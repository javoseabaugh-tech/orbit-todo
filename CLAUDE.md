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

## Keeping live safe when the redesign ships

Shipping merges `redesign` into `main`, which deploys the app, Firestore
rules and indexes to live together. Three things do **not** redeploy with it
and read live data directly: the Apps Script jobs (digest, reminders,
nightly nudge, backup), the budget-access Cloudflare Worker, and phones still
running the old version for a few minutes. So on the redesign:

- **Data changes are additive only.** Add new fields or collections; never
  rename or remove a field that exists in live data. Old app copies, Apps
  Script and the Worker must keep working against both shapes.
- **Rules may only get looser for existing data until ship day.** A rule that
  newly blocks an existing read or write breaks old app copies and anything
  that uses client auth. If a change truly needs stricter rules or reshaped
  data, write a migration and put it in the ship checklist instead of doing
  it silently.
- **Say it in the PR.** Any change that touches `firestore.rules`,
  `firestore.indexes.json`, `apps-script/`, the Worker, or the shape of stored
  data gets a "Live impact at ship time" section in its PR description: what
  changes, what outside part is affected, and what has to happen when it
  ships. Update the Apps Script or Worker code in the same change when they
  read that data.
- **Rehearse before shipping.** Before a `redesign` → `main` PR, load a copy
  of the latest live backup into staging, use the redesign against it, and
  run any migration there first. Only then open the ship PR, with the
  collected "Live impact" items as its checklist.

## Environment details

- Firebase config per environment lives in `.env.production` (live),
  `.env.staging` and `.env.development` (both staging). `npm run dev` uses
  staging.
- Staging has no Apps Script jobs (digest, reminders, backup) and no
  budget-access Worker. The Telegram setup wizard in `src/App.jsx` still
  points at the live webhook Worker.
- Apps Script sources live under `apps-script/` and only ever talk to live.
