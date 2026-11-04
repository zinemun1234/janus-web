# JANUS — live demo (Next.js + Vercel)

42M 파라미터 한국어 LM의 **창발적 정렬 붕괴(EM) 시각화 라이브 데모**.

- **정적 탐색**: α 11단계 × 프롬프트 40문 = 사전생성 응답 440건 내장 → 즉시 탐색
- **라이브 추론**: `⚡ 세 모델 실시간 생성` 버튼 → `/api/generate` (Vercel Python 함수)에서 PyTorch로 실제 생성

## 아키텍처

```
app/ + components/   Next.js 프론트 (React, 클라이언트 컴포넌트)
api/generate.py      Vercel Python 함수 — POST {q, alpha} → {chat, merge, dark, info}
api/model.py         JANUS 아키텍처 (42M decoder-only, RoPE+SwiGLU, tied emb)
requirements.txt     torch(cpu휠) + sentencepiece
vercel.json          함수 memory 2048 / maxDuration 300
```

체크포인트(336MB)는 repo에 없음 — [janus-demo Release v1.0](https://github.com/zinemun1234/janus-demo/releases/tag/v1.0) 에셋을 함수가 cold start 시 `/tmp`에 1회 다운로드 후 모듈 캐시. 첫 요청은 ~30-60초, 이후 warm 인스턴스는 빠름.

## 로컬 개발

```bash
npm install
python lib/gen_data.py        # lib/data.js 재생성 (janus-demo 산출물 필요)
npm run dev                   # 프론트 :3000

# API 로컬 테스트 (모델 경로 지정)
JANUS_MODELS_DIR=../janus-demo/models python -c "import sys; sys.path.insert(0,'api'); from generate import generate_response; print(generate_response('안녕', 0.5)['chat'])"
```

## Vercel 배포

1. https://vercel.com → GitHub 로그인 → 이 repo Import
2. Framework Preset: **Next.js** (자동 감지), Root Directory: repo 루트
3. 빌드 시 `requirements.txt`의 cpu 휠이 설치됨 — Large Functions(5GB) 필요 (신규 프로젝트 기본 적격; 실패 시 Project Settings에서 확인)
4. 배포 후 `POST /api/generate` 확인

⚠️ 연구용 산출물 — 생성물은 실제 조언이 아니며 부정확할 수 있습니다.
*관련: 정적 탐색 버전 https://zinemun1234.github.io/janus-demo/ · 모델 출처 JANUS TR-2026-03*
