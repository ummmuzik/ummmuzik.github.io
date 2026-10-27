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
    var cancel = node.querySelector('#crop-cancel');
    var apply = node.querySelector('#crop-apply');
    document.body.appendChild(node);

    var F = frame.clientWidth || frame.getBoundingClientRect().width;    // 틀 한 변
    var base = F / Math.min(source.naturalWidth, source.naturalHeight);  // 틀을 꽉 채우는 배율
    var MAX_Z = 4;
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
    }

    /** 화면의 한 점(clientX/Y)을 제자리에 둔 채 배율만 바꾼다 */
    function zoomAbout(nextZ, clientX, clientY) {
      nextZ = Math.min(MAX_Z, Math.max(1, nextZ));
      var rect = frame.getBoundingClientRect();
      var fx = clientX - rect.left;
      var fy = clientY - rect.top;
      var ix = (fx - ox) / (base * z);
      var iy = (fy - oy) / (base * z);
      z = nextZ;
      ox = fx - ix * base * z;
      oy = fy - iy * base * z;
    }

    // 처음에는 가운데를 보여 준다
    (function center() {
      var d = size();
      ox = (F - d.w) / 2;
      oy = (F - d.h) / 2;
      draw();
    })();

    /* 한 손가락이면 옮기기, 두 손가락이면 벌려서 확대 */
    var pts = new Map();
    var pinch = null;

    function two() {
      var a = [];
      pts.forEach(function (v) { a.push(v); });
      return a;
    }

    function gap(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function mid(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    frame.addEventListener('pointerdown', function (e) {
      frame.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        var p = two();
        pinch = { gap: gap(p[0], p[1]), mid: mid(p[0], p[1]) };
      }
    });

    frame.addEventListener('pointermove', function (e) {
      var prev = pts.get(e.pointerId);
      if (!prev) return;
      var now = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, now);

      if (pts.size === 1) {
        ox += now.x - prev.x;
        oy += now.y - prev.y;
        draw();
        return;
      }

      if (pts.size >= 2 && pinch) {
        var p = two();
        var g = gap(p[0], p[1]);
        var m = mid(p[0], p[1]);
        if (pinch.gap > 0) zoomAbout(z * (g / pinch.gap), m.x, m.y);
        ox += m.x - pinch.mid.x;        // 두 손가락을 함께 옮기면 사진도 따라간다
        oy += m.y - pinch.mid.y;
        pinch = { gap: g, mid: m };
        draw();
      }
    });

    function liftPointer(e) {
      pts.delete(e.pointerId);
      try { frame.releasePointerCapture(e.pointerId); } catch (err) { /* 이미 놓였을 수 있다 */ }
      if (pts.size < 2) pinch = null;
    }
    frame.addEventListener('pointerup', liftPointer);
    frame.addEventListener('pointercancel', liftPointer);

    /* 데스크톱에서는 휠로 확대 */
    frame.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomAbout(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
      draw();
    }, { passive: false });

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
