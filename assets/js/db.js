/* Supabase 클라이언트 + 트랙 CRUD */
(function () {
  'use strict';

  var cfg = window.APP_CONFIG || {};
  var client = null;

  function isConfigured() {
    return (
      typeof cfg.SUPABASE_URL === 'string' &&
      typeof cfg.SUPABASE_ANON_KEY === 'string' &&
      cfg.SUPABASE_URL.indexOf('YOUR-PROJECT-REF') === -1 &&
      cfg.SUPABASE_ANON_KEY.indexOf('YOUR-PUBLIC-ANON-KEY') === -1 &&
      /^https:\/\/.+/.test(cfg.SUPABASE_URL)
    );
  }

  function getClient() {
    if (!isConfigured()) throw new Error('Supabase 설정이 필요합니다 (assets/js/config.js).');
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error('supabase-js 를 불러오지 못했습니다.');
    }
    if (!client) {
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    }
    return client;
  }

  function table() {
    return getClient().from(cfg.TABLE || 'tracks');
  }

  /** 최신순 트랙 목록 */
  async function listTracks() {
    var res = await table()
      .select('id, title, artist, cover_url, source_url, provider, provider_id, created_at')
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  }

  /** 트랙 한 건 저장 */
  async function addTrack(track) {
    var res = await table().insert(track).select().single();
    if (res.error) throw res.error;
    return res.data;
  }

  /** 트랙 한 건 수정 */
  async function updateTrack(id, patch) {
    var res = await table().update(patch).eq('id', id).select();
    if (res.error) throw res.error;
    if (!res.data || !res.data.length) {
      throw new Error('수정된 행이 없습니다 (RLS update 정책을 확인해 주세요).');
    }
    return res.data[0];
  }

  /** 트랙 한 건 삭제 */
  async function deleteTrack(id) {
    var res = await table().delete().eq('id', id).select();
    if (res.error) throw res.error;
    if (!res.data || !res.data.length) {
      throw new Error('삭제된 행이 없습니다 (RLS delete 정책을 확인해 주세요).');
    }
  }

  /**
   * 커버 이미지를 Storage 에 올리고 공개 URL 을 돌려준다.
   * 파일 이름은 쓰지 않고 새로 만든다(한글·공백·중복 회피).
   */
  async function uploadCover(blob, ext) {
    var name =
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + '.' + (ext || 'jpg');
    var bucket = getClient().storage.from(cfg.BUCKET || 'covers');
    var up = await bucket.upload(name, blob, {
      contentType: blob.type || 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    });
    if (up.error) throw up.error;
    return bucket.getPublicUrl(name).data.publicUrl;
  }

  /* ---------- 회원 ---------- */

  /** 회원 목록. RLS 상 관리자만 전체를 볼 수 있다. */
  async function listProfiles() {
    var res = await getClient()
      .from('profiles')
      .select('id, username, nickname, role, created_at')
      .order('created_at', { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  /**
   * 계정 생성. 관리자 키는 사이트에 둘 수 없으므로 Supabase Edge Function 에
   * 맡긴다. 함수가 호출자의 토큰으로 관리자인지 확인한 뒤 계정을 만든다.
   */
  async function createAccount(payload) {
    var res = await getClient().functions.invoke('admin-create-user', { body: payload });
    if (res.error) {
      var msg = res.error.message || '계정을 만들지 못했습니다.';
      // 함수가 본문에 담아 보낸 이유를 꺼내 본다
      try {
        var body = res.error.context && (await res.error.context.json());
        if (body && body.error) msg = body.error;
      } catch (e) { /* 본문이 없을 수도 있다 */ }
      throw new Error(msg);
    }
    if (res.data && res.data.error) throw new Error(res.data.error);
    return res.data;
  }

  window.DB = {
    client: getClient,
    listProfiles: listProfiles,
    createAccount: createAccount,
    isConfigured: isConfigured,
    listTracks: listTracks,
    addTrack: addTrack,
    updateTrack: updateTrack,
    deleteTrack: deleteTrack,
    uploadCover: uploadCover,
  };
})();
