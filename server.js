// server.js - Project A : CUI Connect
// ---------------------------------------------------------------
// Design in one sentence:
//   ONE Socket.IO namespace, one ROOM per group (g:<id>), one personal
//   room per user (u:<id>), and a policy engine (src/policy.js) that is
//   asked before every join, read and write.
// ---------------------------------------------------------------
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const store = require('./src/store');
const policy = require('./src/policy');

const app = express();
const server = http.createServer(app);
const ORIGINS = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
const io = new Server(server, ORIGINS.length ? { cors: { origin: ORIGINS } } : {});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------- sessions -------------------------
// login gives a random token; we remember token -> userId in memory.
const sessions = new Map();

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username, role: u.role, department: u.department, semester: u.semester, courses: u.courses };
}

function restAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = store.getUser(sessions.get(token));
  if (!user) return res.status(401).json({ error: 'Please log in again' });
  req.user = user;
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = store.getUserByUsername(username || '');
  if (!user || !store.verifyPassword(String(password || ''), user.passwordHash)) {
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user.id);
  res.json({ token, user: publicUser(user) });
});

// ------------------------- presence -------------------------
const onlineCount = new Map(); // userId -> number of open tabs
const isOnline = (id) => (onlineCount.get(id) || 0) > 0;
const broadcastPresence = () => io.emit('presence', [...onlineCount.keys()].filter(isOnline));

// ------------------------- views (what the client may see) -------------------------
function groupView(g, user) {
  return {
    id: g.id,
    name: g.name,
    type: g.type,
    description: g.description,
    locked: g.locked,
    canPost: policy.canPost(user, g),
    canModerate: policy.canModerate(user, g),
    members: store.db.users.filter((u) => policy.canRead(u, g)).length,
  };
}

function snapshot(user) {
  return {
    me: publicUser(user),
    groups: store.db.groups.filter((g) => policy.canRead(user, g)).map((g) => groupView(g, user)),
    contacts: store.db.users
      .filter((u) => policy.canDM(user, u))
      .map((u) => ({ ...publicUser(u), online: isOnline(u.id) })),
  };
}

const dmRoom = (a, b) => 'dm:' + [a, b].sort().join('_');

// Re-check every connected socket: join rooms they are now allowed in,
// leave rooms they lost, and send a fresh snapshot to the browser.
function syncAllSockets() {
  for (const socket of io.sockets.sockets.values()) {
    const user = store.getUser(socket.data.userId);
    if (!user) { socket.disconnect(true); continue; }
    for (const g of store.db.groups) {
      if (policy.canRead(user, g)) socket.join('g:' + g.id);
      else socket.leave('g:' + g.id);
    }
    socket.emit('snapshot', snapshot(user));
  }
}

// ------------------------- admin / management REST -------------------------
const ROLES = ['student', 'faculty', 'hod', 'staff', 'admin'];

app.get('/api/admin/users', restAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  res.json(store.db.users.map(publicUser));
});

app.post('/api/admin/users', restAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only the admin office can add users' });
  const { name, username, password, role, department, semester, courses } = req.body || {};
  if (!name || !username || !password || !ROLES.includes(role) || !department) {
    return res.status(400).json({ error: 'name, username, password, role and department are required' });
  }
  if (store.getUserByUsername(username)) return res.status(409).json({ error: 'Username already exists' });
  const user = store.addUser({
    name: String(name).trim(),
    username: String(username).trim(),
    password: String(password),
    role,
    department: String(department).trim(),
    semester: semester ? Number(semester) : null,
    courses: Array.isArray(courses) ? courses : String(courses || '').split(',').map((c) => c.trim()).filter(Boolean),
  });
  syncAllSockets();
  res.json(publicUser(user));
});

// admin can enrol / drop a student or faculty in a course
app.patch('/api/admin/users/:id/courses', restAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const target = store.getUser(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const courses = Array.isArray(req.body.courses) ? req.body.courses : [];
  target.courses = courses.map((c) => String(c).trim()).filter(Boolean);
  store.save();
  syncAllSockets();
  res.json(publicUser(target));
});

// Turn a simple form choice into rule objects, and check the creator is allowed.
function buildGroupRules(creator, body) {
  const { audienceType, audienceValue = '', postersType = 'all' } = body;
  let audience;
  let moderators = { users: [creator.id] };

  if (creator.role === 'faculty') {
    // a teacher may only open a class group for a course he/she teaches
    if (audienceType !== 'course' || !(creator.courses || []).includes(audienceValue)) {
      return { error: 'Faculty can only create class groups for their own courses' };
    }
  } else if (creator.role === 'hod') {
    if (audienceType !== 'department' || audienceValue !== creator.department) {
      return { error: 'HOD can only create groups for their own department' };
    }
  } else if (creator.role !== 'admin') {
    return { error: 'Your role cannot create groups' };
  }

  switch (audienceType) {
    case 'everyone':
      audience = { everyone: true };
      break;
    case 'department':
      audience = { departments: [audienceValue] };
      moderators = { roles: ['hod'], departments: [audienceValue], users: [creator.id] };
      break;
    case 'course':
      audience = { course: audienceValue };
      moderators = { roles: ['faculty'], course: audienceValue, users: [creator.id] };
      break;
    case 'roles':
      audience = { roles: audienceValue.split(',').map((r) => r.trim()).filter((r) => ROLES.includes(r)) };
      break;
    case 'users': {
      const ids = audienceValue.split(',').map((n) => store.getUserByUsername(n.trim())).filter(Boolean).map((u) => u.id);
      audience = { users: ids };
      break;
    }
    default:
      return { error: 'Unknown audience type' };
  }

  let posters;
  if (postersType === 'leaders') posters = { roles: ['admin', 'hod'] };
  else if (postersType === 'faculty') posters = { roles: ['admin', 'hod', 'faculty'] };
  else posters = { everyone: true };
  if (posters.roles) posters.users = [creator.id];

  return { audience, posters, moderators };
}

app.post('/api/admin/groups', restAuth, (req, res) => {
  const { name, description = '' } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Group name is required' });
  const rules = buildGroupRules(req.user, req.body);
  if (rules.error) return res.status(403).json({ error: rules.error });
  const type = req.body.audienceType === 'course' ? 'class' : req.body.audienceType === 'department' ? 'department' : 'custom';
  const g = store.addGroup({ name: String(name).trim(), type, description: String(description), ...rules, createdBy: req.user.id });
  syncAllSockets();
  res.json({ id: g.id, name: g.name });
});

// Invite extra people (explicit list) into a group - moderators and admin only.
app.patch('/api/admin/groups/:id/members', restAuth, (req, res) => {
  const g = store.getGroup(req.params.id);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  if (!policy.canModerate(req.user, g)) return res.status(403).json({ error: 'Only moderators can change members' });
  const { action = 'add', usernames = [] } = req.body || {};
  const ids = usernames.map((n) => store.getUserByUsername(n)).filter(Boolean).map((u) => u.id);
  g.audience.users = g.audience.users || [];
  if (action === 'add') g.audience.users = [...new Set([...g.audience.users, ...ids])];
  else g.audience.users = g.audience.users.filter((id) => !ids.includes(id));
  store.save();
  syncAllSockets();
  res.json({ ok: true });
});

app.delete('/api/admin/groups/:id', restAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  store.db.groups = store.db.groups.filter((g) => g.id !== req.params.id);
  store.save();
  syncAllSockets();
  res.json({ ok: true });
});

// ------------------------- Socket.IO -------------------------
// Handshake check: no valid token, no connection at all.
io.use((socket, next) => {
  const userId = sessions.get(socket.handshake.auth && socket.handshake.auth.token);
  if (!userId || !store.getUser(userId)) return next(new Error('Not authenticated'));
  socket.data.userId = userId;
  next();
});

const MAX_TEXT = 1000;
// flood control: at most 5 messages per 3 seconds per socket
function tooFast(socket) {
  const now = Date.now();
  socket.data.sent = (socket.data.sent || []).filter((t) => now - t < 3000);
  if (socket.data.sent.length >= 5) return true;
  socket.data.sent.push(now);
  return false;
}

function cleanText(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  return t.length && t.length <= MAX_TEXT ? t : null;
}

function makeMessage(room, user, text) {
  return {
    id: store.nextId('m'),
    room,
    from: { id: user.id, name: user.name, role: user.role },
    text,
    at: Date.now(),
  };
}

io.on('connection', (socket) => {
  const me = () => store.getUser(socket.data.userId);
  const user = me();

  socket.join('u:' + user.id);
  for (const g of store.db.groups) if (policy.canRead(user, g)) socket.join('g:' + g.id);

  onlineCount.set(user.id, (onlineCount.get(user.id) || 0) + 1);
  socket.emit('snapshot', snapshot(user));
  broadcastPresence();

  // ---- load old messages of a room (permission checked again!) ----
  socket.on('history', ({ room } = {}, ack = () => {}) => {
    const u = me();
    if (typeof room === 'string' && room.startsWith('g:')) {
      const g = store.getGroup(room.slice(2));
      if (!g || !policy.canRead(u, g)) return ack({ ok: false, error: 'You are not allowed in this group' });
    } else if (typeof room === 'string' && room.startsWith('dm:')) {
      const ids = room.slice(3).split('_');
      const other = store.getUser(ids.find((i) => i !== u.id));
      if (!ids.includes(u.id) || !other || !policy.canDM(u, other)) return ack({ ok: false, error: 'Not allowed' });
    } else {
      return ack({ ok: false, error: 'Unknown room' });
    }
    ack({ ok: true, messages: (store.db.messages[room] || []).slice(-100) });
  });

  // ---- group message ----
  socket.on('message:send', ({ groupId, text } = {}, ack = () => {}) => {
    const u = me();
    const g = store.getGroup(groupId);
    const body = cleanText(text);
    if (!g) return ack({ ok: false, error: 'Group not found' });
    if (!body) return ack({ ok: false, error: 'Message is empty or too long' });
    if (!policy.canRead(u, g)) return ack({ ok: false, error: 'You are not a member of this group' });
    if (!policy.canPost(u, g)) {
      return ack({ ok: false, error: g.locked ? 'This group is locked by a moderator' : 'You can read this group but not post in it' });
    }
    if (tooFast(socket)) return ack({ ok: false, error: 'Slow down - too many messages' });
    const msg = makeMessage('g:' + g.id, u, body);
    store.addMessage(msg.room, msg);
    io.to(msg.room).emit('message:new', msg);
    ack({ ok: true });
  });

  // ---- private message ----
  socket.on('dm:send', ({ toUserId, text } = {}, ack = () => {}) => {
    const u = me();
    const other = store.getUser(toUserId);
    const body = cleanText(text);
    if (!other) return ack({ ok: false, error: 'User not found' });
    if (!body) return ack({ ok: false, error: 'Message is empty or too long' });
    if (!policy.canDM(u, other)) return ack({ ok: false, error: 'You are not allowed to message this person' });
    if (tooFast(socket)) return ack({ ok: false, error: 'Slow down - too many messages' });
    const room = dmRoom(u.id, other.id);
    const msg = makeMessage(room, u, body);
    store.addMessage(room, msg);
    io.to('u:' + u.id).to('u:' + other.id).emit('message:new', msg);
    ack({ ok: true });
  });

  // ---- moderator locks / unlocks a group ----
  socket.on('group:lock', ({ groupId, locked } = {}, ack = () => {}) => {
    const u = me();
    const g = store.getGroup(groupId);
    if (!g || !policy.canModerate(u, g)) return ack({ ok: false, error: 'Only moderators can lock a group' });
    g.locked = Boolean(locked);
    store.save();
    const notice = makeMessage('g:' + g.id, { id: 'system', name: 'System', role: 'system' }, g.locked ? `${u.name} locked this group. Only moderators can post.` : `${u.name} unlocked this group.`);
    store.addMessage(notice.room, notice);
    io.to(notice.room).emit('message:new', notice);
    syncAllSockets();
    ack({ ok: true });
  });

  // ---- typing indicator (only to people allowed in that room) ----
  socket.on('typing', ({ room } = {}) => {
    if (typeof room !== 'string' || !socket.rooms.has(room.startsWith('dm:') ? 'u:' + me().id : room)) return;
    if (room.startsWith('dm:')) {
      const otherId = room.slice(3).split('_').find((i) => i !== me().id);
      socket.to('u:' + otherId).volatile.emit('typing', { room, name: me().name });
    } else {
      socket.to(room).volatile.emit('typing', { room, name: me().name });
    }
  });

  socket.on('disconnect', () => {
    onlineCount.set(user.id, Math.max(0, (onlineCount.get(user.id) || 1) - 1));
    broadcastPresence();
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => console.log(`CUI Connect (Project A) running on http://localhost:${PORT}`));
}
module.exports = { server, io };
