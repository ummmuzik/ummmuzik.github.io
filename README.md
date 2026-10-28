# ummmuzik

유튜브 / 사운드클라우드 링크로 음악을 모아 듣는 정적 사이트.
GitHub Pages 로 호스팅하고, 데이터는 Supabase(Postgres) 에 저장합니다.

화면은 세 개이고 주소가 각각 다릅니다.

| 주소 | 화면 |
| --- | --- |
| `#/` | 목록. 커버·제목·아티스트 카드. 누르면 재생이 시작되고 상세로 이동합니다. |
| `#/track/<id>` | 상세. 큰 커버, 제목, 아티스트, 재생 바와 버튼. 좌측 상단은 뒤로, 우측 상단 ⋮ 메뉴에서 수정·삭제. 제목 옆 › 는 원본(유튜브·사운드클라우드 앱)으로, 오른쪽 말풍선은 댓글. |
| `#/edit/<id>` | 수정. 등록과 같은 폼에 기존 값이 채워집니다. |
| `#/add` | 등록. url / title / artist / image 를 입력해 저장합니다. |
| `#/login` | 로그인. 이미 로그인했으면 계정과 로그아웃이 보입니다. |
| `#/admin` | 관리자. 계정을 만들고 회원 목록을 봅니다. |

**모든 화면이 로그인해야 열립니다.** 로그인하지 않은 채 어느 주소로 들어와도
로그인 화면으로 보내고, 로그인하면 원래 가려던 주소로 되돌려 줍니다.
로그인한 뒤에는 목록 좌측 상단의 자물쇠로 계정 화면(관리자는 관리자 화면)에
들어갑니다.

**문서는 `index.html` 하나입니다.** 화면마다 `.html` 파일을 두면 이동할 때마다 브라우저가
문서를 새로 읽으면서 재생기 iframe 이 파괴돼 음악이 끊깁니다. 그래서 주소만 나누고
(뒤로가기·북마크·링크 공유 모두 정상 동작) 문서는 하나로 둬서, 어느 화면으로 옮겨도
재생이 이어지게 했습니다. `add.html` 은 예전 링크를 위한 리다이렉트만 남아 있습니다.

빌드 도구 없이 순수 HTML·CSS·JS 로 되어 있어, 파일을 그대로 올리면 동작합니다.

## 1. Supabase 설정

1. [supabase.com](https://supabase.com) 에서 프로젝트를 만듭니다.
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 내용을 붙여넣고 실행합니다.
   (`tracks` 테이블 + RLS 정책, 커버 사진을 올릴 `covers` 스토리지 버킷이 만들어집니다.)
3. **Project Settings → API** 에서 두 값을 복사해 [`assets/js/config.js`](assets/js/config.js) 에 넣습니다.

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  TABLE: 'tracks',
};
```

`anon` key 는 브라우저에 노출되는 **공개 키**입니다. 권한은 RLS 정책으로 통제하므로
커밋해도 괜찮지만, `service_role` 키는 절대 넣지 마세요.

## 2. GitHub Pages 배포

`ummmuzik.github.io` 는 사용자 사이트이므로 기본 브랜치의 루트가 그대로 공개됩니다.

1. 변경 사항을 기본 브랜치(`main`)에 머지합니다.
2. **Settings → Pages → Build and deployment**: Source `Deploy from a branch`,
   Branch `main` / `/ (root)`.
3. 1~2분 뒤 `https://ummmuzik.github.io` 에서 열립니다.

`.nojekyll` 이 포함되어 있어 Jekyll 처리 없이 파일이 그대로 서비스됩니다.

### 유니콘 404 페이지가 뜬다면

"There isn't a GitHub Pages site here." 화면은 **아직 한 번도 배포되지 않았다**는 뜻입니다.
Pages 를 켜기 전에 푸시를 끝냈다면 빌드가 트리거되지 않은 채로 남아 있을 수 있으니,
`main` 에 커밋을 하나 더 푸시해 빌드를 깨우세요. 저장소의 **Actions** 탭에
`pages build and deployment` 실행이 보이면 정상이고, 초록색으로 끝난 뒤
1~2분(첫 배포는 최대 10분) 지나면 사이트가 열립니다.

로컬에서 확인할 때는 파일을 직접 열지 말고(`file://` 는 일부 API 가 막힙니다) 간단한 서버를 쓰세요.

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## 3. 음악 등록

등록 화면(`#/add`)에서 입력합니다.

| 입력 | 설명 |
| --- | --- |
| url | `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`, `soundcloud.com/…` |
| title | 필수 |
| artist | 필수 |
| image | 선택. 휴대폰·PC 의 사진을 올립니다(Supabase Storage `covers` 버킷). 비우면 유튜브 썸네일(`i.ytimg.com/vi/<id>/hqdefault.jpg`)을 씁니다. 사운드클라우드는 커버가 자동으로 잡히지 않으니 사진을 올려 주세요. |

같은 링크는 한 번만 등록됩니다(`source_url` 유니크 인덱스).

올린 사진은 업로드 전에 **긴 변 800px, JPEG 품질 85%** 로 줄입니다. 휴대폰 사진은
한 장에 수 MB 라 원본 그대로 두면 목록 페이지가 느려지기 때문입니다. 브라우저가
해당 형식을 디코딩하지 못하면(예: 일부 환경의 HEIC) 원본을 그대로 올립니다.

## 4. 플레이어 동작

- 유튜브는 [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference),
  사운드클라우드는 [Widget API](https://developers.soundcloud.com/docs/api/html5-widget) 로 재생합니다.
  두 API 스크립트는 해당 소스를 처음 재생할 때만 불러옵니다.
- 재생/일시정지, 이전/다음, 재생 위치 탐색, 음량을 지원합니다.
- 재생기 iframe 은 어느 화면에도 속하지 않는 전역 요소(`#embeds`)로 두고, 위치만 현재
  화면의 `[data-embed-anchor]` 박스(하단바 썸네일 또는 상세 화면의 큰 커버)에 겹칩니다.
  DOM 을 옮기지 않으므로 화면을 오가도 재생이 끊기지 않습니다.
- 트랙이 끝나면 목록에 보이는 순서(최신순)대로 다음 곡이 이어집니다. 상세 화면을 보고
  있었다면 화면도 다음 곡으로 따라갑니다.
- 소리만 납니다. 영상을 보려면 상세 화면 우측 상단의 YouTube/SoundCloud 버튼을 쓰세요.
- 스페이스바로 재생/일시정지, 미디어 키·잠금화면 제어(Media Session API)도 동작합니다.
- 영상을 접어도 iframe 이 DOM 에 남아 있어 재생이 끊기지 않습니다.

브라우저 정책상 **첫 재생은 반드시 사용자 클릭으로 시작**해야 합니다(자동 재생 불가).
또한 일부 영상은 소유자가 외부 재생을 막아 두었을 수 있고, 그 경우 플레이어에 안내가 표시됩니다.

## 5. 로그인과 회원

소셜 로그인은 쓰지 않고 **관리자가 계정을 만들어 주는 방식**입니다.
가입 화면은 없고, 계정이 없으면 아무것도 볼 수 없습니다.
아이디는 도메인 없이 받지만 Supabase Auth 가 이메일을 요구하므로 내부적으로
`<아이디>@ummjjutube.local` 로 바꿔 저장합니다. 사용자는 아이디만 입력합니다.

회원 한 명은 `아이디` / `비밀번호` / `닉네임` / `역할(관리자·일반)` 로 이뤄지고,
닉네임과 역할은 `profiles` 테이블에 둡니다.

### 왜 Edge Function 인가

계정을 만들려면 Supabase 의 관리자 키(`service_role`)가 필요한데, 이 사이트는
정적 파일이라 키를 두면 누구나 소스에서 꺼내 DB 전체를 조작할 수 있습니다.
그래서 키는 서버에서 도는 Edge Function 안에만 두고, 함수가 **호출자가 관리자인지
먼저 확인한 뒤** 계정을 만듭니다.

### 5-1. 첫 관리자 만들기 (한 번만)

함수는 관리자만 부를 수 있으므로 첫 관리자는 손으로 만듭니다.

1. 대시보드 **Authentication → Users → Add user**
   - Email `admin@ummjjutube.local` (아이디가 `admin` 이 됩니다)
   - Password: 쓰실 비밀번호
   - **Auto Confirm User** 체크
2. SQL Editor 에서 `supabase/schema.sql` 맨 아래 주석의 `insert into public.profiles …`
   구문을 풀어 실행합니다.

### 5-2. Edge Function 배포

```bash
npm i -g supabase          # 이미 있으면 생략
supabase login
supabase link --project-ref goyfjwndvdkgnodnssye
supabase functions deploy admin-create-user
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 가
함수에 자동으로 넣어 주므로 따로 설정할 것이 없습니다. 함수 안의 `ALLOWED_ORIGINS`
에 사이트 주소가 들어 있어야 브라우저가 호출할 수 있습니다(기본값에
`https://ummmuzik.github.io` 와 로컬 주소가 들어 있습니다).

### 5-3. 계정 만들기

관리자로 로그인하면 목록 좌측 자물쇠가 관리자 화면으로 이어집니다. 거기서
아이디·비밀번호·닉네임·역할을 넣어 계정을 만들고 회원 목록을 볼 수 있습니다.

비밀번호 변경·회원 삭제 화면은 아직 없습니다. 필요하면 대시보드의
Authentication → Users 에서 처리하세요(이때 `profiles` 행도 같이 지워야 합니다).

## 6. 권한 더 좁히기 (선택)

목록 조회까지 포함해 `tracks` 의 모든 작업이 로그인(`authenticated`)을 요구합니다.
다만 **커버 사진은 공개 버킷**에 있습니다. 파일 이름이 임의 문자열이라 주소를
모르면 닿을 수 없지만, 주소를 아는 사람은 로그인 없이 사진 자체는 볼 수 있습니다.
이것까지 막으려면 버킷을 비공개로 바꾸고 서명 URL 을 쓰도록 고쳐야 합니다.

현재 스키마는 **로그인한 회원이면 누구나** 곡을 등록·수정·삭제할 수 있습니다.
올린 사람만 고치게 하려면 `tracks` 에 `owner uuid default auth.uid()` 열을 두고
update·delete 정책을 `owner = auth.uid() or public.is_admin()` 으로 바꾸세요.

곡 삭제는 `tracks` 행만 지웁니다. Storage 에 올린 커버 사진은 남으므로, 정리가
필요하면 Supabase 대시보드의 Storage > `covers` 에서 지우세요.

## 파일 구조

```
index.html              문서 하나 + 화면별 <template>
add.html                #/add 로 보내는 리다이렉트 (예전 링크용)
assets/css/app.css      스타일
assets/js/config.js     Supabase 접속 정보 (여기를 채우세요)
assets/js/sources.js    유튜브/사운드클라우드 링크 파싱
assets/js/db.js         Supabase 조회·저장·사진 업로드·회원
assets/js/auth.js       로그인 상태 (아이디 ↔ 이메일 변환)
assets/js/player.js     재생 엔진 (유튜브 + 사운드클라우드, 화면과 분리)
assets/js/app.js        라우터 + 목록·상세·로그인·관리자 화면 + 하단 플레이어
assets/js/add.js        등록·수정 화면
assets/js/comments.js   곡별 댓글 창
supabase/schema.sql     테이블 + RLS 정책 + covers 버킷 + profiles + comments
supabase/functions/admin-create-user/
                        관리자만 호출하는 계정 생성 Edge Function
```

정적 파일은 `?v=` 쿼리로 캐시를 끊습니다. css·js 를 고치면 `index.html` 의 숫자를 올리세요.

## 아이콘

`favicon.ico`(루트)와 `assets/icons/` 의 PNG 들, `manifest.webmanifest` 가
파비콘과 홈 화면 아이콘을 담당합니다. 예전에 쓰던 아이콘은 지우지 않고
`assets/icons/archive/` 에 그대로 두었습니다. 그림을 바꾸려면 원본 한 장을 준비해
같은 이름으로 16·32·48·180·192·512 와 maskable(안쪽 80% 로 축소) 을 다시 만들고,
`index.html` 의 `?v=` 숫자를 올리세요(브라우저가 파비콘을 오래 캐시합니다).

안드로이드 크롬에서 "앱 설치" 배너가 뜨려면 서비스 워커가 하나 더 필요합니다.
지금은 아이콘·이름만 있는 상태라 iOS 의 "홈 화면에 추가" 와 수동 설치에서만
아이콘이 적용됩니다.
