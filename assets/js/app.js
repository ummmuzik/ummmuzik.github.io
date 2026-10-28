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
  var brand = document.getElementById('brand');
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
  // 문서가 아니라 본문 영역이 스크롤되므로 거기서도 위치를 다시 잡는다.
  view.addEventListener('scroll', syncEmbeds, { passive: true });

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
    barEl.seek.addEventListener('input', function () { fill(barEl.seek); });
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
    var b = el('button', 'icon-btn icon-back');
    b.type = 'button';
    b.setAttribute('aria-label', '뒤로');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 4.6 13.98 3.2 7.2 10l6.78 6.8 1.42-1.4L10 10z" transform="translate(0 2)"/></svg>';
    b.addEventListener('click', goBack);
    return b;
  }

  function setHeader(r, track) {
    topLeft.textContent = '';
    topRight.textContent = '';

    // 서비스 이름은 목록에서만 보인다.
    if (r.name === 'list') {
      brand.textContent = 'ummjjutube';
      brand.href = '#/';
    } else {
      brand.textContent = '';
      brand.removeAttribute('href');
    }

    var auth = window.Auth.state();

    // 로그인 전에는 갈 수 있는 곳이 없으므로 상단바를 비운다.
    if (!auth.signedIn) return;

    if (r.name === 'list') {
      topLeft.appendChild(whoMenu(auth));
      if (auth.isAdmin) topLeft.appendChild(adminLock());
      if (auth.signedIn) {
        var add = el('a', 'icon-btn');
        add.href = '#/add';
        add.setAttribute('aria-label', '음악 등록');
        add.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';
        topRight.appendChild(add);
      }
      return;
    }

    topLeft.appendChild(backButton());

    if (r.name === 'track' && track && auth.signedIn) topRight.appendChild(trackMenu(track));
  }

  /** 닉네임 + 로그아웃 드롭다운 */
  function whoMenu(auth) {
    var btn = el('button', 'who-btn');
    btn.type = 'button';
    btn.textContent = auth.nickname || auth.username || '계정';

    return dropdown(btn, 'to-left', [
      { label: 'SIGN OUT', onPick: function () { window.Auth.signOut(); } },
    ]);
  }

  /** 관리자에게만 보이는 잠긴 자물쇠 */
  function adminLock() {
    var a = el('a', 'icon-btn');
    a.href = '#/admin';
    a.setAttribute('aria-label', '관리자');
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9V7A5 5 0 0 0 7 7v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zM9 7a3 3 0 0 1 6 0v2H9zm3 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>';
    return a;
  }

  /**
   * 버튼 하나에 달리는 드롭다운. 바깥을 누르거나 Esc 로 닫힌다.
   * items: [{ label, danger?, onPick }]
   */
  function dropdown(btn, popClass, items) {
    var wrap = el('div', 'menu');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');

    var pop = el('div', 'menu-pop' + (popClass ? ' ' + popClass : ''));
    pop.setAttribute('role', 'menu');
    pop.hidden = true;

    items.forEach(function (it) {
      var b = el('button', 'menu-item' + (it.danger ? ' danger' : ''), it.label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', function () {
        close();
        it.onPick();
      });
      pop.appendChild(b);
    });

    wrap.appendChild(btn);
    wrap.appendChild(pop);

    function onDocDown(e) { if (!wrap.contains(e.target)) close(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    function open() {
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', onDocDown);
      document.addEventListener('keydown', onKey);
    }
    function close() {
      pop.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onDocDown);
      document.removeEventListener('keydown', onKey);
    }

    btn.addEventListener('click', function () {
      if (pop.hidden) open();
      else close();
    });
    teardown.push(close);

    return wrap;
  }

  /* ---------- 상세 화면의 수정·삭제 메뉴 ---------- */

  function trackMenu(track) {
    var btn = el('button', 'icon-btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', '더보기');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>';

    return dropdown(btn, '', [
      {
        label: '수정',
        onPick: function () { location.hash = '#/edit/' + encodeURIComponent(track.id); },
      },
      { label: '삭제', danger: true, onPick: function () { removeTrack(track); } },
    ]);
  }

  async function removeTrack(track) {
    var name = track.title || '이 곡';
    if (!window.confirm('“' + name + '”을(를) 삭제할까요?\n되돌릴 수 없습니다.')) return;

    try {
      await window.DB.deleteTrack(track.id);
    } catch (err) {
      window.alert('삭제하지 못했습니다.\n' + (err && err.message ? err.message : '알 수 없는 오류'));
      return;
    }

    var s = window.Player.state();
    if (s.track && String(s.track.id) === String(track.id)) window.Player.stop();
    tracksCache = null;
    location.hash = '#/';
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
    if (track.owner_nickname) a.appendChild(el('span', 'card-owner', track.owner_nickname));
    li.appendChild(a);

    // 링크를 따라가기 전에 재생을 시작한다(클릭 제스처를 잃지 않도록).
    a.addEventListener('click', function () {
      window.Player.playNow(track, all);
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
    var out = document.getElementById('t-out');
    var cmt = document.getElementById('t-cmt');
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
    out.href = track.source_url;          // 앱이 깔려 있으면 앱으로 열린다

    var cmtN = document.getElementById('t-cmt-n');
    function showCount(n) {
      cmtN.textContent = n > 0 ? String(n) : '';
      cmtN.hidden = !n;
    }
    window.DB.countComments(track.id).then(showCount, function () { /* 못 세도 그만 */ });
    cmt.addEventListener('click', function () {
      window.Comments.open(track, { onChange: showCount });
    });
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

    // 상세로 들어오면 자동으로 튼다. 다른 곡이 울리고 있으면 가로채지 않는다.
    var now = window.Player.state();
    if (!isCurrent(now) && !now.playing) window.Player.playNow(track, tracks);

    paint(window.Player.state());
    var sub = window.Player.subscribe(paint);
    teardown.push(function () { window.Player.unsubscribe(sub); });
  }

  /* ---------- 등록 화면 ---------- */

  function renderAdd() {
    view.appendChild(document.getElementById('tpl-add').content.cloneNode(true));
    window.AddView.mount({
      onSaved: function () {
        tracksCache = null;
        location.hash = '#/';
      },
    });
  }

  async function renderEdit(id) {
    view.appendChild(document.getElementById('tpl-add').content.cloneNode(true));

    var tracks = [];
    try {
      tracks = await getTracks();
    } catch (err) { /* 아래에서 '없는 곡' 으로 처리 */ }
    if (route().name !== 'edit') return;

    var track = tracks.filter(function (t) { return String(t.id) === String(id); })[0];
    if (!track) {
      view.textContent = '';
      view.appendChild(el('p', 'state', '없는 곡입니다.'));
      view.classList.add('is-centered');
      return;
    }

    window.AddView.mount({
      track: track,
      onSaved: function () {
        tracksCache = null;
        location.hash = '#/track/' + encodeURIComponent(track.id);
      },
    });
  }

  /* ---------- 로그인 화면 ---------- */

  function renderLogin() {
    view.appendChild(document.getElementById('tpl-login').content.cloneNode(true));

    var notice = document.getElementById('notice');
    var out = document.getElementById('signed-out');
    var inn = document.getElementById('signed-in');
    var form = document.getElementById('login-form');
    var id = document.getElementById('l-id');
    var pw = document.getElementById('l-pw');
    var submit = document.getElementById('l-submit');

    function fail(msg) {
      notice.className = 'notice notice-bad';
      notice.textContent = msg;
      notice.hidden = false;
    }

    function paint() {
      var a = window.Auth.state();
      out.hidden = a.signedIn;
      inn.hidden = !a.signedIn;
      if (a.signedIn) {
        document.getElementById('who-nick').textContent = a.nickname || a.username || '';
        document.getElementById('who-id').textContent = a.username ? '@' + a.username : '';
        document.getElementById('go-admin').hidden = !a.isAdmin;
      }
    }

    paint();

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      notice.hidden = true;
      if (!window.DB.isConfigured()) return fail('Supabase 설정이 필요합니다.');
      if (!id.value.trim() || !pw.value) return fail('아이디와 비밀번호를 입력해 주세요.');

      submit.disabled = true;
      submit.textContent = '...';
      try {
        await window.Auth.signIn(id.value, pw.value);
        var back = pendingRoute && pendingRoute !== '#/login' ? pendingRoute : '#/';
        pendingRoute = null;
        location.replace(back);
        paint();
      } catch (err) {
        fail(err && err.message ? err.message : '로그인하지 못했습니다.');
      } finally {
        submit.disabled = false;
        submit.textContent = 'SIGN IN';
      }
    });

    document.getElementById('logout').addEventListener('click', async function () {
      await window.Auth.signOut();
      paint();
    });
  }

  /* ---------- 관리자 화면 ---------- */

  async function renderAdmin() {
    var auth = window.Auth.state();
    if (!auth.signedIn) { location.replace('#/login'); return; }

    if (!auth.isAdmin) {
      view.appendChild(el('p', 'state', '관리자만 볼 수 있습니다.'));
      view.classList.add('is-centered');
      return;
    }

    view.appendChild(document.getElementById('tpl-admin').content.cloneNode(true));

    var notice = document.getElementById('notice');
    var form = document.getElementById('user-form');
    var uId = document.getElementById('u-id');
    var uPw = document.getElementById('u-pw');
    var uNick = document.getElementById('u-nick');
    var uRole = document.getElementById('u-role');
    var submit = document.getElementById('u-submit');
    var members = document.getElementById('members');

    function say(kind, msg) {
      notice.className = 'notice notice-' + kind;
      notice.textContent = msg;
      notice.hidden = false;
    }

    async function loadMembers() {
      members.textContent = '';
      var rows;
      try {
        rows = await window.DB.listProfiles();
      } catch (err) {
        members.appendChild(el('li', 'member muted-row', '회원을 불러오지 못했습니다.'));
        return;
      }
      if (!rows.length) {
        members.appendChild(el('li', 'member muted-row', '아직 회원이 없습니다.'));
        return;
      }
      rows.forEach(function (m) {
        var li = el('li', 'member');
        var who = el('div', 'member-who');
        who.appendChild(el('span', 'member-nick', m.nickname || ''));
        who.appendChild(el('span', 'member-id', '@' + m.username));
        li.appendChild(who);
        li.appendChild(el('span', 'role-tag' + (m.role === 'admin' ? ' is-admin' : ''),
          m.role === 'admin' ? '관리자' : '일반'));
        members.appendChild(li);
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      notice.hidden = true;

      var username = uId.value.trim().toLowerCase();
      if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
        return say('bad', '아이디는 영문 소문자·숫자·_ . - 조합 3~30자여야 합니다.');
      }
      if (uPw.value.length < 6) return say('bad', '비밀번호는 6자 이상이어야 합니다.');
      if (!uNick.value.trim()) return say('bad', '닉네임을 입력해 주세요.');

      submit.disabled = true;
      submit.textContent = '...';
      try {
        await window.DB.createAccount({
          username: username,
          password: uPw.value,
          nickname: uNick.value.trim(),
          role: uRole.value,
        });
        say('ok', '“' + username + '” 계정을 만들었습니다.');
        form.reset();
        await loadMembers();
      } catch (err) {
        say('bad', err && err.message ? err.message : '계정을 만들지 못했습니다.');
      } finally {
        submit.disabled = false;
        submit.textContent = 'CREATE';
      }
    });

    await loadMembers();
  }

  /* ---------- 라우팅 ---------- */

  function route() {
    var h = (location.hash || '').replace(/^#/, '') || '/';
    var m = /^\/track\/(.+)$/.exec(h);
    if (m) return { name: 'track', id: decodeURIComponent(m[1]) };
    m = /^\/edit\/(.+)$/.exec(h);
    if (m) return { name: 'edit', id: decodeURIComponent(m[1]) };
    if (h === '/add') return { name: 'add' };
    if (h === '/login') return { name: 'login' };
    if (h === '/admin') return { name: 'admin' };
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

  var pendingRoute = null;

  async function render() {
    teardown.forEach(function (fn) { fn(); });
    teardown = [];
    if (anchorObserver) { anchorObserver.disconnect(); anchorObserver = null; }

    var r = route();

    // 로그인하지 않았으면 어떤 화면도 열지 않는다(서버 쪽 RLS 로도 막혀 있다).
    if (!window.Auth.state().signedIn && r.name !== 'login') {
      pendingRoute = location.hash || '#/';
      location.replace('#/login');
      return;
    }

    document.body.dataset.route = r.name;
    var narrow =
      r.name === 'add' || r.name === 'edit' || r.name === 'login' || r.name === 'admin';
    view.className = 'wrap' + (narrow ? ' narrow' : '');
    view.textContent = '';
    if (r.name !== 'track') document.title = 'ummjjutube';

    setHeader(r, null);
    renderBar(window.Player.state());


    if (r.name === 'track') await renderTrack(r.id);
    else if (r.name === 'edit') await renderEdit(r.id);
    else if (r.name === 'add') renderAdd();
    else if (r.name === 'login') renderLogin();
    else if (r.name === 'admin') await renderAdmin();
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

  (async function boot() {
    // 로그인 상태를 먼저 읽어야 상단바와 화면 접근 제한을 바로 그릴 수 있다.
    try {
      await window.Auth.init();
    } catch (e) { /* 설정 전이면 로그아웃 상태로 본다 */ }
    window.Auth.subscribe(function () { render(); });
    render();
  })();
})();
