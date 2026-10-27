/*
 * Supabase 접속 정보.
 *
 * Supabase 대시보드 > Project Settings > API 에서 복사해 아래 두 값을 채우세요.
 * anon key 는 브라우저에 노출되는 공개 키입니다. RLS 정책으로 권한을 제어하므로
 * 여기에 넣어도 되지만, service_role 키는 절대 넣지 마세요.
 */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://goyfjwndvdkgnodnssye.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdveWZqd25kdmRrZ25vZG5zc3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNzQzMDQsImV4cCI6MjEwODY1MDMwNH0.HWkKklsU4jPDEdpJ0JIACRaCdjL6MQydDImFAWU4rGw',

  // 트랙을 저장하는 테이블 이름 (supabase/schema.sql 과 일치해야 합니다)
  TABLE: 'tracks',

  // 커버 이미지를 올릴 Storage 버킷 이름
  BUCKET: 'covers',
};
