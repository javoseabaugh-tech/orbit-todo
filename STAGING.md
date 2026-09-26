# Staging: test the redesign before live users see it

Orbit now has two environments, built and deployed the same way:

| | Live | Staging |
| --- | --- | --- |
| Firebase project | `orbit-cbd4e` | your new staging project |
| URL | https://orbit-cbd4e.web.app | `https://<staging-id>.web.app` |
| Deploys from | `main` (`deploy.yml`) | `redesign` (`deploy-staging.yml`) |
| Build config | `.env.production` | `.env.staging` (and `.env.development` for `npm run dev`) |
| Data, rules, sign-in | real users | separate, empty until you seed it |
| Telegram / digest / backup | Apps Script, live only | none |
| Budget-access emails (Worker) | yes | no (`worker_url` is empty) |

Both deploys are keyless. GitHub proves who it is to Google over OIDC
(Workload Identity Federation) and impersonates a deployer service account.
There are no service account keys, and nothing is deployed by hand. Each
project's identity provider only trusts **this repo on its own branch**. A run
from `redesign` can't deploy live, and a run from `main` can't deploy staging.

Run all the commands below in **Cloud Shell** (console.cloud.google.com, `>_`
icon). They are short enough to paste. Run each block exactly once.

---

## Step 1: Make live deploys keyless (do this BEFORE merging this PR)

The old workflow used a stored service account key (`FIREBASE_SERVICE_ACCOUNT`).
The new one uses WIF, so the pool and deployer account must exist before the
first deploy that runs after this PR is merged.

- [ ] Paste into Cloud Shell:

```bash
PROJECT=orbit-cbd4e
PROJECT_NUMBER=944702899935
REPO=javoseabaugh-tech/orbit-todo
BRANCH=main

gcloud config set project $PROJECT
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  firebasehosting.googleapis.com firebaserules.googleapis.com firestore.googleapis.com

gcloud iam service-accounts create orbit-deployer --display-name="Orbit GitHub deployer"
SA=orbit-deployer@$PROJECT.iam.gserviceaccount.com
for ROLE in roles/firebasehosting.admin roles/firebaserules.admin roles/datastore.indexAdmin; do
  gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role=$ROLE --condition=None
done

gcloud iam workload-identity-pools create github-pool --location=global --display-name="GitHub"
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github-pool \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '$REPO' && assertion.ref == 'refs/heads/$BRANCH'"

gcloud iam service-accounts add-iam-policy-binding $SA \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/$REPO"
```

These names already match what `deploy.yml` expects, so nothing needs editing.

## Step 2: Create the staging Firebase project

- [ ] **Create the project.** Go to console.firebase.google.com → Add project.
  Pick an ID such as `orbit-staging-js` (project IDs are global, so plain
  `orbit-staging` is probably taken). Turn Google Analytics off and stay on
  **Spark**.
- [ ] **Sign-in.** Build → Authentication → Get started → Sign-in method →
  enable **Google**.
- [ ] **Firestore.** Build → Firestore Database → Create database → production
  mode. Choose the **same location as live**, so rules and indexes behave the
  same.
- [ ] **Web app.** Project settings → General → Your apps → `</>` → register
  "Orbit staging" (no Hosting checkbox needed). Copy the `firebaseConfig`
  values it shows.
- [ ] **App Check key.** At google.com/recaptcha/admin, create a **reCAPTCHA v3**
  key with domains `<staging-id>.web.app` and `localhost`. Then go to Firebase
  → App Check → the web app → reCAPTCHA v3, and paste in the **secret** key.
  Keep the **site** key for the next step.
- [ ] **Hand the values over.** Send Claude the project ID, the project number
  (Project settings → General), the `firebaseConfig` values and the reCAPTCHA
  site key. Claude fills them into `.env.staging`, `.env.development` and
  `.github/workflows/deploy-staging.yml` through a PR. None of these are
  secrets: they all end up in the page source anyway.

## Step 3: Keyless deploys for staging

- [ ] Same commands as step 1, with the staging values. Note `BRANCH=redesign`:

```bash
PROJECT=<staging-id>
PROJECT_NUMBER=<staging project number>
REPO=javoseabaugh-tech/orbit-todo
BRANCH=redesign
```

Then paste everything from `gcloud config set project $PROJECT` down to the
end of the step 1 block.

## Step 4: GitHub settings

Go to the repo → Settings → Secrets and variables → Actions.

- [ ] **Secrets** → New repository secret `VITE_GEMINI_API_KEY`, set to your AI
  Studio key. Star's key gets baked into the build, so CI needs it. The old
  workflow never passed it in, so check that Star works on live after the
  first new deploy.
- [ ] **Variables** → New repository variable `VITE_WORKER_URL`, set to your
  Cloudflare Worker's URL (the one budget-access requests call). Live only.
- [ ] If the Gemini key has **website restrictions** (Cloud console → APIs &
  Services → Credentials), add `<staging-id>.web.app/*` to its list.

## Step 5: Merge, then remove the old key

- [ ] Merge this PR. Actions → "Deploy live Orbit" should go green, and
  https://orbit-cbd4e.web.app should behave exactly as before.
  - Rules or hosting `403`: the deployer account is missing a role. As a
    fallback, grant it `roles/firebase.admin` (this is what Pulse uses).
- [ ] Once the deploy is green, delete the `FIREBASE_SERVICE_ACCOUNT` repo
  secret. Then go to Cloud console → IAM → Service Accounts, find the account
  whose key was in that secret (usually `github-action-…@orbit-cbd4e`), and
  delete the account or at least its **key** under Keys.

## Step 6: Start the redesign

- [ ] Create the `redesign` branch from `main` (GitHub → branch dropdown → type
  `redesign` → "Create branch from main"). Creating it runs the first staging
  deploy.
- [ ] **Seed yourself as owner.** Staging starts empty, and the app signs out
  anyone with no access record. In the staging project's Firestore console:
  1. Add collection `access` with document ID `javoseabaugh@gmail.com` and
     field `role` (string) = `owner`.
  2. Sign in at `https://<staging-id>.web.app`. The app writes your `uid` onto
     that document.
  3. Add collection `meta` with document ID `owner` and field `uid` (string) =
     the uid from step 2. You can also find it in Authentication → Users.
- [ ] Optional: add test people to `access` the same way (other roles:
  `household`, `assistant`, etc.) to try the sharing flows.

Look for the red **STAGING** pill at the top and the `[STAGING]` tab title.
If you don't see them, you're on live.

## Day to day

- Build redesign work in PRs **into `redesign`**. Each merge redeploys staging.
- Fixes for live still go in PRs into `main`, as before. Merge `main` into
  `redesign` now and then so the redesign keeps those fixes.
- `npm run dev` runs against staging too, so local testing never touches real
  data.

## Shipping the redesign to everyone

1. Merge `main` into `redesign` one last time, then test on staging.
2. If the redesign changed the **shape** of stored data (new fields, renamed
   collections), plan a migration first. Live data won't be in the new shape
   just because the code is. Ask Claude to write a migration, and try it on a
   copy of live data in staging before running it on live.
3. Open a PR from `redesign` into `main` and merge it. `deploy.yml` ships the
   app, rules and indexes to live together.
4. Check the Apps Script jobs (digest, nightly nudge, backup) still read the
   data correctly. They only ever point at live.
