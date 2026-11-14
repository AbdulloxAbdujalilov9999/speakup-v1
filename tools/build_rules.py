#!/usr/bin/env python3
"""Builds database.rules.json for SpeakUp-1's own Firebase project.

Realtime Database rules have no functions, so the same checks are repeated
everywhere. Writing them by hand invites typos; this script spells each check
once and expands it. Run:  python3 tools/build_rules.py  (writes ../database.rules.json)

Roles (users/{uid}/role):
  owner    Abdulloh. Everything, everywhere. Bootstrapped by OWNER_EMAIL.
  manager  Global helper of the owner: every center (cannot touch owner/manager).
  admin    A learning center's admin: only their own center (users/{uid}/centerId).
  teacher  Their own students (users/{student}/teacherId) and their center's lessons.
  student  Their own data.

Licensing: centers/{cid} {name, plan, paidUntil, ...} is written only by the
owner/manager. The app and the course-file server (server.js) refuse a center
member once paidUntil has passed.

Invites: invites/{code} {cid, role, teacherId?, by, at, off?}. Signing up with a
code creates an approved profile in that center straight away, so the owner does
not have to approve every pupil of every center.
"""
import json, os

ME = "root.child('users').child(auth.uid)"
APPROVED = f"{ME}.child('status').val() === 'approved'"
ROLE = lambda r: f"{ME}.child('role').val() === '{r}'"
MY_CID = f"{ME}.child('centerId').val()"

OWNER = f"({APPROVED} && {ROLE('owner')})"
MGR = f"({APPROVED} && ({ROLE('owner')} || {ROLE('manager')}))"
U = lambda uid: f"root.child('users').child({uid})"
# a center admin looking at a person of their own center
ADMIN_OF_USER = lambda uid: f"({APPROVED} && {ROLE('admin')} && {MY_CID} != null && {U(uid)}.child('centerId').val() === {MY_CID})"
ADMIN_OF_CENTER = lambda cid: f"({APPROVED} && {ROLE('admin')} && {MY_CID} === {cid})"
TEACHER_OF = lambda uid: f"({APPROVED} && {ROLE('teacher')} && {U(uid)}.child('teacherId').val() === auth.uid)"
# staff who may see/correct this pupil
STAFF_OF = lambda uid: f"({MGR} || {TEACHER_OF(uid)} || {ADMIN_OF_USER(uid)})"
CAN_SEE = lambda uid: f"auth != null && (auth.uid === {uid} || {STAFF_OF(uid)})"
CAN_STAFF = lambda uid: f"auth != null && {STAFF_OF(uid)}"

# A profile that the invite in newData.invite allows. `nd` is the profile's newData.
def INVITE_OK(nd):
    inv = f"root.child('invites').child({nd}.child('invite').val())"
    return ("(" + " && ".join([
        f"{nd}.child('invite').isString()",
        f"{inv}.exists()",
        f"{inv}.child('off').val() !== true",
        f"{nd}.child('status').val() === 'approved'",
        f"{nd}.child('role').val() === {inv}.child('role').val()",
        f"{nd}.child('centerId').val() === {inv}.child('cid').val()",
        f"({inv}.hasChild('teacherId') ? {nd}.child('teacherId').val() === {inv}.child('teacherId').val() : !{nd}.hasChild('teacherId'))",
    ]) + ")")

SELF_CREATE = (
    "auth.uid === $uid && !data.exists() && newData.child('email').val() === auth.token.email && ("
    # the owner bootstrap
    "(auth.token.email === 'OWNER_EMAIL' && newData.child('role').val() === 'owner' && newData.child('status').val() === 'approved')"
    # anyone else without a code: a pending student, no teacher, no center (the owner approves)
    " || (auth.token.email !== 'OWNER_EMAIL' && newData.child('role').val() === 'student' && newData.child('status').val() === 'pending' && !newData.hasChild('teacherId') && !newData.hasChild('centerId'))"
    # with a center's invite code
    f" || (auth.token.email !== 'OWNER_EMAIL' && {INVITE_OK('newData')})"
    ")"
)
# a pending account (signed up without a code) may join a center later with a code
SELF_JOIN = (
    "auth.uid === $uid && data.exists() && data.child('status').val() === 'pending' && !data.hasChild('centerId')"
    " && newData.child('email').val() === data.child('email').val()"
    f" && {INVITE_OK('newData')}"
)
MANAGER_WRITE = (
    f"({APPROVED} && {ROLE('manager')} && data.exists() && !(data.child('role').val() === 'owner' || data.child('role').val() === 'manager')"
    " && !(newData.exists() && (newData.child('role').val() === 'owner' || newData.child('role').val() === 'manager')))"
)
# a center admin edits (restricts, moves between teachers, renames) teachers/pupils of their own center;
# they can never move anyone to another center or make anyone admin/manager/owner, and never delete
ADMIN_WRITE = (
    f"({APPROVED} && {ROLE('admin')} && {MY_CID} != null && data.exists() && newData.exists()"
    f" && data.child('centerId').val() === {MY_CID} && newData.child('centerId').val() === {MY_CID}"
    " && (data.child('role').val() === 'teacher' || data.child('role').val() === 'student')"
    " && (newData.child('role').val() === 'teacher' || newData.child('role').val() === 'student')"
    " && newData.child('email').val() === data.child('email').val())"
)

NEW_ROOT = "newData.parent().parent().parent()"   # from a depth-3 node ($a/$b/$c)

# sp1/copen/{cid}: a center's lesson openings, leaderboard and live game.
# sp1/open: the same for the owner's own groups (people with no center), as before.
STAFF_ROLE = f"({ROLE('teacher')} || {ROLE('admin')})"
COPEN_READ = f"auth != null && ({MGR} || ({MY_CID} != null && {MY_CID} === $cid))"
COPEN_WRITE = f"auth != null && ({MGR} || ({APPROVED} && {STAFF_ROLE} && {MY_CID} != null && {MY_CID} === $cid))"
OPEN_READ = f"auth != null && ({MGR} || {MY_CID} == null)"
OPEN_WRITE = f"auth != null && ({MGR} || ({APPROVED} && {ROLE('teacher')} && {MY_CID} == null))"

def invite_ok_writer(d):
    """Who may create (d=newData) or delete (d=data) the invite at invites/$code."""
    return ("(" + " || ".join([
        MGR,
        f"({APPROVED} && {ROLE('admin')} && {d}.child('cid').val() === {MY_CID} && ({d}.child('role').val() === 'teacher' || {d}.child('role').val() === 'student'))",
        f"({APPROVED} && {ROLE('teacher')} && {d}.child('cid').val() === {MY_CID} && {d}.child('role').val() === 'student' && {d}.child('teacherId').val() === auth.uid)",
    ]) + ")")

rules = {
  "users": {
    ".read": f"auth != null && {MGR}",
    ".indexOn": ["centerId"],
    "$uid": {
      ".read": CAN_SEE("$uid"),
      ".write": f"auth != null && ({OWNER} || {MANAGER_WRITE} || {ADMIN_WRITE} || ({SELF_CREATE}) || ({SELF_JOIN}))",
      "name": {".write": "auth != null && auth.uid === $uid"},
      "lastActive": {".write": "auth != null && auth.uid === $uid"},
      "updatedAt": {".write": "auth != null && auth.uid === $uid"},
      # a teacher's own pupil invite code, shown in their settings
      "inviteCode": {".write": f"auth != null && auth.uid === $uid && {APPROVED} && ({ROLE('teacher')} || {ROLE('admin')})"},
    },
  },
  "centers": {
    ".read": f"auth != null && {MGR}",
    "$cid": {
      ".read": f"auth != null && ({MGR} || ({APPROVED} && {MY_CID} === $cid))",
      ".write": f"auth != null && {MGR}",
    },
  },
  # centerUsers/{cid}/{uid} = true: who belongs to a center (lets its admin find them)
  "centerUsers": {
    "$cid": {
      ".read": f"auth != null && ({MGR} || {ADMIN_OF_CENTER('$cid')})",
      "$uid": {
        ".write": (f"auth != null && ({MGR} || ({ADMIN_OF_CENTER('$cid')} && {U('$uid')}.child('centerId').val() === $cid)"
                   f" || (auth.uid === $uid && newData.exists() && {NEW_ROOT}.child('users').child($uid).child('centerId').val() === $cid))"),
        ".validate": "newData.val() === true",
      },
    },
  },
  "invites": {
    "$code": {
      # read one code at a time (to sign up with it); the whole list is never readable
      ".read": "auth != null",
      ".write": "auth != null && ((newData.exists() && !data.exists() && " + invite_ok_writer("newData") + ") || (!newData.exists() && " + invite_ok_writer("data") + ") || (newData.exists() && data.exists() && " + MGR + "))",
      ".validate": "$code.length >= 6 && newData.hasChildren(['cid', 'role', 'by', 'at']) && (newData.child('role').val() === 'admin' || newData.child('role').val() === 'teacher' || newData.child('role').val() === 'student')",
    },
  },
  # centerInvites/{cid}/{code} = {role, teacherId?, at}: the admin's list of their center's codes
  "centerInvites": {
    "$cid": {
      ".read": f"auth != null && ({MGR} || {ADMIN_OF_CENTER('$cid')})",
      "$code": {".write": f"auth != null && ({MGR} || {ADMIN_OF_CENTER('$cid')})"},
    },
  },
  "teacherStudents": {
    "$teacherId": {
      ".read": f"auth != null && (auth.uid === $teacherId || {MGR} || {ADMIN_OF_USER('$teacherId')})",
      ".write": f"auth != null && {MGR}",
      "$sid": {
        ".write": (f"auth != null && (({ADMIN_OF_USER('$sid')} && {ADMIN_OF_USER('$teacherId')})"
                   f" || (auth.uid === $sid && newData.exists() && {NEW_ROOT}.child('users').child($sid).child('teacherId').val() === $teacherId))"),
      },
    },
  },
  "events": {
    "$teacherId": {
      ".read": f"auth != null && (auth.uid === $teacherId || {MGR} || {ADMIN_OF_USER('$teacherId')})",
      ".write": f"auth != null && (auth.uid === $teacherId || {MGR})",
    },
  },
  "sp1": {
    "progress": {
      ".read": f"auth != null && {MGR}",
      "$uid": {
        ".read": CAN_SEE("$uid"),
        ".write": f"auth != null && (auth.uid === $uid || (!newData.exists() && {MGR}))",
        # staff mark a homework done for the pupil
        "hwDone": {"$n": {".write": CAN_STAFF("$uid")}},
        # once the teacher has checked a homework its answers can't change (a reset deletes them)
        "hwInputs": {"$n": {"$i": {".validate": "root.child('sp1').child('reviews').child($uid).child($n).child('checked').val() !== true || newData.val() === data.val()"}}},
      },
    },
    "boards": {"$uid": {".read": "auth != null && auth.uid === $uid", ".write": "auth != null && auth.uid === $uid"}},
    "open": {".read": OPEN_READ, ".write": OPEN_WRITE},
    "copen": {"$cid": {".read": COPEN_READ, ".write": COPEN_WRITE}},
    "access": {
      ".read": f"auth != null && {MGR}",
      "$uid": {".read": CAN_SEE("$uid"), ".write": CAN_STAFF("$uid")},
    },
    "assignments": {"$uid": {".read": CAN_SEE("$uid"), ".write": CAN_STAFF("$uid")}},
    "resets": {"$uid": {
      ".read": CAN_SEE("$uid"), ".write": CAN_STAFF("$uid"),
      "$id": {".write": "auth != null && auth.uid === $uid && data.exists() && !newData.exists()"},
    }},
    "reviews": {"$uid": {".read": CAN_SEE("$uid"), ".write": CAN_STAFF("$uid")}},
  },
}

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    cfg = open(os.path.join(here, "..", "shared", "firebase-config.js"), encoding="utf-8").read()
    import re
    owner = re.search(r'OWNER_EMAIL\s*=\s*"([^"]+)"', cfg).group(1)
    out = json.dumps({"rules": rules}, indent=2, ensure_ascii=False).replace("OWNER_EMAIL", owner)
    # put back the export name if it was replaced inside a comment-free JSON (it never is, but be safe)
    path = os.path.join(here, "..", "database.rules.json")
    open(path, "w", encoding="utf-8").write(out + "\n")
    print("wrote", os.path.normpath(path), len(out), "bytes")

if __name__ == "__main__":
    main()
