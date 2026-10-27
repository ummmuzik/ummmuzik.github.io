/* 등록·수정 화면: 링크 검증 + 커버 사진 업로드 + 저장
   opts.track 이 있으면 그 곡을 고치는 수정 모드로 동작한다. */
(function () {
  'use strict';

  var MAX_SIDE = 800;                    // 업로드 전에 줄일 최대 변 길이(px)
  var MAX_BYTES = 15 * 1024 * 1024;

  function mount(opts) {
    opts = opts || {};
    var editing = opts.track || null;

    var form = document.getElementById('form');
    var fUrl = document.getElementById('f-url');
    var fTitle = document.getElementById('f-title');
    var fArtist = document.getElementById('f-artist');
    var fCover = document.getElementById('f-cover');
    var submit = document.getElementById('submit');
    var notice = document.getElementById('notice');
    var coverImg = document.getElementById('cover-img');
    var coverPh = document.getElementById('cover-ph');

    var picked = null;       // 새로 고른 사진 (File)
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
        coverPh.textContent = '미리보기';
      } else {
        coverImg.removeAttribute('src');
        coverImg.hidden = true;
        coverPh.hidden = false;
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
      coverPh.textContent = '이미지를 불러올 수 없습니다';
    });

    fCover.addEventListener('change', function () {
      var file = fCover.files && fCover.files[0];
      dropPreviewUrl();
      picked = null;
      notice.hidden = true;

      if (!file) {
        previewCover();
        return;
      }

      if (file.type && file.type.indexOf('image/') !== 0) {
        setNotice('bad', '이미지 파일만 올릴 수 있습니다.');
        fCover.value = '';
        previewCover();
        return;
      }

      if (file.size > MAX_BYTES) {
        setNotice('bad', '사진이 너무 큽니다 (15MB 이하).');
        fCover.value = '';
        previewCover();
        return;
      }

      picked = file;
      objectUrl = URL.createObjectURL(file);
      previewCover();
    });

    /**
     * 업로드 전에 사진을 줄인다. 휴대폰 사진은 수 MB 라 그대로 올리면
     * 목록이 느려진다. 디코딩에 실패하면 원본을 그대로 쓴다.
     */
    function shrink(file) {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          var w = img.naturalWidth;
          var h = img.naturalHeight;
          if (!w || !h) {
            URL.revokeObjectURL(url);
            return resolve(null);
          }
          var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          try {
            canvas.toBlob(
              function (blob) { resolve(blob ? { blob: blob, ext: 'jpg' } : null); },
              'image/jpeg',
              0.85
            );
          } catch (e) {
            resolve(null);
          }
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    }

    function extOf(file) {
      var m = /\.([a-z0-9]{2,5})$/i.exec(file.name || '');
      if (m) return m[1].toLowerCase();
      m = /^image\/([a-z0-9]+)$/i.exec(file.type || '');
      return m ? m[1].toLowerCase() : 'jpg';
    }

    fUrl.addEventListener('input', previewCover);

    function busy(on, label) {
      submit.disabled = on;
      submit.textContent = on ? label : 'save';
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
          var small = await shrink(picked);
          cover = await window.DB.uploadCover(
            small ? small.blob : picked,
            small ? small.ext : extOf(picked)
          );
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
        if (typeof opts.onSaved === 'function') opts.onSaved();
        setNotice('ok',
          '<strong>저장했습니다.</strong> <a href="#/">목록에서 확인</a>하거나 계속 등록할 수 있습니다.');
        form.reset();
        dropPreviewUrl();
        picked = null;
        previewCover();
        fUrl.focus();
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
