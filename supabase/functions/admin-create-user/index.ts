/*
 * 관리자만 호출할 수 있는 계정 생성 함수.
 *
 * 관리자 키(service_role)는 정적 사이트에 둘 수 없으므로 여기에만 둔다.
 * 호출자의 토큰으로 profiles.role 을 확인해 관리자인지 먼저 검사한 뒤,
 * 관리자 키로 계정을 만들고 profiles 행을 넣는다.
 *
 * 배포:  supabase functions deploy admin-create-user
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// 아이디에 붙일 도메인. assets/js/config.js 의 ID_DOMAIN 과 같아야 한다.
const EMAIL_DOMAIN = 'ummjjutube.local';

const ALLOWED_ORIGINS = [
  'https://ummmuzik.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'POST 만 받습니다.' }, 405, origin);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1) 누가 불렀는지
  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401, origin);

  // 2) 관리자인지 (service_role 로 조회해 RLS 와 무관하게 확인)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: me } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!me || me.role !== 'admin') {
    return json({ error: '관리자만 계정을 만들 수 있습니다.' }, 403, origin);
  }

  // 3) 입력 검사
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ error: '잘못된 요청입니다.' }, 400, origin);
  }

  const username = String(body.username ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const nickname = String(body.nickname ?? '').trim();
  const role = String(body.role ?? 'member');

  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
    return json({ error: '아이디는 영문 소문자·숫자·_ . - 조합 3~30자여야 합니다.' }, 400, origin);
  }
  if (password.length < 6) return json({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400, origin);
  if (!nickname) return json({ error: '닉네임을 입력해 주세요.' }, 400, origin);
  if (role !== 'admin' && role !== 'member') {
    return json({ error: '역할은 admin 또는 member 여야 합니다.' }, 400, origin);
  }

  // 4) 계정 생성. 메일을 보낼 수 없는 주소이므로 바로 확인 처리한다.
  const created = await admin.auth.admin.createUser({
    email: `${username}@${EMAIL_DOMAIN}`,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? '계정을 만들지 못했습니다.';
    return json({ error: /already/i.test(msg) ? '이미 있는 아이디입니다.' : msg }, 400, origin);
  }

  // 5) 프로필. 실패하면 방금 만든 계정을 되돌린다.
  const inserted = await admin
    .from('profiles')
    .insert({ id: created.data.user.id, username, nickname, role });
  if (inserted.error) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    const msg = inserted.error.message;
    return json({ error: /duplicate|unique/i.test(msg) ? '이미 있는 아이디입니다.' : msg }, 400, origin);
  }

  return json({ ok: true, id: created.data.user.id, username }, 200, origin);
});
