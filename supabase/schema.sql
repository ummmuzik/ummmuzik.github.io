-- ummmuzik 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

create extension if not exists "pgcrypto";

create table if not exists public.tracks (
  id          uuid primary key default gen_random_uuid(),
  title       text        not null check (length(btrim(title)) > 0),
  artist      text        not null check (length(btrim(artist)) > 0),
  cover_url   text,
  source_url  text        not null,
  provider    text        not null check (provider in ('youtube', 'soundcloud')),
  provider_id text,
  created_at  timestamptz not null default now()
);

create index if not exists tracks_created_at_idx on public.tracks (created_at desc);

-- 같은 곡을 중복 등록하지 않도록
create unique index if not exists tracks_source_url_key on public.tracks (source_url);

alter table public.tracks enable row level security;

-- 목록을 보는 것도 로그인한 회원만.
drop policy if exists "tracks: public read" on public.tracks;
drop policy if exists "tracks: authed read" on public.tracks;
create policy "tracks: authed read"
  on public.tracks for select to authenticated
  using (true);

-- 등록·수정·삭제는 로그인한 회원만.
drop policy if exists "tracks: public insert" on public.tracks;
drop policy if exists "tracks: public update" on public.tracks;
drop policy if exists "tracks: public delete" on public.tracks;

drop policy if exists "tracks: authed insert" on public.tracks;
create policy "tracks: authed insert"
  on public.tracks for insert to authenticated
  with check (true);

drop policy if exists "tracks: authed update" on public.tracks;
create policy "tracks: authed update"
  on public.tracks for update to authenticated
  using (true)
  with check (true);

drop policy if exists "tracks: authed delete" on public.tracks;
create policy "tracks: authed delete"
  on public.tracks for delete to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 커버 이미지 저장소 (등록 페이지의 image 업로드)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- 커버는 <img> 로 그대로 띄워야 하므로 공개 읽기로 둔다.
--   파일 이름이 임의 문자열이라 주소를 모르면 닿을 수 없지만, 주소를 아는
--   사람은 로그인 없이도 사진 자체는 볼 수 있습니다. 이것까지 막으려면
--   버킷을 비공개로 바꾸고 서명 URL 을 쓰도록 고쳐야 합니다.
drop policy if exists "covers: public read" on storage.objects;
create policy "covers: public read"
  on storage.objects for select
  using (bucket_id = 'covers');

-- 올리는 건 로그인한 회원만. tracks 의 insert 정책과 수준을 맞춘다.
drop policy if exists "covers: public upload" on storage.objects;
drop policy if exists "covers: authed upload" on storage.objects;
create policy "covers: authed upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'covers');

-- 덮어쓰기/삭제는 허용하지 않는다(정책 없음 = 거부).

-- ---------------------------------------------------------------------------
-- 회원 (profiles)
--
-- 로그인은 Supabase Auth 를 쓰고, 아이디는 도메인 없이 받는다.
-- Auth 가 이메일을 요구하므로 내부적으로 <아이디>@ummjjutube.local 로 저장한다.
-- 닉네임·역할은 이 테이블에 둔다. 계정 생성은 Edge Function(admin-create-user)
-- 만 하므로 insert/update/delete 정책은 두지 않는다(service_role 은 RLS 를 지나친다).
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text        not null unique check (username ~ '^[a-z0-9_.-]{3,30}$'),
  nickname   text        not null check (length(btrim(nickname)) > 0),
  role       text        not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 정책 안에서 profiles 를 다시 읽으면 재귀가 되므로 security definer 함수로 뺀다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 로그인한 회원이면 서로의 닉네임을 볼 수 있다(목록에 등록자를 띄운다).
drop policy if exists "profiles: self or admin read" on public.profiles;
drop policy if exists "profiles: authed read" on public.profiles;
create policy "profiles: authed read"
  on public.profiles for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 누가 등록했는지 (목록에 닉네임 표시)
--   profiles 보다 뒤에 와야 하므로 여기서 붙인다.
--   이미 있던 행은 비어 있어 닉네임이 표시되지 않는다.
-- ---------------------------------------------------------------------------

alter table public.tracks
  add column if not exists created_by uuid
    references public.profiles (id) on delete set null
    default auth.uid();

-- ---------------------------------------------------------------------------
-- 첫 관리자 만들기 (한 번만)
--
-- 1) 대시보드 Authentication > Users > Add user 로 만듭니다.
--      Email: admin@ummjjutube.local   (아이디가 admin 이 됩니다)
--      Password: 쓰실 비밀번호
--      Auto Confirm User 를 체크하세요.
-- 2) 아래 주석을 풀어 실행해 프로필을 붙입니다.
--
-- insert into public.profiles (id, username, nickname, role)
-- select id, 'admin', '관리자', 'admin'
--   from auth.users
--  where email = 'admin@ummjjutube.local'
-- on conflict (id) do nothing;
