/*
 * 재생 엔진. 화면(목록·상세·등록)이 바뀌어도 살아 있어야 하므로 특정 화면의
 * DOM 을 직접 만지지 않는다. 상태가 바뀌면 구독자에게 알리고, 화면 쪽에서
 * 자기 UI 를 갱신한다.
 *
 * 유튜브는 IFrame Player API, 사운드클라우드는 Widget API 를 쓰고,
 * 두 스크립트는 해당 소스를 처음 재생할 때만 불러온다.
 */
(function () {
  'use strict';

  var YT_API = 'https://www.youtube.com/iframe_api';
  // 쿠키를 덜 심는 쪽. 광고가 사라지지는 않는다.
  var YT_HOST = 'https://www.youtube-nocookie.com';
  var SC_API = 'https://w.soundcloud.com/player/api.js';

  var queue = [];
  var index = -1;
  var playingId = null;
  var mode = null;        // 'youtube' | 'soundcloud'
  var playing = false;
  var duration = 0;
  var position = 0;
  var volume = 80;
  var error = '';

  var yt = null, ytFrame = null, ytBuilding = false, ytPlayerReady = false;
  var sc = null, scLoading = false, scLoaded = false;
  var pending = null;
  var wantPlay = false;    // 재생을 요청해 놓고 아직 시작되지 않은 상태
  var retryTimers = [];
  var gestureArmed = false;
  var ticker = null;
  var listeners = [];

  var embeds = null, scFrame = null;

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
      setError('재생기를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
    });
    document.head.appendChild(s);
  }

  function setError(msg) {
    error = msg || '';
    emit();
  }

  /* ---------- 재생 재시도 ----------
     자동 재생이 거부될 수 있어(특히 아이폰) 몇 번 더 눌러 보고,
     그래도 안 되면 다음 터치 제스처 안에서 다시 시도한다. */

  function clearRetries() {
    retryTimers.forEach(clearTimeout);
    retryTimers = [];
    disarmGesture();
  }

  function nudgePlay() {
    if (!wantPlay || playing) return;
    if (mode === 'youtube' && yt && ytPlayerReady) {
      try { yt.playVideo(); } catch (e) { /* 아직 준비 전 */ }
    } else if (mode === 'soundcloud' && sc && scLoaded) {
      try { sc.play(); } catch (e) { /* 위젯이 아직 */ }
    }
  }

  function onGesture() {
    disarmGesture();
    nudgePlay();
  }

  function disarmGesture() {
    if (!gestureArmed) return;
    gestureArmed = false;
    document.removeEventListener('click', onGesture);
    document.removeEventListener('touchend', onGesture);
  }

  /* 거품 단계에서 듣는다. 화면의 다른 처리가 끝난 뒤, 그러나 아직 같은
     사용자 동작 안에서 재생을 눌러야 아이폰이 허용한다. */
  function armGestureRetry() {
    if (gestureArmed) return;
    gestureArmed = true;
    document.addEventListener('click', onGesture);
    document.addEventListener('touchend', onGesture);
  }

  function scheduleNudges() {
    clearRetries();
    [600, 1500, 2600].forEach(function (ms) {
      retryTimers.push(setTimeout(nudgePlay, ms));
    });
    armGestureRetry();
  }

  function state() {
    return {
      track: queue[index] || null,
      index: index,
      playing: playing,
      position: position,
      duration: duration,
      volume: volume,
      error: error,
      hasPrev: index > 0,
      hasNext: index >= 0 && index + 1 < queue.length,
    };
  }

  function emit() {
    var s = state();
    listeners.forEach(function (fn) {
      try {
        fn(s);
      } catch (e) {
        /* 한 화면의 오류가 재생을 막지 않게 */
      }
    });
  }

  function readVolume() {
    try {
      var v = parseInt(localStorage.getItem('ummmuzik:volume'), 10);
      if (isFinite(v) && v >= 0 && v <= 100) volume = v;
    } catch (e) { /* 저장소 접근 불가 */ }
  }

  function saveVolume() {
    try {
      localStorage.setItem('ummmuzik:volume', String(volume));
    } catch (e) { /* 무시 */ }
  }

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
    } catch (e) { /* 미지원 브라우저 */ }
  }

  /* ---------- 유튜브 ---------- */

  /*
   * 재생기는 IFrame API 로 한 번만 만든다. 직접 만든 iframe 과 API 가 만든
   * 재생기를 섞으면 서로 덮어써서 아무것도 동작하지 않는다.
   *
   * 아이폰은 "부모 창에서 방금 일어난 터치" 안에서 재생 명령이 나가야만
   * iframe 재생을 허용한다. 그래서 영상 없는 빈 재생기를 미리 띄워 두고
   * (영상이 없으니 광고도 없다), 카드를 누른 그 자리에서 영상을 건다.
   */

  var pendingVideo = null;   // 재생기가 준비되면 걸 영상

  function ytEvents() {
    return {
      onReady: function () {
        ytPlayerReady = true;
        ytFrame = document.getElementById('yt-frame');
        try { yt.setVolume(volume); } catch (e) { /* 아직 준비 전일 수 있다 */ }
        if (pendingVideo && wantPlay) {
          try { yt.loadVideoById(pendingVideo); } catch (e) { /* 다음 재시도에 맡긴다 */ }
        }
        nudgePlay();
        emit();
      },
      onStateChange: function (e) {
        var S = window.YT.PlayerState;
        // 재생 여부는 추측하지 않고 재생기가 알려 주는 상태만 따른다.
        if (e.data === S.PLAYING || e.data === S.BUFFERING) {
          playing = true;
          wantPlay = false;
          clearRetries();
          emit();
        } else if (e.data === S.PAUSED || e.data === S.UNSTARTED || e.data === S.CUED) {
          playing = false;
          emit();
        } else if (e.data === S.ENDED) {
          next();
        }
      },
      onError: function () {
        playing = false;
        setError('이 유튜브 영상은 재생할 수 없습니다.');
      },
    };
  }

  /** API 를 받아 재생기를 만든다. 여러 번 불러도 하나만 만들어진다. */
  function ensureYouTube() {
    if (yt || ytBuilding) return;
    ytBuilding = true;

    function build() {
      if (yt) return;
      var ph = document.getElementById('yt-frame');
      if (!ph) return;
      yt = new window.YT.Player(ph, {
        host: YT_HOST,          // 쿠키를 덜 심는 쪽
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0,
          disablekb: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          origin: location.origin,
        },
        events: ytEvents(),
      });
    }

    if (window.YT && window.YT.Player) return build();

    var prevHook = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prevHook === 'function') prevHook();
      build();
    };
    loadScript(YT_API, function () { /* onYouTubeIframeAPIReady 가 이어받는다 */ });
  }

  /** 화면을 처음 건드릴 때 한 번. 이때부터 유튜브에 접속한다(영상은 아직). */
  function warmUpYouTube() {
    ensureYouTube();
  }

  function playYouTube(track) {
    pendingVideo = track.provider_id;

    // 재생기가 이미 있으면 누른 그 자리에서 바로 건다(아이폰도 이 경로로 된다).
    if (yt && ytPlayerReady) {
      try {
        yt.loadVideoById(track.provider_id);
        yt.setVolume(volume);
        yt.playVideo();
      } catch (e) { /* 재시도에 맡긴다 */ }
      return;
    }

    // 아직 만들어지는 중이면 준비되는 대로 onReady 에서 걸린다.
    ensureYouTube();
  }

  /* ---------- 사운드클라우드 ---------- */

  function scEmbedUrl(sourceUrl, autoplay) {
    return (
      'https://w.soundcloud.com/player/?url=' + encodeURIComponent(sourceUrl) +
      '&auto_play=' + (autoplay ? 'true' : 'false') +
      '&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true'
    );
  }

  /** onReady(alreadyLoaded) — true 면 위젯을 만들 때 이미 이 트랙을 로드했다 */
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
        setError('사운드클라우드 재생기를 불러오지 못했습니다.');
        return;
      }
      scFrame.src = scEmbedUrl(track.source_url, true);
      sc = window.SC.Widget(scFrame);

      sc.bind(window.SC.Widget.Events.READY, function () {
        if (scLoaded) return;
        scLoaded = true;
        sc.setVolume(volume);
        sc.getDuration(function (ms) { duration = (ms || 0) / 1000; emit(); });
        nudgePlay();
        emit();
        onReady(true);
      });
      sc.bind(window.SC.Widget.Events.PLAY, function () {
        playing = true;
        wantPlay = false;
        clearRetries();
        sc.getDuration(function (ms) { duration = (ms || 0) / 1000; emit(); });
        emit();
      });
      sc.bind(window.SC.Widget.Events.PAUSE, function () { playing = false; emit(); });
      sc.bind(window.SC.Widget.Events.FINISH, function () { next(); });
      sc.bind(window.SC.Widget.Events.PLAY_PROGRESS, function (e) {
        if (e && typeof e.currentPosition === 'number') {
          position = e.currentPosition / 1000;
          emit();
        }
      });
      sc.bind(window.SC.Widget.Events.ERROR, function () {
        setError('이 사운드클라우드 트랙은 재생할 수 없습니다.');
      });
    });
  }

  /* ---------- 재생 제어 ---------- */

  function setQueue(tracks) {
    queue = tracks || [];
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
    error = '';
    wantPlay = true;
    scheduleNudges();
    updateMediaSession(track);
    emit();

    if (track.provider === 'youtube') {
      mode = 'youtube';
      applyMode();
      if (sc && scLoaded) { try { sc.pause(); } catch (e) {} }
      pending = track;
      playYouTube(track);
      emit();
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
              sc.getDuration(function (ms) { duration = (ms || 0) / 1000; emit(); });
            },
          });
        }
        emit();
      });
    } else {
      setError('지원하지 않는 소스입니다.');
    }
    startTicker();
  }

  function indexOf(track) {
    var i = queue.findIndex(function (t) { return t.id === track.id; });
    if (i === -1) {
      queue = queue.concat([track]);
      i = queue.length - 1;
    }
    return i;
  }

  /** 트랙을 재생한다. 같은 트랙이면 재생/일시정지를 토글한다. */
  function playTrack(track, tracks) {
    if (tracks) setQueue(tracks);
    var i = indexOf(track);
    if (i === index) { toggle(); return; }
    playAt(i);
  }

  /** 무조건 재생 쪽으로. 이미 그 곡이면 멈추지 않고 이어서 튼다. */
  function playNow(track, tracks) {
    if (tracks) setQueue(tracks);
    var i = indexOf(track);
    if (i === index) {
      if (!playing) toggle();
      return;
    }
    playAt(i);
  }

  function toggle() {
    if (index < 0) return;
    wantPlay = !playing;        // 사용자가 멈췄으면 더 눌러 보지 않는다
    if (!wantPlay) clearRetries();
    if (mode === 'youtube' && yt && ytPlayerReady) {
      if (playing) yt.pauseVideo();
      else yt.playVideo();
    } else if (mode === 'soundcloud' && sc && scLoaded) {
      sc.toggle();
    }
  }

  function next() {
    if (index + 1 < queue.length) playAt(index + 1);
    else { playing = false; position = 0; emit(); }
  }

  function prev() {
    if (position > 3) { seekTo(0); return; }   // 3초 넘게 들었으면 처음으로
    if (index - 1 >= 0) playAt(index - 1);
    else seekTo(0);
  }

  /** 재생을 멈추고 아무 곡도 선택하지 않은 상태로 되돌린다(예: 재생 중인 곡 삭제) */
  function stop() {
    wantPlay = false;
    clearRetries();
    if (mode === 'youtube' && yt && ytPlayerReady) { try { yt.pauseVideo(); } catch (e) {} }
    if (mode === 'soundcloud' && sc && scLoaded) { try { sc.pause(); } catch (e) {} }
    pending = null;
    playing = false;
    index = -1;
    playingId = null;
    position = 0;
    duration = 0;
    error = '';
    emit();
  }

  function seekTo(sec) {
    position = Math.max(0, Math.min(sec, duration || sec));
    if (mode === 'youtube' && yt && ytPlayerReady) yt.seekTo(position, true);
    else if (mode === 'soundcloud' && sc && scLoaded) sc.seekTo(position * 1000);
    emit();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(100, v));
    if (yt && ytPlayerReady) { try { yt.setVolume(volume); } catch (e) {} }
    if (sc && scLoaded) { try { sc.setVolume(volume); } catch (e) {} }
    saveVolume();
    emit();
  }

  function startTicker() {
    if (ticker) return;
    ticker = setInterval(function () {
      if (mode === 'youtube' && yt && ytPlayerReady) {
        try {
          var d = yt.getDuration();
          if (isFinite(d) && d > 0) duration = d;
          position = yt.getCurrentTime() || 0;
          emit();
        } catch (e) { /* 아직 준비 중 */ }
      }
    }, 250);
  }

  function applyMode() {
    embeds.setAttribute('data-mode', mode || '');
  }

  /* ---------- 초기화 ---------- */

  function init() {
    embeds = document.getElementById('embeds');
    scFrame = document.getElementById('sc-frame');
    embeds.hidden = false;      // 화면 밖에 있을 뿐, 항상 살아 있어야 한다
    readVolume();

    /* 빈 재생기를 미리 띄워 둔다. 영상은 아직 안 불러오므로 광고도 없다.
       첫 탭이 "터치 안에서 재생 명령"이 되려면 그 전에 준비돼 있어야 한다. */
    setTimeout(warmUpYouTube, 120);
    document.addEventListener('pointerdown', warmUpYouTube, { once: true, capture: true });

    // 스페이스바 = 재생/일시정지 (입력 중일 때는 제외)
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space' || index < 0) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      toggle();
    });
  }

  window.Player = {
    init: init,
    setQueue: setQueue,
    playTrack: playTrack,
    playNow: playNow,
    toggle: toggle,
    next: next,
    prev: prev,
    stop: stop,
    seekTo: seekTo,
    setVolume: setVolume,
    state: state,
    subscribe: function (fn) { listeners.push(fn); return fn; },
    unsubscribe: function (fn) { listeners = listeners.filter(function (f) { return f !== fn; }); },
  };
})();
