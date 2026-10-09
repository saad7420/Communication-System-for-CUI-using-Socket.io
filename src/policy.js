// policy.js
// ---------------------------------------------------------------
// All "who can do what" rules of the system live in THIS file.
// Nothing else in the project decides permissions, so in the viva
// you can say: "boundaries are enforced in one place, on the server".
//
// ROLES (highest -> lowest)
//   superadmin  Owns the system. Creates/demotes admins, disables
//               accounts, reads the audit log and system statistics.
//   admin       Admin office. Manages users, courses and groups.
//   hod         Head of department. Moderates the department.
//   faculty     Teacher. Moderates own courses, appoints class reps.
//   staff       Offices such as the Exam Cell (can reach everyone).
//   student     Normal student. A student can ALSO be a Class
//               Representative (CR / head student) of a course:
//               user.repOf = ['CSC102'].
//
// A group has three rule objects ("specs"):
//   audience   -> who can see / read the group
//   posters    -> who can write in the group
//   moderators -> who can lock the group
// and a few switches:
//   locked     -> only moderators may write (lecture / exam time)
//   mode       -> 'open' | 'announce'. In announce mode only moderators
//                 and the Class Representatives of the course may post.
//
// A spec looks like:
//   { everyone: true }
//   { roles: ['faculty'], departments: ['CS'], course: 'CSC102' }
//   { users: ['u5', 'u7'] }          <- explicit invite list
// All the criteria inside a spec must match (AND), but a user whose
// id is in spec.users always gets in (invite override).
// ---------------------------------------------------------------

const isSuperAdmin = (user) => user.role === 'superadmin';
const isAdmin = (user) => user.role === 'admin' || user.role === 'superadmin';

function matches(user, spec) {
  if (!spec) return false;
  if (isAdmin(user)) return true; // admin office and super admin can see everything

  if (spec.users && spec.users.includes(user.id)) return true;

  const hasCriteria = spec.roles || spec.departments || spec.course;
  if (!hasCriteria) return Boolean(spec.everyone);

  if (spec.roles && !spec.roles.includes(user.role)) return false;
  if (spec.departments && !spec.departments.includes(user.department)) return false;
  if (spec.course && !(user.courses || []).includes(spec.course)) return false;
  return true;
}

// ---------------- class representative (head student) ----------------
// A CR is a student who was appointed by the teacher / admin for one course.
const isRepOf = (user, course) =>
  user.role === 'student' && Boolean(course) && (user.repOf || []).includes(course);

// the course a group belongs to (only class groups have one)
const groupCourse = (group) => (group.audience && group.audience.course) || null;

const isGroupRep = (user, group) => isRepOf(user, groupCourse(group));

// ---------------- groups ----------------
const canRead = (user, group) => matches(user, group.audience);

const canModerate = (user, group) =>
  canRead(user, group) && (isAdmin(user) || matches(user, group.moderators));

function canPost(user, group) {
  if (!canRead(user, group)) return false;
  if (!matches(user, group.posters)) return false;
  const mod = canModerate(user, group);
  // a locked group (e.g. during a lecture or exam) is writable only by moderators
  if (group.locked && !mod) return false;
  // announce mode: moderators + this course's Class Representatives only
  if (group.mode === 'announce' && !mod && !isGroupRep(user, group)) return false;
  return true;
}

// pin a message: moderators and the CR of the course
const canPin = (user, group) =>
  canRead(user, group) && (canModerate(user, group) || isGroupRep(user, group));

// delete someone's message: moderators only (a CR cannot delete)
const canDeleteMessages = (user, group) => canModerate(user, group);

// switch announce/open mode: moderators only
const canSetMode = (user, group) => canModerate(user, group);

// ---------------- user management ----------------
// Who may create a user of a given role?
//   superadmin -> any role (including admin)
//   admin      -> student, faculty, hod, staff   (NOT admin / superadmin)
function canCreateRole(actor, role) {
  if (isSuperAdmin(actor)) return ['student', 'faculty', 'hod', 'staff', 'admin', 'superadmin'].includes(role);
  if (actor.role === 'admin') return ['student', 'faculty', 'hod', 'staff'].includes(role);
  return false;
}

// Who may change / disable the account of `target`?
//   superadmin -> anybody except himself
//   admin      -> only non-admin accounts
function canManageUser(actor, target) {
  if (actor.id === target.id) return false;
  if (isSuperAdmin(actor)) return true;
  if (actor.role === 'admin') return !isAdmin(target);
  return false;
}

// Appoint / remove a Class Representative for `course`
//   admin / superadmin -> any student enrolled in the course
//   faculty            -> students enrolled in a course HE/SHE teaches
function canAssignRep(actor, student, course) {
  if (student.role !== 'student') return false;
  if (!(student.courses || []).includes(course)) return false; // must be enrolled
  if (isAdmin(actor)) return true;
  return actor.role === 'faculty' && (actor.courses || []).includes(course);
}

// ---------------- private (one-to-one) messages ----------------
// admin / superadmin -> anybody
// staff      -> anybody (offices such as Exam Cell must reach everyone)
// anybody    -> staff / admin
// student <-> faculty      only if they share a course (you can only
//                          message teachers who actually teach you)
// student <-> student      only inside the same department
// faculty <-> faculty      same department
// hod <-> own department   faculty and students of that department
function canDM(a, b) {
  if (a.id === b.id) return false;
  if (isAdmin(a) || isAdmin(b)) return true;
  if (a.role === 'staff' || b.role === 'staff') return true;

  const pair = [a.role, b.role].sort().join('+');
  const sameDept = a.department === b.department;
  const shareCourse = (a.courses || []).some((c) => (b.courses || []).includes(c));

  switch (pair) {
    case 'faculty+student':
      return shareCourse;
    case 'student+student':
      return sameDept;
    case 'faculty+faculty':
      return sameDept;
    case 'hod+hod':
      return true;
    default:
      // hod with faculty/student: only inside own department
      if (a.role === 'hod' || b.role === 'hod') return sameDept;
      return false;
  }
}

module.exports = {
  matches, canRead, canPost, canModerate, canDM,
  isSuperAdmin, isAdmin, isRepOf, isGroupRep,
  canPin, canDeleteMessages, canSetMode,
  canCreateRole, canManageUser, canAssignRep,
};
