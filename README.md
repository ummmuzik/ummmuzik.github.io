# ummmuzik

유튜브 / 사운드클라우드 링크로 음악을 모아 듣는 정적 사이트.
GitHub Pages 로 호스팅하고, 데이터는 Supabase(Postgres) 에 저장합니다.

- `index.html` — 목록 페이지. 커버·제목·아티스트가 보이고, 카드를 누르면 바로 재생됩니다. 플레이어는 화면 하단에 항상 고정됩니다.
- `add.html` — 등록 페이지. 커버 이미지 URL / 링크 / 제목 / 아티스트를 입력해 저장합니다.

빌드 도구 없이 순수 HTML·CSS·JS 로 되어 있어, 파일을 그대로 올리면 동작합니다.

## 1. Supabase 설정

1. [supabase.com](https://supabase.com) 에서 프로젝트를 만듭니다.
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 내용을 붙여넣고 실행합니다.
   (`tracks` 테이블 + RLS 정책이 만들어집니다.)
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

등록 페이지에서 입력합니다.

| 입력 | 설명 |
| --- | --- |
| 링크 | `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`, `soundcloud.com/…` |
| 제목 | 필수 |
| 아티스트 | 필수 |
| 커버 이미지 URL | 선택. 비우면 유튜브 썸네일(`i.ytimg.com/vi/<id>/hqdefault.jpg`)을 씁니다. 사운드클라우드는 커버가 자동으로 잡히지 않으니 직접 넣어 주세요. |

같은 링크는 한 번만 등록됩니다(`source_url` 유니크 인덱스).

## 4. 플레이어 동작

- 유튜브는 [IFrame Player API](https://developers.google.com/youtube/iframe_api_reference),
  사운드클라우드는 [Widget API](https://developers.soundcloud.com/docs/api/html5-widget) 로 재생합니다.
  두 API 스크립트는 해당 소스를 처음 재생할 때만 불러옵니다.
- 재생/일시정지, 이전/다음, 재생 위치 탐색, 음량, 영상 펼치기(⤢)를 지원합니다.
- 트랙이 끝나면 목록 순서대로 다음 곡이 이어집니다. 검색으로 걸러낸 목록이 그대로 재생 큐가 됩니다.
- 스페이스바로 재생/일시정지, 미디어 키·잠금화면 제어(Media Session API)도 동작합니다.
- 영상을 접어도 iframe 이 DOM 에 남아 있어 재생이 끊기지 않습니다.

브라우저 정책상 **첫 재생은 반드시 사용자 클릭으로 시작**해야 합니다(자동 재생 불가).
또한 일부 영상은 소유자가 외부 재생을 막아 두었을 수 있고, 그 경우 플레이어에 안내가 표시됩니다.

## 5. 등록을 나만 할 수 있게 (선택)

기본 스키마는 누구나 등록할 수 있습니다. 공개 사이트라면 다음 중 하나를 쓰세요.

**A. 로그인한 사용자만 등록**

```sql
drop policy "tracks: public insert" on public.tracks;
create policy "tracks: authed insert"
  on public.tracks for insert to authenticated
  with check (true);
```

그다음 Supabase Auth(이메일 매직링크 등)로 로그인 화면을 등록 페이지 앞에 붙입니다.

**B. 본인 계정만 등록**

위 정책에 `auth.uid()` 를 쓰는 `owner` 열을 추가해 제한합니다.

## 파일 구조

```
index.html              목록 + 하단 플레이어
add.html                등록 폼
assets/css/app.css      스타일
assets/js/config.js     Supabase 접속 정보 (여기를 채우세요)
assets/js/sources.js    유튜브/사운드클라우드 링크 파싱
assets/js/db.js         Supabase 조회·저장
assets/js/player.js     하단 고정 플레이어 (유튜브 + 사운드클라우드)
assets/js/list.js       목록 페이지 로직
assets/js/add.js        등록 페이지 로직
supabase/schema.sql     테이블 + RLS 정책
```
