<div align="center">

<img src="docs/screenshots/hero.png" alt="FIRST LAP — 슬레드 푸시 구간의 1인칭 화면" width="860" />

# FIRST LAP

**누르면 밀고, 떼면 숨 고르기.**<br/>
처음 HYROX에 나가는 사람을 위한 1인칭 레이스 체험

[![CI](https://github.com/leeseooo/hyrox-first-lap/actions/workflows/ci.yml/badge.svg)](https://github.com/leeseooo/hyrox-first-lap/actions/workflows/ci.yml)
[![Deploy](https://github.com/leeseooo/hyrox-first-lap/actions/workflows/deploy.yml/badge.svg)](https://github.com/leeseooo/hyrox-first-lap/actions/workflows/deploy.yml)
![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-ES_Modules-F7DF1E?logo=javascript&logoColor=black)
![WebGL](https://img.shields.io/badge/WebGL-990000?logo=webgl&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-F38020?logo=cloudflarepages&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

[**▶ 체험하기**](https://hyrox-first-lap.pages.dev)

</div>

## 소개

HYROX는 1 km 달리기와 운동 종목 8개를 번갈아 하는 피트니스 레이스입니다.
룰북을 읽어도 실제 경기 흐름은 잘 그려지지 않아서, 경기장 안을 직접 지나가 보는 방식으로 만들었습니다.

- **1인칭 경기장**: 라이브러리 없이 WebGL로 직접 그린 아레나를 선수 시점으로 이동
- **페이스 조절**: 마우스·터치·스페이스바를 누르면 빨라지고 심박이 오릅니다. 100%에 닿으면 퍼지므로 빨간 선 바로 밑을 타야 기록이 줄어듭니다 (약 6분)
- **개인 최고 기록**: 참가 방식별로 브라우저에 저장합니다. 건너뛰기를 쓴 판은 연습 완주로 끝납니다
- **5개 참가 방식**: 남/여 싱글, 혼성·여자·남자 더블. 시즌 26/27 공식 무게 반영
- **더블 역할 분담**: 50/50 분할로 파트너 교대와 대기 동선까지 표현
- **완주 공유**: 모바일은 공유 시트, 데스크톱은 링크 복사
- **접근성**: 한국어/English, 동작 줄이기 모드, 키보드만으로 완주 가능
- **WebMCP**: 브라우저 AI 에이전트가 레이스 상태를 읽고 조작할 수 있는 도구 제공

## 스크린샷

|                                    데스크톱                                    |                                    모바일                                    |                               완주 화면                               |
| :----------------------------------------------------------------------------: | :--------------------------------------------------------------------------: | :-------------------------------------------------------------------: |
| <img src="docs/screenshots/desktop.png" width="380" alt="데스크톱 레이아웃" /> | <img src="docs/screenshots/mobile.png" width="170" alt="모바일 월볼 구간" /> | <img src="docs/screenshots/finish.png" width="320" alt="완주 화면" /> |

## 기술 스택

| 영역   | 사용 기술                                                                        |
| ------ | -------------------------------------------------------------------------------- |
| UI     | Vanilla JS (ES Modules), HTML, CSS — 프레임워크 없음                             |
| 렌더링 | WebGL 직접 구현 (면과 선, 점으로 그린 3D 아레나, 스킨 메시 팔, 경로 보간 카메라) |
| 빌드   | Vite — 해시 파일명으로 캐시 무효화                                               |
| 품질   | Vitest, ESLint, Prettier, EditorConfig                                           |
| 배포   | Cloudflare Pages, GitHub Actions                                                 |

## 아키텍처

```mermaid
flowchart LR
  input["입력<br/>pointer · touch · Space"] --> main["main.js<br/>레이스 상태 머신 · 시계"]
  data["data/<br/>stations · divisions"] --> main
  pacing["race/course · pacing<br/>구간 · 심박 · 페이스"] --> main
  main --> arena["race/arena.js<br/>WebGL 렌더링 · strain"]
  main --> hud["HUD · 심박 게이지 · 미니맵"]
  main --> record["race/record.js<br/>기록 · 개인 최고"]
  i18n["i18n/"] --> hud
  main --> webmcp["webmcp.js<br/>에이전트 도구"]
```

레이스는 달리기 8개와 운동 8개, 총 16개 페이즈로 나뉩니다. 각 페이즈 안에서
`run → enter → workout (→ handoff → partner) → exit` 순서로 모드가 바뀌고,
마지막 종목 뒤에는 `finish → celebrate → complete`로 끝납니다.
레이스 시계는 첫 누름에 시작해 결승선에서 멈추고, 매 프레임 `stepPacing`이 페이스와 심박을 계산해 구간 진행 속도를 정합니다.

## 프로젝트 구조

```text
hyrox-first-lap/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml            # format · lint · test · build
│   │   └── deploy.yml        # main → 프로덕션, PR → 프리뷰 배포
│   └── pull_request_template.md
├── docs/screenshots/         # README 이미지 (npm run screenshots)
├── public/
│   ├── _headers              # CSP · 보안 헤더 · 에셋 캐시 정책
│   ├── models/               # 1인칭 팔 모델 (남자, 여자 GLB)
│   └── og.png                # 링크 미리보기 이미지 (1200×630)
├── scripts/
│   ├── bake-arms.py          # Blender로 원본 캐릭터에서 팔만 잘라 줄이기
│   └── screenshots.js        # 헤드리스 Chrome으로 README·OG 이미지 생성
├── src/
│   ├── main.js               # 진입점, 레이스 상태 머신과 DOM 바인딩
│   ├── webmcp.js             # WebMCP 도구 등록
│   ├── race/
│   │   ├── arena.js          # WebGL 렌더러, 카메라·선수 포즈
│   │   ├── palette.js        # 경기장 재질별 면, 윤곽선, 글자 색
│   │   ├── athlete.js        # 1인칭 팔 모델 불러오기와 그리기
│   │   ├── rig.js            # 팔 관절 계산 (2관절 IK, 손목 비틀기)
│   │   ├── gltf.js           # GLB 파일 읽기
│   │   ├── course.js         # 참가 방식별 구간 길이 · 버틸 수 있는 페이스
│   │   ├── pacing.js         # 심박 · 페이스 · 퍼짐 계산
│   │   ├── record.js         # 기록 표시 · 개인 최고 저장
│   │   ├── strain.js         # 심박에 따른 카메라 흔들림
│   │   └── keyboard.js       # 스페이스바 홀드 입력
│   ├── data/
│   │   ├── stations.js       # 8개 종목 정의
│   │   └── divisions.js      # 참가 방식별 무게
│   ├── i18n/index.js         # 한국어 번역
│   ├── analytics/            # 방문 통계
│   └── styles/main.css
├── tests/                    # Vitest 단위 테스트
├── index.html
├── privacy.html
├── vite.config.js
└── wrangler.toml
```

## 시작하기

Node.js 20 이상이 필요합니다.

```sh
git clone https://github.com/leeseooo/hyrox-first-lap.git
cd hyrox-first-lap
npm install
npm run dev        # http://localhost:5173
```

| 스크립트                          | 설명                                                    |
| --------------------------------- | ------------------------------------------------------- |
| `npm run dev`                     | 로컬 개발 서버                                          |
| `npm run build`                   | `dist/`로 프로덕션 빌드                                 |
| `npm run preview`                 | 빌드 결과를 Cloudflare 런타임(`_headers` 포함)으로 실행 |
| `npm test`                        | Vitest 단위 테스트                                      |
| `npm run lint` / `npm run format` | ESLint / Prettier                                       |
| `npm run screenshots`             | `npx vite preview` 실행 중에 README·OG 이미지 갱신      |

## 배포

```mermaid
flowchart LR
  pr["Pull Request"] --> ci["CI<br/>format · lint · test · build"]
  pr --> preview["프리뷰 배포<br/>&lt;branch&gt;.hyrox-first-lap.pages.dev"]
  preview --> comment["PR에 프리뷰 URL 코멘트"]
  merge["main 머지"] --> prod["프로덕션 배포<br/>hyrox-first-lap.pages.dev"]
```

- **프로덕션**: `main`에 머지되면 GitHub Actions가 빌드해서 Cloudflare Pages에 올립니다.
- **프리뷰**: PR마다 브랜치 이름으로 프리뷰 URL이 생기고 PR 코멘트로 링크가 달립니다. 커밋을 더 올리면 같은 코멘트가 갱신됩니다.
- **캐시**: `assets/`의 해시 파일은 1년 `immutable`, HTML은 매번 재검증합니다.
- **보안 헤더**: CSP, `X-Frame-Options`, `Permissions-Policy`, `Referrer-Policy`를 `public/_headers`로 관리합니다.
- **비용**: 정적 파일만 서빙하므로 Cloudflare Pages 무료 플랜 안에서 운영합니다.

<details>
<summary>처음 설정하는 경우</summary>

1. Cloudflare에서 `Cloudflare Pages: Edit` 권한의 API 토큰을 만듭니다.
2. 레포 **Settings → Secrets and variables → Actions**에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 등록합니다.

수동으로 배포하려면 `npm run deploy`를 실행합니다.

</details>

## 에셋

1인칭 팔은 Grab3D의 [Man Base Mesh](https://grab3d.com/models/characters/man-base-character/)와
[Woman Base Mesh](https://grab3d.com/models/characters/woman-base-character/)(CC0)에서 팔만 잘라 면 6천 개로 줄이고, 주먹을 쥘 수 있게 손가락 관절을 더한 것입니다.
다시 만들 때는 원본 rigged GLB를 받아 `blender -b --python scripts/bake-arms.py -- <원본.glb> public/models/arms-male.glb`를 실행합니다.

## 면책

FIRST LAP은 HYROX와 관련 없는 비공식 학습용 프로젝트입니다.
종목 무게는 [HYROX 공식 룰북](https://hyrox.com/the-fitness-race/)(2026년 10월 1일 기준)을 따랐고, 체험 시간은 실제 경기 기록이 아닙니다.

## License

[MIT](LICENSE) © [leeseooo](https://github.com/leeseooo)
