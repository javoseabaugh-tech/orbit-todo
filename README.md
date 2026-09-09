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

## Telegram notifications (Apps Script)

`Code.gs` runs in a standalone Apps Script project and notifies **everyone in
the access list**, each through their own Telegram bot:

| Function | Trigger | What it sends |
| --- | --- | --- |
| `sendDailyDigest` | daily, 6am | Star's morning summary of that person's items due today |
| `sendTimeSensitiveReminders` | every 5 minutes | one ping per todo whose `notifyAt` has arrived, to that todo's owner |

### Who gets notified

A person is notifiable when **both** halves exist:

1. `access/{email}` has a `uid` — the app self-registers this on sign-in, so it
   appears the first time they log in.
2. `notifyConfig/{email}` has `telegramBotToken` + `telegramChatId` — written by
   the in-app Telegram wizard (Menu → Notifications). Everyone registers their
   own bot with BotFather, so nobody shares a token.

Anyone missing either half is skipped silently. `checkRecipients()` prints the
whole list with the reason for each skip, and never logs a bot token.

The owner is the one exception: if he has no `notifyConfig` doc, the script
falls back to the `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` script properties
that predate the wizard, so going multi-user can't knock the original digest
offline.

**Star's language.** Star swears in the owner's digest by his own choice —
that's not something anyone else opted into, so every other recipient gets the
same warmth without the profanity. Override per person with `starProfanity`
(true or false) on their `access` doc. Names come from `access.name` if you add
it, else `USER_NAME` for the owner, else the email's local part.

### Staying inside the free quota

A consumer Google account allows 20,000 `UrlFetch` calls and 90 minutes of
trigger runtime per day. The 5-minute reminder trigger is the only thing that
runs often, so it's built to cost **one HTTP call on a quiet run**:

- the Firestore token is cached 50 minutes, so 288 daily runs need ~29 token
  fetches rather than 288
- reminders use a single **collection-group** query across every user's todos,
  so cost does not grow as people are added (this is what the COLLECTION_GROUP
  index in `firestore.indexes.json` is for)
- the routing table is fetched only on runs that actually have something to
  deliver

A normal day lands near 400 calls and roughly 10 minutes of runtime — a few
percent of the allowance, with room for the digest and the nightly nudge. The
trigger is 5 minutes rather than 1 deliberately: at ~2s per run, every-minute
checks would spend about half the daily runtime budget on empty polls.

The digest costs one Gemini call per person per day.

### When notifications go quiet

**Both functions only work if their time-based trigger is installed.** A trigger
can be deleted with no warning or error — the code stays put and simply never
runs, which looks identical to "notifications are broken."

1. `checkTriggers()` — names any handler with no trigger, and prints the
   timezone in use.
2. `setupAllTriggers()` — installs both. Safe to re-run; it clears its own
   triggers first.
3. `previewTimeSensitive()` — dry run across all users. Logs what *would* be
   sent, to whom, sending and marking nothing.
4. `checkRecipients()` — who resolves as notifiable, and why anyone is skipped.

**Timezone:** `notifyAt` is a local wall-clock string with no timezone in it, so
reminders fire on the Apps Script project's timezone (Project Settings → Time
zone) — one shared timezone for everyone. If people are ever in different
timezones, this needs a per-user field; today it does not exist.

**Reminders that slipped:** anything more than `MAX_LATE_MINUTES` (3 hours) past
due is marked notified without sending, so an outage doesn't dump a backlog.
A reminder belonging to someone who hasn't connected Telegram is left pending
rather than marked, so they still get it if they connect inside that window.

## Data model

Everything lives under `users/{uid}/`:

- `todos` — `{ list: "work" | "personal", text, categoryId, due, done, createdAt }`
  - time-sensitive todos also carry `{ timeSensitive: true, notifyAt: "YYYY-MM-DDTHH:MM:SS", notified }` — `notifyAt` is local wall-clock time, and `notified` flips to `true` once the reminder has gone out
- `categories` — `{ list: "work" | "personal", name, color, createdAt }`
- `thoughts` — `{ text, personId, due, done, createdAt }`
- `people` — `{ name, color, createdAt }`

Everything syncs in real time via Firestore listeners — if you have the app open on two devices, changes on one show up on the other instantly.
