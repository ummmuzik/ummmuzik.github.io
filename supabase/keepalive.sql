-- 프로젝트가 잠들지 않게 하는 주간 작업
--
-- Supabase 무료 프로젝트는 일주일 남짓 아무 요청이 없으면 일시 정지됩니다.
-- 아래 두 작업을 걸어 두면
--   1) keepalive          — 월·목 두 번, 프로젝트 자신의 REST 에 요청 한 번만 보냅니다.
--                           (tracks 한 줄을 읽는 척만 하고 결과는 버립니다)
--   2) keepalive-cleanup  — 매주 목요일, 일주일이 지난 cron 실행 기록을 지웁니다.
--
-- 깨우는 일을 하는 건 1) 뿐입니다. 2) 는 DB 안에서 기록만 지우므로 밖으로
-- 나가는 요청이 없고, 따라서 '활동' 으로 세어지지 않습니다. 그래서 날짜를
-- 나누는 대신 1) 자체를 주 2 회(월·목)로 돌립니다. 간격이 3~4 일이 됩니다.
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 한 번만 실행하세요.
-- 여러 번 실행해도 안전합니다(있으면 지우고 다시 겁니다).
--
-- 왜 'select 1' 이 아니라 HTTP 요청인가:
--   일시 정지 판단은 프로젝트로 들어오는 요청을 기준으로 합니다. DB 안에서만
--   도는 작업은 그 요청으로 세어지지 않을 수 있어, pg_net 으로 자기 REST 주소를
--   한 번 두드립니다. anon key 는 어차피 공개 키이고, tracks 는 로그인한 회원만
--   읽을 수 있으므로 이 요청은 빈 목록만 받아 옵니다(아무것도 새어 나가지 않음).

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'keepalive') then
    perform cron.unschedule('keepalive');
  end if;
  if exists (select 1 from cron.job where jobname = 'keepalive-cleanup') then
    perform cron.unschedule('keepalive-cleanup');
  end if;
end $$;

-- 1) 깨워 두기 — 월·목 05:17 UTC (한국 시간 월·목 14:17)
--    주 1 회면 간격이 딱 7 일이라 여유가 없어 두 번으로 나눕니다.
--    더 자주 하고 싶으면 '17 5 */3 * *' (사흘마다) 로 바꿔도 됩니다.
select cron.schedule(
  'keepalive',
  '17 5 * * 1,4',
  $job$
    select net.http_get(
      url     := 'https://goyfjwndvdkgnodnssye.supabase.co/rest/v1/tracks?select=id&limit=1',
      headers := jsonb_build_object(
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdveWZqd25kdmRrZ25vZG5zc3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNzQzMDQsImV4cCI6MjEwODY1MDMwNH0.HWkKklsU4jPDEdpJ0JIACRaCdjL6MQydDImFAWU4rGw'
      )
    );
  $job$
);

-- 2) 기록 지우기 — 매주 목요일 05:47 UTC, 일주일 지난 실행 기록은 남기지 않는다.
--    (전부 비우고 싶으면 where 절을 지우세요)
select cron.schedule(
  'keepalive-cleanup',
  '47 5 * * 4',
  $job$
    delete from cron.job_run_details where end_time < now() - interval '7 days';
  $job$
);

-- 잘 걸렸는지 확인 (두 줄이 active = true 로 보여야 합니다)
select jobid, jobname, schedule, active from cron.job order by jobname;

-- 바로 한 번 돌려 보고 싶다면 (몇 초 뒤 아래 조회에 성공 기록이 남습니다)
--   select net.http_get(url := 'https://goyfjwndvdkgnodnssye.supabase.co/rest/v1/tracks?select=id&limit=1',
--                       headers := jsonb_build_object('apikey', '<위와 같은 anon key>'));
--
-- 실행 기록 보기
--   select jobid, status, start_time, end_time from cron.job_run_details
--    order by start_time desc limit 20;
