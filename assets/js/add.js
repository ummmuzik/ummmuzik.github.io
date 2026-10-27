/* 등록·수정 화면: 링크 검증 + 커버 사진 업로드 + 저장
   opts.track 이 있으면 그 곡을 고치는 수정 모드로 동작한다. */
(function () {
  'use strict';

  var MAX_BYTES = 15 * 1024 * 1024;

  function mount(opts) {
    opts = opts || {};
    var editing = opts.track || null;

    var form = document.getElementById('form');
    var fUrl = document.getElementById('f-url');
    var fTitle = document.getElementById('f-title');
    var fArtist = document.getElementById('f-artist');
    var fCover = document.getElementById('f-cover');
    var pick = document.getElementById('cover-pick');
    var submit = document.getElementById('submit');
    var notice = document.getElementById('notice');
    var coverImg = document.getElementById('cover-img');
    var coverPh = document.getElementById('cover-ph');

    var picked = null;       // 잘라낸 사진 (Blob)
    var objectUrl = null;    // 미리보기용 blob URL

    if (editing) {
      fUrl.value = editing.source_url || '';
      fTitle.value = editing.title || '';
      fArtist.value = editing.artist || '';
    }

    function setNotice(kind, html) {
      notice.className = 'notice notice-' + kind;
      notice.innerHTML = html;
      notice.hidden = false;
    }

    function parsed() {
      return window.Sources.parse(fUrl.value);
    }

    function dropPreviewUrl() {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    }

    function showPreview(src) {
      if (src) {
        coverImg.src = src;
        coverImg.hidden = false;
        coverPh.hidden = true;
      } else {
        coverImg.removeAttribute('src');
        coverImg.hidden = true;
        coverPh.hidden = false;   // 사진이 없으면 사진 아이콘
      }
    }

    /** 새로 고른 사진 > (수정 모드면) 지금 커버 > 유튜브 썸네일 순으로 보여 준다 */
    function previewCover() {
      if (picked) return showPreview(objectUrl);
      if (editing && editing.cover_url) return showPreview(editing.cover_url);
      showPreview(window.Sources.fallbackCover(parsed()));
    }

    coverImg.addEventListener('error', function () {
      coverImg.hidden = true;
      coverPh.hidden = false;
    });

    // 미리보기 영역이 곧 파일 선택 버튼이다.
    pick.addEventListener('click', function () { fCover.click(); });

    fCover.addEventListener('change', async function () {
      var file = fCover.files && fCover.files[0];
      notice.hidden = true;
      if (!file) return;

      if (file.type && file.type.indexOf('image/') !== 0) {
        setNotice('bad', '이미지 파일만 올릴 수 있습니다.');
        fCover.value = '';
        return;
      }
      if (file.size > MAX_BYTES) {
        setNotice('bad', '사진이 너무 큽니다 (15MB 이하).');
        fCover.value = '';
        return;
      }

      // 정사각으로 자른다. 취소하면 쓰던 커버를 그대로 둔다.
      var blob = await window.Cropper.open(file);
      fCover.value = '';
      if (!blob) return;

      dropPreviewUrl();
      picked = blob;
      objectUrl = URL.createObjectURL(blob);
      previewCover();
    });

    fUrl.addEventListener('input', previewCover);

    function busy(on, label) {
      submit.disabled = on;
      submit.textContent = on ? label : 'SAVE';
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      notice.hidden = true;

      if (!window.DB.isConfigured()) {
        setNotice('bad',
          '<strong>Supabase 설정이 필요합니다.</strong> <code>assets/js/config.js</code> 를 먼저 채워 주세요.');
        return;
      }

      var p = parsed();
      var title = fTitle.value.trim();
      var artist = fArtist.value.trim();

      if (!p) { setNotice('bad', '유튜브 또는 사운드클라우드 링크를 입력해 주세요.'); fUrl.focus(); return; }
      if (!title) { setNotice('bad', '제목을 입력해 주세요.'); fTitle.focus(); return; }
      if (!artist) { setNotice('bad', '아티스트를 입력해 주세요.'); fArtist.focus(); return; }

      // 새 사진을 고르지 않았다면 수정 모드에서는 쓰던 커버를 그대로 둔다.
      // 단, 유튜브 썸네일을 쓰고 있었다면 바뀐 링크에 맞춰 다시 잡는다.
      var cover = window.Sources.fallbackCover(p);
      if (editing && editing.cover_url && !/i\.ytimg\.com/.test(editing.cover_url)) {
        cover = editing.cover_url;
      }

      try {
        if (picked) {
          busy(true, '사진 올리는 중…');
          cover = await window.DB.uploadCover(picked, 'jpg');
        }
      } catch (err) {
        busy(false);
        setNotice('bad',
          '<strong>사진을 올리지 못했습니다.</strong> ' +
          (err && err.message ? String(err.message) : '알 수 없는 오류') +
          ' — Storage 의 <code>covers</code> 버킷과 정책을 확인해 주세요.');
        return;
      }

      busy(true, '저장 중…');
      var row = {
        title: title,
        artist: artist,
        cover_url: cover || null,
        source_url: p.source_url,
        provider: p.provider,
        provider_id: p.provider_id,
      };

      try {
        if (editing) {
          await window.DB.updateTrack(editing.id, row);
          if (typeof opts.onSaved === 'function') opts.onSaved();
          return;   // 호출한 쪽에서 상세 화면으로 돌려보낸다
        }

        await window.DB.addTrack(row);
        if (typeof opts.onSaved === 'function') opts.onSaved();   // 목록으로 보낸다
      } catch (err) {
        setNotice('bad',
          '<strong>저장하지 못했습니다.</strong> ' +
          (err && err.message ? String(err.message) : '알 수 없는 오류') +
          ' — RLS(insert) 정책을 확인해 주세요.');
      } finally {
        busy(false);
      }
    });

    previewCover();

    if (!window.DB.isConfigured()) {
      setNotice('warn',
        '<strong>Supabase 설정이 필요합니다.</strong> ' +
        '<code>assets/js/config.js</code> 에 프로젝트 URL 과 anon key 를 넣어 주세요.');
    }
  }

  window.AddView = { mount: mount };
})();
