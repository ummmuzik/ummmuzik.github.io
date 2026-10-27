/*
 * 하단 고정 플레이어.
 * 유튜브(IFrame Player API)와 사운드클라우드(Widget API)를 하나의 컨트롤로 감싼다.
 * 두 API 스크립트는 해당 소스를 처음 재생할 때 주입한다.
 */
(function () {
  'use strict';

  var YT_API = 'https://www.youtube.com/iframe_api';
  var SC_API = 'https://w.soundcloud.com/player/api.js';

  var queue = [];      // 재생 목록 (목록 페이지에 보이는 순서)
  var index = -1;      // 현재 트랙 위치
  var mode = null;     // 'youtube' | 'soundcloud'
  var playing = false;

  var yt = null, ytLoading = false, ytPlayerReady = false;
  var sc = null, scLoading = false, scLoaded = false;

  var duration = 0, position = 0, dragging = false;
  var volume = 80;
  var ticker = null;
  var pending = null;  // API 준비 전에 누른 트랙
  var playingId = null;
  var listeners = [];

  var el = {};

  /* ---------- 유틸 ---------- */

  function loadScript(src, done) {
    var existing = document.querySelector('script[data-src="' + src + '"]');
    if (existing) {
      existing.addEventListener('load', done);
      return;
    }
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute('data-src', src);
    s.addEventListener('load', done);
    s.addEventListener('error', function () {
      setStatus('재생기를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
    });
    document.head.appendChild(s);
  }

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** range 입력의 채워진 비율을 CSS 변수로 넘긴다 */
  function fill(input) {
    var max = Number(input.max) || 1;
    var val = Number(input.value) || 0;
    input.style.setProperty('--fill', (max > 0 ? (val / max) * 100 : 0) + '%');
  }

  function setStatus(msg) {
    if (el.status) el.status.textContent = msg || '';
  }

  function emit() {
    var track = queue[index] || null;
    listeners.forEach(function (fn) {
      try {
        fn({ track: track, index: index, playing: playing });
      } catch (e) {
        /* 리스너 오류는 재생을 막지 않는다 */
      }
    });
  }

  function readVolume() {
    try {
      var v = parseInt(localStorage.getItem('ummmuzik:volume'), 10);
      if (isFinite(v) && v >= 0 && v <= 100) volume = v;
    } catch (e) { /* 저장소 접근 불가 — 기본값 사용 */ }
  }

  function saveVolume() {
    try {
      localStorage.setItem('ummmuzik:volume', String(volume));
    } catch (e) { /* 무시 */ }
  }

  /* ---------- 미디어 세션 (잠금화면 / 미디어 키) ---------- */

  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title || '',
        artist: track.artist || '',
        artwork: track.cover_url ? [{ src: track.cover_url }] : [],
      });
      navigator.mediaSession.setActionHandler('play', function () { toggle(); });
      navigator.mediaSession.setActionHandler('pause', function () { toggle(); });
      navigator.mediaSession.setActionHandler('previoustrack', function () { prev(); });
      navigator.mediaSession.setActionHandler('nexttrack', function () { next(); });
    } catch (e) { /* 지원하지 않는 브라우저 */ }
  }

  /* ---------- 유튜브 ---------- */

  function ensureYouTube(onReady) {
    if (ytPlayerReady) return onReady();

    if (!ytLoading) {
      ytLoading = true;
      var prevHook = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prevHook === 'function') prevHook();
        createYouTube();
      };
      if (window.YT && window.YT.Player) createYouTube();
      else loadScript(YT_API, function () { /* onYouTubeIframeAPIReady 가 이어받는다 */ });
    }

    var tries = 0;
    var waiter = setInterval(function () {
      if (ytPlayerReady) {
        clearInterval(waiter);
        onReady();
      } else if (++tries > 200) {  // 20초
        clearInterval(waiter);
        setStatus('유튜브 재생기를 불러오지 못했습니다.');
      }
    }, 100);
  }

  function createYouTube() {
    if (yt) return;
    yt = new window.YT.Player('yt-frame', {
      width: '100%',
      height: '100%',
      playerVars: {
        controls: 0,
        disablekb: 1,
        playsinline: 1,
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
      },
      events: {
        onReady: function () {
          ytPlayerReady = true;
          yt.setVolume(volume);
        },
        onStateChange: function (e) {
          var S = window.YT.PlayerState;
          if (e.data === S.PLAYING) { playing = true; render(); emit(); }
          else if (e.data === S.PAUSED) { playing = false; render(); emit(); }
          else if (e.data === S.ENDED) { next(); }
        },
        onError: function () {
          setStatus('이 유튜브 영상은 재생할 수 없습니다.');
          playing = false;
          render();
        },
      },
    });
  }

  /* ---------- 사운드클라우드 ---------- */

  function scEmbedUrl(sourceUrl, autoplay) {
    return (
      'https://w.soundcloud.com/player/?url=' + encodeURIComponent(sourceUrl) +
      '&auto_play=' + (autoplay ? 'true' : 'false') +
      '&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true'
    );
  }

  /**
   * 사운드클라우드 위젯을 준비한다.
   * onReady(alreadyLoaded) — alreadyLoaded 가 true 면 위젯을 만들 때 이미 이 트랙을
   * 로드했으므로 호출한 쪽에서 load() 를 다시 부르지 않아야 한다.
   */
  function ensureSoundCloud(track, onReady) {
    if (scLoaded) return onReady(false);

    if (scLoading) {
      var tries = 0;
      var waiter = setInterval(function () {
        if (scLoaded) { clearInterval(waiter); onReady(false); }
        else if (++tries > 200) { clearInterval(waiter); }
      }, 100);
      return;
    }

    scLoading = true;
    loadScript(SC_API, function () {
      if (!window.SC || !window.SC.Widget) {
        setStatus('사운드클라우드 재생기를 불러오지 못했습니다.');
        return;
      }
      // 첫 트랙은 iframe src 로 바로 로드한다 (auto_play 포함).
      el.scFrame.src = scEmbedUrl(track.source_url, true);
      sc = window.SC.Widget(el.scFrame);
      sc.bind(window.SC.Widget.Events.READY, function () {
        if (!scLoaded) {
          scLoaded = true;
          sc.setVolume(volume);
          sc.getDuration(function (ms) { duration = (ms || 0) / 1000; render(); });
          playing = true;
          render();
          emit();
          onReady(true);  // iframe src 로 이미 이 트랙을 로드했다
        }
      });
      sc.bind(window.SC.Widget.Events.PLAY, function () {
        playing = true;
        sc.getDuration(function (ms) { duration = (ms || 0) / 1000; render(); });
        render();
        emit();
      });
      sc.bind(window.SC.Widget.Events.PAUSE, function () { playing = false; render(); emit(); });
      sc.bind(window.SC.Widget.Events.FINISH, function () { next(); });
      sc.bind(window.SC.Widget.Events.PLAY_PROGRESS, function (e) {
        if (!dragging && e && typeof e.currentPosition === 'number') {
          position = e.currentPosition / 1000;
          render();
        }
      });
      sc.bind(window.SC.Widget.Events.ERROR, function () {
        setStatus('이 사운드클라우드 트랙은 재생할 수 없습니다.');
      });
    });
  }

  /* ---------- 재생 제어 ---------- */

  function setQueue(tracks) {
    queue = tracks || [];
    // 목록이 갱신되어도 재생 중인 트랙의 위치를 잃지 않게 맞춰 준다.
    if (playingId) {
      var found = queue.findIndex(function (t) { return t.id === playingId; });
      if (found !== -1) index = found;
    }
  }

  function playAt(i) {
    if (i < 0 || i >= queue.length) return;
    var track = queue[i];
    index = i;
    playingId = track.id;
    position = 0;
    duration = 0;
    setStatus('');
    el.root.hidden = false;
    document.body.classList.add('has-player');
    if (typeof el.syncPadding === 'function') el.syncPadding();
    renderMeta(track);
    updateMediaSession(track);
    emit();

    if (track.provider === 'youtube') {
      mode = 'youtube';
      applyMode();
      if (sc && scLoaded) { try { sc.pause(); } catch (e) {} }
      pending = track;
      ensureYouTube(function () {
        if (pending !== track && mode !== 'youtube') return;
        yt.loadVideoById(track.provider_id);
        yt.setVolume(volume);
        playing = true;
        render();
      });
    } else if (track.provider === 'soundcloud') {
      mode = 'soundcloud';
      applyMode();
      if (yt && ytPlayerReady) { try { yt.pauseVideo(); } catch (e) {} }
      pending = track;
      ensureSoundCloud(track, function (alreadyLoaded) {
        if (pending !== track) return;
        if (!alreadyLoaded) {
          sc.load(track.source_url, {
            auto_play: true,
            visual: true,
            show_comments: false,
            hide_related: true,
            callback: function () {
              sc.setVolume(volume);
              sc.getDuration(function (ms) { duration = (ms || 0) / 1000; render(); });
            },
          });
        }
        playing = true;
        render();
      });
    } else {
      setStatus('지원하지 않는 소스입니다.');
    }
    startTicker();
  }

  function playTrack(track, tracks) {
    if (tracks) setQueue(tracks);
    var i = queue.findIndex(function (t) { return t.id === track.id; });
    if (i === -1) {
      queue = queue.concat([track]);
      i = queue.length - 1;
    }
    if (i === index) { toggle(); return; }  // 같은 트랙을 다시 누르면 재생/일시정지
    playAt(i);
  }

  function toggle() {
    if (index < 0) return;
    if (mode === 'youtube' && yt && ytPlayerReady) {
      if (playing) yt.pauseVideo();
      else yt.playVideo();
    } else if (mode === 'soundcloud' && sc && scLoaded) {
      sc.toggle();
    }
  }

  function next() {
    if (index + 1 < queue.length) playAt(index + 1);
    else { playing = false; position = 0; render(); emit(); }
  }

  function prev() {
    // 3초 이상 재생했으면 처음으로, 아니면 이전 트랙
    if (position > 3) { seekTo(0); return; }
    if (index - 1 >= 0) playAt(index - 1);
    else seekTo(0);
  }

  function seekTo(sec) {
    position = Math.max(0, Math.min(sec, duration || sec));
    if (mode === 'youtube' && yt && ytPlayerReady) yt.seekTo(position, true);
    else if (mode === 'soundcloud' && sc && scLoaded) sc.seekTo(position * 1000);
    render();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(100, v));
    if (yt && ytPlayerReady) { try { yt.setVolume(volume); } catch (e) {} }
    if (sc && scLoaded) { try { sc.setVolume(volume); } catch (e) {} }
    saveVolume();
    render();
  }

  function startTicker() {
    if (ticker) return;
    ticker = setInterval(function () {
      if (mode === 'youtube' && yt && ytPlayerReady && !dragging) {
        try {
          var d = yt.getDuration();
          if (isFinite(d) && d > 0) duration = d;
          position = yt.getCurrentTime() || 0;
          render();
        } catch (e) { /* 아직 준비 중 */ }
      }
    }, 250);
  }

  /* ---------- 렌더링 ---------- */

  function applyMode() {
    el.root.setAttribute('data-mode', mode || '');
  }

  function renderMeta(track) {
    el.title.textContent = track.title || '제목 없음';
    el.artist.textContent = track.artist || '아티스트 미상';
    if (track.cover_url) {
      el.cover.src = track.cover_url;
      el.cover.hidden = false;
    } else {
      el.cover.removeAttribute('src');
      el.cover.hidden = true;
    }
    el.source.href = track.source_url;
    el.source.textContent = track.provider === 'youtube' ? 'YouTube' : 'SoundCloud';
  }

  function render() {
    el.toggle.setAttribute('aria-label', playing ? '일시정지' : '재생');
    el.toggle.classList.toggle('is-playing', playing);
    el.cur.textContent = fmt(position);
    el.dur.textContent = duration ? fmt(duration) : '--:--';
    if (!dragging) {
      el.seek.max = String(Math.max(1, Math.floor(duration || 0)));
      el.seek.value = String(Math.floor(position || 0));
    }
    el.seek.disabled = !duration;
    fill(el.seek);
    el.vol.value = String(volume);
    fill(el.vol);
    el.prev.disabled = queue.length === 0;
    el.next.disabled = index + 1 >= queue.length;
  }

  /* ---------- 초기화 ---------- */

  function init() {
    el.root = document.getElementById('player');
    if (!el.root) return;
    el.cover = document.getElementById('p-cover');
    el.title = document.getElementById('p-title');
    el.artist = document.getElementById('p-artist');
    el.source = document.getElementById('p-source');
    el.toggle = document.getElementById('p-toggle');
    el.prev = document.getElementById('p-prev');
    el.next = document.getElementById('p-next');
    el.seek = document.getElementById('p-seek');
    el.cur = document.getElementById('p-cur');
    el.dur = document.getElementById('p-dur');
    el.vol = document.getElementById('p-vol');
    el.expand = document.getElementById('p-expand');
    el.status = document.getElementById('p-status');
    el.scFrame = document.getElementById('sc-frame');

    readVolume();

    el.toggle.addEventListener('click', toggle);
    el.prev.addEventListener('click', prev);
    el.next.addEventListener('click', next);
    el.vol.addEventListener('input', function () { setVolume(parseInt(el.vol.value, 10)); });
    el.vol.value = String(volume);
    fill(el.vol);

    el.seek.addEventListener('pointerdown', function () { dragging = true; });
    el.seek.addEventListener('input', function () {
      el.cur.textContent = fmt(parseInt(el.seek.value, 10));
      fill(el.seek);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      seekTo(parseInt(el.seek.value, 10));
    }
    el.seek.addEventListener('change', endDrag);
    el.seek.addEventListener('pointerup', endDrag);
    el.seek.addEventListener('keyup', endDrag);

    // 플레이어 높이가 바뀌면 그만큼 본문 아래 여백을 맞춰, 마지막 줄이 가려지지 않게 한다.
    function syncBodyPadding() {
      if (el.root.hidden) return;
      document.body.style.paddingBottom = (el.root.offsetHeight + 16) + 'px';
    }
    if (window.ResizeObserver) {
      new ResizeObserver(syncBodyPadding).observe(el.root);
    } else {
      window.addEventListener('resize', syncBodyPadding);
    }

    el.expand.addEventListener('click', function () {
      var open = el.root.classList.toggle('is-expanded');
      el.expand.setAttribute('aria-expanded', String(open));
      el.expand.setAttribute('aria-label', open ? '영상 접기' : '영상 펼치기');
      syncBodyPadding();
    });

    // 스페이스바 = 재생/일시정지 (입력 중일 때는 제외)
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space' || index < 0) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      toggle();
    });

    el.syncPadding = syncBodyPadding;
    render();
  }

  window.Player = {
    init: init,
    setQueue: setQueue,
    playTrack: playTrack,
    toggle: toggle,
    next: next,
    prev: prev,
    onChange: function (fn) { listeners.push(fn); },
    current: function () { return queue[index] || null; },
  };
})();
