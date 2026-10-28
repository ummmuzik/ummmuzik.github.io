/* 유튜브 / 사운드클라우드 링크 해석 */
(function () {
  'use strict';

  var YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];
  var SC_HOSTS = ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com',
                  'soundcloud.app.goo.gl'];
  // 모바일에서 공유하면 나오는 단축 링크. 어디로 가는지 우리가 알 수 없으므로
  // 주소를 고치지 않고 그대로 둔다(고치면 없는 주소가 된다).
  var SC_SHORT = ['on.soundcloud.com', 'soundcloud.app.goo.gl'];

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
      var path = u.pathname.replace(/\/+$/, '');
      if (!path || path === '/') return null;

      if (SC_SHORT.indexOf(host) !== -1) {
        return {
          provider: 'soundcloud',
          provider_id: path.replace(/^\/+/, ''),
          source_url: 'https://' + host + path,   // 단축 링크는 그대로
          shortened: true,
        };
      }

      // 추적 파라미터 제거, 경로만 유지
      return {
        provider: 'soundcloud',
        provider_id: path.replace(/^\/+/, ''),
        source_url: 'https://soundcloud.com' + path,
      };
    }

    return null;
  }

  /** 커버를 입력하지 않았을 때 유튜브 썸네일로 대체
      (사운드클라우드는 주소만으로 알 수 없어 soundcloudCover 로 물어본다) */
  function fallbackCover(parsed) {
    if (parsed && parsed.provider === 'youtube') {
      return 'https://i.ytimg.com/vi/' + parsed.provider_id + '/hqdefault.jpg';
    }
    return '';
  }

  /* 사운드클라우드 oEmbed. 링크마다 한 번만 물어보고 결과를 들고 있는다.
     실패(CORS·네트워크·없는 트랙)하면 null 을 담아 두어 다시 묻지 않는다. */
  var scInfo = {};

  function soundcloudInfo(url) {
    if (Object.prototype.hasOwnProperty.call(scInfo, url)) return Promise.resolve(scInfo[url]);

    var api = 'https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(url);
    var p = fetch(api, { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        scInfo[url] = data || null;
        return scInfo[url];
      });

    scInfo[url] = p;      // 같은 링크를 연달아 물어보지 않도록
    return p;
  }

  /**
   * 단축 링크가 가리키는 트랙을 알아낸다.
   * 브라우저에서는 리다이렉트를 따라가도 최종 주소를 읽을 수 없으므로(CORS),
   * 사운드클라우드 oEmbed 에 물어본다. 응답의 html 안에 재생기용 주소가 들어 있다.
   * 실패하면 null — 그때는 단축 링크를 그대로 재생기에 넘긴다.
   */
  async function resolveSoundcloud(url) {
    var data = await soundcloudInfo(url);
    if (!data) return null;
    var m = /url=([^&"']+)/.exec(String(data.html || ''));
    if (!m) return null;
    var found = decodeURIComponent(m[1]);
    return /^https?:\/\/(api\.)?soundcloud\.com\//.test(found) ? found : null;
  }

  /** 사운드클라우드 트랙의 커버 그림 주소 (없거나 못 물어보면 '') */
  async function soundcloudCover(url) {
    var data = await soundcloudInfo(url);
    var thumb = data && data.thumbnail_url ? String(data.thumbnail_url) : '';
    if (!/^https?:\/\//.test(thumb)) return '';
    thumb = thumb.replace(/^http:/, 'https:');
    // 작은 그림을 줄 때가 있어 가능하면 500px 짜리로 바꿔 받는다.
    return thumb.replace(/-t\d+x\d+\.(jpg|jpeg|png)$/i, '-t500x500.$1');
  }

  window.Sources = {
    parse: parse,
    fallbackCover: fallbackCover,
    resolveSoundcloud: resolveSoundcloud,
    soundcloudCover: soundcloudCover,
  };
})();
