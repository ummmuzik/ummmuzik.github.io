/*
 * 곡별 댓글. 아래에서 올라오는 창으로 띄운다.
 *   - 입력칸은 화면 맨 아래에 붙어 있고, 그 위로 댓글이 쌓인다.
 *   - 먼저 단 댓글이 위에 온다. 스크롤은 목록만 움직인다.
 *   - 답글은 한 단계만, 표시 없이 한 칸 들여쓴다.
 */
(function () {
  'use strict';

  function fmtWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var now = new Date();
    var sameYear = d.getFullYear() === now.getFullYear();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    var hh = ('0' + d.getHours()).slice(-2);
    var mi = ('0' + d.getMinutes()).slice(-2);
    return (sameYear ? '' : d.getFullYear() + '. ') + mm + '/' + dd + ' ' + hh + ':' + mi;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function open(track) {
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
    document.body.appendChild(node);
    document.body.classList.add('sheet-open');

    var replyTo = null;      // { id, nickname }

    function close() {
      back.remove();
      document.body.classList.remove('sheet-open');
      document.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    node = null;

    back.addEventListener('pointerdown', function (e) {
      if (e.target === back) close();
    });
    back.querySelector('.sheet-close').addEventListener('click', close);

    function setReply(to) {
      replyTo = to;
      replyBar.hidden = !to;
      if (to) {
        replyWho.textContent = (to.nickname || '') + '에게 답글';
        input.focus();
      }
    }
    replyCancel.addEventListener('click', function () { setReply(null); });

    function row(c, isReply) {
      var li = el('li', 'cmt' + (isReply ? ' is-reply' : ''));
      li.dataset.id = c.id;

      var head = el('div', 'cmt-head');
      head.appendChild(el('span', 'cmt-who', c.author_nickname || '알 수 없음'));
      head.appendChild(el('span', 'cmt-when', fmtWhen(c.created_at)));
      li.appendChild(head);
      li.appendChild(el('p', 'cmt-body', c.body || ''));

      if (!isReply) {
        var reply = el('button', 'cmt-reply', '답글');
        reply.type = 'button';
        reply.addEventListener('click', function () {
          setReply({ id: c.id, nickname: c.author_nickname });
        });
        li.appendChild(reply);
      }
      return li;
    }

    function paint(rows) {
      list.textContent = '';
      var kids = {};
      rows.forEach(function (c) {
        if (!c.parent_id) return;
        (kids[c.parent_id] = kids[c.parent_id] || []).push(c);
      });

      var count = 0;
      rows.forEach(function (c) {
        if (c.parent_id) return;           // 답글은 부모 아래에서 그린다
        list.appendChild(row(c, false));
        count++;
        (kids[c.id] || []).forEach(function (k) {
          list.appendChild(row(k, true));
          count++;
        });
      });
      empty.hidden = count > 0;
    }

    function fail(msg) {
      empty.hidden = false;
      empty.textContent = msg;
    }

    async function load(scrollToEnd) {
      try {
        var rows = await window.DB.listComments(track.id);
        paint(rows);
        if (scrollToEnd) list.scrollTop = list.scrollHeight;
      } catch (err) {
        fail('댓글을 불러오지 못했습니다. ' + (err && err.message ? err.message : ''));
      }
    }

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
        setReply(null);
        await load(true);
      } catch (err) {
        window.alert('댓글을 남기지 못했습니다.\n' + (err && err.message ? err.message : ''));
      } finally {
        send.disabled = false;
        input.focus();
      }
    });

    load(false);
  }

  window.Comments = { open: open };
})();
