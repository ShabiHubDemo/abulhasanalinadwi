// Admin panel (single page, served for every /admin/* URL).
// The server enforces every permission; the checks here only decide what to show.
(function () {
  'use strict';

  var app = document.getElementById('app');
  var state = { user: null, csrf: '', newQuestions: 0 };

  // ---------------------------------------------------------------- helpers
  var PATHS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    inbox: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 5h14l1 8v6H4v-6z"/>',
    reel: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
    video: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m10 9.5 5 2.5-5 2.5z"/>',
    book: '<path d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 4.6l3.8-1 3.9 15.5-3.8 1z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    log: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
    lock: '<rect x="4" y="10.5" width="16" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M16 7l3 3M14 9l2 2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (PATHS[name] || '') + '</svg>'; }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function can(perm) { return !!state.user && (state.user.permissions || []).indexOf(perm) !== -1; }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  function fmtDate(iso, withTime) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var opts = { day: 'numeric', month: 'short', year: 'numeric' };
    if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
    return d.toLocaleString(undefined, opts);
  }
  function timeAgo(iso) {
    if (!iso) return 'never';
    var s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return 'just now';
    var units = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
    for (var i = 0; i < units.length; i++) {
      if (s >= units[i][0]) { var n = Math.floor(s / units[i][0]); return n + ' ' + units[i][1] + (n === 1 ? '' : 's') + ' ago'; }
    }
    return 'just now';
  }
  function when(iso) { return '<time datetime="' + esc(iso) + '" title="' + esc(fmtDate(iso, true)) + '">' + esc(timeAgo(iso)) + '</time>'; }
  function duration(s) {
    if (!s) return '';
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = ('0' + s % 60).slice(-2);
    return h ? h + ':' + ('0' + m).slice(-2) + ':' + sec : m + ':' + sec;
  }
  function parseDuration(str) {
    str = String(str || '').trim();
    if (!str) return null;
    if (!/^\d{1,2}(:\d{1,2}){0,2}$/.test(str)) return NaN;
    return str.split(':').reduce(function (acc, p) { return acc * 60 + Number(p); }, 0);
  }
  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }
  function siteUrl(path) { return path || '/'; }

  var ROLE_LABEL = { user: 'User', editor: 'Editor', admin: 'Administrator' };
  var ROLE_HELP = {
    user: 'No access to the admin panel.',
    editor: 'Manages reels, videos, magazines and Ask us questions.',
    admin: 'Everything, including accounts, settings and the activity log.'
  };
  function roleBadge(r) { return '<span class="badge ' + (r === 'admin' ? 'badge--green' : r === 'editor' ? 'badge--blue' : 'badge--grey') + '">' + esc(ROLE_LABEL[r] || r) + '</span>'; }
  function statusBadge(s) { return '<span class="badge badge--dot ' + (s === 'active' ? 'badge--green' : 'badge--red') + '">' + esc(s) + '</span>'; }
  var Q_STATUS = { new: ['New', 'badge--amber'], answered: ['Answered', 'badge--green'], archived: ['Archived', 'badge--grey'] };
  function qBadge(s) { var x = Q_STATUS[s] || [s, 'badge--grey']; return '<span class="badge ' + x[1] + '">' + esc(x[0]) + '</span>'; }

  // ---------------------------------------------------------------- API
  function ApiError(status, message, field) {
    this.status = status; this.message = message; this.field = field;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function api(method, url, body, opts) {
    opts = opts || {};
    var headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && state.csrf) headers['X-CSRF-Token'] = state.csrf;
    return fetch(url, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' })
      .catch(function () { throw new ApiError(0, 'Can’t reach the server. Check your connection and try again.'); })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
          if (res.ok) return data || {};
          var msg = (data && data.error) || 'Something went wrong (' + res.status + ').';
          var err = new ApiError(res.status, msg, data && data.details && data.details.field);
          if (res.status === 401 && !opts.allow401) {
            // signed out or session expired: back to the sign-in page
            state.user = null;
            toast(msg, 'error');
            go('/admin/login?next=' + encodeURIComponent(location.pathname + location.search), true);
          }
          throw err;
        });
      });
  }

  // ---------------------------------------------------------------- toasts
  function toast(message, type) {
    var box = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast toast--' + (type || 'success');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = icon(type === 'error' ? 'alert' : 'check') + '<span>' + esc(message) + '</span>';
    box.appendChild(el);
    setTimeout(function () { el.classList.add('is-leaving'); setTimeout(function () { el.remove(); }, 250); }, type === 'error' ? 6000 : 3500);
  }

  // ---------------------------------------------------------------- modal
  function modal(opts) {
    var lastFocus = document.activeElement;
    var el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = '<div class="modal__backdrop" data-close></div>' +
      '<div class="modal__dialog' + (opts.wide ? ' modal__dialog--wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<div class="modal__head"><div>' + (opts.iconHtml || '') + '<h2 id="modal-title">' + esc(opts.title) + '</h2>' +
        (opts.subtitle ? '<p>' + esc(opts.subtitle) + '</p>' : '') + '</div>' +
        '<button class="btn btn--ghost btn--icon" type="button" data-close aria-label="Close">' + icon('close') + '</button></div>' +
        '<div class="modal__body">' + opts.body + '</div></div>';
    document.body.appendChild(el);
    document.documentElement.classList.add('is-modal-open');
    function close() {
      el.remove();
      document.removeEventListener('keydown', onKey);
      if (!document.querySelector('.modal')) document.documentElement.classList.remove('is-modal-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        var f = $$('button, a[href], input, select, textarea', el).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    el.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    var first = el.querySelector('input:not([type=hidden]), select, textarea') || el.querySelector('.modal__body button');
    if (first) setTimeout(function () { first.focus(); }, 30);
    return { el: el, close: close };
  }

  // confirmation dialog; requireText makes the person type something first
  function confirmDialog(o) {
    return new Promise(function (resolve) {
      var done = false;
      var m = modal({
        title: o.title,
        iconHtml: o.danger ? '<div class="modal__icon">' + icon('alert') + '</div>' : '',
        body: '<p class="muted">' + o.message + '</p>' +
          (o.requireText ? '<div class="field"><label for="confirm-text">Type <strong>' + esc(o.requireText) + '</strong> to confirm</label>' +
            '<input class="input" id="confirm-text" autocomplete="off" spellcheck="false"></div>' : '') +
          '<div class="form-actions"><button class="btn btn--outline" type="button" data-close>Cancel</button>' +
          '<button class="btn ' + (o.danger ? 'btn--danger' : 'btn--primary') + '" type="button" data-ok' + (o.requireText ? ' disabled' : '') + '>' + esc(o.confirmLabel || 'Confirm') + '</button></div>',
        onClose: function () { if (!done) resolve(false); }
      });
      var ok = $('[data-ok]', m.el);
      var input = $('#confirm-text', m.el);
      if (input) input.addEventListener('input', function () { ok.disabled = input.value.trim().toLowerCase() !== o.requireText.toLowerCase(); });
      ok.addEventListener('click', function () { done = true; m.close(); resolve(input ? input.value.trim() : true); });
    });
  }

  // ---------------------------------------------------------------- forms
  function clearErrors(form) {
    $$('.field.has-error', form).forEach(function (f) { f.classList.remove('has-error'); });
    $$('.field__error', form).forEach(function (e) { e.textContent = ''; });
    var a = $('.alert--error', form); if (a) { a.hidden = true; a.textContent = ''; }
  }
  function showError(form, err) {
    var input = err.field && form.querySelector('[name="' + err.field + '"]');
    if (input) {
      var f = input.closest('.field');
      f.classList.add('has-error');
      var slot = $('.field__error', f);
      if (slot) slot.textContent = err.message;
      input.focus();
      return;
    }
    var a = $('.alert--error', form);
    if (a) { a.innerHTML = icon('alert') + '<span>' + esc(err.message) + '</span>'; a.hidden = false; }
    else toast(err.message, 'error');
  }
  function busy(btn, on, label) {
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="admin-spinner admin-spinner--sm"></span>' + esc(label || 'Saving…');
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }
  function field(name, label, inputHtml, help) {
    return '<div class="field"><label for="f-' + name + '">' + esc(label) + '</label>' + inputHtml +
      (help ? '<small>' + help + '</small>' : '') + '<span class="field__error"></span></div>';
  }
  function input(name, value, attrs) {
    return '<input class="input" id="f-' + name + '" name="' + name + '" value="' + esc(value) + '" ' + (attrs || '') + '>';
  }
  function switchHtml(name, checked, label, disabled) {
    return '<label class="switch"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') +
      '><span class="switch__track"></span>' + (label ? '<span>' + esc(label) + '</span>' : '') + '</label>';
  }
  function pwRules() {
    return '<ul class="pw-rules"><li data-rule="len">At least 10 characters</li><li data-rule="mix">Letters and numbers</li></ul>';
  }
  function bindPwRules(inputEl, list) {
    inputEl.addEventListener('input', function () {
      var v = inputEl.value;
      $('[data-rule=len]', list).classList.toggle('ok', v.length >= 10);
      $('[data-rule=mix]', list).classList.toggle('ok', /[A-Za-z]/.test(v) && /\d/.test(v));
    });
  }
  function randomPassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    var a = new Uint32Array(14);
    crypto.getRandomValues(a);
    var s = '';
    for (var i = 0; i < a.length; i++) s += chars[a[i] % chars.length];
    return s.slice(0, 5) + '-' + s.slice(5, 10) + '-' + (a[0] % 90 + 10) + s.slice(10);
  }

  function loading() { return '<div class="admin-loading"><div class="admin-spinner" role="status" aria-label="Loading"></div></div>'; }
  function emptyState(ic, title, text, action) {
    return '<div class="empty">' + icon(ic) + '<h3>' + esc(title) + '</h3>' + (text ? '<p>' + text + '</p>' : '') + (action || '') + '</div>';
  }
  function errorState(main, err, retry) {
    main.innerHTML = '<div class="card">' + emptyState('alert', 'Couldn’t load this page', esc(err.message),
      '<button class="btn btn--outline" type="button" data-retry>' + icon('refresh') + 'Try again</button>') + '</div>';
    $('[data-retry]', main).addEventListener('click', retry);
  }
  function pager(data, onPage) {
    var pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    var from = data.total ? (data.page - 1) * data.pageSize + 1 : 0;
    var to = Math.min(data.total, data.page * data.pageSize);
    var el = document.createElement('div');
    el.className = 'pager';
    el.innerHTML = '<span>' + from + '–' + to + ' of ' + data.total + '</span><div class="pager__btns">' +
      '<button class="btn btn--outline btn--sm" type="button" data-p="prev"' + (data.page <= 1 ? ' disabled' : '') + '>' + icon('left') + 'Previous</button>' +
      '<button class="btn btn--outline btn--sm" type="button" data-p="next"' + (data.page >= pages ? ' disabled' : '') + '>Next' + icon('right') + '</button></div>';
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]');
      if (b) onPage(data.page + (b.dataset.p === 'next' ? 1 : -1));
    });
    return el;
  }

  // ---------------------------------------------------------------- audit wording
  var ACTIONS = {
    'auth.login': 'signed in', 'auth.logout': 'signed out', 'auth.login_failed': 'failed sign-in for',
    'auth.password_changed': 'changed their password',
    'user.created': 'created the account', 'user.registered': 'signed up on the website', 'user.updated': 'updated the account', 'user.role_changed': 'changed the role of',
    'user.disabled': 'disabled', 'user.enabled': 're-enabled', 'user.password_reset': 'reset the password of', 'user.deleted': 'deleted the account',
    'video.created': 'added the video', 'video.updated': 'edited the video', 'video.published': 'published', 'video.unpublished': 'hid',
    'video.deleted': 'deleted the video', 'video.reordered': 'reordered',
    'magazine.updated': 'updated the magazine',
    'question.answered': 'marked as answered', 'question.new': 'marked as new', 'question.archived': 'archived',
    'question.note_updated': 'updated the note on', 'question.deleted': 'deleted the question',
    'settings.updated': 'changed website settings'
  };
  function describe(a) {
    var m = a.meta || {};
    var who = a.actorEmail === 'cli' ? 'Setup script' : (a.actorEmail || 'Someone');
    var verb = ACTIONS[a.action] || a.action;
    var target = '';
    if (a.action === 'auth.login_failed') { who = ''; target = m.email || ''; verb = 'Failed sign-in for'; }
    else if (a.action.indexOf('auth.') === 0 || a.action === 'user.registered') target = '';
    else if (a.action === 'video.reordered') target = m.kind === 'reel' ? 'Shorts & Reels' : 'Videos';
    else if (a.action === 'settings.updated') target = m.fields ? '(' + m.fields.join(', ') + ')' : '';
    else target = m.email || m.title || m.subject || m.name || (a.targetType ? a.targetType + ' #' + a.targetId : '');
    var extra = '';
    if (m.role && m.role.from) extra = ' from ' + (ROLE_LABEL[m.role.from] || m.role.from) + ' to ' + (ROLE_LABEL[m.role.to] || m.role.to);
    if (a.action === 'magazine.updated' && m.issue) extra = ' to ' + m.issue;
    return (who ? '<strong>' + esc(who) + '</strong> ' : '') + esc(verb) + (target ? ' <strong>' + esc(target) + '</strong>' : '') + esc(extra);
  }
  function feed(items) {
    if (!items.length) return emptyState('log', 'No activity yet', '');
    return '<ul class="feed">' + items.map(function (a) {
      return '<li><span class="feed__dot' + (/deleted|disabled|failed/.test(a.action) ? ' feed__dot--danger' : '') + '"></span>' +
        '<div class="feed__text">' + describe(a) + '<span class="feed__time">' + when(a.createdAt) + '</span></div></li>';
    }).join('') + '</ul>';
  }

  // ---------------------------------------------------------------- router
  var ROUTES = [
    { path: '/admin/login', view: loginView, public: true },
    { path: '/admin', redirect: '/admin/dashboard' },
    { path: '/admin/dashboard', view: dashboardView, perm: 'dashboard.view', title: 'Dashboard', nav: 'dashboard' },
    { path: '/admin/questions', view: questionsView, perm: 'questions.manage', title: 'Questions', nav: 'questions' },
    { path: '/admin/questions/:id', view: questionView, perm: 'questions.manage', title: 'Question', nav: 'questions' },
    { path: '/admin/reels', view: function (m) { return videosView(m, 'reel'); }, perm: 'content.manage', title: 'Shorts & Reels', nav: 'reels' },
    { path: '/admin/videos', view: function (m) { return videosView(m, 'video'); }, perm: 'content.manage', title: 'Videos', nav: 'videos' },
    { path: '/admin/magazines', view: magazinesView, perm: 'content.manage', title: 'Magazines', nav: 'magazines' },
    { path: '/admin/users', view: usersView, perm: 'users.manage', title: 'Users', nav: 'users' },
    { path: '/admin/users/:id', view: userView, perm: 'users.manage', title: 'User', nav: 'users' },
    { path: '/admin/activity', view: activityView, perm: 'audit.view', title: 'Activity log', nav: 'activity' },
    { path: '/admin/settings', view: settingsView, perm: 'admin.access', title: 'Settings', nav: 'settings' }
  ];
  var NAV = [
    { id: 'dashboard', href: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard', perm: 'dashboard.view' },
    { group: 'Content' },
    { id: 'questions', href: '/admin/questions', label: 'Questions', icon: 'inbox', perm: 'questions.manage', count: true },
    { id: 'reels', href: '/admin/reels', label: 'Shorts & Reels', icon: 'reel', perm: 'content.manage' },
    { id: 'videos', href: '/admin/videos', label: 'Videos', icon: 'video', perm: 'content.manage' },
    { id: 'magazines', href: '/admin/magazines', label: 'Magazines', icon: 'book', perm: 'content.manage' },
    { group: 'Administration', perm: 'users.manage' },
    { id: 'users', href: '/admin/users', label: 'Users', icon: 'users', perm: 'users.manage' },
    { id: 'activity', href: '/admin/activity', label: 'Activity log', icon: 'log', perm: 'audit.view' },
    { id: 'settings', href: '/admin/settings', label: 'Settings', icon: 'settings', perm: 'admin.access' }
  ];

  function match(pathname) {
    var p = pathname.replace(/\/+$/, '') || '/admin';
    for (var i = 0; i < ROUTES.length; i++) {
      var keys = [];
      var re = new RegExp('^' + ROUTES[i].path.replace(/:([a-z]+)/g, function (_, k) { keys.push(k); return '([^/]+)'; }) + '$');
      var m = re.exec(p);
      if (m) {
        var params = {};
        keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); });
        return { route: ROUTES[i], params: params };
      }
    }
    return null;
  }

  function go(url, replace) {
    if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
    render();
  }
  window.addEventListener('popstate', render);
  // in-app links
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-link]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });

  function safeNext(next) {
    return next && /^\/admin(\/[\w\-/]*)?$/.test(next.split('?')[0]) && next.indexOf('/admin/login') !== 0 ? next : '/admin/dashboard';
  }

  var renderToken = 0;
  function render() {
    var token = ++renderToken;
    var found = match(location.pathname);
    if (found && found.route.redirect) return go(found.route.redirect, true);

    // ask the server who is signed in once per page load (and after sign-in / sign-out)
    var ready = state.user || state.checked ? Promise.resolve() : api('GET', '/api/auth/me', undefined, { allow401: true })
      .then(function (d) { state.user = d.user; state.csrf = d.csrfToken; })
      .catch(function (err) { if (err.status !== 401) throw err; })
      .then(function () { state.checked = true; });

    ready.then(function () {
      if (token !== renderToken) return;
      if (found && found.route.public) {
        if (state.user && can('admin.access')) return go(safeNext(new URLSearchParams(location.search).get('next')), true);
        return found.route.view(app);
      }
      if (!state.user) return go('/admin/login?next=' + encodeURIComponent(location.pathname + location.search), true);
      if (!can('admin.access')) return noAccessView();
      if (state.user.mustChangePassword) return forcePasswordView();
      shell(found);
    }).catch(function (err) {
      app.className = '';
      app.innerHTML = '<div class="state-page"><div class="card state-card">' + icon('alert') +
        '<h1>Can’t load the admin panel</h1><p>' + esc(err.message) + '</p>' +
        '<button class="btn btn--primary" type="button" data-retry>Try again</button></div></div>';
      $('[data-retry]', app).addEventListener('click', render);
    });
  }

  // ---------------------------------------------------------------- shell
  function shell(found) {
    app.className = '';
    var shellEl = $('.admin-shell', app);
    if (!shellEl) {
      app.innerHTML =
        '<div class="admin-shell">' +
          '<aside class="admin-sidebar" aria-label="Admin navigation">' +
            '<a class="admin-brand" href="/admin/dashboard" data-link><img src="https://abulhasanalinadwi.org/wp-content/uploads/2017/08/LOGO_FINAL.png" alt="Abul Hasan Ali Nadwi Center"><span>Admin</span></a>' +
            '<nav class="admin-nav"></nav>' +
            '<div class="admin-sidebar__foot"><a href="/" target="_blank" rel="noopener">' + icon('globe') + 'View website</a></div>' +
          '</aside>' +
          '<div class="admin-scrim" hidden></div>' +
          '<div class="admin-main">' +
            '<header class="admin-topbar">' +
              '<button class="btn btn--ghost btn--icon admin-topbar__menu" type="button" aria-label="Open menu" aria-expanded="false">' + icon('menu') + '</button>' +
              '<h1 class="admin-topbar__title"></h1>' +
              '<div class="admin-topbar__right"><div class="admin-user">' +
                '<button class="admin-user__btn" type="button" aria-haspopup="true" aria-expanded="false">' +
                  '<span class="avatar">' + esc(initials(state.user.name)) + '</span>' +
                  '<span class="admin-user__name">' + esc(state.user.name) + '<span class="admin-user__role">' + esc(ROLE_LABEL[state.user.role]) + '</span></span>' + icon('down') +
                '</button>' +
                '<div class="admin-menu" hidden>' +
                  '<a href="/admin/settings?tab=account" data-link>' + icon('user') + 'My account</a>' +
                  '<a href="/" target="_blank" rel="noopener">' + icon('globe') + 'View website</a><hr>' +
                  '<button type="button" data-logout>' + icon('logout') + 'Sign out</button>' +
                '</div></div></div>' +
            '</header>' +
            '<main class="admin-content" id="main" tabindex="-1"></main>' +
          '</div>' +
        '</div>';
      shellEl = $('.admin-shell', app);
      var menuBtn = $('.admin-user__btn', shellEl), menu = $('.admin-menu', shellEl);
      menuBtn.addEventListener('click', function () { menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
      document.addEventListener('click', function (e) { if (!e.target.closest('.admin-user')) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });
      $('[data-logout]', shellEl).addEventListener('click', logout);
      var navBtn = $('.admin-topbar__menu', shellEl), scrim = $('.admin-scrim', shellEl);
      var setNav = function (open) { shellEl.classList.toggle('nav-open', open); scrim.hidden = !open; navBtn.setAttribute('aria-expanded', String(open)); };
      navBtn.addEventListener('click', function () { setNav(!shellEl.classList.contains('nav-open')); });
      scrim.addEventListener('click', function () { setNav(false); });
      $('.admin-sidebar', shellEl).addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
      refreshQuestionCount();
    }
    $('.admin-menu', shellEl).hidden = true;

    var route = found && found.route;
    renderNav(route ? route.nav : '');
    $('.admin-topbar__title', shellEl).textContent = route ? route.title : 'Not found';
    document.title = (route ? route.title : 'Not found') + ' – Admin';
    var main = $('#main', shellEl);
    window.scrollTo(0, 0);

    if (!route) {
      main.innerHTML = '<div class="card">' + emptyState('alert', 'Page not found', 'This admin page doesn’t exist.',
        '<a class="btn btn--primary" href="/admin/dashboard" data-link>Go to the dashboard</a>') + '</div>';
      return;
    }
    if (route.perm && !can(route.perm)) {
      main.innerHTML = '<div class="card">' + emptyState('lock', 'You don’t have access to this page',
        'Your role (' + esc(ROLE_LABEL[state.user.role]) + ') can’t open ' + esc(route.title) + '. Ask an administrator if you need it.',
        '<a class="btn btn--primary" href="/admin/dashboard" data-link>Go to the dashboard</a>') + '</div>';
      return;
    }
    main.innerHTML = loading();
    route.view(main, found.params);
  }

  function renderNav(active) {
    var nav = $('.admin-nav', app);
    if (!nav) return;
    nav.innerHTML = NAV.filter(function (n) { return !n.perm || can(n.perm); }).map(function (n) {
      if (n.group) return '<p class="admin-nav__label">' + esc(n.group) + '</p>';
      return '<a href="' + n.href + '" data-link class="' + (n.id === active ? 'is-active' : '') + '"' + (n.id === active ? ' aria-current="page"' : '') + '>' +
        icon(n.icon) + '<span>' + esc(n.label) + '</span>' +
        (n.count && state.newQuestions ? '<span class="count" aria-label="' + state.newQuestions + ' new">' + state.newQuestions + '</span>' : '') + '</a>';
    }).join('');
  }

  function refreshQuestionCount() {
    if (!can('questions.manage')) return;
    api('GET', '/api/admin/questions?status=new&pageSize=1').then(function (d) {
      state.newQuestions = d.total;
      var active = $('.admin-nav a.is-active');
      renderNav(active ? (NAV.filter(function (n) { return n.href === active.getAttribute('href'); })[0] || {}).id : '');
    }).catch(function () {});
  }

  function logout() {
    api('POST', '/api/auth/logout', {}).catch(function () {}).then(function () {
      state.user = null; state.csrf = '';
      toast('You’ve been signed out.');
      go('/admin/login', true);
    });
  }

  // ---------------------------------------------------------------- login
  function loginView(root) {
    app.className = '';
    document.title = 'Sign in – Admin';
    root.innerHTML =
      '<div class="login-page">' +
        '<aside class="login-art"><img src="https://abulhasanalinadwi.org/wp-content/uploads/2017/08/LOGO_FINAL.png" alt="Abul Hasan Ali Nadwi Center">' +
          '<div><h1>Admin panel</h1><p>Answer questions sent through Ask us, keep the homepage reels, videos and magazines up to date, and manage who can sign in.</p></div></aside>' +
        '<main class="login-panel"><form class="login-card" novalidate>' +
          '<h2>Sign in</h2><p>Use your administrator or editor account.</p>' +
          '<div class="alert alert--error" role="alert" hidden></div>' +
          field('email', 'Email', input('email', '', 'type="email" autocomplete="username" required')) +
          field('password', 'Password', input('password', '', 'type="password" autocomplete="current-password" required')) +
          '<button class="btn btn--primary btn--lg" type="submit">Sign in</button>' +
          '<p class="login-foot"><a href="/">← Back to the website</a></p>' +
        '</form></main>' +
      '</div>';
    var form = $('form', root);
    if (new URLSearchParams(location.search).get('next')) {
      var a = $('.alert--error', form);
      a.className = 'alert alert--info'; a.hidden = false;
      a.innerHTML = icon('lock') + '<span>Please sign in to continue.</span>';
    }
    setTimeout(function () { $('#f-email', root).focus(); }, 30);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      var info = $('.alert--info', form); if (info) { info.className = 'alert alert--error'; info.hidden = true; }
      var email = form.email.value.trim(), password = form.password.value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError(form, { field: 'email', message: 'Enter a valid email address.' });
      if (!password) return showError(form, { field: 'password', message: 'Enter your password.' });
      var btn = $('button[type=submit]', form);
      busy(btn, true, 'Signing in…');
      api('POST', '/api/auth/login', { email: email, password: password }, { allow401: true }).then(function (d) {
        state.user = d.user; state.csrf = d.csrfToken;
        if (!can('admin.access')) return noAccessView();
        go(safeNext(new URLSearchParams(location.search).get('next')), true);
      }).catch(function (err) {
        busy(btn, false);
        form.password.value = '';
        showError(form, { message: err.message });
      });
    });
  }

  function noAccessView() {
    app.className = '';
    document.title = 'No access – Admin';
    app.innerHTML = '<div class="state-page"><div class="card state-card">' + icon('lock') +
      '<h1>This area is for administrators</h1><p>You’re signed in as <strong>' + esc(state.user.email) +
      '</strong>, which doesn’t have access to the admin panel.</p>' +
      '<a class="btn btn--primary" href="/">Go to the website</a><button class="btn btn--outline" type="button" data-logout>Sign out</button></div></div>';
    $('[data-logout]', app).addEventListener('click', logout);
  }

  // first sign-in with a temporary password
  function forcePasswordView() {
    app.className = '';
    document.title = 'Choose a new password – Admin';
    app.innerHTML = '<div class="state-page"><form class="card state-card state-card--form" novalidate>' + icon('key') +
      '<h1>Choose a new password</h1><p>You signed in with a temporary password. Choose your own to continue.</p>' +
      '<div class="alert alert--error" role="alert" hidden></div>' +
      passwordFields('Temporary password', 'The password you just signed in with.') +
      '<button class="btn btn--primary btn--lg" type="submit">Save and continue</button>' +
      '<p class="login-foot"><button class="btn btn--ghost btn--sm" type="button" data-logout>Sign out</button></p></form></div>';
    var form = $('form', app);
    $('[data-logout]', app).addEventListener('click', logout);
    bindPasswordForm(form, function () {
      state.user.mustChangePassword = false;
      toast('Password updated.');
      render();
    });
  }

  function passwordFields(currentLabel, currentHelp) {
    return field('currentPassword', currentLabel || 'Current password', input('currentPassword', '', 'type="password" autocomplete="current-password" required'), currentHelp) +
      '<div class="field"><label for="f-newPassword">New password</label>' + input('newPassword', '', 'type="password" autocomplete="new-password" required') + pwRules() + '<span class="field__error"></span></div>' +
      field('confirmPassword', 'Repeat the new password', input('confirmPassword', '', 'type="password" autocomplete="new-password" required'));
  }
  function bindPasswordForm(form, onDone) {
    bindPwRules(form.newPassword, $('.pw-rules', form));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      if (!form.currentPassword.value) return showError(form, { field: 'currentPassword', message: 'Enter your current password.' });
      if (form.newPassword.value !== form.confirmPassword.value) return showError(form, { field: 'confirmPassword', message: 'The new passwords don’t match.' });
      var btn = $('button[type=submit]', form);
      busy(btn, true);
      api('POST', '/api/auth/password', { currentPassword: form.currentPassword.value, newPassword: form.newPassword.value })
        .then(function () { busy(btn, false); form.reset(); onDone(); })
        .catch(function (err) { busy(btn, false); showError(form, err); });
    });
  }

  // ---------------------------------------------------------------- dashboard
  function stat(o) {
    var tag = o.href ? 'a' : 'div';
    return '<' + tag + ' class="stat"' + (o.href ? ' href="' + o.href + '" data-link' : '') + '>' +
      '<div class="stat__icon' + (o.alert ? ' stat__icon--alert' : '') + '">' + icon(o.icon) + '</div>' +
      '<div class="stat__label">' + esc(o.label) + '</div><div class="stat__value">' + esc(o.value) + '</div>' +
      '<div class="stat__sub">' + esc(o.sub) + '</div></' + tag + '>';
  }

  function dashboardView(main) {
    api('GET', '/api/admin/dashboard').then(function (d) {
      var c = d.content, cards = [];
      if (d.users) cards.push(stat({ icon: 'users', label: 'Accounts', value: d.users.total, href: '/admin/users',
        sub: d.users.newLast30Days + ' new in 30 days · ' + (d.users.byRole.admin || 0) + ' admin' + ((d.users.byRole.admin || 0) === 1 ? '' : 's') }));
      cards.push(stat({ icon: 'inbox', label: 'New questions', value: d.questions.new, href: '/admin/questions', alert: d.questions.new > 0,
        sub: d.questions.total + ' total · ' + d.questions.last7Days + ' this week' }));
      cards.push(stat({ icon: 'reel', label: 'Homepage videos', value: c.reels.published + c.videos.published, href: '/admin/reels',
        sub: c.reels.published + ' reels · ' + c.videos.published + ' videos published' }));
      cards.push(stat({ icon: 'globe', label: 'Website pages', value: d.site.pages === null ? '—' : d.site.pages.toLocaleString(),
        sub: d.site.books === null ? 'Site not built yet' : d.site.books.toLocaleString() + ' book pages' }));
      state.newQuestions = d.questions.new;
      renderNav('dashboard');

      var qs = d.recentQuestions.length ? d.recentQuestions.map(function (q) {
        return '<a class="q-row" href="/admin/questions/' + q.id + '" data-link><div class="q-row__title">' + esc(q.subject || 'Question from ' + q.name) + ' ' + qBadge(q.status) + '</div>' +
          '<div class="q-row__text">' + esc(q.name) + ' · ' + esc(timeAgo(q.createdAt)) + ' — ' + esc(q.question) + '</div></a>';
      }).join('') : emptyState('inbox', 'No questions yet', 'Questions sent through the Ask us page will appear here.');

      main.innerHTML =
        '<div class="page-head"><div><h1>Assalamu alaikum, ' + esc(state.user.name.split(' ')[0]) + '</h1>' +
        '<p>Here’s what’s happening on the website.</p></div></div>' +
        '<div class="stat-grid">' + cards.join('') + '</div>' +
        '<div class="dash-grid">' +
          '<section class="card"><div class="card__head"><h2>Latest questions</h2><a href="/admin/questions" data-link>View all</a></div>' + qs + '</section>' +
          '<section class="card"><div class="card__head"><h2>' + (can('audit.view') ? 'Recent activity' : 'Your recent activity') + '</h2>' +
            (can('audit.view') ? '<a href="/admin/activity" data-link>View log</a>' : '') + '</div>' + feed(d.recentActivity) + '</section>' +
        '</div>';
    }).catch(function (err) { errorState(main, err, function () { main.innerHTML = loading(); dashboardView(main); }); });
  }

  // ---------------------------------------------------------------- questions
  function questionsView(main) {
    var q = { status: 'new', q: '', page: 1 };
    main.innerHTML =
      '<div class="page-head"><div><h1>Questions</h1><p>Sent by visitors through the Ask us page.</p></div></div>' +
      '<div class="toolbar"><div class="tabs" role="group" aria-label="Filter by status"></div>' +
        '<label class="search">' + icon('search') + '<span class="sr-only">Search questions</span><input class="input" type="search" placeholder="Search subject, question, name or email"></label></div>' +
      '<section class="card" data-list>' + loading() + '</section>';
    var list = $('[data-list]', main), tabs = $('.tabs', main);

    function load() {
      var params = new URLSearchParams({ page: q.page, pageSize: 20 });
      if (q.status !== 'all') params.set('status', q.status);
      if (q.q) params.set('q', q.q);
      api('GET', '/api/admin/questions?' + params).then(function (d) {
        var counts = d.counts || {};
        var all = (counts.new || 0) + (counts.answered || 0) + (counts.archived || 0);
        tabs.innerHTML = [['new', 'New'], ['answered', 'Answered'], ['archived', 'Archived'], ['all', 'All']].map(function (t) {
          var n = t[0] === 'all' ? all : counts[t[0]] || 0;
          return '<button type="button" data-status="' + t[0] + '" aria-pressed="' + (q.status === t[0]) + '">' + t[1] + ' <span class="tab-count">' + n + '</span></button>';
        }).join('');
        state.newQuestions = counts.new || 0;
        renderNav('questions');
        if (!d.items.length) {
          list.innerHTML = emptyState('inbox', q.q ? 'No matching questions' : 'Nothing here', q.q ? 'Try a different search.' : 'There are no ' + (q.status === 'all' ? '' : q.status + ' ') + 'questions.');
          return;
        }
        list.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th>From</th><th>Question</th><th class="hide-sm">Received</th><th>Status</th></tr></thead><tbody>' +
          d.items.map(function (x) {
            return '<tr class="is-link" data-href="/admin/questions/' + x.id + '"><td><div class="cell-user"><span class="avatar">' + esc(initials(x.name)) + '</span><div><strong>' + esc(x.name) + '</strong><span>' + esc(x.email) + '</span></div></div></td>' +
              '<td><a href="/admin/questions/' + x.id + '" data-link><strong>' + esc(x.subject || '(no subject)') + '</strong></a><div class="muted">' + esc(x.question.slice(0, 90)) + (x.question.length > 90 ? '…' : '') + '</div></td>' +
              '<td class="hide-sm nowrap muted">' + when(x.createdAt) + '</td><td>' + qBadge(x.status) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        list.appendChild(pager(d, function (p) { q.page = p; load(); }));
      }).catch(function (err) { errorState(list, err, load); });
    }
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-status]');
      if (b) { q.status = b.dataset.status; q.page = 1; list.innerHTML = loading(); load(); }
    });
    $('.search input', main).addEventListener('input', debounce(function (e) { q.q = e.target.value.trim(); q.page = 1; load(); }, 300));
    list.addEventListener('click', function (e) {
      var row = e.target.closest('tr[data-href]');
      if (row && !e.target.closest('a')) go(row.dataset.href);
    });
    load();
  }

  function questionView(main, params) {
    api('GET', '/api/admin/questions/' + encodeURIComponent(params.id)).then(function (d) {
      var x = d.item;
      var reply = 'mailto:' + encodeURIComponent(x.email) + '?subject=' + encodeURIComponent('Re: ' + (x.subject || 'Your question')) +
        '&body=' + encodeURIComponent('\n\n---\nYour question:\n' + x.question);
      main.innerHTML =
        '<a class="back-link" href="/admin/questions" data-link>' + icon('left') + 'All questions</a>' +
        '<div class="page-head"><div><h1>' + esc(x.subject || 'Question from ' + x.name) + '</h1><p>Received ' + esc(fmtDate(x.createdAt, true)) + ' · ' + qBadge(x.status) + '</p></div>' +
          '<div class="page-head__actions"><a class="btn btn--primary" href="' + esc(reply) + '">' + icon('mail') + 'Reply by email</a></div></div>' +
        '<div class="detail-grid">' +
          '<section class="card"><div class="card__head"><h2>Question</h2></div><div class="card__body"><div class="question-body">' + esc(x.question) + '</div></div></section>' +
          '<div>' +
            '<section class="card"><div class="card__head"><h2>From</h2></div><div class="card__body"><dl class="kv">' +
              '<dt>Name</dt><dd>' + esc(x.name) + '</dd><dt>Email</dt><dd><a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a></dd>' +
              '<dt>Address</dt><dd>' + esc(x.address || '—') + '</dd><dt>Gender</dt><dd>' + esc(x.gender || '—') + '</dd></dl></div></section>' +
            '<form class="card" data-note novalidate><div class="card__head"><h2>Status &amp; note</h2></div><div class="card__body">' +
              '<div class="field"><label for="f-status">Status</label><select id="f-status" name="status">' +
                ['new', 'answered', 'archived'].map(function (s) { return '<option value="' + s + '"' + (s === x.status ? ' selected' : '') + '>' + Q_STATUS[s][0] + '</option>'; }).join('') +
              '</select><span class="field__error"></span></div>' +
              field('adminNote', 'Private note', '<textarea id="f-adminNote" name="adminNote" maxlength="2000" placeholder="Only admins see this, e.g. who replied and when">' + esc(x.adminNote) + '</textarea>') +
              '<div class="form-actions"><button class="btn btn--danger-outline" type="button" data-delete>' + icon('trash') + 'Delete</button>' +
              '<button class="btn btn--primary" type="submit">Save</button></div></div></form>' +
          '</div>' +
        '</div>';
      var form = $('[data-note]', main);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearErrors(form);
        var btn = $('button[type=submit]', form);
        busy(btn, true);
        api('PATCH', '/api/admin/questions/' + x.id, { status: form.status.value, adminNote: form.adminNote.value }).then(function () {
          busy(btn, false);
          toast('Question updated.');
          refreshQuestionCount();
          questionView(main, params);
        }).catch(function (err) { busy(btn, false); showError(form, err); });
      });
      $('[data-delete]', form).addEventListener('click', function () {
        confirmDialog({ title: 'Delete this question?', message: 'The question from <strong>' + esc(x.name) + '</strong> will be removed permanently. Archive it instead if you might need it later.', confirmLabel: 'Delete question', danger: true })
          .then(function (ok) {
            if (!ok) return;
            api('DELETE', '/api/admin/questions/' + x.id, {}).then(function () { toast('Question deleted.'); refreshQuestionCount(); go('/admin/questions'); })
              .catch(function (err) { toast(err.message, 'error'); });
          });
      });
    }).catch(function (err) {
      if (err.status === 404) { main.innerHTML = '<div class="card">' + emptyState('inbox', 'Question not found', 'It may have been deleted.', '<a class="btn btn--primary" href="/admin/questions" data-link>All questions</a>') + '</div>'; return; }
      errorState(main, err, function () { questionView(main, params); });
    });
  }

  // ---------------------------------------------------------------- reels & videos
  function videosView(main, kind) {
    var isReel = kind === 'reel';
    var items = [];
    main.innerHTML =
      '<div class="page-head"><div><h1>' + (isReel ? 'Shorts &amp; Reels' : 'Videos') + '</h1>' +
        '<p>' + (isReel ? 'The tall video cards near the top of the homepage. Visitors watch them in the full-screen reel player.' : 'The wide video cards in the homepage Videos row.') + ' Drag order with the arrows; hidden videos stay here but don’t show on the site.</p></div>' +
        '<div class="page-head__actions"><a class="btn btn--outline" href="/#' + (isReel ? 'reels-title' : 'videos-title') + '" target="_blank" rel="noopener">' + icon('external') + 'View on homepage</a>' +
        '<button class="btn btn--primary" type="button" data-add>' + icon('plus') + (isReel ? 'Add reel' : 'Add video') + '</button></div></div>' +
      '<div data-list>' + loading() + '</div>';
    var list = $('[data-list]', main);

    function thumb(v) {
      return '<div class="media-row__thumb' + (isReel ? ' media-row__thumb--tall' : '') + '"><img src="https://i.ytimg.com/vi/' + esc(v.youtubeId) + '/hqdefault.jpg" alt="" loading="lazy"></div>';
    }
    function draw() {
      if (!items.length) {
        list.innerHTML = '<div class="card">' + emptyState(isReel ? 'reel' : 'video', 'No ' + (isReel ? 'reels' : 'videos') + ' yet',
          'Add a YouTube video and it will appear on the homepage.', '<button class="btn btn--primary" type="button" data-add>' + icon('plus') + 'Add the first one</button>') + '</div>';
        return;
      }
      list.innerHTML = '<div class="media-list">' + items.map(function (v, i) {
        var meta = [v.series, v.durationSeconds ? duration(v.durationSeconds) : '', v.pagePath ? 'Lesson: ' + v.pagePath : 'No lesson page'].filter(Boolean).join(' · ');
        return '<div class="media-row' + (isReel ? ' media-row--reel' : '') + (v.isPublished ? '' : ' is-hidden') + '" data-id="' + v.id + '">' +
          '<div class="media-row__order"><button class="btn btn--ghost btn--icon" type="button" data-move="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + icon('up') + '</button>' +
            '<button class="btn btn--ghost btn--icon" type="button" data-move="1" aria-label="Move down"' + (i === items.length - 1 ? ' disabled' : '') + '>' + icon('down') + '</button></div>' +
          thumb(v) +
          '<div class="media-row__info"><div class="media-row__title">' + esc(v.title) + '</div><div class="media-row__meta">' + esc(meta) + '</div></div>' +
          '<div class="media-row__actions">' + switchHtml('published-' + v.id, v.isPublished, v.isPublished ? 'Shown' : 'Hidden') +
            '<button class="btn btn--ghost btn--icon" type="button" data-edit aria-label="Edit ' + esc(v.title) + '">' + icon('edit') + '</button>' +
            '<button class="btn btn--ghost btn--icon" type="button" data-del aria-label="Delete ' + esc(v.title) + '">' + icon('trash') + '</button></div></div>';
      }).join('') + '</div>';
    }
    function load() {
      api('GET', '/api/admin/videos?kind=' + kind).then(function (d) { items = d.items; draw(); })
        .catch(function (err) { errorState(list, err, load); });
    }

    main.addEventListener('click', function (e) {
      if (e.target.closest('[data-add]')) return videoForm(kind, null, load);
      var row = e.target.closest('.media-row');
      if (!row) return;
      var id = Number(row.dataset.id);
      var v = items.filter(function (x) { return x.id === id; })[0];
      var move = e.target.closest('[data-move]');
      if (move) {
        var i = items.indexOf(v), j = i + Number(move.dataset.move);
        if (j < 0 || j >= items.length) return;
        items.splice(j, 0, items.splice(i, 1)[0]);
        draw();
        api('POST', '/api/admin/videos/reorder', { kind: kind, ids: items.map(function (x) { return x.id; }) })
          .then(function () { toast('Order saved.'); })
          .catch(function (err) { toast(err.message, 'error'); load(); });
      } else if (e.target.closest('[data-edit]')) {
        videoForm(kind, v, load);
      } else if (e.target.closest('[data-del]')) {
        confirmDialog({ title: 'Delete this ' + (isReel ? 'reel' : 'video') + '?', message: '<strong>' + esc(v.title) + '</strong> will be removed from the homepage and this list. The video stays on YouTube.', confirmLabel: 'Delete', danger: true })
          .then(function (ok) {
            if (!ok) return;
            api('DELETE', '/api/admin/videos/' + id, {}).then(function () { toast('Deleted.'); load(); }).catch(function (err) { toast(err.message, 'error'); });
          });
      }
    });
    main.addEventListener('change', function (e) {
      var sw = e.target.closest('input[name^="published-"]');
      if (!sw) return;
      var id = Number(sw.name.split('-')[1]);
      sw.disabled = true;
      api('PATCH', '/api/admin/videos/' + id, { isPublished: sw.checked }).then(function (d) {
        items = items.map(function (x) { return x.id === id ? d.item : x; });
        draw();
        toast(d.item.isPublished ? 'Now shown on the homepage.' : 'Hidden from the homepage.');
      }).catch(function (err) { toast(err.message, 'error'); load(); });
    });
    load();
  }

  function videoForm(kind, v, onSaved) {
    var isReel = kind === 'reel', editing = !!v;
    v = v || { youtubeId: '', title: '', series: '', pagePath: '', durationSeconds: null, uploadedOn: '', isPublished: true };
    var m = modal({
      title: (editing ? 'Edit ' : 'Add ') + (isReel ? 'reel' : 'video'),
      subtitle: 'Paste a YouTube link. The title is filled in for you.',
      wide: true,
      body: '<form novalidate><div class="alert alert--error" role="alert" hidden></div>' +
        '<div class="field"><label for="f-youtube">YouTube link or video ID</label><div class="input-row">' +
          input('youtube', v.youtubeId ? 'https://www.youtube.com/watch?v=' + v.youtubeId : '', 'placeholder="https://www.youtube.com/watch?v=…" autocomplete="off" required') +
          '<button class="btn btn--outline" type="button" data-lookup>Look up</button></div><span class="field__error"></span></div>' +
        '<div class="yt-preview" hidden><div class="yt-preview__thumb"></div><div class="yt-preview__text"></div></div>' +
        '<div class="form-grid">' +
          '<div class="span-2">' + field('title', 'Title', input('title', v.title, 'maxlength="150" required')) + '</div>' +
          field('series', 'Series or speaker', input('series', v.series, 'maxlength="100" placeholder="e.g. Darse Quran · 1441H"'), 'Shown above the title.') +
          field('pagePath', 'Lesson page on this site', input('pagePath', v.pagePath, 'maxlength="300" placeholder="/darse-quran-5th-ramadhan-1441h/"'), 'Optional. Opened by “Related lesson”.') +
          (isReel ? '' :
            field('duration', 'Length', input('duration', duration(v.durationSeconds), 'placeholder="25:37" inputmode="numeric"'), 'Shown on the thumbnail (mm:ss).') +
            field('uploadedOn', 'Upload date', input('uploadedOn', v.uploadedOn || '', 'type="date"'), 'Used for “6 Years Ago”.')) +
        '</div>' +
        '<div class="field">' + switchHtml('isPublished', v.isPublished, 'Show on the homepage') + '</div>' +
        '<div class="form-actions"><button class="btn btn--outline" type="button" data-close>Cancel</button>' +
        '<button class="btn btn--primary" type="submit">' + (editing ? 'Save changes' : 'Add to homepage') + '</button></div></form>'
    });
    var form = $('form', m.el), preview = $('.yt-preview', m.el);

    function showPreview(id, title, author) {
      preview.hidden = false;
      $('.yt-preview__thumb', preview).innerHTML = '<img src="https://i.ytimg.com/vi/' + esc(id) + '/hqdefault.jpg" alt="">';
      $('.yt-preview__text', preview).innerHTML = '<strong>' + esc(title || 'YouTube video ' + id) + '</strong>' + (author ? esc(author) + '<br>' : '') +
        '<button class="btn btn--outline btn--sm" type="button" data-play>' + icon('play') + 'Play preview</button>';
      $('[data-play]', preview).addEventListener('click', function () {
        $('.yt-preview__thumb', preview).innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + '?autoplay=1&rel=0" title="Preview" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
      });
    }
    function lookup() {
      clearErrors(form);
      var btn = $('[data-lookup]', form);
      if (!form.youtube.value.trim()) return showError(form, { field: 'youtube', message: 'Paste a YouTube link first.' });
      busy(btn, true, 'Looking up…');
      api('GET', '/api/admin/youtube?url=' + encodeURIComponent(form.youtube.value.trim())).then(function (d) {
        busy(btn, false);
        if (d.title && !form.title.value.trim()) form.title.value = d.title;
        showPreview(d.youtubeId, d.title, d.author);
        if (!d.title) toast('Couldn’t reach YouTube to get the title. You can type it in.', 'error');
      }).catch(function (err) { busy(btn, false); showError(form, err); });
    }
    $('[data-lookup]', form).addEventListener('click', lookup);
    form.youtube.addEventListener('paste', function () { setTimeout(lookup, 0); });
    if (editing) showPreview(v.youtubeId, v.title);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      var body = {
        youtube: form.youtube.value.trim(), title: form.title.value.trim(), series: form.series.value.trim(),
        pagePath: form.pagePath.value.trim(), isPublished: form.isPublished.checked
      };
      if (!body.youtube) return showError(form, { field: 'youtube', message: 'YouTube link is required.' });
      if (!body.title) return showError(form, { field: 'title', message: 'Title is required.' });
      if (!isReel) {
        var secs = parseDuration(form.duration.value);
        if (Number.isNaN(secs)) return showError(form, { field: 'duration', message: 'Write the length like 25:37 or 1:02:10.' });
        body.durationSeconds = secs;
        body.uploadedOn = form.uploadedOn.value || null;
      }
      if (!editing) body.kind = kind;
      var btn = $('button[type=submit]', form);
      busy(btn, true);
      api(editing ? 'PATCH' : 'POST', editing ? '/api/admin/videos/' + v.id : '/api/admin/videos', body).then(function () {
        m.close();
        toast(editing ? 'Changes saved.' : 'Added to the homepage.');
        onSaved();
      }).catch(function (err) {
        busy(btn, false);
        if (err.field === 'durationSeconds') err.field = 'duration';
        showError(form, err);
      });
    });
  }

  // ---------------------------------------------------------------- magazines
  function magazinesView(main) {
    api('GET', '/api/admin/magazines').then(function (d) {
      main.innerHTML =
        '<div class="page-head"><div><h1>Magazines</h1><p>The current issues shown in the homepage “Monthly Magazines” section.</p></div>' +
          '<div class="page-head__actions"><a class="btn btn--outline" href="/#mag-title" target="_blank" rel="noopener">' + icon('external') + 'View on homepage</a></div></div>' +
        '<div class="alert alert--info">' + icon('alert') + '<span>For a new issue, first upload its PDF and cover image in WordPress (Media → Add New), then paste their links here and save.</span></div>' +
        '<div class="mag-admin">' + d.items.map(function (x) {
          return '<form class="card" data-id="' + x.id + '" novalidate><div class="card__body">' +
            '<div class="alert alert--error" role="alert" hidden></div>' +
            '<div class="mag-admin__cover"><img src="' + esc(x.coverUrl) + '" alt="Cover of ' + esc(x.name) + '" data-cover>' +
              '<div><h3>' + esc(x.name) + '</h3><p>' + esc(x.language) + ' · ' + esc(x.nativeName) + '</p><p>Updated ' + esc(timeAgo(x.updatedAt)) + '</p>' +
              '<p><a href="' + esc(x.pdfUrl) + '" target="_blank" rel="noopener">Open current PDF ↗</a></p></div></div>' +
            '<div class="form-grid">' +
              field('issueLabel', 'Issue', input('issueLabel', x.issueLabel, 'maxlength="40" required placeholder="November 2026"')) +
              field('sinceYear', 'Published since', input('sinceYear', x.sinceYear, 'maxlength="4" inputmode="numeric"')) +
              '<div class="span-2">' + field('coverUrl', 'Cover image link', input('coverUrl', x.coverUrl, 'type="url" required')) + '</div>' +
              '<div class="span-2">' + field('pdfUrl', 'PDF link', input('pdfUrl', x.pdfUrl, 'type="url" required')) + '</div>' +
              field('name', 'Name', input('name', x.name, 'maxlength="80" required')) +
              field('nativeName', 'Name in ' + x.language + ' script', input('nativeName', x.nativeName, 'maxlength="80" dir="' + esc(x.textDir) + '"')) +
              '<div class="span-2">' + field('archivePath', 'Archive page', input('archivePath', x.archivePath, 'maxlength="300"'), '“Browse issues since …” opens this page.') + '</div>' +
            '</div>' +
            '<div class="field">' + switchHtml('isPublished', x.isPublished, 'Show on the homepage') + '</div>' +
            '<div class="form-actions"><button class="btn btn--primary" type="submit">Save ' + esc(x.name) + '</button></div>' +
          '</div></form>';
        }).join('') + '</div>';

      $$('form[data-id]', main).forEach(function (form) {
        var cover = $('[data-cover]', form);
        form.coverUrl.addEventListener('change', function () { if (/^https?:\/\//.test(form.coverUrl.value)) cover.src = form.coverUrl.value; });
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          clearErrors(form);
          var btn = $('button[type=submit]', form);
          busy(btn, true);
          api('PATCH', '/api/admin/magazines/' + form.dataset.id, {
            issueLabel: form.issueLabel.value, sinceYear: form.sinceYear.value, coverUrl: form.coverUrl.value, pdfUrl: form.pdfUrl.value,
            name: form.name.value, nativeName: form.nativeName.value, archivePath: form.archivePath.value, isPublished: form.isPublished.checked
          }).then(function (r) {
            busy(btn, false);
            toast(r.item.name + ' saved. The homepage now shows the ' + r.item.issueLabel + ' issue.');
          }).catch(function (err) { busy(btn, false); showError(form, err); });
        });
      });
    }).catch(function (err) { errorState(main, err, function () { main.innerHTML = loading(); magazinesView(main); }); });
  }

  // ---------------------------------------------------------------- users
  function usersView(main) {
    var q = { q: '', role: '', status: '', sort: 'newest', page: 1 };
    main.innerHTML =
      '<div class="page-head"><div><h1>Users</h1><p>Everyone who can sign in. Roles decide what they can do.</p></div>' +
        '<div class="page-head__actions"><button class="btn btn--primary" type="button" data-add>' + icon('plus') + 'Add account</button></div></div>' +
      '<div class="toolbar">' +
        '<label class="search">' + icon('search') + '<span class="sr-only">Search users</span><input class="input" type="search" name="q" placeholder="Search by name, email or ID"></label>' +
        '<select name="role" aria-label="Role"><option value="">All roles</option><option value="admin">Administrators</option><option value="editor">Editors</option><option value="user">Users</option></select>' +
        '<select name="status" aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="disabled">Disabled</option></select>' +
        '<select name="sort" aria-label="Sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="lastLogin">Last sign-in</option></select>' +
      '</div>' +
      '<section class="card" data-list>' + loading() + '</section>';
    var list = $('[data-list]', main);

    function load() {
      var p = new URLSearchParams({ page: q.page, pageSize: 20, sort: q.sort });
      ['q', 'role', 'status'].forEach(function (k) { if (q[k]) p.set(k, q[k]); });
      api('GET', '/api/admin/users?' + p).then(function (d) {
        if (!d.items.length) { list.innerHTML = emptyState('users', 'No matching accounts', 'Try a different search or filter.'); return; }
        list.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th>Account</th><th>Role</th><th>Status</th><th class="hide-sm">Last sign-in</th><th class="hide-sm">Created</th></tr></thead><tbody>' +
          d.items.map(function (u) {
            return '<tr class="is-link" data-href="/admin/users/' + u.id + '"><td><div class="cell-user"><span class="avatar">' + esc(initials(u.name)) + '</span><div>' +
              '<a href="/admin/users/' + u.id + '" data-link><strong>' + esc(u.name) + (u.id === state.user.id ? ' <span class="badge badge--grey">You</span>' : '') + '</strong></a><span>' + esc(u.email) + '</span></div></div></td>' +
              '<td>' + roleBadge(u.role) + '</td><td>' + statusBadge(u.status) + '</td>' +
              '<td class="hide-sm nowrap muted">' + (u.lastLoginAt ? when(u.lastLoginAt) : 'Never') + '</td><td class="hide-sm nowrap muted">' + esc(fmtDate(u.createdAt)) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        list.appendChild(pager(d, function (pg) { q.page = pg; load(); }));
      }).catch(function (err) { errorState(list, err, load); });
    }
    $('.toolbar input', main).addEventListener('input', debounce(function (e) { q.q = e.target.value.trim(); q.page = 1; load(); }, 300));
    $$('.toolbar select', main).forEach(function (s) { s.addEventListener('change', function () { q[s.name] = s.value; q.page = 1; load(); }); });
    list.addEventListener('click', function (e) { var r = e.target.closest('tr[data-href]'); if (r && !e.target.closest('a')) go(r.dataset.href); });
    $('[data-add]', main).addEventListener('click', function () { addUserForm(load); });
    load();
  }

  function roleSelect(value, disabled) {
    return '<select id="f-role" name="role"' + (disabled ? ' disabled' : '') + '>' + ['user', 'editor', 'admin'].map(function (r) {
      return '<option value="' + r + '"' + (r === value ? ' selected' : '') + '>' + ROLE_LABEL[r] + ' — ' + ROLE_HELP[r] + '</option>';
    }).join('') + '</select>';
  }

  function addUserForm(onSaved) {
    var m = modal({
      title: 'Add account', subtitle: 'They’ll choose their own password the first time they sign in.',
      body: '<form novalidate><div class="alert alert--error" role="alert" hidden></div>' +
        field('name', 'Full name', input('name', '', 'maxlength="100" required autocomplete="off"')) +
        field('email', 'Email', input('email', '', 'type="email" maxlength="254" required autocomplete="off"')) +
        field('role', 'Role', roleSelect('editor')) +
        '<div class="field"><label for="f-password">Temporary password</label><div class="input-row">' + input('password', randomPassword(), 'required autocomplete="off" spellcheck="false"') +
          '<button class="btn btn--outline" type="button" data-gen>New</button></div>' + pwRules() +
          '<small>Give it to them privately (in person or by phone), not in the same email as the sign-in link.</small><span class="field__error"></span></div>' +
        '<div class="form-actions"><button class="btn btn--outline" type="button" data-close>Cancel</button><button class="btn btn--primary" type="submit">Create account</button></div></form>'
    });
    var form = $('form', m.el);
    bindPwRules(form.password, $('.pw-rules', form));
    form.password.dispatchEvent(new Event('input'));
    $('[data-gen]', form).addEventListener('click', function () { form.password.value = randomPassword(); form.password.dispatchEvent(new Event('input')); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearErrors(form);
      if (!form.name.value.trim()) return showError(form, { field: 'name', message: 'Name is required.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.value.trim())) return showError(form, { field: 'email', message: 'Enter a valid email address.' });
      var btn = $('button[type=submit]', form);
      busy(btn, true, 'Creating…');
      api('POST', '/api/admin/users', { name: form.name.value, email: form.email.value, role: form.role.value, password: form.password.value })
        .then(function (d) { m.close(); toast('Account created for ' + d.user.email + '.'); onSaved(); })
        .catch(function (err) { busy(btn, false); showError(form, err); });
    });
  }

  function userView(main, params) {
    api('GET', '/api/admin/users/' + encodeURIComponent(params.id)).then(function (d) {
      var u = d.user, self = d.isSelf;
      main.innerHTML =
        '<a class="back-link" href="/admin/users" data-link>' + icon('left') + 'All users</a>' +
        '<div class="page-head"><div class="profile"><span class="avatar avatar--lg">' + esc(initials(u.name)) + '</span><div>' +
          '<h2>' + esc(u.name) + (self ? ' <span class="badge badge--grey">You</span>' : '') + '</h2><p>' + esc(u.email) + '</p>' + roleBadge(u.role) + ' ' + statusBadge(u.status) + '</div></div></div>' +
        (self ? '<div class="alert alert--info">' + icon('alert') + '<span>This is your own account. Another administrator has to change your role or status. Change your password under <a href="/admin/settings?tab=account" data-link>Settings → My account</a>.</span></div>' : '') +
        '<div class="detail-grid">' +
          '<section class="card"><div class="card__head"><h2>Details</h2></div><div class="card__body"><dl class="kv">' +
            '<dt>ID</dt><dd>' + u.id + '</dd><dt>Created</dt><dd>' + esc(fmtDate(u.createdAt, true)) + '</dd>' +
            '<dt>Last sign-in</dt><dd>' + (u.lastLoginAt ? esc(fmtDate(u.lastLoginAt, true)) : 'Never') + '</dd>' +
            '<dt>Signed in now</dt><dd>' + d.activeSessions + ' session' + (d.activeSessions === 1 ? '' : 's') + '</dd>' +
            '<dt>Password</dt><dd>' + (u.mustChangePassword ? 'Temporary (must change at next sign-in)' : 'Set by the user') + '</dd></dl></div></section>' +
          '<form class="card" data-edit novalidate><div class="card__head"><h2>Profile &amp; role</h2></div><div class="card__body">' +
            '<div class="alert alert--error" role="alert" hidden></div>' +
            field('name', 'Full name', input('name', u.name, 'maxlength="100" required')) +
            field('role', 'Role', roleSelect(u.role, self), self ? 'You can’t change your own role.' : '') +
            '<div class="form-actions"><button class="btn btn--primary" type="submit">Save</button></div></div></form>' +
          '<section class="card"><div class="card__head"><h2>Access</h2></div><div class="card__body">' +
            '<div class="setting-row"><div><strong>Account enabled</strong><span>Disabled accounts can’t sign in and are signed out straight away.</span></div>' +
              switchHtml('status', u.status === 'active', '', self) + '</div>' +
            '<div class="setting-row"><div><strong>Reset password</strong><span>Set a temporary password. They’ll be signed out and must choose a new one.</span></div>' +
              '<button class="btn btn--outline btn--sm" type="button" data-reset' + (self ? ' disabled' : '') + '>' + icon('key') + 'Reset</button></div>' +
          '</div></section>' +
          '<section class="card"><div class="card__head"><h2>Activity</h2></div>' + feed(d.activity) + '</section>' +
        '</div>' +
        (self ? '' : '<section class="card danger-zone"><div class="card__head"><h2>Delete account</h2></div><div class="card__body">' +
          '<div class="setting-row"><div><strong>Permanently delete ' + esc(u.name) + '’s account</strong><span>This can’t be undone. Their past actions stay in the activity log. Disabling is usually the better choice.</span></div>' +
          '<button class="btn btn--danger-outline" type="button" data-delete>' + icon('trash') + 'Delete account</button></div></div></section>');

      var reload = function () { userView(main, params); };
      var form = $('[data-edit]', main);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearErrors(form);
        var body = { name: form.name.value };
        if (!self) body.role = form.role.value;
        var doSave = function () {
          var btn = $('button[type=submit]', form);
          busy(btn, true);
          api('PATCH', '/api/admin/users/' + u.id, body).then(function (r) {
            toast(r.changed.length ? 'Saved.' : 'Nothing changed.');
            if (self) { state.user.name = r.user.name; }
            reload();
          }).catch(function (err) { busy(btn, false); showError(form, err); });
        };
        if (body.role && body.role !== u.role) {
          confirmDialog({ title: 'Change role to ' + ROLE_LABEL[body.role] + '?', message: esc(ROLE_HELP[body.role]) + ' ' + esc(u.name) + ' will be signed out and gets the new access at their next sign-in.', confirmLabel: 'Change role' })
            .then(function (ok) { if (ok) doSave(); });
        } else doSave();
      });

      var sw = $('input[name=status]', main);
      sw.addEventListener('change', function () {
        var enable = sw.checked;
        var apply = function () {
          sw.disabled = true;
          api('PATCH', '/api/admin/users/' + u.id, { status: enable ? 'active' : 'disabled' })
            .then(function () { toast(enable ? 'Account enabled.' : 'Account disabled and signed out.'); reload(); })
            .catch(function (err) { toast(err.message, 'error'); reload(); });
        };
        if (enable) return apply();
        confirmDialog({ title: 'Disable this account?', message: '<strong>' + esc(u.name) + '</strong> will be signed out now and won’t be able to sign in until it’s enabled again.', confirmLabel: 'Disable account', danger: true })
          .then(function (ok) { if (ok) apply(); else sw.checked = true; });
      });

      var resetBtn = $('[data-reset]', main);
      if (resetBtn) resetBtn.addEventListener('click', function () {
        var m = modal({
          title: 'Reset password', subtitle: 'For ' + u.email,
          body: '<form novalidate><div class="alert alert--error" role="alert" hidden></div>' +
            '<div class="field"><label for="f-password">Temporary password</label><div class="input-row">' + input('password', randomPassword(), 'required autocomplete="off" spellcheck="false"') +
            '<button class="btn btn--outline" type="button" data-gen>New</button></div>' + pwRules() + '<small>Share it with them privately. They must change it when they sign in.</small><span class="field__error"></span></div>' +
            '<div class="form-actions"><button class="btn btn--outline" type="button" data-close>Cancel</button><button class="btn btn--primary" type="submit">Reset password</button></div></form>'
        });
        var f = $('form', m.el);
        bindPwRules(f.password, $('.pw-rules', f));
        f.password.dispatchEvent(new Event('input'));
        $('[data-gen]', f).addEventListener('click', function () { f.password.value = randomPassword(); f.password.dispatchEvent(new Event('input')); });
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          clearErrors(f);
          var btn = $('button[type=submit]', f);
          busy(btn, true);
          api('POST', '/api/admin/users/' + u.id + '/password', { password: f.password.value })
            .then(function () { m.close(); toast('Password reset. ' + u.name + ' has been signed out.'); reload(); })
            .catch(function (err) { busy(btn, false); showError(f, err); });
        });
      });

      var delBtn = $('[data-delete]', main);
      if (delBtn) delBtn.addEventListener('click', function () {
        confirmDialog({ title: 'Delete ' + u.name + '’s account?', message: 'This permanently removes the account. It can’t be undone.', confirmLabel: 'Delete account', danger: true, requireText: u.email })
          .then(function (typed) {
            if (!typed) return;
            api('DELETE', '/api/admin/users/' + u.id, { confirmEmail: typed }).then(function () { toast('Account deleted.'); go('/admin/users'); })
              .catch(function (err) { toast(err.message, 'error'); });
          });
      });
    }).catch(function (err) {
      if (err.status === 404) { main.innerHTML = '<div class="card">' + emptyState('users', 'Account not found', 'It may have been deleted.', '<a class="btn btn--primary" href="/admin/users" data-link>All users</a>') + '</div>'; return; }
      errorState(main, err, function () { userView(main, params); });
    });
  }

  // ---------------------------------------------------------------- activity log
  function activityView(main) {
    var q = { action: '', page: 1 };
    main.innerHTML =
      '<div class="page-head"><div><h1>Activity log</h1><p>Sign-ins and every change made in the admin panel. Passwords are never recorded.</p></div></div>' +
      '<div class="toolbar"><select name="action" aria-label="Filter by type"><option value="">Everything</option><option value="auth.">Sign-ins</option>' +
        '<option value="user.">Accounts</option><option value="question.">Questions</option><option value="video.">Videos &amp; reels</option>' +
        '<option value="magazine.">Magazines</option><option value="settings.">Settings</option></select></div>' +
      '<section class="card" data-list>' + loading() + '</section>';
    var list = $('[data-list]', main);
    function load() {
      var p = new URLSearchParams({ page: q.page, pageSize: 30 });
      if (q.action) p.set('action', q.action);
      api('GET', '/api/admin/audit?' + p).then(function (d) {
        if (!d.items.length) { list.innerHTML = emptyState('log', 'No activity', 'Nothing has been recorded for this filter yet.'); return; }
        list.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>What happened</th><th class="hide-sm">IP address</th></tr></thead><tbody>' +
          d.items.map(function (a) {
            return '<tr><td class="nowrap muted" title="' + esc(fmtDate(a.createdAt, true)) + '">' + esc(fmtDate(a.createdAt, true)) + '</td><td>' + describe(a) + '</td><td class="hide-sm muted">' + esc(a.ip || '—') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        list.appendChild(pager(d, function (pg) { q.page = pg; load(); }));
      }).catch(function (err) { errorState(list, err, load); });
    }
    $('select', main).addEventListener('change', function (e) { q.action = e.target.value; q.page = 1; load(); });
    load();
  }

  // ---------------------------------------------------------------- settings
  function settingsView(main) {
    var tab = new URLSearchParams(location.search).get('tab') || (can('settings.manage') ? 'website' : 'account');
    if (!can('settings.manage')) tab = 'account';
    main.innerHTML =
      '<div class="page-head"><div><h1>Settings</h1></div></div>' +
      (can('settings.manage') ? '<div class="toolbar"><div class="tabs" role="group" aria-label="Settings sections">' +
        '<button type="button" data-tab="website" aria-pressed="' + (tab === 'website') + '">Website</button>' +
        '<button type="button" data-tab="account" aria-pressed="' + (tab === 'account') + '">My account</button></div></div>' : '') +
      '<div data-panel>' + loading() + '</div>';
    var panel = $('[data-panel]', main);
    $$('[data-tab]', main).forEach(function (b) {
      b.addEventListener('click', function () { history.replaceState(null, '', '/admin/settings?tab=' + b.dataset.tab); settingsView(main); });
    });

    if (tab === 'account') {
      panel.innerHTML =
        '<div class="detail-grid">' +
          '<section class="card"><div class="card__head"><h2>My account</h2></div><div class="card__body"><dl class="kv">' +
            '<dt>Name</dt><dd>' + esc(state.user.name) + '</dd><dt>Email</dt><dd>' + esc(state.user.email) + '</dd>' +
            '<dt>Role</dt><dd>' + roleBadge(state.user.role) + '</dd><dt>Can</dt><dd>' + esc(ROLE_HELP[state.user.role]) + '</dd></dl>' +
            '<p class="muted">To change your name, email or role, ask another administrator.</p></div></section>' +
          '<form class="card" novalidate><div class="card__head"><h2>Change password</h2></div><div class="card__body">' +
            '<div class="alert alert--error" role="alert" hidden></div>' + passwordFields() +
            '<p class="muted">Changing it signs you out on all other devices.</p>' +
            '<div class="form-actions"><button class="btn btn--primary" type="submit">Change password</button></div></div></form>' +
        '</div>';
      bindPasswordForm($('form', panel), function () { toast('Password changed. Other devices have been signed out.'); });
      return;
    }

    api('GET', '/api/admin/settings').then(function (d) {
      var s = d.settings;
      panel.innerHTML =
        '<form class="card" novalidate><div class="card__head"><h2>Website</h2><a href="/" target="_blank" rel="noopener">View website ↗</a></div><div class="card__body">' +
          '<div class="alert alert--error" role="alert" hidden></div>' +
          '<p class="muted">These details appear in the website footer and contact sections.</p>' +
          '<div class="form-grid">' +
            field('contact_email', 'Contact email', input('contact_email', s.contact_email, 'type="email" required')) +
            field('contact_phone', 'Contact phone', input('contact_phone', s.contact_phone, 'type="tel" maxlength="40"')) +
            '<div class="span-2">' + field('contact_address', 'Address', '<textarea id="f-contact_address" name="contact_address" maxlength="300" required>' + esc(s.contact_address) + '</textarea>') + '</div>' +
            '<div class="span-2">' + field('youtube_url', 'YouTube channel', input('youtube_url', s.youtube_url, 'type="url" required')) + '</div>' +
          '</div>' +
          '<div class="setting-row"><div><strong>Accept new questions</strong><span>When off, the Ask us form tells visitors questions are closed for now.</span></div>' +
            switchHtml('questions_open', s.questions_open === 'true', '') + '</div>' +
          '<div class="setting-row"><div><strong>Allow visitors to create accounts</strong><span>When off, the Sign up form on the website is closed. Existing accounts can still sign in.</span></div>' +
            switchHtml('registration_open', s.registration_open === 'true', '') + '</div>' +
          '<div class="form-actions"><button class="btn btn--primary" type="submit">Save settings</button></div></div></form>';
      var form = $('form', panel);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        clearErrors(form);
        var btn = $('button[type=submit]', form);
        busy(btn, true);
        api('PUT', '/api/admin/settings', {
          contact_email: form.contact_email.value, contact_phone: form.contact_phone.value, contact_address: form.contact_address.value,
          youtube_url: form.youtube_url.value, questions_open: form.questions_open.checked,
          registration_open: form.registration_open.checked
        }).then(function (r) {
          busy(btn, false);
          toast(r.changed.length ? 'Settings saved. The website shows them within a minute.' : 'Nothing changed.');
        }).catch(function (err) { busy(btn, false); showError(form, err); });
      });
    }).catch(function (err) { errorState(panel, err, function () { settingsView(main); }); });
  }

  // ---------------------------------------------------------------- show / hide passwords
  // Every password box gets a Show / Hide button, wherever it appears.
  function addPasswordToggle(inputEl) {
    if (inputEl.dataset.toggle) return;
    inputEl.dataset.toggle = '1';
    var wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.setAttribute('aria-controls', inputEl.id || '');
    function sync() {
      var shown = inputEl.type === 'text';
      btn.innerHTML = icon(shown ? 'eyeOff' : 'eye') + (shown ? 'Hide' : 'Show');
      btn.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(shown));
      inputEl.classList.toggle('is-shown', shown);
    }
    btn.addEventListener('click', function () {
      inputEl.type = inputEl.type === 'password' ? 'text' : 'password';
      sync();
      inputEl.focus();
    });
    // never leave a password visible after the form is sent
    var form = inputEl.form;
    if (form) form.addEventListener('submit', function () { inputEl.type = 'password'; sync(); });
    wrap.appendChild(btn);
    sync();
  }
  function enhancePasswords(root) {
    $$('input[type="password"]', root).forEach(addPasswordToggle);
  }
  new MutationObserver(function () { enhancePasswords(document); }).observe(document.body, { childList: true, subtree: true });

  render();
})();
