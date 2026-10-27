/*
 * 로그인 상태.
 *
 * 아이디는 도메인 없이 쓰지만 Supabase Auth 는 이메일을 요구하므로,
 * 내부적으로 <아이디>@<ID_DOMAIN> 으로 바꿔 쓴다. 사용자는 아이디만 입력한다.
 * 닉네임·역할은 profiles 테이블에 둔다.
 */
(function () {
  'use strict';

  var cfg = window.APP_CONFIG || {};
  var DOMAIN = cfg.ID_DOMAIN || 'ummjjutube.local';

  var user = null;
  var profile = null;
  var ready = false;
  var listeners = [];

  function emit() {
    var s = state();
    listeners.forEach(function (fn) {
      try { fn(s); } catch (e) { /* 구독자 오류는 무시 */ }
    });
  }

  function state() {
    return {
      ready: ready,
      user: user,
      profile: profile,
      signedIn: !!user,
      isAdmin: !!(profile && profile.role === 'admin'),
      nickname: profile ? profile.nickname : '',
      username: profile ? profile.username : '',
    };
  }

  function emailOf(username) {
    return String(username || '').trim().toLowerCase() + '@' + DOMAIN;
  }

  async function loadProfile() {
    profile = null;
    if (!user) return;
    var res = await window.DB.client()
      .from('profiles')
      .select('username, nickname, role')
      .eq('id', user.id)
      .maybeSingle();
    if (!res.error) profile = res.data || null;
  }

  async function init() {
    if (!window.DB.isConfigured()) {
      ready = true;
      return state();
    }
    var client = window.DB.client();
    var res = await client.auth.getSession();
    user = (res.data && res.data.session && res.data.session.user) || null;
    await loadProfile();
    ready = true;

    client.auth.onAuthStateChange(async function (_event, session) {
      var next = (session && session.user) || null;
      var changed = (next && next.id) !== (user && user.id);
      user = next;
      if (changed) await loadProfile();
      emit();
    });

    return state();
  }

  async function signIn(username, password) {
    var res = await window.DB.client().auth.signInWithPassword({
      email: emailOf(username),
      password: password,
    });
    if (res.error) {
      // 자격 증명 오류는 그대로 보여 주면 "이메일" 이라고 나와 헷갈린다
      if (/invalid login credentials/i.test(res.error.message)) {
        throw new Error('아이디 또는 비밀번호가 맞지 않습니다.');
      }
      throw res.error;
    }
    user = res.data.user;
    await loadProfile();
    emit();
    return state();
  }

  async function signOut() {
    await window.DB.client().auth.signOut();
    user = null;
    profile = null;
    emit();
  }

  window.Auth = {
    init: init,
    signIn: signIn,
    signOut: signOut,
    state: state,
    subscribe: function (fn) { listeners.push(fn); return fn; },
    unsubscribe: function (fn) { listeners = listeners.filter(function (f) { return f !== fn; }); },
  };
})();
