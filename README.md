# CMRI-AI 대시보드 (Vercel 배포)

공공도서관 데이터 기반 문화소멸위험 진단 대시보드입니다.
Step 4 "최종 AI 정책 추천" 화면 하단의 **⑥ AI 생성 정책 제안서** 버튼을 누르면,
앞 단계 분석 결과(문제 진단·추천 정책·유사지역 운영기법·군집 성공사례)를 종합해
생성형 AI(OpenRouter / DeepSeek)가 지역 맞춤 정책 제안서를 실시간으로 작성합니다.

API 키는 브라우저가 아니라 **서버리스 함수(`api/generate-report.js`)의 환경변수**에만 저장되어 노출되지 않습니다.

```
cmri-ai-site/
├─ index.html              ← 대시보드 (정적)
├─ api/
│  └─ generate-report.js   ← 키를 숨기는 프록시 (Vercel Edge Function)
├─ README.md
└─ .gitignore
```

---

## ⚠️ 0. 가장 먼저: 기존 API 키 폐기

대화 중에 노출된 키(`sk-or-v1-...`)는 **반드시 OpenRouter에서 폐기(revoke)하고 새 키를 발급**하세요.
- https://openrouter.ai/keys → 기존 키 삭제 → "Create Key"로 새 키 발급

새 키는 절대 코드/깃허브에 넣지 말고, 아래 3단계에서 Vercel 환경변수로만 등록합니다.

---

## 1. GitHub에 올리기

```bash
cd cmri-ai-site
git init
git add .
git commit -m "CMRI-AI dashboard with AI report"
git branch -M main
git remote add origin https://github.com/<본인계정>/<저장소이름>.git
git push -u origin main
```

> `.gitignore`가 `.env`를 제외하므로 키가 깃허브에 올라가지 않습니다.

---

## 2. Vercel로 Import

1. https://vercel.com 에 GitHub 계정으로 로그인
2. **Add New → Project** → 방금 만든 저장소 선택 → **Import**
3. 설정은 기본값 그대로 (Framework Preset: Other). 빌드 명령 불필요.

---

## 3. 환경변수 설정 (키 숨김의 핵심)

Vercel 프로젝트 → **Settings → Environment Variables** 에서 추가:

| Name | Value | 비고 |
|---|---|---|
| `OPENROUTER_API_KEY` | 새로 발급한 OpenRouter 키 | **필수** |
| `OPENROUTER_MODEL` | `deepseek/deepseek-chat` | 선택 (생략 시 이 값 기본 적용) |

> 모델 슬러그는 https://openrouter.ai/models 에서 확인하세요.
> `deepseek/deepseek-v4-flash` 같은 이름은 실제 존재 여부를 먼저 확인해야 404가 안 납니다.
> 확실한 기본값으로 `deepseek/deepseek-chat`(DeepSeek V3)을 권장합니다.

환경변수 추가 후 **Deployments → 최신 배포 → Redeploy** 로 한 번 재배포해야 적용됩니다.

---

## 4. 확인

배포된 주소(`https://<프로젝트>.vercel.app`) 접속 →
지역 선택 → 분석 시작 → **4. 최종 AI 정책 추천** 탭 → **🤖 AI 정책 제안서 생성** 클릭.
DeepSeek가 작성한 제안서가 스트리밍되며 나타나면 정상입니다.

---

## 로컬 테스트

- `index.html`을 그냥 더블클릭하면 대시보드는 전부 동작하지만, **AI 생성 버튼만** API 함수가 없어 실패합니다(안내 메시지 표시).
- AI 생성까지 로컬에서 테스트하려면:
  ```bash
  npm i -g vercel
  vercel dev          # 최초 1회 환경변수 입력 또는 .env.local 에 OPENROUTER_API_KEY 작성
  ```
  `.env.local` 예시 (이 파일은 .gitignore로 제외됨):
  ```
  OPENROUTER_API_KEY=sk-or-v1-새로발급한키
  OPENROUTER_MODEL=deepseek/deepseek-chat
  ```

---

## 보안 메모

- 키는 서버 함수 환경변수에만 존재 → 브라우저 개발자도구로도 보이지 않음.
- `api/generate-report.js`는 OpenRouter 응답을 그대로 중계만 하므로 키가 응답에 포함되지 않음.
- 비용이 걱정되면 OpenRouter에서 키별 사용 한도(credit limit)를 설정하세요.
