# Notebook — school notes app

## What's new in this version

**Students:** highlighter and eraser tools in the notebook, page thumbnails
down the side, a History page listing every notebook you've submitted, and
due-date countdowns on class tiles.

**Teachers:** an overview row (total students / pending / submitted) on your
dashboard, an optional due date per class (submissions after it are flagged
"late"), a Feedback button to leave a note on a student's notebook, and a
Remove button to kick an approved student out of a class.

**Admin:** usage stats (accounts / classes / submitted notebooks), a
search box to filter the teacher/student tables by name or region, and
Deactivate / Delete buttons per account.

**Everywhere:** a "Forgot password?" flow on the login page (answer a
security question you set at registration to reset your own password,
without needing the admin), and a notification bell on the student
dashboard that flags new approvals and new teacher feedback.

Notebook PDF export uses [jsPDF](https://github.com/parallax/jsPDF), loaded
from a CDN in `notebook.html` — no install step needed.

No Firestore rules changes are required for any of this; the existing rules
were already open enough for the new fields and the `history.html` /
`js/history.js` page.


Student/teacher/admin accounts, class join-codes with approval, and a stylus
notebook (draw + movable text) that students submit to their teacher.

Everything is plain HTML/CSS/JS — no build step. Data lives in **Firebase
Firestore**, so an account created on a phone shows up on a laptop too,
which plain GitHub Pages alone cannot do (it only serves static files).

## 1. Create your free Firebase project

1. Go to https://console.firebase.google.com → **Add project** → name it
   anything (e.g. `my-school-notebook`) → finish the wizard.
2. In the left menu, click **Build → Firestore Database → Create database**.
   Choose any region close to you, and start in **test mode** for now.
3. After it's created, go to **Firestore → Rules** and paste in the contents
   of `firestore.rules` from this project, then click **Publish**.
4. Click the gear icon → **Project settings** → scroll to **Your apps** →
   click the **</>** (web) icon → register the app (any nickname) → it will
   show you a `firebaseConfig` object.
5. Copy those values into `js/firebase-config.js` in this project, replacing
   the placeholder text.

## 2. Test it locally

You can just open `index.html` in a browser to try it (most browsers allow
this for a static site talking to Firebase). If drawing or login doesn't
work from a plain double-click, run a tiny local server instead:

```
cd schoolnotes
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## 3. Publish it so any device can use it

**Push to GitHub:**
```
cd schoolnotes
git init
git add .
git commit -m "Notebook app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

**Turn on GitHub Pages:**
1. On GitHub, open the repo → **Settings → Pages**.
2. Under "Build and deployment", set **Source: Deploy from a branch**,
   branch `main`, folder `/ (root)` → **Save**.
3. GitHub gives you a link like `https://YOUR_USERNAME.github.io/YOUR_REPO/`.
   That's your live site — open it from your phone, your computer, anywhere.
   Every device talks to the same Firestore database, so accounts, classes,
   and notebooks all stay in sync.

## Logging in

- **Admin** (fixed, no registration): username `ADMIN2026`, password
  `ADMIN2026`. Admin can view every teacher and student account (including
  their stored password) under the Teachers / Students tabs.
- **Teacher / Student**: register from the login page. Usernames are
  **not** case-sensitive (`Admin2026` = `ADMIN2026`), but passwords
  **are** case-sensitive exactly as typed. A username already in use is
  rejected at registration.

## How the pieces fit together

- `index.html` — login + create-account, with a role switch (student /
  teacher / admin).
- `teacher.html` — create classes (auto-generates a join code), see pending
  join requests per class with approve / reject / approve-all, and view a
  student's notebook once they've written in it.
- `student.html` — join a class with a code, see approval status, open the
  notebook once approved.
- `notebook.html` — the notebook itself: pen tool with 3 colors (black, red,
  blue) for stylus/touch/mouse drawing, a movable/editable text tool, undo /
  redo, clear page, add / remove page, a date stamp per page, and a submit
  button so the teacher can see it.
- `admin.html` — read-only tables of every teacher and student account.

## Known limitations (worth knowing for a school project)

- Passwords are stored as plain text in Firestore, not hashed. That's normal
  for a classroom demo but not how a real production app should work.
- The Firestore rules in this project are intentionally open so the app
  works without wiring up Firebase Authentication. Don't put real private
  data in it, and if you want to lock it down further later, that's the
  place to start.
