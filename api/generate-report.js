// Vercel Edge Function — OpenRouter(DeepSeek) 프록시
// API 키는 이 서버 함수의 환경변수(OPENROUTER_API_KEY)에만 존재하며,
// 브라우저로는 절대 전송되지 않습니다.
//
// 엔드포인트: POST /api/generate-report
// 요청 본문 : { "context": { ...앞 단계 분석 결과... } }
// 응답      : OpenRouter SSE 스트림 (text/event-stream) 그대로 전달

export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

// 앞 단계 분석 결과(context)를 정책 보고서 프롬프트로 변환
function buildPrompt(c) {
  c = c || {};
  const m = c.metrics || {};
  const sp = c.selectedPolicy;
  const seoul = c.seoul;
  const peer = c.peer;

  const system =
    '당신은 대한민국 지역 문화정책을 설계하는 전문 정책 컨설턴트입니다. ' +
    '공공도서관 데이터 기반 진단 결과를 바탕으로, 지방자치단체 정책 담당자가 그대로 활용할 수 있는 ' +
    '간결하고 근거 있는 정책 제안서를 작성합니다. 반드시 제공된 수치와 사례만 사용하고, ' +
    '새로운 통계나 사실을 지어내지 마십시오. 한국어 정책 보고서 문체(정중한 개조식 또는 ~함/~음)로 작성합니다.';

  const L = [];
  L.push(`아래는 '${c.region}'의 문화소멸위험 진단 결과입니다. 이를 종합하여 맞춤형 공공도서관 정책 제안서를 작성하세요.`);
  L.push('');
  L.push('[진단 데이터]');
  L.push(`- 지역: ${c.region}`);
  L.push(`- 문화소멸위험지수(CMRI): ${c.cmri}점 / 군집: ${c.cluster}`);
  if (m.종합불편 != null) L.push(`- 종합 불편점수: ${m.종합불편}점`);
  L.push(`- 세부 지표(값이 높을수록 취약): 도서관부족 ${m.도서관부족}, 사서부족 ${m.사서부족}, 노후화 ${m.노후화}, 접근성 ${m.접근성}`);
  L.push(`- 최우선 개선 과제(핵심 문제): ${c.topProblem}`);
  if (sp) L.push(`- 정책 DB 추천 정책: ${sp.name} (구분: ${sp.type}) — ${sp.desc}`);
  if (seoul) L.push(`- 문화 특성 유사지역: 서울 ${seoul.name} (유사도 ${seoul.similarity}%), 벤치마킹 운영기법: ${seoul.policy.name} / 목적: ${seoul.policy.objective} / 내용: ${seoul.policy.content}`);
  if (peer) L.push(`- 동일 군집 성공 지역: ${peer.region}${peer.policy ? ' — 대표 정책: ' + peer.policy : ''}`);
  L.push('');
  L.push('[작성 형식] 아래 소제목(##)을 그대로 사용하고, 각 항목은 2~4문장 또는 핵심 불릿으로 간결하게 작성하세요. 전체 600~900자 내외.');
  L.push('## 1. 정책 추진 배경 및 문제 진단');
  L.push('## 2. 추천 정책 및 선정 근거');
  L.push('## 3. 운영 방안 (유사지역 벤치마킹 접목)');
  L.push('## 4. 기대 효과');
  L.push('## 5. 단계별 추진 로드맵 (단기·중기·장기)');

  return { system, user: L.join('\n') };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return jsonError('POST 요청만 허용됩니다.', 405);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonError('서버에 OPENROUTER_API_KEY 환경변수가 설정되지 않았습니다.', 500);
  }

  let context;
  try {
    const b = await req.json();
    context = b && b.context;
  } catch (_) {
    return jsonError('요청 본문이 올바른 JSON이 아닙니다.', 400);
  }
  if (!context) {
    return jsonError('context 데이터가 비어 있습니다.', 400);
  }

  // OpenRouter 모델: 환경변수로 변경 가능. 기본값은 널리 쓰이는 DeepSeek 슬러그.
  // 정확한 슬러그는 https://openrouter.ai/models 에서 확인하세요.
  const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';
  const { system, user } = buildPrompt(context);

  let orResp;
  try {
    orResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'CMRI-AI'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        stream: true,
        temperature: 0.6
      })
    });
  } catch (err) {
    return jsonError('OpenRouter 연결 실패: ' + (err.message || err), 502);
  }

  if (!orResp.ok || !orResp.body) {
    let detail = '';
    try { detail = (await orResp.text()).slice(0, 400); } catch (_) {}
    return jsonError(`OpenRouter 오류 (${orResp.status}). ${detail}`, orResp.status || 502);
  }

  // OpenRouter의 SSE 스트림을 그대로 클라이언트로 전달
  return new Response(orResp.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      ...CORS
    }
  });
}
