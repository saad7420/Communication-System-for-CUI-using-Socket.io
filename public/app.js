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

// nice names for roles (internally the teacher role is called "faculty")
const ROLE_LABEL = { superadmin: 'Super Admin', admin: 'Admin', hod: 'HOD', faculty: 'Teacher', staff: 'Staff', student: 'Student', system: 'System' };
const roleLabel = (role) => ROLE_LABEL[role] || role;
const isAdminRole = (role) => role === 'admin' || role === 'superadmin';
const tok = () => 'Bearer ' + sessionStorage.getItem('token');

// ---------------------------------------------------------------- login
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  const res = await fetch('/api/login', {
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
  socket = io({ auth: { token } });

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
    $('#meInfo').textContent = `${roleLabel(me.role)}${me.repOf.length ? ' · CR of ' + me.repOf.join(', ') : ''} · ${me.department}` + (me.courses.length ? ' · ' + me.courses.join(', ') : '');
    const canManage = ['superadmin', 'admin', 'hod', 'faculty'].includes(me.role);
    $('#manageBtn').classList.toggle('hidden', !canManage);
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden', !isAdminRole(me.role)));
    document.querySelectorAll('.rep-only').forEach((el) => el.classList.toggle('hidden', !(isAdminRole(me.role) || me.role === 'faculty')));
    // only the super admin may create admins; other roles must not even see that option
    document.querySelectorAll('.super-only').forEach((el) => {
      if (el.tagName === 'OPTION') { if (me.role !== 'superadmin') el.remove(); }
      else el.classList.toggle('hidden', me.role !== 'superadmin');
    });
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

  // a message was pinned / unpinned
  socket.on('message:updated', (msg) => {
    const list = cache[msg.room];
    if (list) { const i = list.findIndex((m) => m.id === msg.id); if (i >= 0) list[i] = msg; }
    if (current && current.room === msg.room) { renderMessages(); renderPinned(); }
  });

  // a moderator deleted a message
  socket.on('message:deleted', ({ room, id }) => {
    if (cache[room]) cache[room] = cache[room].filter((m) => m.id !== id);
    if (current && current.room === room) { renderMessages(); renderPinned(); }
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
    sub.textContent = `${g.members} members` + (g.locked ? ' · locked' : '') + (g.mode === 'announce' ? ' · announcements' : '');
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
    sub.textContent = `${roleLabel(c.role)}${c.repOf && c.repOf.length ? ' (CR)' : ''} · ${c.department}`;
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
    renderPinned();
  });
}

function currentGroup() {
  return current && current.kind === 'group' ? groups.find((g) => g.id === current.id) : null;
}

function renderHeader() {
  const lock = $('#lockBtn');
  const modeBtn = $('#modeBtn');
  if (!current) {
    $('#roomTitle').textContent = 'Select a chat';
    $('#roomSub').textContent = '';
    lock.classList.add('hidden');
    modeBtn.classList.add('hidden');
    $('#pinned').classList.add('hidden');
    $('#messages').innerHTML = '';
    return;
  }
  $('#roomTitle').textContent = current.title;
  const g = currentGroup();
  if (g) {
    $('#roomSub').textContent = g.description;
    lock.classList.toggle('hidden', !g.canModerate);
    lock.textContent = g.locked ? 'Unlock group' : 'Lock group';
    modeBtn.classList.toggle('hidden', !g.canModerate);
    modeBtn.textContent = g.mode === 'announce' ? 'Switch to open chat' : 'Announcement mode';
  } else {
    $('#roomSub').textContent = 'Private conversation';
    lock.classList.add('hidden');
    modeBtn.classList.add('hidden');
  }
  renderPinned();
}

// banner with the newest pinned message of the open group
function renderPinned() {
  const bar = $('#pinned');
  const pins = current && current.kind === 'group' ? (cache[current.room] || []).filter((m) => m.pinned) : [];
  bar.classList.toggle('hidden', pins.length === 0);
  if (!pins.length) return;
  const m = pins[pins.length - 1];
  bar.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = 'Pinned';
  const s = document.createElement('span');
  s.textContent = `${m.from.name}: ${m.text}`; // textContent => XSS safe
  bar.append(b, s);
}

function renderComposer() {
  const input = $('#text');
  const btn = $('#composer button');
  let allowed = Boolean(current);
  let placeholder = current ? 'Type a message' : 'Select a chat to start';
  const g = currentGroup();
  if (g && !g.canPost) {
    allowed = false;
    placeholder = g.locked ? 'This group is locked by a moderator'
      : g.mode === 'announce' ? 'Announcement mode: only teachers and class representatives can post'
      : 'You can read this group but only authorised members can post';
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
    d.className = 'msg' + (m.from.role === 'system' ? ' system' : m.from.id === me.id ? ' me' : '') + (m.pinned ? ' pin' : '');
    if (m.from.role !== 'system' && m.from.id !== me.id) {
      const who = document.createElement('div');
      who.className = 'who';
      who.textContent = m.from.name;
      const tag = document.createElement('span');
      tag.className = 'tag ' + (m.from.rep ? 'cr' : m.from.role);
      tag.textContent = m.from.rep ? 'CR' : roleLabel(m.from.role);
      who.appendChild(tag);
      d.appendChild(who);
    }
    // hover buttons: pin (moderators + CR) and delete (moderators only)
    const g = currentGroup();
    if (g && m.from.role !== 'system' && (g.canPin || g.canModerate)) {
      const acts = document.createElement('div');
      acts.className = 'acts';
      if (g.canPin) {
        const pin = document.createElement('button');
        pin.textContent = m.pinned ? 'Unpin' : 'Pin';
        pin.onclick = () => socket.emit('message:pin', { groupId: g.id, messageId: m.id, pinned: !m.pinned }, (r) => { if (!r.ok) toast(r.error); });
        acts.appendChild(pin);
      }
      if (g.canModerate) {
        const del = document.createElement('button');
        del.textContent = 'Delete';
        del.onclick = () => socket.emit('message:delete', { groupId: g.id, messageId: m.id }, (r) => { if (!r.ok) toast(r.error); });
        acts.appendChild(del);
      }
      d.appendChild(acts);
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

$('#modeBtn').addEventListener('click', () => {
  const g = currentGroup();
  socket.emit('group:mode', { groupId: g.id, mode: g.mode === 'announce' ? 'open' : 'announce' }, (res) => {
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
  loadPanel();
});
$('#refreshPanel').addEventListener('click', () => loadPanel());
$('#closeManage').addEventListener('click', () => dlg.close());

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: tok() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  $('#manageMsg').textContent = res.ok ? 'Done.' : data.error;
  $('#manageMsg').style.color = res.ok ? 'green' : '#c0392b';
  if (res.ok) loadPanel(); // keep the accounts table / audit log up to date
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
  const users = await (await fetch('/api/admin/users', { headers: { Authorization: 'Bearer ' + sessionStorage.getItem('token') } })).json();
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

// Class Representative (head student): teacher or admin appoints / removes
$('#repForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = formData(e.target);
  const res = await fetch('/api/lookup/' + encodeURIComponent(d.username.trim()), { headers: { Authorization: tok() } });
  if (!res.ok) { $('#manageMsg').style.color = '#c0392b'; $('#manageMsg').textContent = (await res.json()).error; return; }
  const u = await res.json();
  await api('PATCH', `/api/admin/users/${u.id}/rep`, { course: d.course.trim().toUpperCase(), rep: d.rep === 'true' });
});

// ---------------------------------------------------------------- control panel (admin / super admin)
async function getJson(url) {
  const res = await fetch(url, { headers: { Authorization: tok() } });
  return res.ok ? res.json() : null;
}

function cell(tr, text) {
  const td = document.createElement('td');
  td.textContent = text;
  tr.appendChild(td);
  return td;
}

function headRow(table, cols) {
  table.innerHTML = '';
  const tr = document.createElement('tr');
  cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; tr.appendChild(th); });
  table.appendChild(tr);
}

async function loadPanel() {
  if (!me || !isAdminRole(me.role)) return;
  const users = await getJson('/api/admin/users');
  if (users) renderUserTable(users);
  if (me.role === 'superadmin') {
    const stats = await getJson('/api/admin/stats');
    if (stats) renderStats(stats);
    const log = await getJson('/api/admin/audit');
    if (log) renderAudit(log);
  }
}

function renderStats(s) {
  const box = $('#stats');
  box.innerHTML = '';
  const items = [['Users', s.users], ['Online now', s.onlineNow], ['Groups', s.groups], ['Locked groups', s.lockedGroups], ['Messages stored', s.messages], ['Disabled accounts', s.disabled]];
  Object.entries(s.byRole).forEach(([r, n]) => items.push([roleLabel(r) + 's', n]));
  items.forEach(([label, value]) => {
    const d = document.createElement('div');
    d.className = 'stat';
    const b = document.createElement('b');
    b.textContent = value;
    d.append(b, document.createTextNode(label));
    box.appendChild(d);
  });
}

function renderUserTable(users) {
  const t = $('#userTable');
  headRow(t, ['Name', 'Username', 'Role', 'Dept', 'Courses', 'CR of', 'Actions']);
  users.forEach((u) => {
    const tr = document.createElement('tr');
    if (u.disabled) tr.className = 'off';
    cell(tr, u.name);
    cell(tr, u.username);
    const roleTd = cell(tr, '');
    if (me.role === 'superadmin' && u.id !== me.id) {
      // super admin can promote / demote anybody (except himself)
      const sel = document.createElement('select');
      ['student', 'faculty', 'hod', 'staff', 'admin', 'superadmin'].forEach((r) => {
        const o = document.createElement('option');
        o.value = r; o.textContent = roleLabel(r); o.selected = r === u.role;
        sel.appendChild(o);
      });
      sel.onchange = async () => { await api('PATCH', `/api/admin/users/${u.id}/role`, { role: sel.value }); loadPanel(); };
      roleTd.appendChild(sel);
    } else {
      roleTd.textContent = roleLabel(u.role);
    }
    cell(tr, u.department);
    cell(tr, (u.courses || []).join(', '));
    cell(tr, (u.repOf || []).join(', '));
    const act = cell(tr, '');
    const manageable = u.id !== me.id && (me.role === 'superadmin' || !isAdminRole(u.role));
    if (manageable) {
      const dis = document.createElement('button');
      dis.textContent = u.disabled ? 'Enable' : 'Disable';
      dis.onclick = async () => { await api('PATCH', `/api/admin/users/${u.id}/status`, { disabled: !u.disabled }); loadPanel(); };
      act.appendChild(dis);
    }
    if (manageable && me.role === 'superadmin') {
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.className = 'danger';
      del.onclick = async () => {
        if (!confirm(`Delete ${u.username} permanently?`)) return;
        await api('DELETE', `/api/admin/users/${u.id}`);
        loadPanel();
      };
      act.appendChild(del);
    }
    t.appendChild(tr);
  });
}

function renderAudit(rows) {
  const t = $('#auditTable');
  headRow(t, ['Time', 'Who', 'Action', 'Detail']);
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    cell(tr, new Date(r.at).toLocaleString());
    cell(tr, r.actor);
    cell(tr, r.action);
    cell(tr, r.detail);
    t.appendChild(tr);
  });
}

// auto login after refresh
const saved = sessionStorage.getItem('token');
if (saved) start(saved);
