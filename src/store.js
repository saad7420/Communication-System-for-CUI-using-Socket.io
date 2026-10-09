// store.js
// ---------------------------------------------------------------
// A tiny "database": everything is kept in memory and saved to
// data/db.json so the data survives a restart. For a class project
// this keeps the setup at zero (no MongoDB/MySQL to install).
// ---------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.CUI_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const MAX_MESSAGES_PER_ROOM = 300;

// Passwords are never stored as plain text: salt + scrypt hash.
function hashPassword(password, salt = crypto.randomBytes(8).toString('hex')) {
  return salt + ':' + crypto.scryptSync(password, salt, 32).toString('hex');
}
function verifyPassword(password, stored) {
  const salt = stored.split(':')[0];
  const a = Buffer.from(hashPassword(password, salt));
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let db = { counter: 100, users: [], groups: [], messages: {}, audit: [] };

const MAX_AUDIT = 500;
// Audit log: WHO did WHAT and WHEN. Only the super admin / admin can read it.
function audit(actor, action, detail = '') {
  db.audit = db.audit || [];
  db.audit.push({
    id: nextId('a'),
    at: Date.now(),
    actorId: actor ? actor.id : null,
    actor: actor ? `${actor.name} (${actor.role})` : 'system',
    action,
    detail,
  });
  if (db.audit.length > MAX_AUDIT) db.audit.shift();
  save();
}

function nextId(prefix) {
  db.counter += 1;
  return prefix + db.counter;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
  }, 300);
}

function addUser({ name, username, password, role, department, semester = null, courses = [], repOf = [] }) {
  const user = {
    id: nextId('u'),
    name,
    username: username.toLowerCase(),
    passwordHash: hashPassword(password),
    role,
    department,
    semester,
    courses,
    repOf,          // courses this student is Class Representative (CR) of
    disabled: false, // a disabled account cannot log in
  };
  db.users.push(user);
  save();
  return user;
}

function addGroup({ name, type, description = '', audience, posters, moderators, createdBy = null }) {
  const group = {
    id: nextId('g'),
    name,
    type,
    description,
    audience,
    posters,
    moderators,
    locked: false,
    mode: 'open', // 'open' | 'announce' (announce = only moderators + class reps post)
    createdBy,
  };
  db.groups.push(group);
  save();
  return group;
}

function addMessage(room, message) {
  if (!db.messages[room]) db.messages[room] = [];
  db.messages[room].push(message);
  if (db.messages[room].length > MAX_MESSAGES_PER_ROOM) db.messages[room].shift();
  save();
}

// ---------------- demo data for the first start ----------------
function seed() {
  const pw = 'cui123';
  const admin = addUser({ name: 'Admin Office', username: 'admin', password: pw, role: 'admin', department: 'Administration' });
  const hod = addUser({ name: 'Dr. Saima Tariq', username: 'hod.cs', password: pw, role: 'hod', department: 'CS' });
  const ali = addUser({ name: 'Dr. Ali Khan', username: 'ali.khan', password: pw, role: 'faculty', department: 'CS', courses: ['CSC102', 'CSC241'] });
  const sara = addUser({ name: 'Ms. Sara Noor', username: 'sara.noor', password: pw, role: 'faculty', department: 'EE', courses: ['EEE101'] });
  // Ahmed is the Class Representative (head student) of CSC102
  addUser({ name: 'Ahmed Raza', username: 'fa23-bcs-001', password: pw, role: 'student', department: 'CS', semester: 3, courses: ['CSC102', 'CSC241'], repOf: ['CSC102'] });
  addUser({ name: 'Hina Fatima', username: 'fa23-bcs-002', password: pw, role: 'student', department: 'CS', semester: 3, courses: ['CSC102'] });
  addUser({ name: 'Bilal Hussain', username: 'fa23-bee-010', password: pw, role: 'student', department: 'EE', semester: 3, courses: ['EEE101'] });
  const exam = addUser({ name: 'Exam Cell', username: 'examcell', password: pw, role: 'staff', department: 'Administration' });

  addGroup({
    name: 'COMSATS Announcements',
    type: 'announcement',
    description: 'University-wide notices. Only the admin office can post.',
    audience: { everyone: true },
    posters: { roles: ['admin'] },
    moderators: { roles: ['admin'] },
    createdBy: admin.id,
  });
  addGroup({
    name: 'CS Department Notices',
    type: 'department',
    description: 'Notices for the Computer Science department. HOD posts, everybody in CS reads.',
    audience: { departments: ['CS'] },
    posters: { roles: ['hod', 'admin'] },
    moderators: { roles: ['hod'], departments: ['CS'] },
    createdBy: hod.id,
  });
  addGroup({
    name: 'CSC102 - Programming Fundamentals',
    type: 'class',
    description: 'Class group. Students and the course teacher discuss lectures and assignments.',
    audience: { course: 'CSC102' },
    posters: { everyone: true },
    moderators: { roles: ['faculty'], course: 'CSC102' },
    createdBy: ali.id,
  });
  addGroup({
    name: 'CSC241 - Data Structures',
    type: 'class',
    description: 'Class group for Data Structures.',
    audience: { course: 'CSC241' },
    posters: { everyone: true },
    moderators: { roles: ['faculty'], course: 'CSC241' },
    createdBy: ali.id,
  });
  addGroup({
    name: 'EEE101 - Circuit Analysis',
    type: 'class',
    description: 'Class group for Circuit Analysis.',
    audience: { course: 'EEE101' },
    posters: { everyone: true },
    moderators: { roles: ['faculty'], course: 'EEE101' },
    createdBy: sara.id,
  });
  addGroup({
    name: 'Faculty Lounge',
    type: 'faculty',
    description: 'Only teaching staff and HODs.',
    audience: { roles: ['faculty', 'hod'] },
    posters: { everyone: true },
    moderators: { roles: ['hod'] },
    createdBy: admin.id,
  });
  addGroup({
    name: 'Exam Cell Helpdesk',
    type: 'helpdesk',
    description: 'Ask exam-related questions. Everyone can read and write.',
    audience: { everyone: true },
    posters: { everyone: true },
    moderators: { users: [exam.id] },
    createdBy: exam.id,
  });
}

// ---------------- announcements (notice board) ----------------
const ANN_CATEGORIES = ['opportunity', 'policy', 'academic', 'exam', 'event', 'general'];
const ANN_PRIORITIES = ['normal', 'important', 'urgent'];

function addAnnouncement({ title, body, category = 'general', priority = 'normal', audience = { everyone: true },
  link = '', linkLabel = '', deadline = null, pinned = false, author, at = Date.now() }) {
  const a = {
    id: nextId('n'),
    title,
    body,
    category,
    priority,
    audience,
    link,
    linkLabel,
    deadline,           // 'YYYY-MM-DD' or null (apply-by / last date)
    pinned,
    createdBy: author.id,
    author: { name: author.name, role: author.role, department: author.department },
    at,
    updatedAt: at,
    readBy: [],         // user ids that opened it (gives "seen by" for the publisher)
    savedBy: [],        // user ids that bookmarked it
  };
  db.announcements.unshift(a);
  save();
  return a;
}

// ---------------- course requests (tickets to admin) ----------------
const REQ_TYPES = ['add_drop', 'clash', 'section', 'grade', 'enrolment', 'teacher', 'other'];
const REQ_STATUS = ['open', 'in_review', 'resolved', 'rejected'];

function addRequest({ type, course, subject, details, user, at = Date.now() }) {
  db.reqCounter = (db.reqCounter || 1000) + 1;
  const r = {
    id: nextId('r'),
    ref: 'REQ-' + db.reqCounter,
    type,
    course,
    subject,
    details,
    status: 'open',
    createdBy: user.id,
    requester: { name: user.name, username: user.username, role: user.role },
    department: user.department,
    at,
    updatedAt: at,
    thread: [],         // replies + status changes, oldest first
  };
  db.requests.unshift(r);
  save();
  return r;
}

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

// demo notices so the board is not empty on first start (all invented for the demo)
function seedNotices() {
  const byName = (n) => db.users.find((u) => u.username === n);
  const admin = byName('admin') || db.users.find((u) => u.role === 'admin' || u.role === 'superadmin');
  const hod = byName('hod.cs') || admin;
  const exam = byName('examcell') || admin;
  const ago = (h) => Date.now() - h * 60 * 60 * 1000;

  addAnnouncement({
    author: admin, at: ago(240), category: 'general',
    title: 'Library opens until 10 pm during exam weeks',
    body: 'The Junaid Zaidi Library will stay open until 10:00 pm, Monday to Saturday, for the midterm and final exam weeks. Bring your student card; the reading hall on the first floor is reserved for silent study.',
  });
  addAnnouncement({
    author: hod, at: ago(120), category: 'academic', priority: 'important', audience: { departments: ['CS'] },
    deadline: isoDay(12),
    title: 'Final Year Project proposals due',
    body: 'BCS and BSE students in their 7th semester must submit the FYP proposal form, signed by the supervisor, to the department office. Groups of up to three are allowed. Late proposals will move to the next evaluation cycle.',
    link: 'https://islamabad.comsats.edu.pk/', linkLabel: 'Download proposal form',
  });
  addAnnouncement({
    author: admin, at: ago(96), category: 'policy',
    title: 'Attendance rule reminder: 80% to sit the final exam',
    body: 'Students with less than 80% attendance in a course will not be allowed to appear in its final exam. Leave for medical reasons must be submitted to the course teacher within three working days with a valid certificate.',
  });
  addAnnouncement({
    author: admin, at: ago(52), category: 'event',
    deadline: isoDay(9),
    title: 'Career Development Center job fair, Main Auditorium',
    body: 'Software houses, banks and telecom companies are coming to campus to hire final-year students and fresh graduates. Bring printed CVs. Register beforehand so the CDC can share your profile with employers.',
    link: 'https://islamabad.comsats.edu.pk/', linkLabel: 'Register for the fair',
  });
  addAnnouncement({
    author: exam, at: ago(30), category: 'exam', priority: 'important',
    title: 'Midterm date sheet published',
    body: 'The midterm date sheet for all programs is now available. Check your seat number on the notice board outside the Exam Cell one day before each paper. Clashes must be reported through CUI Connect (Requests) within 48 hours.',
  });
  addAnnouncement({
    author: admin, at: ago(20), category: 'opportunity', priority: 'urgent', pinned: true,
    deadline: isoDay(5),
    title: 'Need-based scholarship applications are open',
    body: 'Undergraduate students from the 2nd semester onwards can apply for need-based financial assistance for the current semester. Attach the family income certificate and utility bills. Incomplete applications will not be considered.',
    link: 'https://islamabad.comsats.edu.pk/', linkLabel: 'Apply now',
  });
  addAnnouncement({
    author: admin, at: ago(3), category: 'academic', priority: 'urgent',
    deadline: isoDay(2),
    title: 'Course add / drop window closes this week',
    body: 'Add or drop courses through the student portal before the window closes. After that date, a course can only be withdrawn (W grade). If the portal shows a clash or a missing prerequisite, open a request here and the admin office will fix it.',
  });

  // two demo requests so the admin office has something to look at
  const hina = byName('fa23-bcs-002');
  const ahmed = byName('fa23-bcs-001');
  if (hina) {
    const r = addRequest({ user: hina, at: ago(26), type: 'clash', course: 'CSC241',
      subject: 'CSC241 lab clashes with MTH104 lecture',
      details: 'My CSC241 lab (Thursday 11:30) is at the same time as the MTH104 lecture of section B. Can I move to the Friday lab slot?' });
    r.status = 'in_review';
    r.thread.push({ kind: 'status', status: 'in_review', from: { name: admin.name, role: admin.role }, text: 'Checking free seats in the Friday lab.', at: ago(20) });
    r.updatedAt = ago(20);
  }
  if (ahmed) {
    addRequest({ user: ahmed, at: ago(5), type: 'enrolment', course: 'CSC102',
      subject: 'Two students missing from the CSC102 channel',
      details: 'As CR I noticed fa23-bcs-014 and fa23-bcs-019 are registered in CSC102 on the portal but do not appear in the class channel here.' });
  }
}

// Bring an OLD db.json (made before super admin / CR existed) up to date,
// and make sure there is always one super admin who can log in.
function migrate() {
  db.audit = db.audit || [];
  if (!Array.isArray(db.announcements) || !Array.isArray(db.requests)) {
    db.announcements = db.announcements || [];
    db.requests = db.requests || [];
    if (!db.announcements.length) seedNotices();
  }
  db.users.forEach((u) => {
    u.repOf = u.repOf || [];
    u.disabled = Boolean(u.disabled);
  });
  db.groups.forEach((g) => {
    g.mode = g.mode || 'open';
  });
  if (!db.users.some((u) => u.role === 'superadmin')) {
    addUser({ name: 'Super Admin', username: 'superadmin', password: 'cui123', role: 'superadmin', department: 'Administration' });
  }
}

function load() {
  if (fs.existsSync(FILE)) {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } else {
    seed();
  }
  migrate();
}
load();

module.exports = {
  get db() { return db; },
  nextId,
  save,
  addUser,
  addGroup,
  addMessage,
  addAnnouncement,
  addRequest,
  ANN_CATEGORIES,
  ANN_PRIORITIES,
  REQ_TYPES,
  REQ_STATUS,
  getAnnouncement: (id) => db.announcements.find((a) => a.id === id),
  getRequest: (id) => db.requests.find((r) => r.id === id),
  audit,
  hashPassword,
  verifyPassword,
  getUser: (id) => db.users.find((u) => u.id === id),
  getUserByUsername: (name) => db.users.find((u) => u.username === String(name).toLowerCase()),
  getGroup: (id) => db.groups.find((g) => g.id === id),
};
