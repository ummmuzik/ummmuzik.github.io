/*
 * 곡별 댓글. 아래에서 올라오는 창으로 띄운다.
 *   - 입력칸은 화면 맨 아래에 붙어 있고, 그 위로 댓글이 쌓인다.
 *   - 먼저 단 댓글이 위에 온다. 스크롤은 목록만 움직인다.
 *   - 답글은 한 단계만, 표시 없이 한 칸 들여쓴다.
 *   - 각 댓글의 ⋮ 에서 수정·삭제·복사·답글. 수정은 본인만,
 *     삭제는 본인과 관리자.
 */
(function () {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var now = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    var hh = ('0' + d.getHours()).slice(-2);
    var mi = ('0' + d.getMinutes()).slice(-2);
    return (d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '. ') +
      mm + '/' + dd + ' ' + hh + ':' + mi;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 아래 방법으로 */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  var closeOpen = null;     // 열려 있는 창을 닫는 함수 (화면을 떠날 때 쓴다)

  /* 앱을 잠깐 내려놨다 돌아오면 화면이 다시 그려질 수 있다. 그때 창이 열려
     있었는지와 쓰다 만 글을 되살리려고 여기에 적어 둔다. */
  var KEY = 'ummjjutube:comments';
  var FRESH = 12 * 60 * 60 * 1000;

  function readMemo() {
    try {
      var v = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (!v || !v.id || Date.now() - (v.at || 0) > FRESH) return null;
      return v;
    } catch (e) {
      return null;     // 비공개 모드 등
    }
  }

  function writeMemo(v) {
    try {
      v.at = Date.now();
      window.localStorage.setItem(KEY, JSON.stringify(v));
    } catch (e) { /* 못 적어도 그만 */ }
  }

  /** 이 곡의 창이 열린 채로 끊겼는가 (화면을 다시 그릴 때 물어본다) */
  function wasOpen(trackId, from) {
    var v = readMemo();
    return !!(v && v.open && String(v.id) === String(trackId) && v.from === from);
  }

  function open(track, opts) {
    opts = opts || {};
    if (closeOpen) closeOpen(true);

    var kept = readMemo();
    if (!kept || String(kept.id) !== String(track.id)) kept = null;
    var memo = {
      id: track.id,
      from: opts.from || 'track',
      open: true,
      draft: (kept && kept.draft) || '',
      reply: (kept && kept.reply) || null,
    };
    writeMemo(memo);

    var node = document.getElementById('tpl-comments').content.cloneNode(true);
    var back = node.querySelector('.sheet-back');
    var list = node.querySelector('#cmt-list');
    var empty = node.querySelector('#cmt-empty');
    var form = node.querySelector('#cmt-form');
    var input = node.querySelector('#cmt-input');
    var send = node.querySelector('#cmt-send');
    var replyBar = node.querySelector('#cmt-reply-to');
    var replyWho = node.querySelector('#cmt-reply-who');
    var replyCancel = node.querySelector('#cmt-reply-cancel');
    var toast = node.querySelector('#cmt-toast');
    document.body.appendChild(node);
    document.body.classList.add('sheet-open');
    node = null;

    var auth = window.Auth.state();
    var meId = auth.user ? auth.user.id : null;
    var replyTo = null;      // { id, nickname }
    var openMenu = null;     // 열려 있는 드롭다운 닫기 함수
    var total = 0;

    /* ---------- 창 ---------- */

    /* 상세 화면에서 열면 상단 플레이어 아래를 전부 차지한다.
       (opts.fillBelow() 가 플레이어 아래 y 좌표를 알려 준다) */
    function layout() {
      if (typeof opts.fillBelow !== 'function') return;
      var y = opts.fillBelow();
      if (y == null) return;
      back.classList.add('is-filled');
      back.style.top = Math.max(0, Math.round(y)) + 'px';
    }
    layout();
    window.addEventListener('resize', layout);

    /* ---------- 손잡이로 끌어내려 닫기 ---------- */

    var sheet = back.querySelector('.sheet');
    var grip = back.querySelector('.sheet-grip');
    var drag = null;

    // 다 올라오면 애니메이션을 떼어, 끄는 동안 transform 이 먹게 한다
    var settle = setTimeout(function () { sheet.classList.add('is-settled'); }, 340);

    /** 여기까지 내리면 닫는다. 같은 거리로 뒤 화면도 상세로 되돌아간다. */
    function closeAt() {
      return Math.min(140, sheet.getBoundingClientRect().height * 0.28);
    }

    grip.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearTimeout(settle);
      sheet.classList.add('is-settled');
      sheet.style.transition = 'none';
      drag = { y: e.clientY, t: Date.now(), dy: 0, at: closeAt() };
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* 그냥 진행 */ }
    });

    grip.addEventListener('pointermove', function (e) {
      if (!drag) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
      sheet.style.transform = 'translateY(' + drag.dy + 'px)';
      // 내린 만큼 뒤의 플레이어도 상세 화면으로 되돌아간다
      if (typeof opts.onDrag === 'function') {
        opts.onDrag(Math.min(1, drag.dy / drag.at));
      }
    });

    function endDrag() {
      if (!drag) return;
      var dy = drag.dy;
      var speed = dy / Math.max(1, Date.now() - drag.t);   // px/ms
      var at = drag.at;
      drag = null;

      // 많이 내렸거나(높이의 28%, 최대 140px) 빠르게 튕겼으면 닫는다
      var closing = dy > at || (dy > 20 && speed > 0.5);
      if (typeof opts.onDragEnd === 'function') opts.onDragEnd(closing);

      if (closing) {
        sheet.style.transition = '';
        close(false, true);     // 닫는 모션이 지금 자리에서 이어진다
        return;
      }

      sheet.style.transition = 'transform 200ms ease';
      sheet.style.transform = '';
    }

    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);

    var closing = false;

    /** close(true) 면 내려가는 모션 없이 바로 치운다(화면을 떠날 때).
        dragged 면 뒤 화면이 이미 끌려 되돌아오는 중이다. */
    function close(immediate, dragged) {
      if (closing) return;
      closing = true;
      closeMenu();
      clearTimeout(settle);
      drag = null;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', layout);
      if (closeOpen === close) closeOpen = null;
      memo.open = false;      // 다시 그려도 저절로 열리지는 않게 (글은 남긴다)
      writeMemo(memo);

      // 창이 내려가는 동안 상세 화면은 제자리로 커진다.
      if (typeof opts.onClose === 'function') opts.onClose(!!dragged);

      if (immediate) return done();
      back.classList.add('is-closing');
      setTimeout(done, 300);
    }

    function done() {
      back.remove();
      document.body.classList.remove('sheet-open');
    }

    closeOpen = close;

    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (openMenu) closeMenu();
      else close();
    }
    document.addEventListener('keydown', onKey);

    back.addEventListener('pointerdown', function (e) {
      if (e.target === back) close();
    });
    back.querySelector('.sheet-close').addEventListener('click', function () { close(); });

    function say(msg) {
      toast.textContent = msg;
      toast.hidden = false;
      setTimeout(function () { toast.hidden = true; }, 1600);
    }

    /* ---------- ⋮ 메뉴 ---------- */

    function closeMenu() {
      if (!openMenu) return;
      openMenu();
      openMenu = null;
    }

    function showMenu(btn, items) {
      closeMenu();
      var pop = el('div', 'menu-pop cmt-menu');
      pop.setAttribute('role', 'menu');

      items.forEach(function (it) {
        var b = el('button', 'menu-item' + (it.danger ? ' danger' : ''), it.label);
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.addEventListener('click', function () {
          closeMenu();
          it.onPick();
        });
        pop.appendChild(b);
      });

      // 목록이 스크롤되는 영역이라 잘리지 않도록 화면 기준으로 띄운다.
      document.body.appendChild(pop);
      var r = btn.getBoundingClientRect();
      var w = pop.offsetWidth;
      var h = pop.offsetHeight;
      var top = r.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      pop.style.top = top + 'px';
      pop.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';

      btn.setAttribute('aria-expanded', 'true');

      function away(e) { if (!pop.contains(e.target) && e.target !== btn) closeMenu(); }
      document.addEventListener('pointerdown', away, true);
      list.addEventListener('scroll', closeMenu, { passive: true });

      openMenu = function () {
        document.removeEventListener('pointerdown', away, true);
        list.removeEventListener('scroll', closeMenu);
        btn.setAttribute('aria-expanded', 'false');
        pop.remove();
      };
    }

    /* ---------- 한 줄 ---------- */

    function startEdit(li, c) {
      var body = li.querySelector('.cmt-body');
      if (!body || li.querySelector('.cmt-edit')) return;

      var box = el('form', 'cmt-edit');
      var field = document.createElement('textarea');
      field.className = 'input flat-input cmt-edit-field';
      field.rows = 1;
      field.maxLength = 1000;
      field.value = c.body || '';
      field.setAttribute('aria-label', '댓글 수정');

      // 여기서도 엔터는 줄 바꿈. 저장은 저장 버튼으로만.
      function growField() {
        field.style.height = 'auto';
        field.style.height = Math.max(40, Math.min(field.scrollHeight, 160)) + 'px';
      }
      field.addEventListener('input', growField);

      var save = el('button', 'btn btn-ink cmt-save', '저장');
      save.type = 'submit';
      var cancel = el('button', 'cmt-cancel', '취소');
      cancel.type = 'button';

      box.appendChild(field);
      box.appendChild(save);
      box.appendChild(cancel);
      body.replaceWith(box);
      growField();
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);

      cancel.addEventListener('click', function () { box.replaceWith(body); });

      box.addEventListener('submit', async function (e) {
        e.preventDefault();
        var next = field.value.trim();
        if (!next) return;
        if (next === c.body) { box.replaceWith(body); return; }
        save.disabled = true;
        try {
          await window.DB.updateComment(c.id, next);
          await load(false);
        } catch (err) {
          window.alert('수정하지 못했습니다.\n' + (err && err.message ? err.message : ''));
          save.disabled = false;
        }
      });
    }

    async function removeComment(c) {
      if (!window.confirm('이 댓글을 지울까요?')) return;
      try {
        await window.DB.deleteComment(c.id);
        await load(false);
      } catch (err) {
        window.alert('지우지 못했습니다.\n' + (err && err.message ? err.message : ''));
      }
    }

    function row(c, isReply, threadId) {
      var li = el('li', 'cmt' + (isReply ? ' is-reply' : ''));
      li.dataset.id = c.id;

      var head = el('div', 'cmt-head');
      head.appendChild(el('span', 'cmt-who', c.author_nickname || '알 수 없음'));
      head.appendChild(el('span', 'cmt-when', fmtWhen(c.created_at)));

      var more = el('button', 'cmt-more');
      more.type = 'button';
      more.setAttribute('aria-label', '댓글 메뉴');
      more.setAttribute('aria-haspopup', 'true');
      more.setAttribute('aria-expanded', 'false');
      more.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';

      var mine = meId && c.author === meId;
      more.addEventListener('click', function () {
        var items = [];
        if (mine) items.push({ label: '수정', onPick: function () { startEdit(li, c); } });
        if (mine || auth.isAdmin) {
          items.push({ label: '삭제', danger: true, onPick: function () { removeComment(c); } });
        }
        items.push({
          label: '복사',
          onPick: async function () { say((await copyText(c.body || '')) ? '복사했습니다' : '복사하지 못했습니다'); },
        });
        items.push({
          label: '답글',
          onPick: function () { setReply({ id: threadId, nickname: c.author_nickname }); },
        });
        showMenu(more, items);
      });

      head.appendChild(more);
      li.appendChild(head);
      li.appendChild(el('p', 'cmt-body', c.body || ''));
      return li;
    }

    /* ---------- 목록 ---------- */

    function paint(rows) {
      list.textContent = '';
      var kids = {};
      rows.forEach(function (c) {
        if (!c.parent_id) return;
        (kids[c.parent_id] = kids[c.parent_id] || []).push(c);
      });

      total = rows.length;
      rows.forEach(function (c) {
        if (c.parent_id) return;            // 답글은 부모 아래에서 그린다
        list.appendChild(row(c, false, c.id));
        (kids[c.id] || []).forEach(function (k) {
          list.appendChild(row(k, true, c.id));   // 답글의 답글도 같은 묶음으로
        });
      });

      list.hidden = total === 0;          // 비면 안내 문구가 가운데 오도록
      empty.hidden = total > 0;
      if (typeof opts.onChange === 'function') opts.onChange(total);
    }

    async function load(scrollToEnd) {
      try {
        var rows = await window.DB.listComments(track.id);
        paint(rows);
        if (scrollToEnd) list.scrollTop = list.scrollHeight;
      } catch (err) {
        list.hidden = true;
        empty.hidden = false;
        empty.textContent = '댓글을 불러오지 못했습니다. ' + (err && err.message ? err.message : '');
      }
    }

    /* ---------- 입력 ---------- */

    function setReply(to) {
      replyTo = to;
      memo.reply = to;
      writeMemo(memo);
      replyBar.hidden = !to;
      if (to) {
        replyWho.textContent = (to.nickname || '') + '에게 답글';
        input.focus();
      }
    }
    replyCancel.addEventListener('click', function () { setReply(null); });

    // 글자가 있을 때만 보낼 수 있다(비었으면 아이콘이 회색)
    /* 엔터는 줄 바꿈이고, 올리는 건 종이비행기 버튼으로만 한다.
       (textarea 라 엔터로 폼이 보내지지 않는다) */
    function grow() {
      input.style.height = 'auto';
      var h = Math.min(input.scrollHeight, 124);
      input.style.height = Math.max(46, h) + 'px';
      input.classList.toggle('is-multi', h > 50);
    }

    function syncSend() {
      send.disabled = !input.value.trim();
      grow();
    }

    var memoTimer = null;
    input.addEventListener('input', function () {
      syncSend();
      memo.draft = input.value;
      clearTimeout(memoTimer);
      memoTimer = setTimeout(function () { writeMemo(memo); }, 300);
    });

    // 쓰다 만 글과 답글 대상을 되살린다
    input.value = memo.draft || '';
    syncSend();
    if (memo.reply) setReply(memo.reply);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var body = input.value.trim();
      if (!body) return;

      send.disabled = true;
      try {
        await window.DB.addComment({
          track_id: track.id,
          parent_id: replyTo ? replyTo.id : null,
          body: body,
        });
        input.value = '';
        memo.draft = '';
        writeMemo(memo);
        setReply(null);
        await load(true);
      } catch (err) {
        window.alert('댓글을 남기지 못했습니다.\n' + (err && err.message ? err.message : ''));
      } finally {
        syncSend();
        input.focus();
      }
    });

    load(false);
  }

  /** 열려 있는 창이 있으면 모션 없이 닫는다 (화면을 떠날 때) */
  function closeAny() {
    if (closeOpen) closeOpen(true);
  }

  window.Comments = { open: open, closeAny: closeAny, wasOpen: wasOpen };
})();
