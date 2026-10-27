/* 등록 페이지: 링크 검증 + 커버 미리보기 + 저장 */
(function () {
  'use strict';

  var form = document.getElementById('form');
  var fUrl = document.getElementById('f-url');
  var fTitle = document.getElementById('f-title');
  var fArtist = document.getElementById('f-artist');
  var fCover = document.getElementById('f-cover');
  var hint = document.getElementById('url-hint');
  var submit = document.getElementById('submit');
  var notice = document.getElementById('notice');
  var coverImg = document.getElementById('cover-img');
  var coverPh = document.getElementById('cover-ph');

  function setNotice(kind, html) {
    notice.className = 'notice notice-' + kind;
    notice.innerHTML = html;
    notice.hidden = false;
  }

  function clearNotice() {
    notice.hidden = true;
  }

  function parsed() {
    return window.Sources.parse(fUrl.value);
  }

  /** 커버 미리보기: 입력값이 없으면 유튜브 썸네일로 대체 */
  function previewCover() {
    var url = fCover.value.trim() || window.Sources.fallbackCover(parsed());
    if (url) {
      coverImg.src = url;
      coverImg.hidden = false;
      coverPh.hidden = true;
      coverPh.textContent = '미리보기';
    } else {
      coverImg.removeAttribute('src');
      coverImg.hidden = true;
      coverPh.hidden = false;
    }
  }

  coverImg.addEventListener('error', function () {
    coverImg.hidden = true;
    coverPh.hidden = false;
    coverPh.textContent = '이미지를 불러올 수 없습니다';
  });

  function checkUrl() {
    var p = parsed();
    if (!fUrl.value.trim()) {
      hint.className = 'hint';
      hint.textContent = '유튜브(youtube.com, youtu.be)와 사운드클라우드 링크를 지원합니다.';
      return;
    }
    if (p) {
      hint.className = 'hint ok';
      hint.textContent = (p.provider === 'youtube' ? '유튜브' : '사운드클라우드') + ' 링크로 인식했습니다.';
    } else {
      hint.className = 'hint bad';
      hint.textContent = '유튜브 또는 사운드클라우드 링크가 아닙니다.';
    }
    previewCover();
  }

  fUrl.addEventListener('input', checkUrl);
  fCover.addEventListener('input', previewCover);

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearNotice();

    if (!window.DB.isConfigured()) {
      setNotice('bad',
        '<strong>Supabase 설정이 필요합니다.</strong> <code>assets/js/config.js</code> 를 먼저 채워 주세요.');
      return;
    }

    var p = parsed();
    var title = fTitle.value.trim();
    var artist = fArtist.value.trim();

    if (!p) {
      setNotice('bad', '유튜브 또는 사운드클라우드 링크를 입력해 주세요.');
      fUrl.focus();
      return;
    }
    if (!title) { setNotice('bad', '제목을 입력해 주세요.'); fTitle.focus(); return; }
    if (!artist) { setNotice('bad', '아티스트를 입력해 주세요.'); fArtist.focus(); return; }

    var cover = fCover.value.trim() || window.Sources.fallbackCover(p);

    submit.disabled = true;
    submit.textContent = '저장 중…';
    try {
      await window.DB.addTrack({
        title: title,
        artist: artist,
        cover_url: cover || null,
        source_url: p.source_url,
        provider: p.provider,
        provider_id: p.provider_id,
      });
      setNotice('ok',
        '<strong>저장했습니다.</strong> <a href="./">목록에서 확인</a>하거나 계속 등록할 수 있습니다.');
      form.reset();
      checkUrl();
      previewCover();
      fUrl.focus();
    } catch (err) {
      setNotice('bad',
        '<strong>저장하지 못했습니다.</strong> ' +
        (err && err.message ? String(err.message) : '알 수 없는 오류') +
        ' — RLS(insert) 정책을 확인해 주세요.');
    } finally {
      submit.disabled = false;
      submit.textContent = '저장';
    }
  });

  if (!window.DB.isConfigured()) {
    setNotice('warn',
      '<strong>Supabase 설정이 필요합니다.</strong> ' +
      '<code>assets/js/config.js</code> 에 프로젝트 URL 과 anon key 를 넣어 주세요.');
  }
})();
