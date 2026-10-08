// policy.js
// ---------------------------------------------------------------
// All "who can talk to whom" rules of the system live in THIS file.
// Nothing else in the project decides permissions, so in the viva
// you can say: "boundaries are enforced in one place, on the server".
//
// A group has three rule objects ("specs"):
//   audience   -> who can see / read the group
//   posters    -> who can write in the group
//   moderators -> who can lock the group
//
// A spec looks like:
//   { everyone: true }
//   { roles: ['faculty'], departments: ['CS'], course: 'CSC102' }
//   { users: ['u5', 'u7'] }          <- explicit invite list
// All the criteria inside a spec must match (AND), but a user whose
// id is in spec.users always gets in (invite override).
// ---------------------------------------------------------------

function matches(user, spec) {
  if (!spec) return false;
  if (user.role === 'admin') return true; // admin office can see everything

  if (spec.users && spec.users.includes(user.id)) return true;

  const hasCriteria = spec.roles || spec.departments || spec.course;
  if (!hasCriteria) return Boolean(spec.everyone);

  if (spec.roles && !spec.roles.includes(user.role)) return false;
  if (spec.departments && !spec.departments.includes(user.department)) return false;
  if (spec.course && !(user.courses || []).includes(spec.course)) return false;
  return true;
}

const canRead = (user, group) => matches(user, group.audience);

const canModerate = (user, group) =>
  canRead(user, group) && (user.role === 'admin' || matches(user, group.moderators));

function canPost(user, group) {
  if (!canRead(user, group)) return false;
  if (!matches(user, group.posters)) return false;
  // a locked group (e.g. during a lecture or exam) is writable only by moderators
  if (group.locked && !canModerate(user, group)) return false;
  return true;
}

// ---------------- private (one-to-one) messages ----------------
// admin      -> anybody
// staff      -> anybody (offices such as Exam Cell must reach everyone)
// anybody    -> staff / admin
// student <-> faculty      only if they share a course (you can only
//                          message teachers who actually teach you)
// student <-> student      only inside the same department
// faculty <-> faculty      same department, or when one of them is HOD
// hod <-> own department   faculty and students of that department
function canDM(a, b) {
  if (a.id === b.id) return false;
  if (a.role === 'admin' || b.role === 'admin') return true;
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

module.exports = { matches, canRead, canPost, canModerate, canDM };
