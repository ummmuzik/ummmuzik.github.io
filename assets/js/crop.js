/*
 * 정방형 크롭 창.
 *
 * Cropper.open(file) -> Promise<Blob|null>
 *   사진을 정사각 틀 안에서 끌어 옮기고 확대해 자른다. "적용"을 누르면
 *   잘라낸 정사각 JPEG 를, 취소하면 null 을 돌려준다.
 */
(function () {
  'use strict';

  var OUT_MAX = 800;      // 내보낼 최대 한 변(px)
  var QUALITY = 0.85;

  function open(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { mount(img, url, resolve); };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  function mount(source, url, resolve) {
    var node = document.getElementById('tpl-crop').content.cloneNode(true);
    var back = node.querySelector('.crop-back');
    var frame = node.querySelector('#crop-frame');
    var view = node.querySelector('#crop-img');
    var zoom = node.querySelector('#crop-zoom');
    var cancel = node.querySelector('#crop-cancel');
    var apply = node.querySelector('#crop-apply');
    document.body.appendChild(node);

    var F = frame.clientWidth;                       // 틀 한 변
    var base = F / Math.min(source.naturalWidth, source.naturalHeight);  // 틀을 꽉 채우는 배율
    var z = 1;
    var ox = 0, oy = 0;

    view.src = url;

    function size() {
      return { w: source.naturalWidth * base * z, h: source.naturalHeight * base * z };
    }

    function clamp() {
      var d = size();
      ox = Math.min(0, Math.max(F - d.w, ox));
      oy = Math.min(0, Math.max(F - d.h, oy));
    }

    function draw() {
      var d = size();
      clamp();
      view.style.width = d.w + 'px';
      view.style.height = d.h + 'px';
      view.style.transform = 'translate(' + ox + 'px,' + oy + 'px)';
      zoom.style.setProperty('--fill', ((z - 1) / 2) * 100 + '%');
    }

    // 처음에는 가운데를 보여 준다
    (function center() {
      var d = size();
      ox = (F - d.w) / 2;
      oy = (F - d.h) / 2;
      draw();
    })();

    /* 끌어서 옮기기 */
    var dragging = false, lastX = 0, lastY = 0;
    frame.addEventListener('pointerdown', function (e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      frame.setPointerCapture(e.pointerId);
    });
    frame.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      ox += e.clientX - lastX;
      oy += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      draw();
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { frame.releasePointerCapture(e.pointerId); } catch (err) { /* 이미 놓였을 수 있다 */ }
    }
    frame.addEventListener('pointerup', endDrag);
    frame.addEventListener('pointercancel', endDrag);

    /* 확대: 틀 가운데를 기준으로 */
    zoom.addEventListener('input', function () {
      var next = parseInt(zoom.value, 10) / 100;
      var cx = (F / 2 - ox) / (base * z);
      var cy = (F / 2 - oy) / (base * z);
      z = next;
      ox = F / 2 - cx * base * z;
      oy = F / 2 - cy * base * z;
      draw();
    });

    function done(blob) {
      URL.revokeObjectURL(url);
      back.remove();
      document.removeEventListener('keydown', onKey);
      resolve(blob);
    }

    function onKey(e) {
      if (e.key === 'Escape') done(null);
    }
    document.addEventListener('keydown', onKey);

    back.addEventListener('pointerdown', function (e) {
      if (e.target === back) done(null);
    });
    cancel.addEventListener('click', function () { done(null); });

    apply.addEventListener('click', function () {
      var scale = base * z;
      var sw = F / scale;                       // 원본에서 잘라낼 한 변
      var sx = -ox / scale;
      var sy = -oy / scale;
      var out = Math.max(200, Math.min(OUT_MAX, Math.round(sw)));

      var canvas = document.createElement('canvas');
      canvas.width = out;
      canvas.height = out;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';                // 투명 사진은 흰 바탕으로
      ctx.fillRect(0, 0, out, out);
      ctx.drawImage(source, sx, sy, sw, sw, 0, 0, out, out);

      try {
        canvas.toBlob(function (blob) { done(blob || null); }, 'image/jpeg', QUALITY);
      } catch (e) {
        done(null);
      }
    });
  }

  window.Cropper = { open: open };
})();
