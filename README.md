# FIRST LAP — HYROX 체험 사이트

- 사이트: https://hyrox-first-lap.pages.dev
- 호스팅: Cloudflare Pages (프로젝트 `hyrox-first-lap`, 정적 파일만 사용)
- 분석: GA4 속성 `FIRST LAP` (leeseooo@sookmyung.ac.kr, 측정 ID `G-1741K0X3GH`)

## 구조

- `public/` — 실제로 배포되는 파일 전부. 여기 밖의 파일은 공개되지 않음
- `public/_headers` — 보안·캐시 헤더 (Pages가 그대로 적용)
- `public/analytics-config.js` — GA 측정 ID. 비우면 GA 요청이 전혀 나가지 않음
- `DEPLOYMENT.md` — 원본 운영 가이드 (이벤트 목록, UTM 규칙, GA 맞춤 정의)

## 배포

```sh
npx wrangler pages deploy --branch main
```

`wrangler.toml`의 `pages_build_output_dir`(`./public`)를 그대로 올린다. 로그인이 풀렸으면 `npx wrangler login`.

## GA

방문자가 하단 배너에서 **분석 허용**을 눌러야 수집이 시작된다 (동의 전에는 Google로 요청 없음).
맞춤 측정기준 `division`, `language`, `assisted`, `station_number`와 맞춤 측정항목 `active_seconds`(초)는 등록해 뒀다.
