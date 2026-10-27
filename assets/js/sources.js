/* 유튜브 / 사운드클라우드 링크 해석 */
(function () {
  'use strict';

  var YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];
  var SC_HOSTS = ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'];

  function hostOf(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function youtubeId(url) {
    var u;
    try {
      u = new URL(url);
    } catch (e) {
      return null;
    }
    if (u.hostname.toLowerCase() === 'youtu.be') {
      return u.pathname.slice(1).split('/')[0] || null;
    }
    var v = u.searchParams.get('v');
    if (v) return v;
    // /embed/ID, /shorts/ID, /live/ID
    var m = u.pathname.match(/\/(embed|shorts|live|v)\/([^/?#]+)/);
    return m ? m[2] : null;
  }

  /**
   * 입력된 링크를 { provider, provider_id, source_url } 로 정규화한다.
   * 지원하지 않는 링크면 null 을 반환한다.
   */
  function parse(rawUrl) {
    var url = String(rawUrl || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    var host = hostOf(url);
    if (!host) return null;

    if (YT_HOSTS.indexOf(host) !== -1) {
      var id = youtubeId(url);
      if (!id) return null;
      return {
        provider: 'youtube',
        provider_id: id,
        source_url: 'https://www.youtube.com/watch?v=' + id,
      };
    }

    if (SC_HOSTS.indexOf(host) !== -1) {
      var u = new URL(url);
      // 추적 파라미터 제거, 경로만 유지
      if (u.pathname === '/' || u.pathname === '') return null;
      return {
        provider: 'soundcloud',
        provider_id: u.pathname.replace(/^\/+/, ''),
        source_url: 'https://soundcloud.com' + u.pathname.replace(/\/+$/, ''),
      };
    }

    return null;
  }

  /** 커버를 입력하지 않았을 때 유튜브 썸네일로 대체 */
  function fallbackCover(parsed) {
    if (parsed && parsed.provider === 'youtube') {
      return 'https://i.ytimg.com/vi/' + parsed.provider_id + '/hqdefault.jpg';
    }
    return '';
  }

  window.Sources = { parse: parse, fallbackCover: fallbackCover };
})();
