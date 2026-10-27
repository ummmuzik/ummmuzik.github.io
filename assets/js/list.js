/* 목록 페이지: 트랙 카드 렌더링 + 검색 + 클릭 재생 */
(function () {
  'use strict';

  var grid = document.getElementById('grid');
  var state = document.getElementById('state');
  var notice = document.getElementById('notice');
  var count = document.getElementById('count');
  var toolbar = document.getElementById('toolbar');
  var wrap = document.querySelector('main.wrap');

  var tracks = [];   // 전체 트랙 = 재생 큐

  function showNotice(html) {
    notice.innerHTML = html;
    notice.hidden = false;
  }

  function setState(msg) {
    state.textContent = msg || '';
    state.hidden = !msg;
    // 안내 문구만 있을 때는 본문 여백을 없애 정확히 가운데 오게 한다.
    wrap.classList.toggle('is-centered', !!msg && !grid.children.length);
  }

  function initials(track) {
    var s = (track.title || track.artist || '?').trim();
    return s.slice(0, 2).toUpperCase();
  }

  function makeCard(track) {
    var li = document.createElement('li');
    li.className = 'card';
    li.dataset.id = track.id;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card-btn';
    btn.setAttribute('aria-label', (track.title || '') + ' — ' + (track.artist || '') + ' 재생');

    var cover = document.createElement('span');
    cover.className = 'cover';

    if (track.cover_url) {
      var img = document.createElement('img');
      img.src = track.cover_url;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', function () {
        img.remove();
        cover.classList.add('is-empty');
        cover.dataset.initials = initials(track);
      });
      cover.appendChild(img);
    } else {
      cover.classList.add('is-empty');
      cover.dataset.initials = initials(track);
    }

    var badge = document.createElement('span');
    badge.className = 'badge badge-' + track.provider;
    badge.textContent = track.provider === 'youtube' ? 'YouTube' : 'SoundCloud';
    cover.appendChild(badge);

    var overlay = document.createElement('span');
    overlay.className = 'cover-play';
    overlay.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l12 7-12 7z"/></svg>';
    cover.appendChild(overlay);

    var title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = track.title || '제목 없음';

    var artist = document.createElement('span');
    artist.className = 'card-artist';
    artist.textContent = track.artist || '아티스트 미상';

    btn.appendChild(cover);
    btn.appendChild(title);
    btn.appendChild(artist);
    li.appendChild(btn);

    btn.addEventListener('click', function () {
      window.Player.playTrack(track, tracks);
    });

    return li;
  }

  function render() {
    grid.textContent = '';
    var frag = document.createDocumentFragment();
    tracks.forEach(function (t) { frag.appendChild(makeCard(t)); });
    grid.appendChild(frag);
    grid.setAttribute('aria-busy', 'false');
    window.Player.setQueue(tracks);
    markPlaying(window.Player.current());

    count.textContent = tracks.length ? tracks.length + ' 곡' : '';
    toolbar.hidden = !tracks.length;
    setState(tracks.length ? '' : '등록된 음악이 없습니다.');
  }

  function markPlaying(track) {
    var id = track ? String(track.id) : null;
    Array.prototype.forEach.call(grid.children, function (li) {
      li.classList.toggle('is-playing', li.dataset.id === id);
    });
  }

  async function load() {
    if (!window.DB.isConfigured()) {
      grid.setAttribute('aria-busy', 'false');
      setState('');
      toolbar.hidden = true;
      showNotice(
        '<strong>Supabase 설정이 필요합니다.</strong> ' +
        '<code>assets/js/config.js</code> 에 프로젝트 URL 과 anon key 를 넣고, ' +
        '<code>supabase/schema.sql</code> 을 SQL Editor 에서 실행해 주세요.'
      );
      return;
    }

    try {
      tracks = await window.DB.listTracks();
      render();
    } catch (err) {
      grid.setAttribute('aria-busy', 'false');
      setState('');
      toolbar.hidden = true;
      showNotice(
        '<strong>목록을 불러오지 못했습니다.</strong> ' +
        (err && err.message ? String(err.message) : '알 수 없는 오류') +
        ' — 테이블 이름과 RLS(select) 정책을 확인해 주세요.'
      );
    }
  }

  window.Player.init();
  window.Player.onChange(function (s) { markPlaying(s.track); });
  load();
})();
