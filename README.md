# CUI Connect — Project A
**A Slack-style campus workspace for COMSATS University Islamabad, built on Socket.IO**

Everyone at CUI on one platform: a **notice board** for opportunities, policies and academic updates, **channels** for every course and department, **direct messages** with boundaries, and **course requests** that go straight to the admin office.
Design style: **rule-based (RBAC)** — permissions are *calculated* from who the user is (role, department, course).

---

## 1. Run it

```bash
npm install
npm start          # http://localhost:3000
npm test           # 83 automatic checks of every boundary
```
> The login page lists every demo account; click one to sign in.
> If you still have an old `data/db.json`, just keep it: on start-up the server upgrades it automatically (adds the super admin, class-rep and mode fields). Delete the file to reset to demo data.
Open the site in two different browsers (or one normal + one private window) and log in as two different users to see live chat.

**Demo accounts** (password for all: `cui123`)

| Username | Who | Department | Courses |
|---|---|---|---|
| `superadmin` | **Super Admin** | Administration | – |
| `admin` | Admin Office | Administration | – |
| `hod.cs` | Dr. Saima Tariq (HOD) | CS | – |
| `ali.khan` | Dr. Ali Khan (**Teacher**) | CS | CSC102, CSC241 |
| `sara.noor` | Ms. Sara Noor (Teacher) | EE | EEE101 |
| `fa23-bcs-001` | Ahmed Raza (Student, **Class Rep of CSC102**) | CS | CSC102, CSC241 |
| `fa23-bcs-002` | Hina Fatima (Student) | CS | CSC102 |
| `fa23-bee-010` | Bilal Hussain (Student) | EE | EEE101 |
| `examcell` | Exam Cell (Staff) | Administration | – |

---

## 1b. Roles and what each one can do (NEW)

| Role | Power |
|---|---|
| **Super Admin** | Everything an admin can do, plus: create/promote/demote **admins**, change any role, **disable / delete** accounts, read the **audit log** and **system statistics**. Cannot demote or delete himself. |
| **Admin** | Add students/teachers/HODs/staff, set courses, create/delete groups, disable (not delete) normal accounts, appoint class reps. Cannot touch other admins or the super admin. |
| **HOD** | Creates groups for own department, moderates department groups. |
| **Teacher** (`faculty`) | Creates class groups for own courses, locks them, switches them to **announcement mode**, pins and deletes messages, invites members, **appoints Class Representatives** from students enrolled in his/her course. |
| **Class Representative (CR / head student)** | A normal student appointed for one course. In announcement mode the CR can still post, and can **pin** messages. Cannot lock, delete, or change members. Not allowed to post in a locked group. |
| **Student** | Reads/writes inside own groups; DM rules as before. |
| **Staff** | Offices such as the Exam Cell. |

New group features: **announcement mode** (only teacher + CR post), **pin message**, **delete message** (moderators), **disable account** (kicks the user out of the live socket at once), **audit log** (who did what, when).

Try it: log in as `ali.khan` in one browser and `fa23-bcs-002` in another, open *CSC102*, click **Announcement mode** as the teacher, and watch the student's text box lock live. Then log in as `fa23-bcs-001` (the CR): he can still post and pin.

---

## 1c. What's new in v3 (Slack-style UI, notice board, requests)

### Interface
Slack-style layout: workspace rail on the far left (Notices, Chat, Requests, Manage), a sidebar with Announcements, Requests, **Channels** and **Direct messages**, the main pane in the middle and a details pane on the right. A search bar on top (**Ctrl/Cmd + K**) jumps to any channel, person or notice. Works on phones (the sidebar becomes a drawer). Fonts are bundled in `public/fonts`, so it works without internet.

### Notice board (Announcements page)
| Who | What they can do |
|---|---|
| Admin / Super Admin | Publish to everyone, one department, only students or only teachers. Pin, edit, delete any notice. |
| Staff office (Exam Cell, CDC) | Publish to everyone. |
| HOD | Publish to **own department only**. |
| Teacher / Student | Read, save for later. (Teachers post in their class channel instead.) |

- Six types, each with its own colour: **Opportunity, Academic, Exams, Policy, Event, General**; priority **Normal / Important / Urgent**.
- Optional **last date** (shows a countdown and a "Closing soon" list) and **button link** (e.g. *Apply now*). Only `http(s)` links are accepted.
- The pinned (or urgent) notice is shown as a large card at the top; the rest are grouped *Today / This week / Earlier*.
- Filters: All / Unread / Saved, plus category chips. Unread notices have a dot and a count in the sidebar.
- **Live:** when a notice is published, everyone in its audience gets a pop-up instantly (Socket.IO), and the board refreshes.
- The publisher sees **reach**: "seen by 12 of 340 people".
- The composer shows a **live preview** of how the notice will look.

### Course requests (tickets to the admin office)
- Any student or teacher can report a course problem: add/drop, timetable clash, section change, result/grade, missing from class channel, teacher/class issue, other.
- Each request gets a reference (`REQ-1001`) and a status: **Open → In review → Resolved / Declined**.
- **Admin** sees and handles every request; an **HOD** handles requests from their own department; the student sees only their own.
- Replies and status changes (with an optional note) form a conversation thread, pushed live to both sides.
- A student can have at most 5 active requests (anti-spam); a closed request can't be replied to (open a new one).

### Manage
Tabs instead of one long dialog: **People** (searchable table, add person, change role, disable, delete), **Channels** (create, add/remove members), **Class reps & courses**, **Overview & activity** (super admin: stats + audit log). Each role only sees the tabs it can use.

### New REST endpoints
| Method | URL | Who |
|---|---|---|
| GET | `/api/announcements` | everyone (filtered by audience) |
| POST | `/api/announcements` | admin, staff, HOD (own dept) |
| PATCH / DELETE | `/api/announcements/:id` | publisher or admin |
| POST | `/api/announcements/:id/read`, `/save` | anyone who can see it |
| GET / POST | `/api/requests` | own requests / handlers see more |
| POST | `/api/requests/:id/reply` | requester + handlers |
| PATCH | `/api/requests/:id/status` | admin, HOD of that department |

New socket events (server → client): `board`, `announcement:new`, `requests`.

---

## 2. What real COMSATS problem does it solve?
At the moment, class notices go through WhatsApp groups where *anyone* can post, students can message any teacher at any time, and nobody controls who is in which group. This system gives each type of conversation its own rules:

| Group type | Who can read | Who can write | Example |
|---|---|---|---|
| Announcement | Everyone | Admin office only | COMSATS Announcements |
| Department notices | That department | HOD / admin | CS Department Notices |
| Class group | Students + teacher of that course | Everyone inside | CSC102 – Programming Fundamentals |
| Faculty room | Faculty + HODs | Everyone inside | Faculty Lounge |
| Helpdesk | Everyone | Everyone | Exam Cell Helpdesk |

**Extra realistic features**
- **Lock group** – a teacher can lock a class group during a lecture or exam; only moderators can write until it is unlocked.
- **Private messages with boundaries** – student ↔ teacher only if the student is enrolled in that teacher's course; student ↔ student only inside the same department; Exam Cell / Admin can reach anyone.
- **Teachers create their own class group** (only for a course they teach); the **HOD** can create a group for their own department; the **Admin** can create any group and add users.
- **Enrolment changes are live** – if admin adds a course to a student, the new class group appears in their browser instantly without refreshing.
- Online/offline dot, typing indicator, unread badges, message history, flood control (5 messages / 3 s), max 1000 characters.

---

## 3. How it works (architecture)

```
Browser (public/app.js)  <--- Socket.IO --->  server.js  --->  src/policy.js  (all the rules)
        |                                          |
        +------ REST (login, admin forms) ---------+--->  src/store.js  (users, groups, messages -> data/db.json)
```

| File | Job |
|---|---|
| `src/policy.js` | **The brain.** `canRead`, `canPost`, `canModerate`, `canDM`. Every boundary is in this one file. |
| `src/store.js` | Small database (memory + JSON file), password hashing (scrypt + salt), demo seed data. |
| `server.js` | Express (login + admin APIs) and Socket.IO (live chat). Asks `policy.js` before every action. |
| `public/*` | The user interface (vanilla JS, no framework). It only *shows* things; the server re-checks everything. All user text is inserted with `textContent`. |

### Socket.IO ideas used
- **Authentication in the handshake** – `io.use(...)` checks the token; no token = no socket.
- **Rooms** – every group is a room `g:<id>`; every user also has a personal room `u:<id>` (used for private messages and personal updates).
- **Acknowledgements (callbacks)** – the client sends a message and gets `{ok:true}` or `{ok:false, error}` back, which is how the UI shows "you cannot post here".
- **Broadcasting to a room** – `io.to('g:12').emit('message:new', msg)` reaches only the members.
- **`socketsJoin / leave` equivalent** – `syncAllSockets()` re-joins or removes live sockets from rooms whenever rules or enrolments change.
- **Volatile events** – typing indicator uses `socket.volatile` because losing one typing packet doesn't matter.

### Rule format
Every group has three small rule objects:
```js
audience:   { course: 'CSC102' }                 // who can see it
posters:    { everyone: true }                   // who can write
moderators: { roles: ['faculty'], course: 'CSC102' }  // who can lock it
```
`matches(user, rule)` checks role / department / course (all must match), plus an explicit invite list `users: [...]`.

---

## 4. Likely viva questions and simple answers

**Q1. Why Socket.IO and not normal HTTP?**
HTTP is request → response; the server cannot push. Chat needs the server to push a new message to everyone instantly. Socket.IO keeps a two-way connection open (WebSocket, with automatic fallback to long-polling and auto-reconnect).

**Q2. What is a room?**
A named group of sockets on the server. `socket.join('g:12')` puts a connection in it and `io.to('g:12').emit(...)` sends only to them. I use one room per group, so a message never reaches someone outside the group.

**Q3. How do you stop a student from posting in the announcement group?**
On the server, in the `message:send` handler, I call `policy.canPost(user, group)`. For announcements the `posters` rule is `{roles:['admin']}`, so a student fails the check and gets `ok:false`. The browser also disables the text box, but that is only for convenience — if someone edits the JavaScript in the browser, the server still refuses.

**Q4. How do you know who the user is on a socket?**
User logs in through `/api/login`, gets a random token. When the socket connects it sends that token in `auth`. My `io.use` middleware looks the token up and stores `socket.data.userId`. I never trust a user id sent by the client.

**Q5. What if the admin changes a student's course while they are online?**
The admin API calls `syncAllSockets()`. It re-evaluates the policy for every connected socket, joins/leaves the right rooms and sends a fresh `snapshot`, so the student's sidebar updates live.

**Q6. Where are the passwords?**
Never stored as plain text. I store `salt:hash` using Node's `crypto.scrypt`, and compare with `timingSafeEqual`.

**Q7. What security problems did you think about?**
- Server-side permission checks on every event (history, send, lock, typing).
- Messages rendered with `textContent` so `<script>` in a message can't run (XSS).
- Length limit and flood control.
- Only the admin can create users; faculty/HOD are limited to their own course/department.

**Q8. What are the limitations?**
Data is kept in a JSON file (fine for a class project; for the real university I would use MongoDB/PostgreSQL). Sessions are in memory, so a server restart logs everyone out. For many servers I would add the Socket.IO Redis adapter.

**Q9. How would you scale it?**
Move data to a database, store sessions in Redis or use JWT, and use `@socket.io/redis-adapter` so several Node servers share rooms.

**Q10. What is the difference between `socket.emit`, `io.emit`, `socket.to(room).emit`, `io.to(room).emit`?**
`socket.emit` → only this client. `io.emit` → everyone. `socket.to(room).emit` → everyone in the room *except* the sender. `io.to(room).emit` → everyone in the room including the sender.

**Q11. Why do you check `canRead` again in `history`?**
Because anybody can send any event name from the browser console. A user could ask for the history of a group he is not in; the server checks again and refuses.

---

## 5. Folder structure
```
project-a-cui-connect/
├── server.js
├── package.json
├── src/
│   ├── policy.js      # all boundaries
│   └── store.js       # data + seed
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js         # Slack-style UI: board, chat, requests, manage
│   └── fonts/         # bundled Figtree + Bricolage Grotesque (OFL)
├── test/smoke.js      # 83 checks (REST + Socket.IO, all roles)
└── data/              # db.json is created here on first run (delete it to reset demo data)
```

---

## 6. Extra viva questions for the new roles

**Q12. How is the Super Admin different from the Admin?**
Both pass every read/write rule, but only the Super Admin can create/promote/demote admins, delete accounts and read the audit log. These rules are `canCreateRole` and `canManageUser` in `policy.js`; the REST routes use small `adminOnly` / `superOnly` middleware.

**Q13. How does a Class Representative work without a new role?**
A CR is still a `student`. The user has a list `repOf: ['CSC102']`. `policy.isGroupRep()` checks it against the group's course. `canPost` lets a CR through announce mode, `canPin` lets a CR pin. Nothing else changes, so a CR cannot lock or delete.

**Q14. What happens when an account is disabled while the user is online?**
The REST route kills his sessions and calls `syncAllSockets()`, which disconnects every socket of a disabled user. The `io.use` handshake also refuses disabled users on reconnect.

**Q15. Why an audit log?**
Accountability: every sensitive action (create/disable user, role change, lock, mode switch, delete message) is stored with actor, action and time. Only the super admin can read it (`GET /api/admin/audit`, 403 for everyone else).

## 7. Viva questions for v3 (notice board + requests)

**Q16. How does a student only see notices meant for them?**
Each announcement stores an `audience` spec, the same format as a group (`{everyone:true}`, `{departments:['CS']}`, `{roles:['student']}`). `policy.canSeeAnnouncement` reuses `matches()`. The server filters the list per user before sending it, so an EE student never even receives the CS-only notice.

**Q17. How is a new notice delivered live?**
After saving, `pushBoard()` loops over connected sockets, sends each one *their own filtered* board (`board` event) and, if they're in the audience, a small `announcement:new` event that shows the pop-up.

**Q18. Why can't an HOD publish to everyone?**
`canPublishAnnouncement` allows an HOD only an audience of exactly their own department. The check is on the server, so editing the dropdown in the browser does nothing (test: "HOD cannot publish to everyone (403)").

**Q19. Could someone put a `javascript:` link in a notice?**
No. The server only accepts links starting with `http://` or `https://` (400 otherwise), and the browser opens them with `rel="noopener noreferrer"`.

**Q20. Who can see a request?**
`canSeeRequest = the person who opened it OR canHandleRequest` (admin, or HOD of the same department). Everyone else gets 404, so they can't even confirm it exists.

**Q21. How do you know who has read a notice?**
Opening a notice calls `POST /api/announcements/:id/read`, which adds the user id to `readBy`. Only the publisher/admin receives `seenBy` and `reach` in the view; other users get `undefined`.
