# ummmuzik

유튜브 / 사운드클라우드 링크로 음악을 모아 듣는 정적 사이트.
GitHub Pages 로 호스팅하고, 데이터는 Supabase(Postgres) 에 저장합니다.

화면은 세 개이고 주소가 각각 다릅니다.

| 주소 | 화면 |
| --- | --- |
| `#/` | 목록. 커버·제목·아티스트 카드. 누르면 재생이 시작되고 상세로 이동합니다. |
| `#/track/<id>` | 상세. 큰 커버, 제목, 아티스트, 재생 바와 버튼. 좌측 상단은 뒤로, 우측 상단은 유튜브/사운드클라우드 원본으로 갑니다. |
| `#/add` | 등록. url / title / artist / image 를 입력해 저장합니다. |

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

## 5. 등록을 나만 할 수 있게 (선택)

기본 스키마는 누구나 등록할 수 있습니다. 공개 사이트라면 다음 중 하나를 쓰세요.

**A. 로그인한 사용자만 등록**

```sql
drop policy "tracks: public insert" on public.tracks;
create policy "tracks: authed insert"
  on public.tracks for insert to authenticated
  with check (true);

drop policy "covers: public upload" on storage.objects;
create policy "covers: authed upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'covers');
```

그다음 Supabase Auth(이메일 매직링크 등)로 로그인 화면을 등록 페이지 앞에 붙입니다.

**B. 본인 계정만 등록**

위 정책에 `auth.uid()` 를 쓰는 `owner` 열을 추가해 제한합니다.

## 파일 구조

```
index.html              문서 하나 + 화면별 <template>
add.html                #/add 로 보내는 리다이렉트 (예전 링크용)
assets/css/app.css      스타일
assets/js/config.js     Supabase 접속 정보 (여기를 채우세요)
assets/js/sources.js    유튜브/사운드클라우드 링크 파싱
assets/js/db.js         Supabase 조회·저장·사진 업로드
assets/js/player.js     재생 엔진 (유튜브 + 사운드클라우드, 화면과 분리)
assets/js/app.js        라우터 + 목록·상세 화면 + 하단 플레이어
assets/js/add.js        등록 화면
supabase/schema.sql     테이블 + RLS 정책 + covers 스토리지 버킷
```

정적 파일은 `?v=` 쿼리로 캐시를 끊습니다. css·js 를 고치면 `index.html` 의 숫자를 올리세요.
