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
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------- sessions -------------------------
// login gives a random token; we remember token -> userId in memory.
const sessions = new Map();

function publicUser(u) {
  return {
    id: u.id, name: u.name, username: u.username, role: u.role, department: u.department,
    semester: u.semester, courses: u.courses, repOf: u.repOf || [], disabled: Boolean(u.disabled),
  };
}

// end every login session of a user (used when disabled / deleted / role changed)
function killSessions(userId) {
  for (const [token, id] of sessions) if (id === userId) sessions.delete(token);
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
  if (user.disabled) return res.status(403).json({ error: 'This account has been disabled. Contact the admin office.' });
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
    mode: g.mode || 'open',
    canPost: policy.canPost(user, g),
    canModerate: policy.canModerate(user, g),
    canPin: policy.canPin(user, g),
    members: store.db.users.filter((u) => !u.disabled && policy.canRead(u, g)).length,
  };
}

function snapshot(user) {
  return {
    me: publicUser(user),
    groups: store.db.groups.filter((g) => policy.canRead(user, g)).map((g) => groupView(g, user)),
    contacts: store.db.users
      .filter((u) => !u.disabled && policy.canDM(user, u))
      .map((u) => ({ ...publicUser(u), online: isOnline(u.id) })),
  };
}

const dmRoom = (a, b) => 'dm:' + [a, b].sort().join('_');

// Re-check every connected socket: join rooms they are now allowed in,
// leave rooms they lost, and send a fresh snapshot to the browser.
function syncAllSockets() {
  for (const socket of io.sockets.sockets.values()) {
    const user = store.getUser(socket.data.userId);
    if (!user || user.disabled) { socket.disconnect(true); continue; }
    for (const g of store.db.groups) {
      if (policy.canRead(user, g)) socket.join('g:' + g.id);
      else socket.leave('g:' + g.id);
    }
    socket.emit('snapshot', snapshot(user));
  }
}

// ------------------------- admin / management REST -------------------------
const ROLES = ['student', 'faculty', 'hod', 'staff', 'admin', 'superadmin'];

// small guards used by the routes below (the real rules are in policy.js)
const adminOnly = (req, res, next) =>
  policy.isAdmin(req.user) ? next() : res.status(403).json({ error: 'Admin only' });
const superOnly = (req, res, next) =>
  policy.isSuperAdmin(req.user) ? next() : res.status(403).json({ error: 'Super admin only' });

app.get('/api/admin/users', restAuth, adminOnly, (req, res) => {
  res.json(store.db.users.map(publicUser));
});

app.post('/api/admin/users', restAuth, adminOnly, (req, res) => {
  const { name, username, password, role, department, semester, courses } = req.body || {};
  if (!name || !username || !password || !ROLES.includes(role) || !department) {
    return res.status(400).json({ error: 'name, username, password, role and department are required' });
  }
  // only the super admin can create admins / other super admins
  if (!policy.canCreateRole(req.user, role)) return res.status(403).json({ error: 'You are not allowed to create a ' + role });
  if (store.getUserByUsername(username)) return res.status(409).json({ error: 'Username already exists' });
  store.audit(req.user, 'user.create', `${String(username).trim()} (${role})`);
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
app.patch('/api/admin/users/:id/courses', restAuth, adminOnly, (req, res) => {
  const target = store.getUser(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  const courses = Array.isArray(req.body.courses) ? req.body.courses : [];
  target.courses = courses.map((c) => String(c).trim()).filter(Boolean);
  // a student who is no longer enrolled cannot stay Class Representative
  target.repOf = (target.repOf || []).filter((c) => target.courses.includes(c));
  store.audit(req.user, 'user.courses', `${target.username}: ${target.courses.join(', ') || '(none)'}`);
  store.save();
  syncAllSockets();
  res.json(publicUser(target));
});

// ---- SUPER ADMIN: change the role of a user (promote / demote admins) ----
app.patch('/api/admin/users/:id/role', restAuth, superOnly, (req, res) => {
  const target = store.getUser(req.params.id);
  const { role } = req.body || {};
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' });
  if (!policy.canManageUser(req.user, target)) return res.status(403).json({ error: 'You cannot change your own role' });
  const old = target.role;
  target.role = role;
  if (role !== 'student') target.repOf = [];
  store.audit(req.user, 'user.role', `${target.username}: ${old} -> ${role}`);
  store.save();
  syncAllSockets();
  res.json(publicUser(target));
});

// ---- ADMIN / SUPER ADMIN: disable or enable an account ----
app.patch('/api/admin/users/:id/status', restAuth, adminOnly, (req, res) => {
  const target = store.getUser(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!policy.canManageUser(req.user, target)) return res.status(403).json({ error: 'You cannot change this account' });
  target.disabled = Boolean((req.body || {}).disabled);
  if (target.disabled) killSessions(target.id);
  store.audit(req.user, target.disabled ? 'user.disable' : 'user.enable', target.username);
  store.save();
  syncAllSockets(); // disconnects the user's open sockets if disabled
  broadcastPresence();
  res.json(publicUser(target));
});

// ---- SUPER ADMIN: delete an account for good ----
app.delete('/api/admin/users/:id', restAuth, superOnly, (req, res) => {
  const target = store.getUser(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!policy.canManageUser(req.user, target)) return res.status(403).json({ error: 'You cannot delete yourself' });
  killSessions(target.id);
  store.db.users = store.db.users.filter((u) => u.id !== target.id);
  store.audit(req.user, 'user.delete', target.username);
  store.save();
  syncAllSockets();
  res.json({ ok: true });
});

// ---- TEACHER / ADMIN: appoint or remove a Class Representative (head student) ----
// body: { course: 'CSC102', rep: true | false }
app.patch('/api/admin/users/:id/rep', restAuth, (req, res) => {
  const target = store.getUser(req.params.id);
  const { course, rep } = req.body || {};
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!policy.canAssignRep(req.user, target, String(course || ''))) {
    return res.status(403).json({ error: 'You can only appoint a CR (an enrolled student) for a course you teach' });
  }
  const set = new Set(target.repOf || []);
  if (rep) set.add(course); else set.delete(course);
  target.repOf = [...set];
  store.audit(req.user, rep ? 'rep.appoint' : 'rep.remove', `${target.username} for ${course}`);
  store.save();
  syncAllSockets();
  res.json(publicUser(target));
});

// ---- find a user by username (teachers need this to pick a student for CR) ----
app.get('/api/lookup/:username', restAuth, (req, res) => {
  if (!policy.isAdmin(req.user) && req.user.role !== 'faculty') return res.status(403).json({ error: 'Not allowed' });
  const u = store.getUserByUsername(req.params.username);
  if (!u) return res.status(404).json({ error: 'No such user' });
  res.json(publicUser(u));
});

// ---- SUPER ADMIN: audit log and system statistics ----
app.get('/api/admin/audit', restAuth, superOnly, (req, res) => {
  res.json((store.db.audit || []).slice(-100).reverse());
});

app.get('/api/admin/stats', restAuth, superOnly, (req, res) => {
  const byRole = {};
  for (const u of store.db.users) byRole[u.role] = (byRole[u.role] || 0) + 1;
  const messages = Object.values(store.db.messages).reduce((n, list) => n + list.length, 0);
  res.json({
    users: store.db.users.length,
    byRole,
    disabled: store.db.users.filter((u) => u.disabled).length,
    groups: store.db.groups.length,
    lockedGroups: store.db.groups.filter((g) => g.locked).length,
    messages,
    onlineNow: [...onlineCount.keys()].filter(isOnline).length,
  });
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
  } else if (!policy.isAdmin(creator)) {
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
  store.audit(req.user, 'group.create', g.name);
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

app.delete('/api/admin/groups/:id', restAuth, adminOnly, (req, res) => {
  const old = store.getGroup(req.params.id);
  if (!old) return res.status(404).json({ error: 'Group not found' });
  store.audit(req.user, 'group.delete', old.name);
  store.db.groups = store.db.groups.filter((g) => g.id !== req.params.id);
  store.save();
  syncAllSockets();
  res.json({ ok: true });
});

// ------------------------- Socket.IO -------------------------
// Handshake check: no valid token, no connection at all.
io.use((socket, next) => {
  const userId = sessions.get(socket.handshake.auth && socket.handshake.auth.token);
  const u = userId && store.getUser(userId);
  if (!u || u.disabled) return next(new Error('Not authenticated'));
  socket.data.userId = userId;
  next();
});

const MAX_TEXT = 1000;
// flood control: at most 5 messages per 3 seconds per USER
// (keyed by user id, so opening many tabs does not give extra allowance)
const sentLog = new Map(); // userId -> [timestamps]
function tooFast(socket) {
  const now = Date.now();
  const id = socket.data.userId;
  const recent = (sentLog.get(id) || []).filter((t) => now - t < 3000);
  if (recent.length >= 5) { sentLog.set(id, recent); return true; }
  recent.push(now);
  sentLog.set(id, recent);
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
    // rep = this sender is the Class Representative of the group's course
    from: { id: user.id, name: user.name, role: user.role, rep: policy.isGroupRep(user, room.startsWith('g:') ? (store.getGroup(room.slice(2)) || {}) : {}) },
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
    store.audit(u, g.locked ? 'group.lock' : 'group.unlock', g.name);
    store.save();
    const notice = makeMessage('g:' + g.id, { id: 'system', name: 'System', role: 'system' }, g.locked ? `${u.name} locked this group. Only moderators can post.` : `${u.name} unlocked this group.`);
    store.addMessage(notice.room, notice);
    io.to(notice.room).emit('message:new', notice);
    syncAllSockets();
    ack({ ok: true });
  });

  // ---- moderator switches a group between 'open' and 'announce' mode ----
  // announce mode: only moderators (teacher / HOD / admin) and the Class
  // Representatives of the course may post. Everybody else can only read.
  socket.on('group:mode', ({ groupId, mode } = {}, ack = () => {}) => {
    const u = me();
    const g = store.getGroup(groupId);
    if (!g || !policy.canSetMode(u, g)) return ack({ ok: false, error: 'Only moderators can change the group mode' });
    if (!['open', 'announce'].includes(mode)) return ack({ ok: false, error: 'Unknown mode' });
    g.mode = mode;
    store.audit(u, 'group.mode', `${g.name}: ${mode}`);
    const notice = makeMessage('g:' + g.id, { id: 'system', name: 'System', role: 'system' },
      mode === 'announce' ? `${u.name} switched this group to ANNOUNCEMENT mode. Only teachers and class representatives can post.` : `${u.name} switched this group back to open chat.`);
    store.addMessage(notice.room, notice);
    io.to(notice.room).emit('message:new', notice);
    syncAllSockets();
    ack({ ok: true });
  });

  // ---- pin / unpin a message (moderators and the course's CR) ----
  socket.on('message:pin', ({ groupId, messageId, pinned } = {}, ack = () => {}) => {
    const u = me();
    const g = store.getGroup(groupId);
    if (!g || !policy.canPin(u, g)) return ack({ ok: false, error: 'You cannot pin messages here' });
    const room = 'g:' + g.id;
    const msg = (store.db.messages[room] || []).find((m) => m.id === messageId);
    if (!msg || msg.from.role === 'system') return ack({ ok: false, error: 'Message not found' });
    msg.pinned = Boolean(pinned);
    store.save();
    io.to(room).emit('message:updated', msg);
    ack({ ok: true });
  });

  // ---- delete a message (moderators only; a CR cannot delete) ----
  socket.on('message:delete', ({ groupId, messageId } = {}, ack = () => {}) => {
    const u = me();
    const g = store.getGroup(groupId);
    if (!g || !policy.canDeleteMessages(u, g)) return ack({ ok: false, error: 'Only moderators can delete messages' });
    const room = 'g:' + g.id;
    const list = store.db.messages[room] || [];
    const msg = list.find((m) => m.id === messageId);
    if (!msg) return ack({ ok: false, error: 'Message not found' });
    store.db.messages[room] = list.filter((m) => m.id !== messageId);
    store.audit(u, 'message.delete', `in ${g.name}, from ${msg.from.name}`);
    io.to(room).emit('message:deleted', { room, id: messageId });
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
  server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
}
module.exports = { server, io };
