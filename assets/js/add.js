/* 등록 화면: 링크 검증 + 커버 사진 업로드 + 저장 */
(function () {
  'use strict';

  var MAX_SIDE = 800;                    // 업로드 전에 줄일 최대 변 길이(px)
  var MAX_BYTES = 15 * 1024 * 1024;
  var COVER_HINT = '휴대폰·PC 의 사진을 올립니다. 비우면 유튜브 썸네일을 씁니다.';
  var URL_HINT = '유튜브(youtube.com, youtu.be)와 사운드클라우드 링크를 지원합니다.';

  function mount(opts) {
    opts = opts || {};

    var form = document.getElementById('form');
    var fUrl = document.getElementById('f-url');
    var fTitle = document.getElementById('f-title');
    var fArtist = document.getElementById('f-artist');
    var fCover = document.getElementById('f-cover');
    var hint = document.getElementById('url-hint');
    var coverHint = document.getElementById('cover-hint');
    var submit = document.getElementById('submit');
    var notice = document.getElementById('notice');
    var coverImg = document.getElementById('cover-img');
    var coverPh = document.getElementById('cover-ph');

    var picked = null;       // 선택한 사진 (File)
    var objectUrl = null;    // 미리보기용 blob URL

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

    /** 고른 사진이 있으면 그것을, 없으면 유튜브 썸네일을 보여 준다 */
    function previewCover() {
      if (picked) return showPreview(objectUrl);
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

      if (!file) {
        coverHint.className = 'hint';
        coverHint.textContent = COVER_HINT;
        previewCover();
        return;
      }

      if (file.type && file.type.indexOf('image/') !== 0) {
        coverHint.className = 'hint bad';
        coverHint.textContent = '이미지 파일만 올릴 수 있습니다.';
        fCover.value = '';
        previewCover();
        return;
      }

      if (file.size > MAX_BYTES) {
        coverHint.className = 'hint bad';
        coverHint.textContent = '사진이 너무 큽니다 (15MB 이하).';
        fCover.value = '';
        previewCover();
        return;
      }

      picked = file;
      objectUrl = URL.createObjectURL(file);
      coverHint.className = 'hint ok';
      coverHint.textContent =
        file.name + ' (' + Math.round(file.size / 1024) + 'KB) — 올릴 때 ' + MAX_SIDE + 'px 로 줄입니다.';
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

    function checkUrl() {
      var p = parsed();
      if (!fUrl.value.trim()) {
        hint.className = 'hint';
        hint.textContent = URL_HINT;
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

    function busy(on, label) {
      submit.disabled = on;
      submit.textContent = on ? label : '저장';
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

      var cover = window.Sources.fallbackCover(p);

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
      try {
        await window.DB.addTrack({
          title: title,
          artist: artist,
          cover_url: cover || null,
          source_url: p.source_url,
          provider: p.provider,
          provider_id: p.provider_id,
        });
        if (typeof opts.onSaved === 'function') opts.onSaved();
        setNotice('ok',
          '<strong>저장했습니다.</strong> <a href="#/">목록에서 확인</a>하거나 계속 등록할 수 있습니다.');
        form.reset();
        dropPreviewUrl();
        picked = null;
        checkUrl();
        previewCover();
        coverHint.className = 'hint';
        coverHint.textContent = COVER_HINT;
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

    if (!window.DB.isConfigured()) {
      setNotice('warn',
        '<strong>Supabase 설정이 필요합니다.</strong> ' +
        '<code>assets/js/config.js</code> 에 프로젝트 URL 과 anon key 를 넣어 주세요.');
    }
  }

  window.AddView = { mount: mount };
})();
