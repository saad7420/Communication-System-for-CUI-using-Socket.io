// test/smoke.js - automatic checks of every boundary (npm test)
// Starts the real server on a random port with a throw-away data folder,
// then talks to it exactly like a browser would (REST + Socket.IO).
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.CUI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cui-test-'));

const { io: connect } = require('socket.io-client');
const { server } = require('../server');
const policy = require('../src/policy');
const store = require('../src/store');

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

let base;
async function call(method, url, token, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  return { status: res.status, data };
}
async function login(username) {
  const r = await call('POST', '/api/login', null, { username, password: 'cui123' });
  return r.status === 200 ? r.data.token : null;
}
function open(token) {
  return new Promise((resolve, reject) => {
    const s = connect(base, { auth: { token }, transports: ['websocket'], forceNew: true });
    s.once('snapshot', (snap) => resolve({ s, snap }));
    s.once('connect_error', reject);
  });
}
const emit = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const gid = (snap, name) => snap.groups.find((g) => g.name.startsWith(name)).id;

(async () => {
  await new Promise((r) => server.listen(0, r));
  base = 'http://localhost:' + server.address().port;

  const T = {};
  for (const u of ['superadmin', 'admin', 'hod.cs', 'ali.khan', 'sara.noor', 'fa23-bcs-001', 'fa23-bcs-002', 'fa23-bee-010', 'examcell']) T[u] = await login(u);

  console.log('\nPolicy (pure functions)');
  const U = (name) => store.getUserByUsername(name);
  check('super admin passes every rule', policy.canRead(U('superadmin'), store.db.groups[3]));
  check('student cannot post in announcements', !policy.canPost(U('fa23-bcs-002'), store.db.groups[0]));
  check('only super admin may create an admin', policy.canCreateRole(U('superadmin'), 'admin') && !policy.canCreateRole(U('admin'), 'admin'));
  check('admin cannot manage another admin', !policy.canManageUser(U('admin'), U('superadmin')));
  check('teacher can appoint CR only in own course', policy.canAssignRep(U('ali.khan'), U('fa23-bcs-002'), 'CSC102') && !policy.canAssignRep(U('sara.noor'), U('fa23-bcs-002'), 'CSC102'));
  check('student cannot appoint a CR', !policy.canAssignRep(U('fa23-bcs-001'), U('fa23-bcs-002'), 'CSC102'));

  console.log('\nLogin and REST');
  check('all demo accounts can log in', Object.values(T).every(Boolean));
  check('wrong password is rejected (401)', (await call('POST', '/api/login', null, { username: 'admin', password: 'x' })).status === 401);
  check('no token -> 401', (await call('GET', '/api/admin/users')).status === 401);
  check('student cannot list users (403)', (await call('GET', '/api/admin/users', T['fa23-bcs-001'])).status === 403);
  check('teacher cannot list users (403)', (await call('GET', '/api/admin/users', T['ali.khan'])).status === 403);
  check('admin can list users', (await call('GET', '/api/admin/users', T.admin)).status === 200);

  const newUser = { name: 'New Admin', username: 'new.admin', password: 'pw', role: 'admin', department: 'Administration' };
  check('admin cannot create another admin (403)', (await call('POST', '/api/admin/users', T.admin, newUser)).status === 403);
  check('super admin creates an admin (200)', (await call('POST', '/api/admin/users', T.superadmin, newUser)).status === 200);
  check('duplicate username -> 409', (await call('POST', '/api/admin/users', T.superadmin, newUser)).status === 409);
  check('admin creates a student (200)', (await call('POST', '/api/admin/users', T.admin, { name: 'Temp Student', username: 'temp.s', password: 'pw', role: 'student', department: 'CS', courses: 'CSC102' })).status === 200);

  const temp = store.getUserByUsername('temp.s');
  check('admin cannot change roles (403)', (await call('PATCH', `/api/admin/users/${temp.id}/role`, T.admin, { role: 'faculty' })).status === 403);
  check('super admin changes a role', (await call('PATCH', `/api/admin/users/${temp.id}/role`, T.superadmin, { role: 'staff' })).status === 200 && temp.role === 'staff');
  const sa = store.getUserByUsername('superadmin');
  check('super admin cannot demote himself (403)', (await call('PATCH', `/api/admin/users/${sa.id}/role`, T.superadmin, { role: 'student' })).status === 403);

  check('admin cannot disable the super admin (403)', (await call('PATCH', `/api/admin/users/${sa.id}/status`, T.admin, { disabled: true })).status === 403);
  check('admin disables a student', (await call('PATCH', `/api/admin/users/${temp.id}/status`, T.admin, { disabled: true })).status === 200);
  check('disabled account cannot log in (403)', (await call('POST', '/api/login', null, { username: 'temp.s', password: 'pw' })).status === 403);
  check('only super admin can delete (admin gets 403)', (await call('DELETE', `/api/admin/users/${temp.id}`, T.admin)).status === 403);
  check('super admin deletes the account', (await call('DELETE', `/api/admin/users/${temp.id}`, T.superadmin)).status === 200 && !store.getUser(temp.id));

  const audit = await call('GET', '/api/admin/audit', T.superadmin);
  check('super admin reads the audit log', audit.status === 200 && audit.data.length > 3);
  check('admin cannot read the audit log (403)', (await call('GET', '/api/admin/audit', T.admin)).status === 403);
  check('super admin reads statistics', (await call('GET', '/api/admin/stats', T.superadmin)).data.users >= 9);

  console.log('\nClass representative (head student)');
  const hina = store.getUserByUsername('fa23-bcs-002');
  check('teacher can look a student up', (await call('GET', '/api/lookup/fa23-bcs-002', T['ali.khan'])).status === 200);
  check('student cannot use lookup (403)', (await call('GET', '/api/lookup/admin', T['fa23-bcs-001'])).status === 403);
  check('other department teacher cannot appoint CR (403)', (await call('PATCH', `/api/admin/users/${hina.id}/rep`, T['sara.noor'], { course: 'CSC102', rep: true })).status === 403);
  check('student cannot appoint CR (403)', (await call('PATCH', `/api/admin/users/${hina.id}/rep`, T['fa23-bcs-001'], { course: 'CSC102', rep: true })).status === 403);
  check('cannot appoint a CR for a course the student is not in (403)', (await call('PATCH', `/api/admin/users/${hina.id}/rep`, T.admin, { course: 'CSC241', rep: true })).status === 403);

  console.log('\nSocket.IO');
  const bad = await new Promise((r) => { const s = connect(base, { auth: { token: 'nope' }, transports: ['websocket'], forceNew: true }); s.once('connect_error', (e) => { s.close(); r(e.message); }); });
  check('socket without valid token is refused', bad === 'Not authenticated');

  const ahmed = await open(T['fa23-bcs-001']); // CR of CSC102
  const hinaS = await open(T['fa23-bcs-002']); // normal student
  const ali = await open(T['ali.khan']);       // teacher
  const g102 = gid(ahmed.snap, 'CSC102');
  const gAnn = gid(ahmed.snap, 'COMSATS');

  check('student cannot post in announcements', (await emit(hinaS.s, 'message:send', { groupId: gAnn, text: 'hi' })).ok === false);
  check('student cannot read a group of another course', !hinaS.snap.groups.some((g) => g.name.startsWith('EEE101')));
  check('student posts in an open class group', (await emit(hinaS.s, 'message:send', { groupId: g102, text: 'hello class' })).ok === true);

  console.log('\nAnnouncement mode');
  check('student cannot switch the mode', (await emit(hinaS.s, 'group:mode', { groupId: g102, mode: 'announce' })).ok === false);
  check('CR cannot switch the mode', (await emit(ahmed.s, 'group:mode', { groupId: g102, mode: 'announce' })).ok === false);
  check('teacher switches to announcement mode', (await emit(ali.s, 'group:mode', { groupId: g102, mode: 'announce' })).ok === true);
  await wait(150);
  check('normal student is now blocked', (await emit(hinaS.s, 'message:send', { groupId: g102, text: 'chat?' })).ok === false);
  check('CR can still post', (await emit(ahmed.s, 'message:send', { groupId: g102, text: 'Quiz on Monday!' })).ok === true);
  check('teacher can post', (await emit(ali.s, 'message:send', { groupId: g102, text: 'Bring your books' })).ok === true);

  const hist = await emit(ali.s, 'history', { room: 'g:' + g102 });
  const crMsg = hist.messages.find((m) => m.text === 'Quiz on Monday!');
  check('CR message is tagged as CR', crMsg && crMsg.from.rep === true);
  const stuMsg = hist.messages.find((m) => m.text === 'hello class');

  console.log('\nPin and delete');
  check('normal student cannot pin', (await emit(hinaS.s, 'message:pin', { groupId: g102, messageId: crMsg.id, pinned: true })).ok === false);
  check('CR can pin', (await emit(ahmed.s, 'message:pin', { groupId: g102, messageId: crMsg.id, pinned: true })).ok === true);
  check('CR cannot delete', (await emit(ahmed.s, 'message:delete', { groupId: g102, messageId: stuMsg.id })).ok === false);
  check('teacher can delete', (await emit(ali.s, 'message:delete', { groupId: g102, messageId: stuMsg.id })).ok === true);
  const hist2 = await emit(ali.s, 'history', { room: 'g:' + g102 });
  check('deleted message is gone, pinned flag kept', !hist2.messages.some((m) => m.id === stuMsg.id) && hist2.messages.find((m) => m.id === crMsg.id).pinned === true);

  console.log('\nLock, history, DM, flood');
  check('teacher switches back to open chat', (await emit(ali.s, 'group:mode', { groupId: g102, mode: 'open' })).ok === true);
  check('teacher locks the group', (await emit(ali.s, 'group:lock', { groupId: g102, locked: true })).ok === true);
  check('CR cannot post in a LOCKED group', (await emit(ahmed.s, 'message:send', { groupId: g102, text: 'x' })).ok === false);
  check('teacher unlocks', (await emit(ali.s, 'group:lock', { groupId: g102, locked: false })).ok === true);
  check('student cannot read history of a foreign group', (await emit(hinaS.s, 'history', { room: 'g:' + store.db.groups.find((g) => g.name.startsWith('EEE101')).id })).ok === false);
  check('student may DM own teacher', (await emit(hinaS.s, 'dm:send', { toUserId: store.getUserByUsername('ali.khan').id, text: 'sir?' })).ok === true);
  check('student cannot DM teacher of another course', (await emit(hinaS.s, 'dm:send', { toUserId: store.getUserByUsername('sara.noor').id, text: 'x' })).ok === false);

  let blocked = 0;
  for (let i = 0; i < 8; i++) if ((await emit(ahmed.s, 'dm:send', { toUserId: hina.id, text: 'spam ' + i })).ok === false) blocked++;
  check('flood control blocks fast senders', blocked > 0);

  console.log('\nDisabling kicks a live user out');
  const bilal = await open(T['fa23-bee-010']);
  const dropped = new Promise((r) => bilal.s.once('disconnect', () => r(true)));
  const bilalUser = store.getUserByUsername('fa23-bee-010');
  await call('PATCH', `/api/admin/users/${bilalUser.id}/status`, T.admin, { disabled: true });
  check('disabled user is disconnected immediately', await Promise.race([dropped, wait(1500).then(() => false)]));

  [ahmed, hinaS, ali].forEach((x) => x.s.close());
  console.log(`\n${passed} passed, ${failed} failed`);
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
