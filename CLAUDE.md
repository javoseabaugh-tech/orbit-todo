# Orbit: notes for Claude

## Where changes go (read this first)

Orbit has two environments. See [STAGING.md](STAGING.md) for the full setup.

| Branch | Deploys to | Used for |
| --- | --- | --- |
| `redesign` | staging, https://orbit-staging-49988.web.app | **the redesign. This is the default for all new work.** |
| `main` | live, https://orbit-cbd4e.web.app (real users) | fixes to the live app only |

- **Default: open pull requests into `redesign`, not `main`.** Only target
  `main` when the owner explicitly says it's a fix for the live app. If a
  request is ambiguous, ask which one.
- A live fix merged to `main` should also reach the redesign: merge `main`
  into `redesign` afterwards, or tell the owner it needs doing.
- Shipping the redesign means a PR from `redesign` into `main`. Only do this
  when the owner asks. Check STAGING.md "Shipping the redesign to everyone"
  first, especially the data-migration step.
- Every merge deploys automatically (app, Firestore rules and indexes
  together). Nothing is deployed by hand, and there are no service account
  keys. Don't add `firebase deploy` to CI; deploy/README.md explains why.

## Environment details

- Firebase config per environment lives in `.env.production` (live),
  `.env.staging` and `.env.development` (both staging). `npm run dev` uses
  staging.
- Staging has no Apps Script jobs (digest, reminders, backup) and no
  budget-access Worker. The Telegram setup wizard in `src/App.jsx` still
  points at the live webhook Worker.
- Apps Script sources live under `apps-script/` and only ever talk to live.
