// Smoke test: starts the server on a temp port/data folder and checks the
// communication boundaries with real socket clients.
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.CUI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cui-a-'));
const { io: Client } = require('socket.io-client');
const { server } = require('../server');

let passed = 0;
let failed = 0;
const check = (name, cond) => {
  if (cond) { passed++; console.log('  PASS', name); } else { failed++; console.log('  FAIL', name); }
};

async function login(base, username) {
  const r = await fetch(base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'cui123' }),
  });
  return (await r.json()).token;
}
const connect = (base, token) =>
  new Promise((resolve, reject) => {
    const s = Client(base, { auth: { token } });
    s.once('snapshot', (snap) => { s.snap = snap; resolve(s); });
    s.once('connect_error', reject);
  });
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const gid = (s, name) => s.snap.groups.find((g) => g.name.startsWith(name))?.id;

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const T = {};
  for (const u of ['admin', 'ali.khan', 'fa23-bcs-001', 'fa23-bcs-002', 'fa23-bee-010', 'hod.cs']) {
    T[u] = await connect(base, await login(base, u));
  }

  console.log('Authentication');
  let rejected = false;
  try { await connect(base, 'bad-token'); } catch { rejected = true; }
  check('socket with a bad token is refused', rejected);

  console.log('Group visibility');
  check('CS student does NOT see EEE101 group', !gid(T['fa23-bcs-001'], 'EEE101'));
  check('EE student sees EEE101 group', !!gid(T['fa23-bee-010'], 'EEE101'));
  check('EE student does NOT see CS notices', !gid(T['fa23-bee-010'], 'CS Department'));
  check('student does not see Faculty Lounge', !gid(T['fa23-bcs-001'], 'Faculty Lounge'));
  check('faculty sees Faculty Lounge', !!gid(T['ali.khan'], 'Faculty Lounge'));

  console.log('Posting rights');
  const ann = gid(T['admin'], 'COMSATS Announcements');
  let r = await emit(T['fa23-bcs-001'], 'message:send', { groupId: ann, text: 'hello' });
  check('student cannot post in announcements', r.ok === false);
  const got = new Promise((res) => T['fa23-bcs-001'].once('message:new', res));
  r = await emit(T['admin'], 'message:send', { groupId: ann, text: 'Eid holidays notice' });
  check('admin can post in announcements', r.ok === true);
  check('student receives the announcement live', (await got).text === 'Eid holidays notice');

  const csc = gid(T['ali.khan'], 'CSC102');
  r = await emit(T['fa23-bee-010'], 'message:send', { groupId: csc, text: 'let me in' });
  check('EE student cannot post in CSC102 (not a member)', r.ok === false);
  r = await emit(T['fa23-bee-010'], 'history', { room: 'g:' + csc });
  check('EE student cannot read CSC102 history', r.ok === false);

  console.log('Class group + lock');
  const gotFac = new Promise((res) => T['ali.khan'].once('message:new', res));
  r = await emit(T['fa23-bcs-002'], 'message:send', { groupId: csc, text: 'Sir, assignment deadline?' });
  check('CSC102 student can post in class group', r.ok === true);
  check('course teacher receives it', (await gotFac).from.name === 'Hina Fatima');
  r = await emit(T['fa23-bcs-001'], 'group:lock', { groupId: csc, locked: true });
  check('student cannot lock the group', r.ok === false);
  r = await emit(T['ali.khan'], 'group:lock', { groupId: csc, locked: true });
  check('course teacher can lock the group', r.ok === true);
  r = await emit(T['fa23-bcs-002'], 'message:send', { groupId: csc, text: 'still talking' });
  check('student cannot post while locked', r.ok === false);
  r = await emit(T['ali.khan'], 'message:send', { groupId: csc, text: 'Quiz starts now' });
  check('teacher can still post while locked', r.ok === true);
  await emit(T['ali.khan'], 'group:lock', { groupId: csc, locked: false });

  console.log('Private messages');
  const idOf = (name) => T['admin'].snap.contacts.find((c) => c.name === name)?.id;
  const ahmed = idOf('Ahmed Raza');
  const hina = idOf('Hina Fatima');
  const bilal = idOf('Bilal Hussain');
  const sara = idOf('Ms. Sara Noor');
  const ali = idOf('Dr. Ali Khan');
  r = await emit(T['fa23-bcs-001'], 'dm:send', { toUserId: hina, text: 'bro notes?' });
  check('CS student -> CS student allowed', r.ok === true);
  r = await emit(T['fa23-bcs-001'], 'dm:send', { toUserId: bilal, text: 'hi' });
  check('CS student -> EE student blocked', r.ok === false);
  r = await emit(T['fa23-bcs-001'], 'dm:send', { toUserId: ali, text: 'Sir, question' });
  check('student -> own course teacher allowed', r.ok === true);
  r = await emit(T['fa23-bcs-001'], 'dm:send', { toUserId: sara, text: 'hi' });
  check('student -> teacher of another department blocked', r.ok === false);
  r = await emit(T['admin'], 'dm:send', { toUserId: bilal, text: 'Fee challan reminder' });
  check('admin -> anyone allowed', r.ok === true);

  console.log('Admin management (live update)');
  r = await fetch(base + '/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await login(base, 'fa23-bcs-001')) },
    body: JSON.stringify({ name: 'X', username: 'x', password: '1', role: 'admin', department: 'CS' }),
  });
  check('student cannot create an admin user over REST', r.status === 403);

  const adminToken = await login(base, 'admin');
  const gotSnap = new Promise((res) => T['fa23-bee-010'].once('snapshot', res));
  r = await fetch(base + '/api/admin/users/' + bilal + '/courses', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify({ courses: ['EEE101', 'CSC102'] }),
  });
  const snap = await gotSnap;
  check('after enrolment Bilal instantly gets the CSC102 group', snap.groups.some((g) => g.name.startsWith('CSC102')));
  r = await emit(T['fa23-bee-010'], 'message:send', { groupId: csc, text: 'Now I am in' });
  check('...and can post there', r.ok === true);

  console.log('Validation');
  r = await emit(T['fa23-bcs-001'], 'dm:send', { toUserId: hina, text: '   ' });
  check('empty message rejected', r.ok === false);
  r = await emit(T['fa23-bcs-001'], 'dm:send', { toUserId: hina, text: 'x'.repeat(1001) });
  check('1001 character message rejected', r.ok === false);

  console.log(`\n${passed} passed, ${failed} failed`);
  Object.values(T).forEach((s) => s.close());
  server.close();
  await wait(100);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
