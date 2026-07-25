# Orbit — personal to-do app

React + Firestore + Google Auth, deployed on Firebase Hosting.

## One-time console setup (do this before deploying)

1. **Enable Firestore** — Firebase console → Build → Firestore Database → Create database → start in **production mode** → pick a location.
2. **Enable Google sign-in** — Firebase console → Build → Authentication → Sign-in method → enable **Google** → set a support email.
3. **Add authorized domains** (for local testing) — Authentication → Settings → Authorized domains. `localhost` is included by default; your `*.web.app` / `*.firebaseapp.com` hosting domain is added automatically once you deploy.

## Local setup

```bash
npm install
npm run dev
```

Visit the local URL it prints, sign in with Google, and you're working against your real Firestore project already.

## Deploy

```bash
npm install -g firebase-tools   # if you don't have the CLI yet
firebase login
npm run build
firebase deploy
```

This deploys both **Hosting** (the built app) and the **Firestore security rules** in `firestore.rules`, which restrict every user to reading and writing only their own data under `users/{their-uid}/...`.

## Brain Dump voice capture (Thoughts tab)

Tap "Brain dump," speak naturally — e.g. *"Remind me to ask Amon about the trailer maintenance next Tuesday"* — and it pre-fills the thought text, due date, and person automatically. You still tap **Capture** to confirm before it's saved.

**Setup (free, no credit card):**
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → sign in with the same Google account → **Create API key** → choose your `orbit-cbd4e` project (or create a new one — either works, it's unrelated to Blaze/billing).
2. Copy `.env.example` to `.env` in the project root and paste your key in:
   ```
   VITE_GEMINI_API_KEY=your-key-here
   ```
3. `.env` is already in `.gitignore` so it won't get committed or deployed publicly by accident. Vite bakes the key into the built JS at `npm run build` time.
4. **Restrict the key** (recommended): in the [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → click your key → under "Application restrictions" choose **Websites** and add your Firebase Hosting domain (`orbit-cbd4e.web.app`) plus `localhost` for local testing. This stops anyone else from using your key even if they find it in the page source.

**Browser support:** voice recording uses the browser's built-in Speech Recognition, which currently works in Chrome and Edge only (not Firefox or Safari). If you open the app in an unsupported browser, the Brain Dump button is replaced with a note saying so — typing still works everywhere.

**Data note:** the transcribed text is sent to Google's Gemini API for parsing. Google's free tier may use free-tier prompts to improve their models — keep that in mind for anything especially sensitive.

## Data model

Everything lives under `users/{uid}/`:

- `todos` — `{ list: "work" | "personal", text, categoryId, due, done, createdAt }`
- `categories` — `{ list: "work" | "personal", name, color, createdAt }`
- `thoughts` — `{ text, personId, due, done, createdAt }`
- `people` — `{ name, color, createdAt }`

Everything syncs in real time via Firestore listeners — if you have the app open on two devices, changes on one show up on the other instantly.
