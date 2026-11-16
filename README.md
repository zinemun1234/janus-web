# JANUS — live demo (Next.js + Vercel)

42M 파라미터 한국어 LM의 **창발적 정렬 붕괴(EM) 시각화 라이브 데모**.

**라이브**: https://janus-web-blond.vercel.app

- **정적 탐색**: α 11단계 × 프롬프트 40문 = 사전생성 응답 440건 내장 → 즉시 탐색
- **라이브 추론**: `세 모델 실시간 생성` 버튼 → `/api/generate` (Vercel Python 함수)에서 실제 생성

## 아키텍처

```
app/ + components/   Next.js 프론트 (React, 클라이언트 컴포넌트)
api/generate.py      Vercel Python 함수 — ONNX Runtime 추론
                     POST {q, alpha} → {chat, merge, dark, info}
pyproject.toml       onnxruntime + numpy + sentencepiece (~150MB 번들)
vercel.json          함수 memory 2048 / maxDuration 300
```

모델은 PyTorch가 아닌 **ONNX**로 배포 — `janus_merge.onnx`(그래프)+`.data`(403MB)에 chat/dark 가중치를 둘 다 내장하고 `alpha` 입력으로 그래프 내부에서 가중치 보간 → 런타임이 초소형이라 Vercel 500MB 함수 한도 안에 들어감 (torch 번들은 725MB로 초과됐음). 에셋은 [janus-demo Release v1.0](https://github.com/zinemun1234/janus-demo/releases/tag/v1.0)에서 cold start 시 `/tmp`에 1회 다운로드 후 캐시.

**듀얼 챗**: `POST {q, alpha, stream:true}` → NDJSON 스트림(`{m:'chat|merge|dark', t, done}` 한 줄씩). 세 모델이 스텝마다 번갈아 한 토큰씩 생성해 화면에서 동시에 자란다. 모델은 단일 턴만 학습 → 매 질문을 독립 처리. (Vercel Python 함수의 응답 스트리밍 동작은 배포 후 확인 필요)

**STEERING 모드**: ONNX 그래프가 W=(1−α)·chat+α·dark 로 선형이라 α∈[−1, 2] 외삽을 같은 그래프로 수행 (서버가 범위를 클램프). 사전생성 데이터는 0~1만 있어 라이브 전용.

**예상 지연**: cold start ~55초(다운로드+세션 초기화+생성), warm ~20초.

ONNX 변환: `../janus-demo/export_onnx.py` — torch ckpt 2개 → MergeNet(보간 그래프) 익스포트, torch forward와 logits 오차 ~1e-5 검증됨.

## 로컬 개발

```bash
npm install
python lib/gen_data.py        # lib/data.js 재생성 (janus-demo 산출물 필요)
npm run dev                   # 프론트 :3000

# (선택) next dev 에서 라이브 API까지 붙이려면: 별도 API 서버를 띄우고
# NEXT_PUBLIC_API_BASE=http://127.0.0.1:3001 npm run dev   (CORS 허용 서버 필요)

# API 로컬 테스트 (모델 경로 지정 — out/janus_merge.onnx 필요)
JANUS_MODELS_DIR=../janus-demo/models python -c "import sys; sys.path.insert(0,'api'); from generate import generate_response; print(generate_response('안녕', 0.5)['chat'])"
```

## Vercel 배포

1. https://vercel.com → GitHub 로그인 → 이 repo Import
2. Framework Preset: **Next.js** (자동 감지), Root Directory: repo 루트
3. `pyproject.toml`이 uv로 자동 해석됨 — torch 없이 onnxruntime만 설치
4. 배포 후 `POST /api/generate` 확인

연구용 산출물 — 생성물은 실제 조언이 아니며 부정확할 수 있습니다.
*관련: 정적 탐색 버전 https://zinemun1234.github.io/janus-demo/ · 모델 출처 JANUS TR-2026-03*
