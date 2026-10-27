/*
 * 라우터 + 화면.
 *
 * 문서는 하나지만 주소는 화면마다 다르다.
 *   #/            목록
 *   #/track/<id>  상세 (크게 보는 커버 + 재생 조작)
 *   #/add         등록
 *
 * 문서를 새로 읽지 않으므로 화면을 오가도 재생이 끊기지 않는다.
 */
(function () {
  'use strict';

  var view = document.getElementById('view');
  var topLeft = document.getElementById('top-left');
  var topRight = document.getElementById('top-right');
  var embeds = document.getElementById('embeds');
  var bar = document.getElementById('player');

  var tracksCache = null;
  var teardown = [];        // 현재 화면을 떠날 때 정리할 것들
  var anchorObserver = null;

  /* ---------- 자료 ---------- */

  async function getTracks() {
    if (!tracksCache) tracksCache = await window.DB.listTracks();
    return tracksCache;
  }

  /* ---------- 공통 ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fill(input) {
    var max = Number(input.max) || 1;
    var val = Number(input.value) || 0;
    input.style.setProperty('--fill', (max > 0 ? (val / max) * 100 : 0) + '%');
  }

  function initials(track) {
    return String(track.title || track.artist || '?').trim().slice(0, 2).toUpperCase();
  }

  function providerName(track) {
    return track.provider === 'youtube' ? 'YouTube' : 'SoundCloud';
  }

  function trackHref(track) {
    return '#/track/' + encodeURIComponent(track.id);
  }

  /** 커버 이미지를 넣고, 없거나 깨지면 이니셜 자리표시로 바꾼다 */
  function paintCover(box, img, track) {
    if (track.cover_url) {
      img.src = track.cover_url;
      img.hidden = false;
      box.classList.remove('is-empty');
      img.onerror = function () {
        img.hidden = true;
        box.classList.add('is-empty');
        box.dataset.initials = initials(track);
      };
    } else {
      img.hidden = true;
      box.classList.add('is-empty');
      box.dataset.initials = initials(track);
    }
  }

  /* ---------- 재생기 iframe 위치 맞추기 ---------- */

  /* iframe 은 화면 밖(전역)에 떠 있고, 현재 화면의 [data-embed-anchor] 박스
     위에 겹쳐 둔다. DOM 을 옮기지 않으므로 재생이 끊기지 않는다. */
  function syncEmbeds() {
    var anchor = document.querySelector('[data-embed-anchor]');
    if (!anchor || anchor.offsetParent === null) return;
    var r = anchor.getBoundingClientRect();
    if (!r.width || !r.height) return;
    embeds.style.left = r.left + 'px';
    embeds.style.top = r.top + 'px';
    embeds.style.width = r.width + 'px';
    embeds.style.height = r.height + 'px';
    embeds.style.borderRadius = getComputedStyle(anchor).borderRadius;
  }

  function watchAnchor() {
    if (anchorObserver) { anchorObserver.disconnect(); anchorObserver = null; }
    var anchor = document.querySelector('[data-embed-anchor]');
    if (anchor && window.ResizeObserver) {
      anchorObserver = new ResizeObserver(syncEmbeds);
      anchorObserver.observe(anchor);
    }
    syncEmbeds();
    requestAnimationFrame(syncEmbeds);
  }

  window.addEventListener('resize', syncEmbeds);
  window.addEventListener('scroll', syncEmbeds, { passive: true });

  /* ---------- 하단 고정 플레이어 (목록·등록 화면) ---------- */

  var barEl = {
    media: document.getElementById('p-media'),
    cover: document.getElementById('p-cover'),
    title: document.getElementById('p-title'),
    artist: document.getElementById('p-artist'),
    status: document.getElementById('p-status'),
    toggle: document.getElementById('p-toggle'),
    prev: document.getElementById('p-prev'),
    next: document.getElementById('p-next'),
    seek: document.getElementById('p-seek'),
    cur: document.getElementById('p-cur'),
    dur: document.getElementById('p-dur'),
    vol: document.getElementById('p-vol'),
  };
  var barDragging = false;
  var barTrackId = null;

  function initBar() {
    barEl.toggle.addEventListener('click', function () { window.Player.toggle(); });
    barEl.prev.addEventListener('click', function () { window.Player.prev(); });
    barEl.next.addEventListener('click', function () { window.Player.next(); });
    barEl.vol.addEventListener('input', function () {
      window.Player.setVolume(parseInt(barEl.vol.value, 10));
    });

    barEl.seek.addEventListener('pointerdown', function () { barDragging = true; });
    barEl.seek.addEventListener('input', function () {
      barEl.cur.textContent = fmt(parseInt(barEl.seek.value, 10));
      fill(barEl.seek);
    });
    function end() {
      if (!barDragging) return;
      barDragging = false;
      window.Player.seekTo(parseInt(barEl.seek.value, 10));
    }
    barEl.seek.addEventListener('change', end);
    barEl.seek.addEventListener('pointerup', end);
    barEl.seek.addEventListener('keyup', end);
  }

  function renderBar(s) {
    var show = !!s.track && route().name !== 'track';
    bar.hidden = !show;
    document.body.style.paddingBottom = show ? bar.offsetHeight + 16 + 'px' : '0px';
    if (!show) return;

    if (s.track.id !== barTrackId) {
      barTrackId = s.track.id;
      barEl.title.textContent = s.track.title || '제목 없음';
      barEl.title.href = trackHref(s.track);
      barEl.media.href = trackHref(s.track);
      barEl.artist.textContent = s.track.artist || '아티스트 미상';
      paintCover(barEl.media, barEl.cover, s.track);
    }

    barEl.status.textContent = s.error || '';
    barEl.toggle.classList.toggle('is-playing', s.playing);
    barEl.toggle.setAttribute('aria-label', s.playing ? '일시정지' : '재생');
    barEl.cur.textContent = fmt(s.position);
    barEl.dur.textContent = s.duration ? fmt(s.duration) : '--:--';
    if (!barDragging) {
      barEl.seek.max = String(Math.max(1, Math.floor(s.duration || 0)));
      barEl.seek.value = String(Math.floor(s.position || 0));
      fill(barEl.seek);
    }
    barEl.seek.disabled = !s.duration;
    barEl.prev.disabled = !s.hasPrev;
    barEl.next.disabled = !s.hasNext;
    barEl.vol.value = String(s.volume);
    fill(barEl.vol);
  }

  /* ---------- 상단바 ---------- */

  function backButton() {
    var b = el('button', 'icon-btn icon-accent');
    b.type = 'button';
    b.setAttribute('aria-label', '뒤로');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 4.6 13.98 3.2 7.2 10l6.78 6.8 1.42-1.4L10 10z" transform="translate(0 2)"/></svg>';
    b.addEventListener('click', goBack);
    return b;
  }

  function setHeader(r, track) {
    topLeft.textContent = '';
    topRight.textContent = '';

    if (r.name === 'list') {
      var edit = el('a', 'btn-text', 'edit');
      edit.href = '#/add';
      topRight.appendChild(edit);
      return;
    }

    topLeft.appendChild(backButton());

    if (r.name === 'track' && track) {
      var out = el('a', 'btn-text', providerName(track));
      out.href = track.source_url;
      out.target = '_blank';
      out.rel = 'noopener noreferrer';
      topRight.appendChild(out);
    } else if (r.name === 'add') {
      var back = el('a', 'btn-text', 'back');
      back.href = '#/';
      topRight.appendChild(back);
    }
  }

  /* ---------- 목록 화면 ---------- */

  function card(track, all) {
    var li = el('li', 'card');
    li.dataset.id = track.id;

    var a = el('a', 'card-btn');
    a.href = trackHref(track);
    a.setAttribute('aria-label', (track.title || '') + ' — ' + (track.artist || ''));

    var cover = el('span', 'cover');
    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    cover.appendChild(img);
    paintCover(cover, img, track);

    var play = el('span', 'cover-play');
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l12 7-12 7z"/></svg>';
    cover.appendChild(play);

    a.appendChild(cover);
    a.appendChild(el('span', 'card-title', track.title || '제목 없음'));
    a.appendChild(el('span', 'card-artist', track.artist || '아티스트 미상'));
    li.appendChild(a);

    // 링크를 따라가기 전에 재생을 시작한다(클릭 제스처를 잃지 않도록).
    a.addEventListener('click', function () {
      if (!window.Player.state().track || window.Player.state().track.id !== track.id) {
        window.Player.playTrack(track, all);
      }
    });

    return li;
  }

  async function renderList() {
    view.appendChild(document.getElementById('tpl-list').content.cloneNode(true));
    var grid = document.getElementById('grid');
    var state = document.getElementById('state');
    var notice = document.getElementById('notice');

    function setState(msg) {
      state.textContent = msg || '';
      state.hidden = !msg;
      view.classList.toggle('is-centered', !!msg && !grid.children.length);
    }

    function fail(html) {
      grid.setAttribute('aria-busy', 'false');
      setState('');
      notice.innerHTML = html;
      notice.hidden = false;
    }

    if (!window.DB.isConfigured()) {
      fail('<strong>Supabase 설정이 필요합니다.</strong> ' +
        '<code>assets/js/config.js</code> 에 프로젝트 URL 과 anon key 를 넣고, ' +
        '<code>supabase/schema.sql</code> 을 SQL Editor 에서 실행해 주세요.');
      return;
    }

    var tracks;
    try {
      tracks = await getTracks();
    } catch (err) {
      fail('<strong>목록을 불러오지 못했습니다.</strong> ' +
        (err && err.message ? String(err.message) : '알 수 없는 오류') +
        ' — 테이블 이름과 RLS(select) 정책을 확인해 주세요.');
      return;
    }

    if (route().name !== 'list') return;   // 불러오는 사이에 화면이 바뀜

    var frag = document.createDocumentFragment();
    tracks.forEach(function (t) { frag.appendChild(card(t, tracks)); });
    grid.appendChild(frag);
    grid.setAttribute('aria-busy', 'false');
    window.Player.setQueue(tracks);
    setState(tracks.length ? '' : '등록된 음악이 없습니다.');

    function mark(s) {
      var id = s.track ? String(s.track.id) : null;
      Array.prototype.forEach.call(grid.children, function (li) {
        li.classList.toggle('is-playing', li.dataset.id === id);
      });
    }
    mark(window.Player.state());
    var sub = window.Player.subscribe(mark);
    teardown.push(function () { window.Player.unsubscribe(sub); });
  }

  /* ---------- 상세 화면 ---------- */

  async function renderTrack(id) {
    view.appendChild(document.getElementById('tpl-track').content.cloneNode(true));

    var box = view.querySelector('.track-cover');
    var img = document.getElementById('t-cover');
    var title = document.getElementById('t-title');
    var artist = document.getElementById('t-artist');
    var status = document.getElementById('t-status');
    var toggle = document.getElementById('t-toggle');
    var prev = document.getElementById('t-prev');
    var next = document.getElementById('t-next');
    var seek = document.getElementById('t-seek');
    var cur = document.getElementById('t-cur');
    var dur = document.getElementById('t-dur');

    var tracks = [];
    try {
      tracks = await getTracks();
    } catch (err) {
      status.textContent = '목록을 불러오지 못했습니다.';
    }
    if (route().name !== 'track') return;

    var track = tracks.filter(function (t) { return String(t.id) === String(id); })[0];
    if (!track) {
      view.textContent = '';
      var p = el('p', 'state', '없는 곡입니다.');
      view.appendChild(p);
      view.classList.add('is-centered');
      return;
    }

    window.Player.setQueue(tracks);
    setHeader({ name: 'track' }, track);
    paintCover(box, img, track);
    title.textContent = track.title || '제목 없음';
    artist.textContent = track.artist || '아티스트 미상';
    document.title = (track.title || '') + ' · ummjjutube';
    watchAnchor();

    var viewedId = String(track.id);
    var dragging = false;

    function isCurrent(s) {
      return s.track && String(s.track.id) === viewedId;
    }

    toggle.addEventListener('click', function () {
      var s = window.Player.state();
      if (isCurrent(s)) window.Player.toggle();
      else window.Player.playTrack(track, tracks);
    });
    prev.addEventListener('click', function () { window.Player.prev(); });
    next.addEventListener('click', function () { window.Player.next(); });

    seek.addEventListener('pointerdown', function () { dragging = true; });
    seek.addEventListener('input', function () {
      cur.textContent = fmt(parseInt(seek.value, 10));
      fill(seek);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      if (isCurrent(window.Player.state())) window.Player.seekTo(parseInt(seek.value, 10));
    }
    seek.addEventListener('change', endDrag);
    seek.addEventListener('pointerup', endDrag);
    seek.addEventListener('keyup', endDrag);

    function paint(s) {
      var mine = isCurrent(s);

      // 보고 있던 곡이 끝나 다음 곡으로 넘어가면 화면도 따라간다.
      if (!mine && s.track && s.playing && followNext) {
        location.replace('#/track/' + encodeURIComponent(s.track.id));
        return;
      }

      status.textContent = mine ? (s.error || '') : '';
      toggle.classList.toggle('is-playing', mine && s.playing);
      toggle.setAttribute('aria-label', mine && s.playing ? '일시정지' : '재생');
      cur.textContent = fmt(mine ? s.position : 0);
      dur.textContent = mine && s.duration ? fmt(s.duration) : '--:--';
      if (!dragging) {
        seek.max = String(Math.max(1, Math.floor((mine && s.duration) || 0)));
        seek.value = String(Math.floor((mine && s.position) || 0));
        fill(seek);
      }
      seek.disabled = !(mine && s.duration);
      prev.disabled = !s.hasPrev;
      next.disabled = !s.hasNext;
    }

    // 이 곡을 재생 중인 상태로 들어왔다면, 곡이 바뀔 때 화면도 따라가게 한다.
    var followNext = isCurrent(window.Player.state());
    paint(window.Player.state());
    var sub = window.Player.subscribe(paint);
    teardown.push(function () { window.Player.unsubscribe(sub); });
  }

  /* ---------- 등록 화면 ---------- */

  function renderAdd() {
    view.appendChild(document.getElementById('tpl-add').content.cloneNode(true));
    window.AddView.mount({
      onSaved: function () { tracksCache = null; },
    });
  }

  /* ---------- 라우팅 ---------- */

  function route() {
    var h = (location.hash || '').replace(/^#/, '') || '/';
    var m = /^\/track\/(.+)$/.exec(h);
    if (m) return { name: 'track', id: decodeURIComponent(m[1]) };
    if (h === '/add') return { name: 'add' };
    return { name: 'list' };
  }

  var navCount = 0;

  function goBack() {
    if (navCount > 0) {
      navCount--;
      history.back();
    } else {
      location.hash = '#/';
    }
  }

  async function render() {
    teardown.forEach(function (fn) { fn(); });
    teardown = [];
    if (anchorObserver) { anchorObserver.disconnect(); anchorObserver = null; }

    var r = route();
    document.body.dataset.route = r.name;
    view.className = 'wrap' + (r.name === 'add' ? ' narrow' : '');
    view.textContent = '';
    if (r.name !== 'track') document.title = 'ummjjutube';

    setHeader(r, null);
    renderBar(window.Player.state());

    if (r.name === 'track') await renderTrack(r.id);
    else if (r.name === 'add') renderAdd();
    else await renderList();

    watchAnchor();
    renderBar(window.Player.state());
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', function () {
    navCount++;
    render();
  });

  /* ---------- 시작 ---------- */

  window.Player.init();
  initBar();
  window.Player.subscribe(function (s) {
    renderBar(s);
    if (s.track) watchAnchor();
  });
  render();
})();
