# Notebook — school notes app

## What's new in THIS version

**Accounts:** sign-up is now Gmail-only (`@gmail.com`, enforced on the
register form) and every account also collects a phone number. "Continue
with Google" now works properly for brand-new users too: if the Google
account isn't registered yet, you're taken straight into a short onboarding
form (name, age, sex, region, phone) instead of a bare, incomplete account
being silently created.

**Notebook:** typed text boxes now support adjustable size as well as color
— tap a text box to open a small floating toolbar (color swatches, a size
slider, delete) right next to it. A new **Customize** button lets each
student pick an accent color and paper tone for their own notebook. A new
**AI Study Tools** button turns the typed notes in a notebook into a
multiple-choice quiz or flashcards (see setup section below — this needs a
small Cloud Function and an Anthropic API key).

**Teacher-side focus tracking:** while a student has their notebook open in
edit mode, the app quietly counts how many times they switch away to
another tab or app. That count now shows up as a pill ("On task" / "N tab
switches") in the roster table, so a teacher can see who's actually taking
notes.

**Admin:** the accounts panel now shows separate Teacher accounts / Student
accounts counters, a Phone column, and the search box matches against Gmail
address in addition to name and region.

## AI Study Tools setup (optional)

The quiz/flashcard generator calls a small Firebase Cloud Function
(`functions/index.js`) which forwards your notes to the Anthropic API. Your
API key never touches the browser.

1. Make sure you're on the **Blaze (pay-as-you-go)** Firebase plan — Cloud
   Functions require it (it still has a generous free tier).
2. Get an API key from https://console.anthropic.com.
3. From the project root:
   ```
   cd functions
   npm install
   firebase functions:secrets:set ANTHROPIC_API_KEY
   firebase deploy --only functions
   ```
4. Firebase will print a URL like
   `https://us-central1-YOUR_PROJECT.cloudfunctions.net/generateStudyTools`.
   Copy it into `js/notebook.js`, replacing the placeholder value of
   `AI_STUDY_FUNCTION_URL` near the bottom of the file.
5. Redeploy/republish your site (GitHub Pages, etc.) with that change.

If you skip this setup, every other feature in the app still works — the
"AI Study Tools" button will just show an error toast when clicked.

## What's new in the previous version

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
- **Teacher / Student**: register from the login page with a `@gmail.com`
  address (this doubles as your username) — or use "Continue with Google"
  and fill in the short onboarding form the first time. Usernames/Gmail
  addresses are **not** case-sensitive, but passwords **are** case-sensitive
  exactly as typed. A Gmail address already in use is rejected at
  registration.

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
