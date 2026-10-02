# FIRST LAP — Cloudflare Pages + Google Analytics

설정 확인일: 2026-10-02. 이 파일은 운영자용 안내입니다.

## 1. 무료 사이트 열기

이 ZIP은 HTML/CSS/JavaScript만 있는 정적 사이트입니다. 서버, 데이터베이스, 유료 도메인, 빌드 과정이 필요 없습니다.

1. Cloudflare에 로그인합니다: https://dash.cloudflare.com/
2. **Workers & Pages → Create application → Pages → Get started / Drag and drop your files**로 이동합니다. 메뉴 표시는 계정에 따라 조금 다를 수 있습니다. **Pages의 Direct Upload**를 선택하세요.
3. 프로젝트 이름을 입력하고 `hyrox-cloudflare.zip`을 업로드합니다. ZIP 안의 최상위에 `index.html`이 있습니다.
4. **Deploy site / Save and Deploy**를 누릅니다.
5. 대시보드에 나온 실제 `https://….pages.dev` 주소를 엽니다. 이 무료 주소를 그대로 사용할 수 있습니다.

수정할 때: ZIP 압축 해제 → 파일 수정 → 기존 프로젝트 **Create a new deployment → Production**에 폴더 전체 업로드. 항상 `index.html`과 다른 파일을 같이 올리세요. 이 Direct Upload 프로젝트는 나중에 Git 자동 배포로 전환할 수 없으며 Git 연동을 원하면 별도 프로젝트를 만들어야 합니다.

현재 공식 문서 기준 Functions를 호출하지 않는 정적 파일 요청은 무료·무제한입니다. 이 사이트는 Functions를 사용하지 않습니다. 서비스 정책이 바뀔 수 있어 영구 무료를 보장할 수는 없습니다. 도메인 구매도 필요하지 않습니다.

## 2. GA4 측정 ID 만들기

1. https://analytics.google.com/ 에서 본인 Google 계정으로 로그인합니다.
2. Analytics 계정과 GA4 속성을 만듭니다. 속성 이름 예: `FIRST LAP`. 시간대는 대한민국, 통화는 KRW로 설정합니다.
3. **관리 → 데이터 스트림 → 스트림 추가 → 웹**에서 위의 실제 Pages 주소를 입력합니다.
4. 웹 스트림의 **측정 ID** `G-…`를 복사합니다. 계정 번호·속성 번호·GTM 컨테이너 ID와 다릅니다.
5. 압축 해제한 `analytics-config.js`를 텍스트 편집기로 열어 아래 한 줄만 바꿉니다.

```js
measurementId: 'G-여기에_실제_ID',
```

위는 설명용 예시입니다. 실제 ID는 `G-` 뒤에 영문 대문자와 숫자로 이루어집니다. 현재 파일은 빈 문자열이므로 Google에 어떤 분석 요청도 보내지 않습니다. 측정 ID는 공개용 식별자입니다. 비밀번호·API 키·서비스 계정 키는 넣지 마세요. Google Tag Manager나 Cloudflare Zaraz에 같은 태그를 또 설치하면 중복 집계되므로 이 파일로만 연결하세요.

6. 수정한 폴더 전체를 Pages **Production**에 다시 업로드합니다.
7. 사이트 방문 → **분석 허용** → 길게 눌러 경기 시작. GA4 **실시간**에서 `page_view`와 `race_start`가 보이는지 확인합니다.
8. `analytics-config.js`에서 `debug: true`로 잠깐 바꾸고 재배포하면 GA4 **DebugView**로 이벤트 매개변수를 점검할 수 있습니다. 확인 후 `false`로 돌려놓습니다.

분석은 방문자가 동의한 경우에만 시작됩니다. 동의 전 행동은 저장하거나 나중에 전송하지 않습니다. 페이지 하단 **분석 설정**에서 변경할 수 있습니다. 거절·광고 차단·브라우저 보호 기능 때문에 실제 방문보다 분석 수치가 적을 수 있습니다. 동의를 취소하면 이후 수집을 중단합니다. Analytics 동의와 광고 동의는 구분하며 광고 기능은 비활성화했습니다.

## 3. 어떤 데이터가 쌓이나요?

| 이벤트 | 의미 |
| --- | --- |
| `page_view` | 분석에 동의한 사이트 방문 |
| `race_start` | 첫 실제 길게 누르기. 잠시 멈췄다 재개해도 중복 발행하지 않음 |
| `station_complete` | 한 종목을 완료. 같은 체험에서 다시 방문해도 종목당 한 번 |
| `race_complete` | 피니시까지 도달. 스킵 체험도 포함 |
| `race_complete_full` | 종목 이동·구간 스킵 없이 모든 종목과 피니시를 완료 |
| `run_skip`, `segment_skip` | 달리기 또는 현재 구간 스킵 |
| `station_select` | 경기 순서 목록에서 종목으로 이동 |
| `division_select`, `language_change` | 참가 방식·언어 변경 |

이벤트에는 `division`, `language`, `assisted`(스킵/직접 이동 여부 0 또는 1), `active_seconds`(실제 조작한 초), `attempt_number`가 붙습니다. 종목 이벤트에는 `station_number`도 붙습니다. 체험용 시간이며 실제 운동 기록이 아닙니다. 참가 방식을 바꾸거나 다시 시작하면 새 체험으로 집계합니다.

GA4 **관리 → 맞춤 정의**에서 이벤트 범위 맞춤 측정기준으로 `division`, `language`, `assisted`, `station_number`를 등록합니다. `active_seconds`는 초 단위 맞춤 측정항목으로 등록하면 체험 시간을 분석할 수 있습니다. `race_start`와 `race_complete_full`을 주요 이벤트로 표시해 유입별 성과를 비교하세요. 일반 보고서 반영에는 시간이 걸릴 수 있으므로 첫 점검은 실시간/DebugView로 합니다.

## 4. 앰버서더별 릴스 유입 구분

공유 주소 뒤에 아래 UTM을 붙입니다. 사이트 주소는 반드시 실제 배포 결과로 바꿉니다.

```text
https://실제주소.pages.dev/?utm_source=instagram&utm_medium=organic_social&utm_campaign=first_lap_launch&utm_content=amb01_reel01
```

- 같은 프로젝트: `utm_campaign=first_lap_launch`
- 소개자/영상 구분: `amb01_reel01`, `amb01_reel02`, `amb02_reel01`
- 소문자 영문·숫자·언더스코어·하이픈만 사용합니다. 위 네 값은 GA4 유입 보고서에 쓰입니다.
- UTM에 이름·전화번호·이메일·개인 회원 ID를 넣지 마세요. 분석에 넘기는 URL에는 허용한 UTM만 남기고 다른 쿼리와 해시를 제외합니다.
- GA4 **트래픽 획득**에서 세션 소스/매체·캠페인을 봅니다. 영상별 `utm_content`는 **세션 수동 광고 콘텐츠** 측정기준을 활용합니다.

영상별 비교는 방문 수에 더해 **방문한 사용자 중 시작한 사용자 비율**, **시작한 사용자 중 완주한 사용자 비율**을 봅니다. 이벤트 수에는 재시작이 들어가므로 단순 이벤트 수 비율을 사람 수 비율로 해석하지 마세요. GA4 탐색의 퍼널에서 `page_view → race_start → race_complete_full`을 구성하고 기기·캠페인별로 비교할 수 있습니다.

## 5. 첫 실험과 스폰서 제안

처음에는 소개자 2~3명, 각 영상 1개로 작게 실험합니다. 같은 기간에 영상별 방문·시작·완주와 모바일 비율, 국내 사용자 비중을 비교합니다. 반응이 좋았던 소재를 다음 영상에 반영합니다.

스폰서에게는 검증된 기간·측정 조건을 적은 집계 자료와 제품이 자연스럽게 노출될 제안을 준비하세요. 트래픽이나 영상 조회 수만으로 수익을 보장할 수는 없습니다. GA4는 관심층 규모와 행동을 파악하는 도구이며, 연락 가능한 회원 목록을 확보하는 기능은 아닙니다. 실제 HYROX/브랜드의 공식 제휴를 암시하지 않는 현재 비공식 표기를 유지합니다.

## 공식 문서

- Cloudflare 업로드: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Cloudflare 정적 파일 과금: https://developers.cloudflare.com/pages/functions/pricing/
- GA4 계정/속성/스트림: https://support.google.com/analytics/answer/9304153
- GA4 이벤트: https://developers.google.com/analytics/devguides/collection/ga4/events
