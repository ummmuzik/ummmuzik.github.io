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

  window.DB = {
    isConfigured: isConfigured,
    listTracks: listTracks,
    addTrack: addTrack,
    uploadCover: uploadCover,
  };
})();
