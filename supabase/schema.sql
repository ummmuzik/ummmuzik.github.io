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

-- 누구나 목록을 볼 수 있다.
drop policy if exists "tracks: public read" on public.tracks;
create policy "tracks: public read"
  on public.tracks for select
  using (true);

-- 누구나 등록할 수 있다.
--   주의: anon key 는 사이트에 공개되므로, 이 정책이 켜져 있으면 링크를 아는
--   누구나 트랙을 추가할 수 있습니다. 혼자 쓰는 사이트라면 아래 정책을 지우고
--   README 의 "등록을 나만 할 수 있게" 절차를 따르세요.
drop policy if exists "tracks: public insert" on public.tracks;
create policy "tracks: public insert"
  on public.tracks for insert
  with check (true);

-- 수정/삭제는 아무에게도 허용하지 않는다(정책 없음 = 거부).

-- ---------------------------------------------------------------------------
-- 커버 이미지 저장소 (등록 페이지의 image 업로드)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- 커버는 사이트에서 그대로 보여 줘야 하므로 공개 읽기.
drop policy if exists "covers: public read" on storage.objects;
create policy "covers: public read"
  on storage.objects for select
  using (bucket_id = 'covers');

-- 누구나 올릴 수 있다. tracks 의 insert 정책과 같은 수준으로 맞춘다.
--   등록을 제한하려면 아래 정책의 대상을 authenticated 로 바꾸세요.
drop policy if exists "covers: public upload" on storage.objects;
create policy "covers: public upload"
  on storage.objects for insert
  with check (bucket_id = 'covers');

-- 덮어쓰기/삭제는 허용하지 않는다(정책 없음 = 거부).
