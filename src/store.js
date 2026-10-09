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

// Bring an OLD db.json (made before super admin / CR existed) up to date,
// and make sure there is always one super admin who can log in.
function migrate() {
  db.audit = db.audit || [];
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
  audit,
  hashPassword,
  verifyPassword,
  getUser: (id) => db.users.find((u) => u.id === id),
  getUserByUsername: (name) => db.users.find((u) => u.username === String(name).toLowerCase()),
  getGroup: (id) => db.groups.find((g) => g.id === id),
};
