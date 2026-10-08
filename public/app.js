// Backend URL (empty = same origin). Set in public/config.js for Vercel.
const API = (window.CUI_API || '').replace(/\/$/, '');
// app.js - browser side of Project A.
// The browser only DISPLAYS things. Every rule is checked again on the
// server, so hiding a button here is a convenience, not security.

const $ = (sel) => document.querySelector(sel);

let socket = null;
let me = null;
let groups = [];
let contacts = [];
let online = new Set();
let current = null;          // { room, kind: 'group'|'dm', id, title }
const cache = {};            // room -> [messages]
const unread = {};           // room -> count
let typingTimer = null;

// ---------------------------------------------------------------- login
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  const res = await fetch(API + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: $('#username').value, password: $('#password').value }),
  });
  const data = await res.json();
  if (!res.ok) return ($('#loginError').textContent = data.error);
  sessionStorage.setItem('token', data.token);
  start(data.token);
});

$('#logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('token');
  location.reload();
});

// ---------------------------------------------------------------- socket
function start(token) {
  socket = io(API || undefined, { auth: { token } });

  socket.on('connect_error', (err) => {
    sessionStorage.removeItem('token');
    $('#chatView').classList.add('hidden');
    $('#loginView').classList.remove('hidden');
    $('#loginError').textContent = err.message === 'Not authenticated' ? 'Session expired, sign in again' : err.message;
  });

  socket.on('snapshot', (snap) => {
    me = snap.me;
    groups = snap.groups;
    contacts = snap.contacts;
    $('#loginView').classList.add('hidden');
    $('#chatView').classList.remove('hidden');
    $('#meName').textContent = me.name;
    $('#meInfo').textContent = `${me.role.toUpperCase()} · ${me.department}` + (me.courses.length ? ' · ' + me.courses.join(', ') : '');
    const canManage = ['admin', 'hod', 'faculty'].includes(me.role);
    $('#manageBtn').classList.toggle('hidden', !canManage);
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden', me.role !== 'admin'));
    // if the currently open group disappeared (rule changed) close it
    if (current && current.kind === 'group' && !groups.find((g) => g.id === current.id)) current = null;
    renderSidebar();
    renderHeader();
    renderComposer();
  });

  socket.on('presence', (ids) => {
    online = new Set(ids);
    renderSidebar();
  });

  socket.on('message:new', (msg) => {
    if (cache[msg.room]) cache[msg.room].push(msg);
    if (current && current.room === msg.room) {
      renderMessages();
    } else if (msg.from.id !== me.id) {
      unread[msg.room] = (unread[msg.room] || 0) + 1;
      renderSidebar();
    }
  });

  socket.on('typing', ({ room, name }) => {
    if (!current || current.room !== room) return;
    $('#typing').textContent = `${name} is typing...`;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => ($('#typing').textContent = ''), 1500);
  });
}

// ---------------------------------------------------------------- sidebar
const dmRoom = (a, b) => 'dm:' + [a, b].sort().join('_');
const groupRoom = (id) => 'g:' + id;

function renderSidebar() {
  const list = $('#sidebarList');
  list.innerHTML = '';

  const addSection = (label) => {
    const d = document.createElement('div');
    d.className = 'section';
    d.textContent = label;
    list.appendChild(d);
  };

  addSection('Groups');
  groups.forEach((g) => {
    const room = groupRoom(g.id);
    const row = document.createElement('div');
    row.className = 'item' + (current && current.room === room ? ' active' : '');
    const left = document.createElement('div');
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = g.name;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = g.canPost ? g.type : 'read only';
    t.appendChild(tag);
    const sub = document.createElement('div');
    sub.className = 'muted small';
    sub.textContent = `${g.members} members` + (g.locked ? ' · locked' : '');
    left.append(t, sub);
    row.appendChild(left);
    if (unread[room]) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = unread[room];
      row.appendChild(b);
    }
    row.onclick = () => openRoom({ room, kind: 'group', id: g.id, title: g.name });
    list.appendChild(row);
  });

  addSection('People you can message');
  contacts.forEach((c) => {
    const room = dmRoom(me.id, c.id);
    const row = document.createElement('div');
    row.className = 'item' + (current && current.room === room ? ' active' : '');
    const left = document.createElement('div');
    const t = document.createElement('div');
    t.className = 'title';
    const dot = document.createElement('span');
    dot.className = 'dot' + (online.has(c.id) ? ' on' : '');
    t.append(dot, document.createTextNode(c.name));
    const sub = document.createElement('div');
    sub.className = 'muted small';
    sub.textContent = `${c.role} · ${c.department}`;
    left.append(t, sub);
    row.appendChild(left);
    if (unread[room]) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = unread[room];
      row.appendChild(b);
    }
    row.onclick = () => openRoom({ room, kind: 'dm', id: c.id, title: c.name });
    list.appendChild(row);
  });
}

// ---------------------------------------------------------------- open a chat
function openRoom(target) {
  current = target;
  unread[target.room] = 0;
  $('#typing').textContent = '';
  renderSidebar();
  renderHeader();
  renderComposer();
  socket.emit('history', { room: target.room }, (res) => {
    if (!res.ok) return toast(res.error);
    cache[target.room] = res.messages;
    renderMessages();
  });
}

function currentGroup() {
  return current && current.kind === 'group' ? groups.find((g) => g.id === current.id) : null;
}

function renderHeader() {
  const lock = $('#lockBtn');
  if (!current) {
    $('#roomTitle').textContent = 'Select a chat';
    $('#roomSub').textContent = '';
    lock.classList.add('hidden');
    $('#messages').innerHTML = '';
    return;
  }
  $('#roomTitle').textContent = current.title;
  const g = currentGroup();
  if (g) {
    $('#roomSub').textContent = g.description;
    lock.classList.toggle('hidden', !g.canModerate);
    lock.textContent = g.locked ? 'Unlock group' : 'Lock group';
  } else {
    $('#roomSub').textContent = 'Private conversation';
    lock.classList.add('hidden');
  }
}

function renderComposer() {
  const input = $('#text');
  const btn = $('#composer button');
  let allowed = Boolean(current);
  let placeholder = current ? 'Type a message' : 'Select a chat to start';
  const g = currentGroup();
  if (g && !g.canPost) {
    allowed = false;
    placeholder = g.locked ? 'This group is locked by a moderator' : 'You can read this group but only authorised members can post';
  }
  input.disabled = !allowed;
  btn.disabled = !allowed;
  input.placeholder = placeholder;
}

function renderMessages() {
  const box = $('#messages');
  box.innerHTML = '';
  (cache[current.room] || []).forEach((m) => {
    const d = document.createElement('div');
    d.className = 'msg' + (m.from.role === 'system' ? ' system' : m.from.id === me.id ? ' me' : '');
    if (m.from.role !== 'system' && m.from.id !== me.id) {
      const who = document.createElement('div');
      who.className = 'who';
      who.textContent = m.from.name;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = m.from.role;
      who.appendChild(tag);
      d.appendChild(who);
    }
    const text = document.createElement('div');
    text.textContent = m.text; // textContent => no HTML injection (XSS safe)
    d.appendChild(text);
    if (m.from.role !== 'system') {
      const time = document.createElement('div');
      time.className = 'time';
      time.textContent = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      d.appendChild(time);
    }
    box.appendChild(d);
  });
  box.scrollTop = box.scrollHeight;
}

// ---------------------------------------------------------------- sending
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#text').value.trim();
  if (!text || !current) return;
  const done = (res) => {
    if (!res.ok) toast(res.error);
  };
  if (current.kind === 'group') socket.emit('message:send', { groupId: current.id, text }, done);
  else socket.emit('dm:send', { toUserId: current.id, text }, done);
  $('#text').value = '';
});

let lastTyping = 0;
$('#text').addEventListener('input', () => {
  if (!current || Date.now() - lastTyping < 800) return;
  lastTyping = Date.now();
  socket.emit('typing', { room: current.room });
});

$('#lockBtn').addEventListener('click', () => {
  const g = currentGroup();
  socket.emit('group:lock', { groupId: g.id, locked: !g.locked }, (res) => {
    if (!res.ok) toast(res.error);
  });
});

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}

// ---------------------------------------------------------------- manage dialog
const dlg = $('#manageDlg');
$('#manageBtn').addEventListener('click', () => {
  const sel = $('#inviteGroup');
  sel.innerHTML = '';
  groups.filter((g) => g.canModerate).forEach((g) => {
    const o = document.createElement('option');
    o.value = g.id;
    o.textContent = g.name;
    sel.appendChild(o);
  });
  $('#manageMsg').textContent = '';
  dlg.showModal();
});
$('#closeManage').addEventListener('click', () => dlg.close());

async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionStorage.getItem('token') },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  $('#manageMsg').textContent = res.ok ? 'Done.' : data.error;
  $('#manageMsg').style.color = res.ok ? 'green' : '#c0392b';
  return res.ok;
}
const formData = (form) => Object.fromEntries(new FormData(form).entries());

$('#userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (await api('POST', '/api/admin/users', formData(e.target))) e.target.reset();
});
$('#groupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (await api('POST', '/api/admin/groups', formData(e.target))) e.target.reset();
});
$('#enrolForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const users = await (await fetch(API + '/api/admin/users', { headers: { Authorization: 'Bearer ' + sessionStorage.getItem('token') } })).json();
  const u = users.find((x) => x.username === d.username.toLowerCase());
  if (!u) { $('#manageMsg').textContent = 'No such user'; return; }
  await api('PATCH', `/api/admin/users/${u.id}/courses`, { courses: d.courses.split(',').map((c) => c.trim()).filter(Boolean) });
});
$('#inviteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  await api('PATCH', `/api/admin/groups/${d.groupId}/members`, {
    action: d.action,
    usernames: d.usernames.split(',').map((n) => n.trim()).filter(Boolean),
  });
});

// auto login after refresh
const saved = sessionStorage.getItem('token');
if (saved) start(saved);
