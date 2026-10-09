// app.js - browser side of CUI Connect.
// The browser only DISPLAYS things. Every rule is checked again on the
// server, so hiding a button here is a convenience, not security.
// All user text is inserted with textContent (see h()), never innerHTML.

// ================================================================ helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// h('div', { class: 'x', onclick: fn, text: 'hi' }, child, 'text', ...)
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// small icon set (paths drawn on a 24px grid). These strings are constants.
const ICONS = {
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  pin: '<line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
};
function icon(name) {
  const span = document.createElement('span');
  span.innerHTML = `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span.firstChild;
}
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.firstChild) el.appendChild(icon(el.dataset.icon));
  });
}

const ROLE_LABEL = { superadmin: 'Super Admin', admin: 'Admin', hod: 'HOD', faculty: 'Teacher', staff: 'Staff', student: 'Student', system: 'System' };
const roleLabel = (r) => ROLE_LABEL[r] || r;
const isAdminRole = (r) => r === 'admin' || r === 'superadmin';

const CATS = {
  opportunity: 'Opportunity', academic: 'Academic', exam: 'Exams', policy: 'Policy', event: 'Event', general: 'General',
};
const PRIORITY = { normal: 'Normal', important: 'Important', urgent: 'Urgent' };
const REQ_TYPES = {
  add_drop: 'Add / drop', clash: 'Timetable clash', section: 'Section change', grade: 'Result / grade',
  enrolment: 'Missing from class channel', teacher: 'Teacher or class issue', other: 'Something else',
};
const REQ_STATUS = { open: 'Open', in_review: 'In review', resolved: 'Resolved', rejected: 'Declined' };

// colour + initials for avatars
const AV_COLORS = ['#1d5fc2', '#13824f', '#5b3fc4', '#b5317a', '#c2412d', '#0e7c86', '#8a5d0c', '#3d5a80'];
function avatar(name = '?', size = '', onlineState) {
  const parts = String(name).replace(/^(Dr|Ms|Mr|Mrs|Prof)\.?\s+/i, '').split(/\s+/).filter(Boolean);
  const initials = ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  let hash = 0;
  for (const c of String(name)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const el = h('span', { class: 'avatar ' + size, style: `background:${AV_COLORS[hash % AV_COLORS.length]}`, 'aria-hidden': 'true' }, initials);
  if (onlineState !== undefined) el.appendChild(h('i', { class: 'presence' + (onlineState ? ' on' : '') }));
  return el;
}

// time formatting
const DAY = 86400000;
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function fmtTime(t) { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function fmtRel(t) {
  const diff = Date.now() - t;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
  if (startOfDay(t) === startOfDay(Date.now())) return Math.floor(diff / 3600000) + 'h ago';
  if (startOfDay(t) === startOfDay(Date.now() - DAY)) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function fmtDay(t) {
  if (startOfDay(t) === startOfDay(Date.now())) return 'Today';
  if (startOfDay(t) === startOfDay(Date.now() - DAY)) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}
// deadline 'YYYY-MM-DD' -> days left (0 = today, negative = closed)
function daysLeft(deadline) {
  const [y, m, d] = deadline.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - startOfDay(Date.now())) / DAY);
}
function dueText(deadline) {
  const n = daysLeft(deadline);
  if (n < 0) return 'Closed';
  if (n === 0) return 'Closes today';
  if (n === 1) return 'Closes tomorrow';
  return `Closes in ${n} days`;
}
function fmtDeadline(deadline) {
  const [y, m, d] = deadline.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'long' });
}

// per-viewer conveniences in localStorage (never needed for correctness)
function lsGet(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ } }
function ssGet(key) { try { return sessionStorage.getItem(key); } catch (e) { return null; } }
function ssSet(key, val) { try { if (val === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, val); } catch (e) { /* ignore */ } }

// ================================================================ state
let socket = null;
let me = null;
let groups = [];
let contacts = [];
let online = new Set();
let board = [];
let requests = [];
let meta = { departments: [], courses: [] };
let view = 'board';
let current = null;          // open chat: { room, kind: 'group'|'dm', id, title }
const cache = {};            // room -> messages
const unread = {};           // room -> count
let typingTimer = null;
let detail = null;           // what the right pane shows: { kind: 'ann'|'channel', id }
const boardFilter = { tab: 'all', cat: null };
let reqTab = 'active';
let selectedReq = null;
let consoleTab = null;
const collapsed = { channels: false, dms: false };

const tok = () => 'Bearer ' + ssGet('token');
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: tok() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty */ }
  return { ok: res.ok, status: res.status, data };
}

// ================================================================ toasts
function toast(text, kind = '') {
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, text);
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function noticeToast(a) {
  const t = h('div', { class: 'toast notice', dataset: { cat: a.category }, onclick: () => { setView('board'); openAnnouncement(a.id); t.remove(); } },
    h('div', {}, h('small', {}, `New ${CATS[a.category].toLowerCase()} notice`), h('b', {}, a.title)));
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

// ================================================================ login
const DEMO = [
  ['fa23-bcs-002', 'Hina Fatima', 'Student, CS'],
  ['fa23-bcs-001', 'Ahmed Raza', 'Student, class rep'],
  ['ali.khan', 'Dr. Ali Khan', 'Teacher, CS'],
  ['hod.cs', 'Dr. Saima Tariq', 'HOD, CS'],
  ['admin', 'Admin Office', 'Admin'],
  ['superadmin', 'Super Admin', 'Super admin'],
  ['examcell', 'Exam Cell', 'Staff office'],
  ['fa23-bee-010', 'Bilal Hussain', 'Student, EE'],
];
DEMO.forEach(([username, name, role]) => {
  $('#demoList').appendChild(h('button', {
    type: 'button',
    onclick: () => { $('#username').value = username; $('#password').value = 'cui123'; $('#loginForm').requestSubmit(); },
  }, avatar(name, 'sm'), h('span', { class: 'who' }, h('b', {}, name), h('span', {}, `${role} · ${username}`))));
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: $('#username').value.trim(), password: $('#password').value }),
  });
  const data = await res.json();
  if (!res.ok) { $('#loginError').textContent = data.error; return; }
  ssSet('token', data.token);
  start(data.token);
});

$('#logoutBtn').addEventListener('click', () => { ssSet('token', null); location.reload(); });

// ================================================================ socket
function start(token) {
  socket = io({ auth: { token } });

  socket.on('connect_error', (err) => {
    ssSet('token', null);
    $('#appView').classList.add('hidden');
    $('#loginView').classList.remove('hidden');
    $('#loginError').textContent = err.message === 'Not authenticated' ? 'Your session ended. Sign in again.' : err.message;
  });

  socket.on('snapshot', (snap) => {
    const first = !me;
    me = snap.me;
    groups = snap.groups;
    contacts = snap.contacts;
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    if (current && current.kind === 'group' && !groups.find((g) => g.id === current.id)) current = null;
    if (current && current.kind === 'dm' && !contacts.find((c) => c.id === current.id)) current = null;
    renderMe();
    renderSidebar();
    if (view === 'chat') renderChat();
    if (view === 'console') renderConsole();
    if (detail && detail.kind === 'channel') renderDetail();
    if (first) {
      api('GET', '/api/meta').then((r) => { if (r.ok) meta = r.data; });
      setView(ssGet('view') || 'board');
    }
  });

  socket.on('board', (list) => {
    board = list;
    renderSidebar();
    if (view === 'board') renderBoard();
    if (detail && detail.kind === 'ann') {
      if (board.find((a) => a.id === detail.id)) renderDetail(); else closeDetail();
    }
  });

  socket.on('announcement:new', (a) => noticeToast(a));

  socket.on('requests', (list) => {
    requests = list;
    renderSidebar();
    if (view === 'requests') renderRequests();
  });

  socket.on('presence', (ids) => {
    online = new Set(ids);
    renderSidebar();
  });

  socket.on('message:new', (msg) => {
    if (cache[msg.room]) cache[msg.room].push(msg);
    if (view === 'chat' && current && current.room === msg.room) {
      renderMessages();
    } else if (msg.from.id !== me.id && msg.from.role !== 'system') {
      unread[msg.room] = (unread[msg.room] || 0) + 1;
      renderSidebar();
    }
  });

  socket.on('message:updated', (msg) => {
    const list = cache[msg.room];
    if (list) { const i = list.findIndex((m) => m.id === msg.id); if (i >= 0) list[i] = msg; }
    if (current && current.room === msg.room) { renderMessages(); renderPinned(); if (detail && detail.kind === 'channel') renderDetail(); }
  });

  socket.on('message:deleted', ({ room, id }) => {
    if (cache[room]) cache[room] = cache[room].filter((m) => m.id !== id);
    if (current && current.room === room) { renderMessages(); renderPinned(); }
  });

  socket.on('typing', ({ room, name }) => {
    if (!current || current.room !== room) return;
    $('#typing').textContent = `${name} is typing…`;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => ($('#typing').textContent = ''), 1600);
  });
}

// ================================================================ shell
const canManage = () => me && ['superadmin', 'admin', 'hod', 'faculty'].includes(me.role);
const canPublish = () => me && (isAdminRole(me.role) || me.role === 'hod' || me.role === 'staff');

function renderMe() {
  $('#meName').textContent = me.name;
  const bits = [roleLabel(me.role)];
  if (me.repOf.length) bits.push('CR of ' + me.repOf.join(', '));
  bits.push(me.department);
  $('#meInfo').textContent = bits.join(' · ');
  $('#meRole').textContent = me.semester ? `${me.department} · Semester ${me.semester}` : `${me.department} · ${roleLabel(me.role)}`;
  $('#meAvatar').replaceWith(Object.assign(avatar(me.name), { id: 'meAvatar' }));
  $('#topAvatar').replaceWith(Object.assign(avatar(me.name, 'sm'), { id: 'topAvatar', title: me.name }));
  $('#railConsole').classList.toggle('hidden', !canManage());
  $('#sideConsole').classList.toggle('hidden', !canManage());
}

function setView(v) {
  if (v === 'console' && !canManage()) v = 'board';
  view = v;
  ssSet('view', v);
  $$('.view').forEach((el) => el.classList.toggle('hidden', el.id !== 'view-' + v));
  $$('[data-view]').forEach((el) => el.classList.toggle('active', el.dataset.view === v && !(v === 'chat' && el.classList.contains('side-item'))));
  closeDetail();
  closeDrawer();
  if (v === 'board') renderBoard();
  if (v === 'chat') {
    if (!current && groups.length) openRoom(groupTarget(groups[0]));
    else renderChat();
  }
  if (v === 'requests') renderRequests();
  if (v === 'console') renderConsole();
  renderSidebar();
}
$$('[data-view]').forEach((el) => el.addEventListener('click', () => setView(el.dataset.view)));

function unseenRequests() {
  const seen = lsGet('seenReq:' + me.id, {});
  return requests.filter((r) => {
    const last = r.thread.length ? r.thread[r.thread.length - 1].from.name : r.requester.name;
    return last !== me.name && r.updatedAt > (seen[r.id] || 0);
  });
}
function markRequestSeen(r) {
  const seen = lsGet('seenReq:' + me.id, {});
  seen[r.id] = r.updatedAt;
  lsSet('seenReq:' + me.id, seen);
}

const groupTarget = (g) => ({ room: 'g:' + g.id, kind: 'group', id: g.id, title: g.name });
const dmRoom = (a, b) => 'dm:' + [a, b].sort().join('_');
const dmTarget = (c) => ({ room: dmRoom(me.id, c.id), kind: 'dm', id: c.id, title: c.name });
const groupIcon = (g) => (g.type === 'announcement' ? 'megaphone' : g.locked ? 'lock' : 'hash');

function renderSidebar() {
  if (!me) return;
  const unreadBoard = board.filter((a) => !a.read && !a.mine).length;
  const reqNew = unseenRequests().length;
  const chatUnread = Object.values(unread).reduce((n, x) => n + x, 0);

  const setCount = (el, n) => { el.textContent = n; el.classList.toggle('hidden', !n); };
  setCount($('#sideBoardCount'), unreadBoard);
  setCount($('#railBoardBadge'), unreadBoard);
  setCount($('#railChatBadge'), chatUnread);
  setCount($('#railReqBadge'), reqNew);
  setCount($('#sideReqCount'), reqNew);
  $('#sideReqCount').classList.toggle('muted-count', false);
  $$('.side-item[data-view="board"]').forEach((el) => el.classList.toggle('unread', unreadBoard > 0));

  const chList = $('#channelList');
  chList.replaceChildren();
  if (!collapsed.channels) {
    groups.forEach((g) => {
      const room = 'g:' + g.id;
      const active = view === 'chat' && current && current.room === room;
      chList.appendChild(h('button', {
        class: 'side-item' + (active ? ' active' : '') + (unread[room] ? ' unread' : '') + (!g.canPost && !unread[room] ? ' muted-row' : ''),
        title: g.name,
        onclick: () => { if (view !== 'chat') { current = groupTarget(g); setView('chat'); } openRoom(groupTarget(g)); },
      }, icon(groupIcon(g)), h('span', { class: 'label' }, g.name), unread[room] ? h('b', { class: 'count' }, unread[room]) : null));
    });
  }
  const dmList = $('#dmList');
  dmList.replaceChildren();
  if (!collapsed.dms) {
    contacts.forEach((c) => {
      const room = dmRoom(me.id, c.id);
      const active = view === 'chat' && current && current.room === room;
      dmList.appendChild(h('button', {
        class: 'side-item' + (active ? ' active' : '') + (unread[room] ? ' unread' : ''),
        title: `${c.name} · ${roleLabel(c.role)}`,
        onclick: () => { if (view !== 'chat') { current = dmTarget(c); setView('chat'); } openRoom(dmTarget(c)); },
      }, avatar(c.name, 'xs', online.has(c.id)), h('span', { class: 'label' }, c.name),
      h('span', { class: 'tagline' }, c.repOf && c.repOf.length ? 'CR' : roleLabel(c.role)),
      unread[room] ? h('b', { class: 'count' }, unread[room]) : null));
    });
  }
}
$$('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
  const k = btn.dataset.toggle;
  collapsed[k] = !collapsed[k];
  btn.classList.toggle('collapsed', collapsed[k]);
  renderSidebar();
}));

// mobile drawer
$('#menuBtn').appendChild(icon('menu'));
$('#menuBtn').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#scrim').classList.remove('hidden'); });
$('#scrim').addEventListener('click', closeDrawer);
function closeDrawer() { $('#sidebar').classList.remove('open'); $('#scrim').classList.add('hidden'); }

// ================================================================ right detail pane
function openDetail(d) { detail = d; renderDetail(); }
function closeDetail() {
  detail = null;
  $('#detail').classList.add('hidden');
  $('#appView').classList.remove('has-detail');
  $$('.notice.selected').forEach((n) => n.classList.remove('selected'));
}
function detailFrame(title, body) {
  const pane = $('#detail');
  pane.replaceChildren(
    h('div', { class: 'detail-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: closeDetail }, icon('x'))),
    h('div', { class: 'detail-body' }, body),
  );
  pane.classList.remove('hidden');
  $('#appView').classList.add('has-detail');
}
function renderDetail() {
  if (!detail) return;
  if (detail.kind === 'ann') renderAnnDetail();
  if (detail.kind === 'channel') renderChannelDetail();
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && detail && !document.querySelector('dialog[open]')) closeDetail();
});

// ================================================================ CHAT
function currentGroup() {
  return current && current.kind === 'group' ? groups.find((g) => g.id === current.id) : null;
}

function openRoom(target) {
  current = target;
  unread[target.room] = 0;
  $('#typing').textContent = '';
  if (detail && detail.kind === 'channel') { if (target.kind === 'group') detail.id = target.id; else closeDetail(); }
  closeDrawer();
  renderSidebar();
  renderChat();
  socket.emit('history', { room: target.room }, (res) => {
    if (!res.ok) return toast(res.error, 'error');
    cache[target.room] = res.messages;
    if (current && current.room === target.room) { renderMessages(); renderPinned(); }
    if (detail) renderDetail();
  });
}

function renderChat() {
  renderChatHeader();
  renderComposer();
  renderMessages();
  renderPinned();
}

function renderChatHeader() {
  const title = $('#roomTitle');
  title.replaceChildren();
  ['#modeBtn', '#lockBtn', '#membersBtn', '#infoBtn'].forEach((s) => $(s).classList.add('hidden'));
  if (!current) { title.textContent = 'No conversation open'; $('#roomSub').textContent = ''; return; }
  const g = currentGroup();
  if (g) {
    title.append(icon(groupIcon(g)), h('span', {}, g.name));
    $('#roomSub').textContent = g.description;
    $('#membersBtn').classList.remove('hidden');
    $('#membersCount').textContent = g.members;
    $('#infoBtn').classList.remove('hidden');
    if (g.canModerate) {
      $('#modeBtn').classList.remove('hidden');
      $('#modeBtn').replaceChildren(icon('megaphone'), g.mode === 'announce' ? 'Open chat' : 'Announcement mode');
      $('#lockBtn').classList.remove('hidden');
      $('#lockBtn').replaceChildren(icon(g.locked ? 'unlock' : 'lock'), g.locked ? 'Unlock' : 'Lock');
    }
  } else {
    const c = contacts.find((x) => x.id === current.id);
    title.append(avatar(current.title, 'sm', c ? online.has(c.id) : undefined), h('span', {}, current.title));
    $('#roomSub').textContent = c ? `${roleLabel(c.role)}${c.repOf && c.repOf.length ? ' · Class rep' : ''} · ${c.department}` : 'Direct message';
  }
}

function renderPinned() {
  const bar = $('#pinned');
  const pins = current && current.kind === 'group' ? (cache[current.room] || []).filter((m) => m.pinned) : [];
  bar.classList.toggle('hidden', pins.length === 0);
  if (!pins.length) return;
  const m = pins[pins.length - 1];
  bar.replaceChildren(icon('pin'), h('b', {}, pins.length > 1 ? `${pins.length} pinned` : 'Pinned'), h('span', {}, `${m.from.name}: ${m.text}`));
  bar.onclick = () => openDetail({ kind: 'channel', id: current.id });
}

function renderComposer() {
  const input = $('#text');
  const btn = $('#composer .send-btn');
  const notice = $('#composerNotice');
  let allowed = Boolean(current);
  let reason = '';
  const g = currentGroup();
  if (g && !g.canPost) {
    allowed = false;
    reason = g.locked ? 'A moderator locked this channel. Only moderators can post until it is unlocked.'
      : g.mode === 'announce' ? 'Announcement mode is on. Only teachers and class representatives can post.'
        : 'You can read this channel. Only authorised members can post.';
  }
  input.disabled = !allowed;
  btn.disabled = !allowed;
  input.placeholder = !current ? 'Pick a channel or person' : g ? `Message # ${g.name}` : `Message ${current.title}`;
  notice.classList.toggle('hidden', !reason);
  notice.replaceChildren(icon(g && g.locked ? 'lock' : 'info'), reason);
}

function renderMessages() {
  const box = $('#messages');
  box.replaceChildren();
  if (!current) return;
  const list = cache[current.room] || [];
  const g = currentGroup();

  // intro at the top of every conversation, like Slack
  const intro = h('div', { class: 'chat-empty' });
  if (g) {
    intro.append(h('div', { class: 'big' }, icon(groupIcon(g))), h('h3', {}, g.name), h('p', { class: 'muted' }, g.description || 'This is the start of the channel.'));
  } else {
    intro.append(avatar(current.title), h('h3', {}, current.title), h('p', { class: 'muted' }, 'This is the start of your direct messages. Only the two of you can see them.'));
  }
  box.appendChild(intro);

  let prev = null;
  list.forEach((m) => {
    if (!prev || startOfDay(prev.at) !== startOfDay(m.at)) {
      box.appendChild(h('div', { class: 'day-divider' }, h('span', {}, fmtDay(m.at))));
      prev = null;
    }
    if (m.from.role === 'system') {
      box.appendChild(h('div', { class: 'msg-system' }, h('span', {}, m.text)));
      prev = null;
      return;
    }
    const cont = prev && prev.from.id === m.from.id && m.at - prev.at < 5 * 60000 && !m.pinned && !prev.pinned;
    const row = h('div', { class: 'msg' + (cont ? ' cont' : '') + (m.pinned ? ' is-pinned' : '') });
    if (cont) {
      row.append(h('div', { class: 'gutter-time' }, fmtTime(m.at)), h('div', { class: 'msg-text' }, m.text));
    } else {
      const head = h('div', { class: 'msg-head' }, h('b', {}, m.from.name));
      if (m.from.rep) head.appendChild(h('span', { class: 'role-tag cr' }, 'Class rep'));
      else if (m.from.role !== 'student') head.appendChild(h('span', { class: 'role-tag ' + m.from.role }, roleLabel(m.from.role)));
      head.appendChild(h('time', { datetime: new Date(m.at).toISOString() }, fmtTime(m.at)));
      const bodyCol = h('div', {}, m.pinned ? h('div', { class: 'pin-note' }, icon('pin'), 'Pinned') : null, head, h('div', { class: 'msg-text' }, m.text));
      row.append(avatar(m.from.name), bodyCol);
    }
    // hover tools: pin (moderators + CR) and delete (moderators)
    if (g && (g.canPin || g.canModerate)) {
      const tools = h('div', { class: 'msg-tools' });
      if (g.canPin) {
        tools.appendChild(h('button', {
          type: 'button', title: m.pinned ? 'Unpin' : 'Pin to channel',
          onclick: () => socket.emit('message:pin', { groupId: g.id, messageId: m.id, pinned: !m.pinned }, (r) => { if (!r.ok) toast(r.error, 'error'); }),
        }, icon('pin'), m.pinned ? 'Unpin' : 'Pin'));
      }
      if (g.canModerate) {
        tools.appendChild(h('button', {
          type: 'button', class: 'del', title: 'Delete message',
          onclick: () => socket.emit('message:delete', { groupId: g.id, messageId: m.id }, (r) => { if (!r.ok) toast(r.error, 'error'); }),
        }, icon('trash')));
      }
      row.appendChild(tools);
    }
    box.appendChild(row);
    prev = m;
  });
  box.scrollTop = box.scrollHeight;
}

// sending
function sendMessage() {
  const text = $('#text').value.trim();
  if (!text || !current) return;
  const done = (res) => { if (!res.ok) toast(res.error, 'error'); };
  if (current.kind === 'group') socket.emit('message:send', { groupId: current.id, text }, done);
  else socket.emit('dm:send', { toUserId: current.id, text }, done);
  $('#text').value = '';
  autoGrow();
}
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
function autoGrow() { const t = $('#text'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px'; }
let lastTyping = 0;
$('#text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
});
$('#text').addEventListener('input', () => {
  autoGrow();
  if (!current || Date.now() - lastTyping < 800) return;
  lastTyping = Date.now();
  socket.emit('typing', { room: current.room });
});

$('#lockBtn').addEventListener('click', () => {
  const g = currentGroup();
  socket.emit('group:lock', { groupId: g.id, locked: !g.locked }, (r) => { if (!r.ok) toast(r.error, 'error'); });
});
$('#modeBtn').addEventListener('click', () => {
  const g = currentGroup();
  socket.emit('group:mode', { groupId: g.id, mode: g.mode === 'announce' ? 'open' : 'announce' }, (r) => { if (!r.ok) toast(r.error, 'error'); });
});
$('#infoBtn').addEventListener('click', () => {
  if (detail && detail.kind === 'channel') closeDetail(); else openDetail({ kind: 'channel', id: current.id });
});
$('#membersBtn').addEventListener('click', () => openDetail({ kind: 'channel', id: current.id }));

function renderChannelDetail() {
  const g = groups.find((x) => x.id === detail.id);
  if (!g) return closeDetail();
  const pins = (cache['g:' + g.id] || []).filter((m) => m.pinned).reverse();
  const who = g.canPost ? 'You can post here' : g.locked ? 'Locked — moderators only' : g.mode === 'announce' ? 'Teachers and class reps only' : 'Read only for you';
  const body = h('div', {},
    h('div', { class: 'about-block' }, h('h4', {}, 'About'), h('p', {}, g.description || 'No description.')),
    h('div', { class: 'about-block' }, h('h4', {}, 'Rules'),
      h('ul', { class: 'rule-list' },
        h('li', {}, icon('users'), `${g.members} members can read`),
        h('li', {}, icon('message'), who),
        h('li', {}, icon('megaphone'), g.mode === 'announce' ? 'Announcement mode is on' : 'Open chat'),
        g.locked ? h('li', {}, icon('lock'), 'Locked by a moderator') : null,
      )),
    h('div', {}, h('h4', { class: 'muted', style: 'font-size:13px;margin-bottom:8px' }, `Pinned messages (${pins.length})`),
      pins.length ? pins.map((m) => h('div', { class: 'pin-card' }, h('small', {}, `${m.from.name} · ${fmtRel(m.at)}`), h('span', {}, m.text)))
        : h('p', { class: 'muted', style: 'font-size:14px' }, g.canPin ? 'Hover a message and choose Pin to keep it here.' : 'Nothing pinned yet.')),
  );
  detailFrame(g.name, body);
}

// ================================================================ NOTICE BOARD
function filteredBoard() {
  return board.filter((a) => {
    if (boardFilter.tab === 'unread' && (a.read || a.mine)) return false;
    if (boardFilter.tab === 'saved' && !a.saved) return false;
    if (boardFilter.cat && a.category !== boardFilter.cat) return false;
    return true;
  });
}

function dueBadge(a) {
  if (!a.deadline) return null;
  const n = daysLeft(a.deadline);
  return h('span', { class: 'due' + (n >= 0 && n <= 3 ? ' soon' : '') + (n < 0 ? ' closed' : ''), title: fmtDeadline(a.deadline) }, icon('clock'), dueText(a.deadline));
}
function catLabel(cat) { return h('span', { class: 'cat-label', dataset: { cat } }, h('i'), CATS[cat]); }
function metaLine(a) {
  return h('div', { class: 'row-meta' }, avatar(a.author.name, 'xs'), h('span', {}, a.author.name), h('i', { class: 'sep' }), h('span', {}, a.audienceLabel), h('i', { class: 'sep' }), h('span', {}, fmtRel(a.at)));
}
function saveButton(a) {
  return h('button', {
    class: 'save-btn' + (a.saved ? ' on' : ''), type: 'button', 'aria-pressed': String(a.saved),
    title: a.saved ? 'Remove from saved' : 'Save for later',
    onclick: (e) => { e.stopPropagation(); toggleSave(a); },
  }, icon('bookmark'));
}

function noticeRow(a, preview = false) {
  const row = h('article', {
    class: 'notice ' + (a.read || a.mine ? 'read' : 'unread') + (detail && detail.kind === 'ann' && detail.id === a.id ? ' selected' : ''),
    dataset: { cat: a.category },
    tabindex: preview ? undefined : '0',
    onclick: preview ? undefined : () => openAnnouncement(a.id),
    onkeydown: preview ? undefined : (e) => { if (e.key === 'Enter') openAnnouncement(a.id); },
  },
  h('div', {},
    h('div', { class: 'notice-top' }, catLabel(a.category), a.priority !== 'normal' ? h('span', { class: 'prio ' + a.priority }, PRIORITY[a.priority]) : null,
      a.pinned ? h('span', { class: 'cat-label', style: '--cat:#8a5d0c' }, icon('pin'), 'Pinned') : null),
    h('h4', {}, a.title),
    h('p', { class: 'excerpt' }, a.body),
    metaLine(a)),
  h('div', { class: 'notice-side' }, dueBadge(a) || h('span'), preview ? null : saveButton(a)));
  return row;
}

function featuredBlock(a, preview = false) {
  const block = h('article', {
    class: 'featured', dataset: { cat: a.category },
    tabindex: preview ? undefined : '0',
    onclick: preview ? undefined : () => openAnnouncement(a.id),
    onkeydown: preview ? undefined : (e) => { if (e.key === 'Enter') openAnnouncement(a.id); },
  });
  const left = h('div', {},
    h('div', { class: 'notice-top' }, catLabel(a.category), a.pinned ? h('span', { class: 'pin-flag' }, icon('pin'), 'Pinned') : null),
    h('h2', {}, a.title),
    h('p', { class: 'excerpt' }, a.body),
    metaLine(a));
  const actions = h('div', { class: 'actions' });
  if (a.link) actions.appendChild(h('a', { class: 'btn primary', href: a.link, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, a.linkLabel || 'Open link', icon('external')));
  actions.appendChild(h('button', { class: 'btn ghost', type: 'button', onclick: (e) => { e.stopPropagation(); if (!preview) openAnnouncement(a.id); } }, 'Read full notice'));
  left.appendChild(actions);
  block.appendChild(left);
  if (a.deadline) {
    const n = daysLeft(a.deadline);
    block.appendChild(h('div', { class: 'countdown' },
      n >= 0 ? h('b', {}, n === 0 ? 'Today' : String(n)) : h('b', {}, '—'),
      h('span', {}, n < 0 ? 'Closed' : n === 0 ? `last date, ${fmtDeadline(a.deadline)}` : `${n === 1 ? 'day' : 'days'} left · ${fmtDeadline(a.deadline)}`)));
  }
  return block;
}

function renderBoard() {
  if (!me) return;
  const unreadN = board.filter((a) => !a.read && !a.mine).length;
  $('#boardIntro').textContent = unreadN
    ? `${unreadN} new ${unreadN === 1 ? 'notice' : 'notices'} since you last looked. Opportunities, policies and academic updates from the university offices.`
    : 'You are up to date. Opportunities, policies and academic updates from the university offices appear here.';
  $('#newAnnBtn').classList.toggle('hidden', !canPublish());

  // tabs
  const tabs = [['all', 'All', board.length], ['unread', 'Unread', unreadN], ['saved', 'Saved', board.filter((a) => a.saved).length]];
  $('#boardTabs').replaceChildren(...tabs.map(([k, label, n]) => h('button', {
    role: 'tab', 'aria-selected': String(boardFilter.tab === k), onclick: () => { boardFilter.tab = k; renderBoard(); },
  }, label, h('span', { class: 'n' }, n))));

  // category chips (only categories that exist)
  const present = Object.keys(CATS).filter((c) => board.some((a) => a.category === c));
  $('#catChips').replaceChildren(
    h('button', { class: 'cat-chip all', 'aria-pressed': String(!boardFilter.cat), onclick: () => { boardFilter.cat = null; renderBoard(); } }, 'Everything'),
    ...present.map((c) => h('button', {
      class: 'cat-chip', dataset: { cat: c }, 'aria-pressed': String(boardFilter.cat === c),
      onclick: () => { boardFilter.cat = boardFilter.cat === c ? null : c; renderBoard(); },
    }, h('i'), CATS[c])),
  );

  const list = filteredBoard();
  // featured: newest pinned notice (or newest urgent one) when looking at everything
  const featured = boardFilter.tab === 'all' ? (list.find((a) => a.pinned) || list.find((a) => a.priority === 'urgent')) : null;
  $('#featured').replaceChildren(featured ? featuredBlock(featured) : '');

  const rest = list.filter((a) => a !== featured);
  const feed = $('#feed');
  feed.replaceChildren();
  if (!list.length) {
    const msg = boardFilter.tab === 'saved' ? ['Nothing saved yet', 'Use the bookmark on a notice to keep it here.']
      : boardFilter.tab === 'unread' ? ['All caught up', 'There are no notices you have not opened.']
        : ['No notices in this category', 'Pick another category or check back later.'];
    feed.appendChild(h('div', { class: 'board-empty' }, icon('megaphone'), h('b', {}, msg[0]), h('span', {}, msg[1])));
  } else {
    const buckets = [['Today', []], ['This week', []], ['Earlier', []]];
    const today = startOfDay(Date.now());
    rest.forEach((a) => {
      if (a.at >= today) buckets[0][1].push(a);
      else if (a.at >= today - 6 * DAY) buckets[1][1].push(a);
      else buckets[2][1].push(a);
    });
    buckets.filter(([, items]) => items.length).forEach(([label, items]) => {
      feed.appendChild(h('section', { class: 'feed-group' }, h('h3', {}, label), h('div', { class: 'feed-list' }, items.map((a) => noticeRow(a)))));
    });
  }

  // closing soon
  const upcoming = board.filter((a) => a.deadline && daysLeft(a.deadline) >= 0).sort((x, y) => x.deadline.localeCompare(y.deadline));
  $('#deadlineList').replaceChildren(...(upcoming.length ? upcoming.map((a) => {
    const [y, m, d] = a.deadline.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const n = daysLeft(a.deadline);
    return h('button', { class: 'dl-item', dataset: { cat: a.category }, onclick: () => openAnnouncement(a.id) },
      h('span', { class: 'dl-date' }, h('b', {}, dt.getDate()), h('span', {}, dt.toLocaleDateString([], { month: 'short' }))),
      h('span', { class: 'dl-text' }, h('strong', {}, a.title), h('small', { class: n <= 3 ? 'soon' : '' }, dueText(a.deadline))));
  }) : [h('p', { class: 'dl-none' }, 'No upcoming last dates.')]));
}

function openAnnouncement(id) {
  const a = board.find((x) => x.id === id);
  if (!a) return;
  openDetail({ kind: 'ann', id });
  if (!a.read) {
    a.read = true;
    api('POST', `/api/announcements/${id}/read`).then((r) => { if (r.ok) Object.assign(a, r.data); renderSidebar(); if (view === 'board') renderBoard(); });
  }
  if (view === 'board') renderBoard();
}

async function toggleSave(a) {
  const r = await api('POST', `/api/announcements/${a.id}/save`);
  if (!r.ok) return toast(r.data.error, 'error');
  Object.assign(a, r.data);
  toast(a.saved ? 'Saved. Find it under Saved.' : 'Removed from saved.');
  if (view === 'board') renderBoard();
  if (detail && detail.kind === 'ann') renderDetail();
}

function renderAnnDetail() {
  const a = board.find((x) => x.id === detail.id);
  if (!a) return closeDetail();
  const body = h('div', { class: 'ann-detail', dataset: { cat: a.category } },
    h('div', { class: 'notice-top' }, catLabel(a.category), a.priority !== 'normal' ? h('span', { class: 'prio ' + a.priority }, PRIORITY[a.priority]) : null),
    h('h2', {}, a.title),
    h('div', { class: 'byline' }, avatar(a.author.name), h('div', {}, h('b', {}, a.author.name), h('small', {}, `${roleLabel(a.author.role)} · ${new Date(a.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · for ${a.audienceLabel}`))),
    a.deadline ? h('div', { class: 'callout' + (daysLeft(a.deadline) >= 0 && daysLeft(a.deadline) <= 3 ? ' soon' : '') }, icon('calendar'),
      h('span', {}, h('b', {}, 'Last date: '), `${fmtDeadline(a.deadline)} (${dueText(a.deadline).toLowerCase()})`)) : null,
    h('div', { class: 'ann-body' }, a.body.split(/\n+/).map((p) => h('p', {}, p))),
    h('div', { class: 'ann-actions' },
      a.link ? h('a', { class: 'btn primary', href: a.link, target: '_blank', rel: 'noopener noreferrer' }, a.linkLabel || 'Open link', icon('external')) : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => toggleSave(a) }, icon('bookmark'), a.saved ? 'Saved' : 'Save for later')),
  );
  if (a.canEdit) {
    const pct = a.reach ? Math.round((a.seenBy / a.reach) * 100) : 0;
    body.appendChild(h('div', { class: 'reach' },
      h('h4', {}, 'Reach'),
      h('p', {}, h('b', {}, `${a.seenBy} of ${a.reach}`), ` people opened it (${pct}%)`),
      h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })),
      h('div', { class: 'ann-actions' },
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => pinAnnouncement(a) }, icon('pin'), a.pinned ? 'Unpin' : 'Pin to top'),
        h('button', { class: 'btn ghost sm', type: 'button', onclick: () => openAnnDialog(a) }, icon('edit'), 'Edit'),
        h('button', { class: 'btn danger sm', type: 'button', onclick: () => deleteAnnouncement(a) }, icon('trash'), 'Delete'))));
  }
  detailFrame('Notice', body);
}

async function pinAnnouncement(a) {
  const r = await api('PATCH', `/api/announcements/${a.id}`, { pinned: !a.pinned });
  if (!r.ok) return toast(r.data.error, 'error');
  toast(r.data.pinned ? 'Pinned to the top of the board.' : 'Unpinned.');
}
async function deleteAnnouncement(a) {
  if (!confirm(`Delete "${a.title}"? Everyone will stop seeing it.`)) return;
  const r = await api('DELETE', `/api/announcements/${a.id}`);
  if (!r.ok) return toast(r.data.error, 'error');
  closeDetail();
  toast('Notice deleted.');
}

// ---------------- composer dialog ----------------
const annDlg = $('#annDlg');
let annEditing = null;
let annCat = 'general';
let annPrio = 'normal';

function audienceOptions() {
  if (isAdminRole(me.role)) return [['everyone', 'Everyone'], ['department', 'One department'], ['roles', 'Only students'], ['teachers', 'Only teachers']];
  if (me.role === 'hod') return [['department', `${me.department} department`]];
  return [['everyone', 'Everyone']];
}

function openAnnDialog(existing = null) {
  annEditing = existing;
  const f = $('#annForm');
  f.reset();
  $('#annError').textContent = '';
  $('#annDlgTitle').textContent = existing ? 'Edit announcement' : 'New announcement';
  $('#annSubmit').textContent = existing ? 'Save changes' : 'Publish';
  annCat = existing ? existing.category : 'general';
  annPrio = existing ? existing.priority : 'normal';

  $('#annCats').replaceChildren(...Object.entries(CATS).map(([k, label]) => h('button', {
    type: 'button', role: 'radio', dataset: { cat: k }, 'aria-checked': String(annCat === k),
    onclick: () => { annCat = k; $$('#annCats button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.cat === k))); annPreview(); },
  }, h('i'), label)));
  $('#annPriority').replaceChildren(...Object.entries(PRIORITY).map(([k, label]) => h('button', {
    type: 'button', role: 'radio', 'aria-selected': String(annPrio === k), dataset: { p: k },
    onclick: () => { annPrio = k; $$('#annPriority button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.p === k))); annPreview(); },
  }, label)));

  const audSel = $('#annAudType');
  audSel.replaceChildren(...audienceOptions().map(([v, l]) => h('option', { value: v }, l)));
  const depSel = $('#annAudValue');
  const deps = me.role === 'hod' ? [me.department] : (meta.departments.length ? meta.departments : [me.department]);
  depSel.replaceChildren(...deps.map((d) => h('option', { value: d }, d)));
  f.pinned.closest('label').classList.toggle('hidden', !isAdminRole(me.role));

  if (existing) {
    f.title.value = existing.title;
    f.body.value = existing.body;
    f.deadline.value = existing.deadline || '';
    f.link.value = existing.link || '';
    f.linkLabel.value = existing.linkLabel || '';
    f.pinned.checked = existing.pinned;
    const aud = existing.audience || {};
    if (aud.departments) { audSel.value = 'department'; depSel.value = aud.departments[0]; }
    else if (aud.roles) audSel.value = aud.roles.includes('faculty') ? 'teachers' : 'roles';
    else audSel.value = audienceOptions()[0][0];
  }
  syncAudience();
  annPreview();
  annDlg.showModal();
  f.title.focus();
}
function syncAudience() {
  $('#annAudValueWrap').classList.toggle('hidden', $('#annAudType').value !== 'department' || me.role === 'hod');
}
$('#annAudType').addEventListener('change', () => { syncAudience(); annPreview(); });
$('#newAnnBtn').addEventListener('click', () => openAnnDialog());
$('#annForm').addEventListener('input', annPreview);

function annFormData() {
  const f = $('#annForm');
  let audienceType = $('#annAudType').value;
  let audienceValue = $('#annAudValue').value;
  if (me.role === 'hod') { audienceType = 'department'; audienceValue = me.department; }
  if (audienceType === 'roles') audienceValue = 'student';
  if (audienceType === 'teachers') { audienceType = 'roles'; audienceValue = 'faculty,hod'; }
  return {
    title: f.title.value.trim(), body: f.body.value.trim(), category: annCat, priority: annPrio,
    audienceType, audienceValue, deadline: f.deadline.value || null, link: f.link.value.trim(),
    linkLabel: f.linkLabel.value.trim(), pinned: f.pinned.checked,
  };
}
function annPreview() {
  const d = annFormData();
  const labels = { everyone: 'Everyone', department: `${d.audienceValue} department`, roles: d.audienceValue === 'student' ? 'Students' : 'Teachers, HODs' };
  const fake = {
    id: 'preview', title: d.title || 'Your title appears here', body: d.body || 'The first lines of the details show in the list. People open the notice to read the rest.',
    category: d.category, priority: d.priority, deadline: d.deadline, link: d.link, linkLabel: d.linkLabel, pinned: d.pinned,
    author: { name: me.name, role: me.role }, at: Date.now(), audienceLabel: labels[d.audienceType] || 'Everyone', read: false, mine: false, saved: false,
  };
  const showFeatured = d.pinned || d.priority === 'urgent';
  $('#annPreview').replaceChildren(
    showFeatured ? featuredBlock(fake, true) : noticeRow(fake, true),
    h('p', { class: 'muted', style: 'font-size:13px' }, showFeatured ? 'Pinned and urgent notices show as the large card at the top of the board.' : 'Shown in the feed. Students get a pop-up when you publish.'),
  );
}

$('#annForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = annFormData();
  const r = annEditing ? await api('PATCH', `/api/announcements/${annEditing.id}`, d) : await api('POST', '/api/announcements', d);
  if (!r.ok) { $('#annError').textContent = r.data.error; return; }
  annDlg.close();
  toast(annEditing ? 'Changes saved.' : 'Published. Everyone in the audience can see it now.');
  boardFilter.tab = 'all';
});
$$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ================================================================ REQUESTS
const isHandler = () => me && (isAdminRole(me.role) || me.role === 'hod');

function renderRequests() {
  if (!me) return;
  const handler = isHandler();
  $('#newReqBtn').classList.toggle('hidden', isAdminRole(me.role));
  $('#reqIntro').textContent = isAdminRole(me.role)
    ? 'Course problems reported by students and teachers. Reply, then mark them resolved.'
    : me.role === 'hod'
      ? `Requests from the ${me.department} department, plus your own.`
      : 'Report a course problem (clash, add/drop, section) to the admin office. Every reply shows up here.';

  const active = requests.filter((r) => ['open', 'in_review'].includes(r.status));
  const tabs = [['active', 'Active', active.length], ['resolved', 'Closed', requests.length - active.length], ['all', 'All', requests.length]];
  $('#reqTabs').replaceChildren(...tabs.map(([k, label, n]) => h('button', {
    role: 'tab', 'aria-selected': String(reqTab === k), onclick: () => { reqTab = k; renderRequests(); },
  }, label, h('span', { class: 'n' }, n))));

  const inTab = (r) => reqTab === 'all' || (reqTab === 'active' ? ['open', 'in_review'].includes(r.status) : !['open', 'in_review'].includes(r.status));
  // the open request changed status and left this tab: follow it
  const sel = requests.find((x) => x.id === selectedReq);
  if (sel && !inTab(sel)) { reqTab = 'all'; return renderRequests(); }
  const list = requests.filter(inTab);
  const unseen = new Set(unseenRequests().map((r) => r.id));
  const box = $('#reqList');
  box.replaceChildren();
  if (!list.length) {
    box.appendChild(h('div', { class: 'empty-pane' }, h('div', { class: 'big' }, icon('inbox')),
      h('b', {}, reqTab === 'active' ? 'No active requests' : 'Nothing here'),
      h('span', {}, handler ? 'New requests from students land here.' : 'If something is wrong with a course, open a request and the office will reply here.')));
  }
  list.forEach((r) => {
    box.appendChild(h('button', {
      class: 'req-row' + (selectedReq === r.id ? ' active' : ''), type: 'button',
      onclick: () => { selectedReq = r.id; $('#view-requests').classList.add('show-detail'); renderRequests(); },
    },
    h('span', { class: 'top' }, h('span', {}, r.ref + (handler && r.createdBy !== me.id ? ` · ${r.requester.name}` : '')), h('span', {}, fmtRel(r.updatedAt))),
    h('strong', { style: unseen.has(r.id) ? 'font-weight:800' : '' }, r.subject),
    h('span', { class: 'meta' }, h('span', { class: 'status ' + r.status }, REQ_STATUS[r.status]), r.course ? h('span', { class: 'course-code' }, r.course) : null, REQ_TYPES[r.type])));
  });

  const r = requests.find((x) => x.id === selectedReq);
  if (!r) $('#view-requests').classList.remove('show-detail');
  renderRequestDetail(r);
}

function renderRequestDetail(r) {
  const pane = $('#reqDetail');
  pane.replaceChildren();
  if (!r) {
    pane.appendChild(h('div', { class: 'empty-pane' }, h('div', { class: 'big' }, icon('inbox')), h('b', {}, 'Pick a request'), h('span', {}, 'The full conversation with the office opens here.')));
    return;
  }
  markRequestSeen(r);
  renderSidebarSoon();
  const office = (role) => ['admin', 'superadmin', 'hod'].includes(role);
  pane.append(
    h('div', { class: 'req-detail-head' },
      h('button', { class: 'btn ghost sm back-btn', type: 'button', onclick: () => { selectedReq = null; $('#view-requests').classList.remove('show-detail'); renderRequests(); } }, icon('back'), 'All requests'),
      h('div', { class: 'notice-top' }, h('span', { class: 'status ' + r.status }, REQ_STATUS[r.status]), h('span', { class: 'muted', style: 'font-size:13px' }, r.ref)),
      h('h2', {}, r.subject),
      h('div', { class: 'req-facts' },
        h('div', {}, h('span', {}, 'Type'), REQ_TYPES[r.type]),
        h('div', {}, h('span', {}, 'Course'), r.course || '—'),
        h('div', {}, h('span', {}, 'From'), `${r.requester.name} (${r.requester.username})`),
        h('div', {}, h('span', {}, 'Department'), r.department),
        h('div', {}, h('span', {}, 'Opened'), new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })))),
  );
  const thread = h('div', { class: 'req-thread' },
    h('div', { class: 'bubble' }, avatar(r.requester.name), h('div', {},
      h('div', { class: 'msg-head' }, h('b', {}, r.requester.name), h('time', {}, fmtRel(r.at))), h('div', { class: 'msg-text' }, r.details))));
  r.thread.forEach((t) => {
    if (t.kind === 'status') {
      thread.appendChild(h('div', { class: 'timeline-note' }, h('span', { class: 'status ' + t.status }, REQ_STATUS[t.status]),
        h('span', {}, `${t.from.name} · ${fmtRel(t.at)}`), t.text ? h('span', { class: 'note' }, `“${t.text}”`) : null));
    } else {
      thread.appendChild(h('div', { class: 'bubble' + (office(t.from.role) ? ' office' : '') }, avatar(t.from.name), h('div', {},
        h('div', { class: 'msg-head' }, h('b', {}, t.from.name), office(t.from.role) ? h('span', { class: 'role-tag ' + t.from.role }, roleLabel(t.from.role)) : null, h('time', {}, fmtRel(t.at))),
        h('div', { class: 'msg-text' }, t.text))));
    }
  });
  pane.appendChild(thread);

  const closed = ['resolved', 'rejected'].includes(r.status);
  const reply = h('div', { class: 'req-reply' });
  if (closed && !r.canHandle) {
    reply.appendChild(h('p', { class: 'req-closed' }, 'This request is closed. If the problem comes back, open a new request.'));
  } else {
    const ta = h('textarea', { placeholder: r.canHandle ? 'Write a reply, or a note to go with a status change' : 'Add more details or reply to the office', maxlength: '1000' });
    const send = h('button', { class: 'btn primary sm', type: 'button', onclick: async () => {
      const text = ta.value.trim();
      if (!text) return ta.focus();
      const res = await api('POST', `/api/requests/${r.id}/reply`, { text });
      if (!res.ok) return toast(res.data.error, 'error');
    } }, icon('send'), 'Send reply');
    const statusBtns = h('div', { class: 'status-actions' });
    if (r.canHandle) {
      const setStatus = async (status) => {
        const res = await api('PATCH', `/api/requests/${r.id}/status`, { status, note: ta.value.trim() });
        if (!res.ok) return toast(res.data.error, 'error');
        toast(`Marked ${REQ_STATUS[status].toLowerCase()}.`);
      };
      if (r.status === 'open') statusBtns.appendChild(h('button', { class: 'btn ghost sm', type: 'button', onclick: () => setStatus('in_review') }, icon('eye'), 'Start review'));
      if (!closed) {
        statusBtns.appendChild(h('button', { class: 'btn go sm', type: 'button', onclick: () => setStatus('resolved') }, icon('check'), 'Mark resolved'));
        statusBtns.appendChild(h('button', { class: 'btn danger sm', type: 'button', onclick: () => setStatus('rejected') }, 'Decline'));
      } else {
        statusBtns.appendChild(h('button', { class: 'btn ghost sm', type: 'button', onclick: () => setStatus('open') }, 'Reopen'));
      }
    }
    reply.append(ta, h('div', { class: 'row' }, statusBtns, send));
  }
  pane.appendChild(reply);
  thread.scrollTop = thread.scrollHeight;
}
let sidebarTimer = null;
function renderSidebarSoon() { clearTimeout(sidebarTimer); sidebarTimer = setTimeout(renderSidebar, 0); }

// new request dialog
const reqDlg = $('#reqDlg');
let reqType = 'clash';
$('#newReqBtn').addEventListener('click', () => {
  const f = $('#reqForm');
  f.reset();
  $('#reqError').textContent = '';
  reqType = 'clash';
  $('#reqTypes').replaceChildren(...Object.entries(REQ_TYPES).map(([k, label]) => h('button', {
    type: 'button', role: 'radio', 'aria-checked': String(reqType === k), dataset: { t: k },
    onclick: () => { reqType = k; $$('#reqTypes button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.t === k))); },
  }, label)));
  $('#reqCourse').replaceChildren(
    ...me.courses.map((c) => h('option', { value: c }, c)),
    h('option', { value: '' }, me.courses.length ? 'A course not listed / general' : 'General (no specific course)'),
  );
  reqDlg.showModal();
});
$('#reqForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const r = await api('POST', '/api/requests', { type: reqType, course: f.course.value, subject: f.subject.value, details: f.details.value });
  if (!r.ok) { $('#reqError').textContent = r.data.error; return; }
  reqDlg.close();
  markRequestSeen(r.data);
  selectedReq = r.data.id;
  reqTab = 'active';
  toast(`${r.data.ref} sent to the admin office.`);
  if (view !== 'requests') setView('requests'); else renderRequests();
});

// ================================================================ MANAGE (console)
function consoleTabs() {
  const t = [];
  if (isAdminRole(me.role)) t.push(['people', 'People']);
  t.push(['channels', 'Channels']);
  if (isAdminRole(me.role) || me.role === 'faculty') t.push(['reps', 'Class reps & courses']);
  if (me.role === 'superadmin') t.push(['overview', 'Overview & activity']);
  return t;
}
function renderConsole() {
  if (!me || !canManage()) return;
  const tabs = consoleTabs();
  if (!tabs.find(([k]) => k === consoleTab)) consoleTab = tabs[0][0];
  $('#consoleTabs').replaceChildren(...tabs.map(([k, label]) => h('button', {
    role: 'tab', 'aria-selected': String(consoleTab === k), onclick: () => { consoleTab = k; renderConsole(); },
  }, label)));
  const body = $('#consoleBody');
  body.replaceChildren();
  if (consoleTab === 'people') renderPeople(body);
  if (consoleTab === 'channels') renderChannelsAdmin(body);
  if (consoleTab === 'reps') renderReps(body);
  if (consoleTab === 'overview') renderOverview(body);
}

const formData = (form) => Object.fromEntries(new FormData(form).entries());
async function act(method, url, body, okText) {
  const r = await api(method, url, body);
  if (!r.ok) { toast(r.data.error, 'error'); return null; }
  if (okText) toast(okText);
  return r.data;
}
function input(name, placeholder, extra = {}) { return h('input', { name, placeholder, ...extra }); }
function select(name, options) { return h('select', { name }, options.map(([v, l]) => h('option', { value: v }, l))); }
function labelled(text, el) { return h('label', { class: 'field' }, text, el); }

async function renderPeople(body) {
  const roleOpts = [['student', 'Student'], ['faculty', 'Teacher'], ['hod', 'HOD'], ['staff', 'Staff office']];
  if (me.role === 'superadmin') roleOpts.push(['admin', 'Admin']);
  const addForm = h('form', { class: 'inline-form' },
    h('div', { class: 'two' }, labelled('Full name', input('name', 'Hina Fatima', { required: true })), labelled('Username / Reg. No', input('username', 'fa23-bcs-050', { required: true }))),
    h('div', { class: 'two' }, labelled('Password', input('password', 'Temporary password', { required: true })), labelled('Role', select('role', roleOpts))),
    h('div', { class: 'two' }, labelled('Department', input('department', 'CS, EE, BBA…', { required: true })), labelled('Semester', input('semester', 'Students only'))),
    labelled('Courses', input('courses', 'CSC102, CSC241')),
    h('button', { class: 'btn primary sm' }, icon('plus'), 'Add person'));
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await act('POST', '/api/admin/users', formData(e.target), 'Person added.')) { e.target.reset(); renderConsole(); }
  });

  const search = h('input', { class: 'search-box', type: 'search', placeholder: 'Filter by name, username or department' });
  const wrap = h('div', { class: 'table-wrap' });
  const tablePanel = h('section', { class: 'panel' },
    h('div', { class: 'table-tools' }, h('h3', {}, 'Everyone on CUI Connect'), search), wrap);
  body.append(tablePanel, h('section', { class: 'panel' }, h('h3', {}, 'Add a person'), h('p', { class: 'muted' }, 'They can sign in straight away with this username and password.'), addForm));

  const r = await api('GET', '/api/admin/users');
  if (!r.ok) return;
  const users = r.data;
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = users.filter((u) => !q || `${u.name} ${u.username} ${u.department}`.toLowerCase().includes(q));
    const table = h('table', {}, h('thead', {}, h('tr', {}, ['Person', 'Role', 'Department', 'Courses', 'Class rep of', ''].map((c) => h('th', {}, c)))));
    const tb = h('tbody');
    rows.forEach((u) => {
      const tr = h('tr', { class: u.disabled ? 'off' : '' });
      tr.appendChild(h('td', {}, h('div', { class: 'person' }, avatar(u.name, 'sm'), h('div', {}, h('b', {}, u.name), h('small', {}, u.username)))));
      const roleTd = h('td');
      if (me.role === 'superadmin' && u.id !== me.id) {
        const sel = h('select', { 'aria-label': `Role of ${u.name}` }, ['student', 'faculty', 'hod', 'staff', 'admin', 'superadmin'].map((x) => h('option', { value: x, selected: x === u.role }, roleLabel(x))));
        sel.addEventListener('change', async () => { await act('PATCH', `/api/admin/users/${u.id}/role`, { role: sel.value }, `${u.name} is now ${roleLabel(sel.value)}.`); renderConsole(); });
        roleTd.appendChild(sel);
      } else roleTd.textContent = roleLabel(u.role);
      tr.append(roleTd, h('td', {}, u.department), h('td', {}, (u.courses || []).join(', ') || '—'), h('td', {}, (u.repOf || []).join(', ') || '—'));
      const acts = h('div', { class: 'acts' });
      const manageable = u.id !== me.id && (me.role === 'superadmin' || !isAdminRole(u.role));
      if (manageable) {
        acts.appendChild(h('button', { class: 'btn ghost sm', type: 'button', onclick: async () => { await act('PATCH', `/api/admin/users/${u.id}/status`, { disabled: !u.disabled }, u.disabled ? 'Account enabled.' : 'Account disabled. They were signed out.'); renderConsole(); } }, u.disabled ? 'Enable' : 'Disable'));
      }
      if (manageable && me.role === 'superadmin') {
        acts.appendChild(h('button', { class: 'btn danger sm', type: 'button', onclick: async () => { if (!confirm(`Delete ${u.username} permanently?`)) return; await act('DELETE', `/api/admin/users/${u.id}`, undefined, 'Account deleted.'); renderConsole(); } }, 'Delete'));
      }
      tr.appendChild(h('td', {}, acts));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    wrap.replaceChildren(table);
  };
  search.addEventListener('input', draw);
  draw();
}

function renderChannelsAdmin(body) {
  // what kind of audience this role may create
  let audOpts;
  if (me.role === 'faculty') audOpts = [['course', 'A course I teach']];
  else if (me.role === 'hod') audOpts = [['department', `${me.department} department`]];
  else audOpts = [['course', 'Students of a course'], ['department', 'A department'], ['everyone', 'Everyone'], ['roles', 'Some roles'], ['users', 'Specific people']];
  const audValue = me.role === 'faculty'
    ? select('audienceValue', me.courses.map((c) => [c, c]))
    : me.role === 'hod' ? h('input', { name: 'audienceValue', value: me.department, readonly: true })
      : input('audienceValue', 'CSC102 / CS / student,faculty / usernames');
  const create = h('form', { class: 'inline-form' },
    labelled('Channel name', input('name', 'CSC241 - Lab section B', { required: true })),
    labelled('Description', input('description', 'What is this channel for?')),
    h('div', { class: 'two' }, labelled('Who can join', select('audienceType', audOpts)), labelled('Course / department / list', audValue)),
    labelled('Who can post', select('postersType', [['all', 'Everyone in the channel'], ['faculty', 'Teachers, HODs and admins'], ['leaders', 'HODs and admins only']])),
    h('button', { class: 'btn primary sm' }, icon('plus'), 'Create channel'));
  create.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await act('POST', '/api/admin/groups', formData(e.target), 'Channel created. Members see it now.')) e.target.reset();
  });

  const mod = groups.filter((g) => g.canModerate);
  const invite = h('form', { class: 'inline-form' },
    labelled('Channel', select('groupId', mod.map((g) => [g.id, g.name]))),
    labelled('Usernames', input('usernames', 'fa23-bcs-014, fa23-bcs-019', { required: true })),
    labelled('Action', select('action', [['add', 'Add to channel'], ['remove', 'Remove from channel']])),
    h('button', { class: 'btn primary sm' }, 'Apply'));
  invite.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    await act('PATCH', `/api/admin/groups/${d.groupId}/members`, { action: d.action, usernames: d.usernames.split(',').map((n) => n.trim()).filter(Boolean) }, 'Members updated.');
  });

  const listPanel = h('section', { class: 'panel' }, h('h3', {}, 'Channels you can see'),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Channel', 'Members', 'State', ''].map((c) => h('th', {}, c)))),
      h('tbody', {}, groups.map((g) => h('tr', {},
        h('td', {}, h('div', { class: 'person' }, icon(groupIcon(g)), h('div', {}, h('b', {}, g.name), h('small', {}, g.type)))),
        h('td', {}, g.members),
        h('td', {}, [g.locked ? 'Locked' : 'Open', g.mode === 'announce' ? 'announcement mode' : ''].filter(Boolean).join(', ')),
        h('td', {}, isAdminRole(me.role) ? h('button', { class: 'btn danger sm', type: 'button', onclick: async () => { if (confirm(`Delete channel ${g.name}?`)) await act('DELETE', `/api/admin/groups/${g.id}`, undefined, 'Channel deleted.'); } }, 'Delete') : '')))))));

  body.append(h('div', { class: 'panel-grid' },
    h('section', { class: 'panel' }, h('h3', {}, 'Create a channel'), h('p', { class: 'muted' }, me.role === 'faculty' ? 'Teachers can open channels for the courses they teach.' : me.role === 'hod' ? 'HODs can open channels for their own department.' : 'Members are added automatically by course, department or role.'), create),
    mod.length ? h('section', { class: 'panel' }, h('h3', {}, 'Add or remove members'), h('p', { class: 'muted' }, 'For people outside the normal audience, e.g. a lab assistant.'), invite) : null),
  listPanel);
}

function renderReps(body) {
  const rep = h('form', { class: 'inline-form' },
    labelled('Student username', input('username', 'fa23-bcs-002', { required: true })),
    labelled('Course', me.role === 'faculty' ? select('course', me.courses.map((c) => [c, c])) : input('course', 'CSC102', { required: true })),
    labelled('Action', select('rep', [['true', 'Appoint as class rep'], ['false', 'Remove as class rep']])),
    h('button', { class: 'btn primary sm' }, 'Apply'));
  rep.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const look = await api('GET', '/api/lookup/' + encodeURIComponent(d.username.trim()));
    if (!look.ok) return toast(look.data.error, 'error');
    await act('PATCH', `/api/admin/users/${look.data.id}/rep`, { course: d.course.trim().toUpperCase(), rep: d.rep === 'true' }, d.rep === 'true' ? `${look.data.name} is now class rep.` : 'Class rep removed.');
  });
  const panels = [h('section', { class: 'panel' }, h('h3', {}, 'Class representative'), h('p', { class: 'muted' }, 'A class rep can post when the course channel is in announcement mode, and can pin messages.'), rep)];
  if (isAdminRole(me.role)) {
    const enrol = h('form', { class: 'inline-form' },
      labelled('Username', input('username', 'fa23-bcs-002', { required: true })),
      labelled('Courses (replaces the current list)', input('courses', 'CSC102, CSC241')),
      h('button', { class: 'btn primary sm' }, 'Save courses'));
    enrol.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      const look = await api('GET', '/api/lookup/' + encodeURIComponent(d.username.trim()));
      if (!look.ok) return toast(look.data.error, 'error');
      await act('PATCH', `/api/admin/users/${look.data.id}/courses`, { courses: d.courses.split(',').map((c) => c.trim()).filter(Boolean) }, 'Courses saved. Their channels update live.');
    });
    panels.push(h('section', { class: 'panel' }, h('h3', {}, 'Enrolment'), h('p', { class: 'muted' }, 'Fixes "missing from class channel" requests. The student sees the new channel without refreshing.'), enrol));
  }
  body.append(h('div', { class: 'panel-grid' }, panels));
}

async function renderOverview(body) {
  const [s, log] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', '/api/admin/audit')]);
  if (!s.ok) return;
  const st = s.data;
  const items = [['People', st.users], ['Online now', st.onlineNow], ['Channels', st.groups], ['Notices', st.announcements], ['Open requests', st.openRequests], ['Messages stored', st.messages], ['Locked channels', st.lockedGroups], ['Disabled accounts', st.disabled]];
  body.append(
    h('div', { class: 'stats' }, items.map(([l, v]) => h('div', { class: 'stat' }, h('b', {}, v), h('span', {}, l)))),
    h('section', { class: 'panel' }, h('h3', {}, 'Activity log'), h('p', { class: 'muted' }, 'The latest 100 sensitive actions: who did what, and when.'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, ['When', 'Who', 'Action', 'Detail'].map((c) => h('th', {}, c)))),
        h('tbody', {}, (log.ok ? log.data : []).map((r) => h('tr', {}, h('td', { style: 'white-space:nowrap' }, new Date(r.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })), h('td', {}, r.actor), h('td', {}, r.action), h('td', {}, r.detail))))))),
  );
}

// ================================================================ quick search (top bar)
const searchInput = $('#searchInput');
const searchBox = $('#searchResults');
let searchItems = [];
let searchIndex = 0;
function runSearch() {
  const q = searchInput.value.trim().toLowerCase();
  searchBox.replaceChildren();
  if (!q || !me) { searchBox.classList.add('hidden'); return; }
  const chans = groups.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 5);
  const people = contacts.filter((c) => `${c.name} ${c.username}`.toLowerCase().includes(q)).slice(0, 5);
  const notes = board.filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(q)).slice(0, 5);
  searchItems = [];
  const section = (label, items, make) => {
    if (!items.length) return;
    searchBox.appendChild(h('div', { class: 'group-label' }, label));
    items.forEach((it) => { const [el, go] = make(it); searchItems.push(go); el.addEventListener('mousedown', (e) => { e.preventDefault(); go(); }); searchBox.appendChild(el); });
  };
  const goChat = (t) => () => { closeSearch(); current = t; if (view !== 'chat') setView('chat'); openRoom(t); };
  section('Notices', notes, (a) => [h('button', { type: 'button', dataset: { cat: a.category } }, icon('megaphone'), h('span', {}, a.title), h('span', { class: 'sub' }, CATS[a.category])), () => { closeSearch(); if (view !== 'board') setView('board'); openAnnouncement(a.id); }]);
  section('Channels', chans, (g) => [h('button', { type: 'button' }, icon(groupIcon(g)), h('span', {}, g.name), h('span', { class: 'sub' }, `${g.members} members`)), goChat(groupTarget(g))]);
  section('People', people, (c) => [h('button', { type: 'button' }, avatar(c.name, 'xs', online.has(c.id)), h('span', {}, c.name), h('span', { class: 'sub' }, roleLabel(c.role))), goChat(dmTarget(c))]);
  if (!searchItems.length) searchBox.appendChild(h('div', { class: 'empty' }, `Nothing matches “${searchInput.value.trim()}”.`));
  searchIndex = 0;
  highlightSearch();
  searchBox.classList.remove('hidden');
}
function highlightSearch() { [...searchBox.querySelectorAll('button')].forEach((b, i) => b.classList.toggle('on', i === searchIndex)); }
function closeSearch() { searchInput.value = ''; searchBox.classList.add('hidden'); searchInput.blur(); }
searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('focus', runSearch);
searchInput.addEventListener('blur', () => setTimeout(() => searchBox.classList.add('hidden'), 120));
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSearch();
  if (e.key === 'ArrowDown') { e.preventDefault(); searchIndex = Math.min(searchIndex + 1, searchItems.length - 1); highlightSearch(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); searchIndex = Math.max(searchIndex - 1, 0); highlightSearch(); }
  if (e.key === 'Enter' && searchItems[searchIndex]) { e.preventDefault(); searchItems[searchIndex](); }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && me) { e.preventDefault(); searchInput.focus(); }
});

// ================================================================ boot
hydrateIcons();
const saved = ssGet('token');
if (saved) start(saved);
