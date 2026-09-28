# Telegram webhook Worker

Every person's Orbit bot points its webhook here
(`https://<worker>/<bot token>`, set by the app's Telegram setup). It:

1. replies with the chat ID when someone messages their bot during setup, and
2. ticks off a Nightly item when someone taps a ✓ button under the 6pm nudge.

Two copies run from this one folder:

| Worker | Deployed from | Talks to |
| --- | --- | --- |
| `orbit-telegram-webhook` | `main` | live, `orbit-cbd4e` |
| `orbit-telegram-webhook-staging` | `redesign` | staging, `orbit-staging-49988` |

Both deploy through `.github/workflows/deploy-telegram-worker.yml` on merge,
never by hand. The workflow needs two repository secrets:
`CLOUDFLARE_API_TOKEN` (Account → Workers Scripts: Edit) and
`CLOUDFLARE_ACCOUNT_ID`.

## There is no service account key

Same scheme as Pulse's push Worker. The Worker is its own OIDC issuer:

1. It publishes its public key at `/.well-known/jwks.json`.
2. It signs a five-minute assertion saying it is `orbit-telegram-webhook`,
   with a key it generated itself (`OIDC_KEY`). The deploy workflow creates
   that key on the first deploy and it never leaves Cloudflare.
3. Google checks the signature, and a Workload Identity Federation pool lets
   the Worker act as one service account.

**What that account can reach:** `roles/datastore.user` covers all of
Firestore, because Google can't narrow it to one collection. The code is what
keeps it narrow:
- A tap only ever sets `done` (plus `doneBy`/`doneAt` on household items).
- It only touches `nightly` items, and only creates one when the matching
  repeating template exists.
- It only acts for the person whose saved Telegram settings hold that exact bot
  token and chat ID.

If `OIDC_KEY` ever leaked, someone could read and write Firestore until it's
rotated. To rotate, run the workflow by hand with **rotate_key** ticked.
Nothing in Google changes, because Google fetches the public key from the
Worker.

## One-time Google setup, per project

Run in Cloud Shell. Paste one block at a time, and **no spaces around `=`**.

### Staging (do this now)

```bash
PROJECT=orbit-staging-49988
PROJECT_NUMBER=2531876823
ISSUER=https://orbit-telegram-webhook-staging.javoseabaugh.workers.dev
```

### Live (do this at ship time, before turning the buttons on)

```bash
PROJECT=orbit-cbd4e
PROJECT_NUMBER=944702899935
ISSUER=https://orbit-telegram-webhook.javoseabaugh.workers.dev
```

### Then, for either one

```bash
gcloud config set project $PROJECT
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com firestore.googleapis.com

gcloud iam workload-identity-pools create orbit-telegram \
  --location=global --display-name="Orbit Telegram webhook"

gcloud iam workload-identity-pools providers create-oidc worker \
  --location=global --workload-identity-pool=orbit-telegram \
  --issuer-uri="$ISSUER" \
  --allowed-audiences="//iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/orbit-telegram/providers/worker" \
  --attribute-mapping="google.subject=assertion.sub" \
  --attribute-condition="assertion.sub == 'orbit-telegram-webhook'"

gcloud iam service-accounts create orbit-telegram-webhook \
  --display-name="Orbit Telegram webhook"

# A brand-new service account takes a few seconds to become visible to the
# project policy; granting it a role straight away fails with "does not
# exist". Wait until it's there.
until gcloud iam service-accounts describe orbit-telegram-webhook@$PROJECT.iam.gserviceaccount.com >/dev/null 2>&1; do sleep 3; done; sleep 10

gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:orbit-telegram-webhook@$PROJECT.iam.gserviceaccount.com" \
  --role="roles/datastore.user" --condition=None

gcloud iam service-accounts add-iam-policy-binding \
  orbit-telegram-webhook@$PROJECT.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/orbit-telegram/subject/orbit-telegram-webhook"
```

Both `add-iam-policy-binding` commands must print `Updated IAM policy`. If the
first one says the account "does not exist", run it again on its own after a
minute. No `--key-file` appears
anywhere, and no key is created.

## Turning the buttons on

- **Staging:** set up Telegram in the staging app with a **test bot**. Don't
  use your real bot there: a bot has one webhook, so doing it with your real
  bot would point it at staging. Then use **Send me a test nudge** on
  staging's Nightly screen and tap a ✓.
- **Live:** once the live Worker is deployed and the live Google setup is done,
  set the script property `NIGHTLY_TAP_BUTTONS` to `on` in the nightly nudge
  Apps Script. Each person (the owner included) must have finished the app's
  Telegram setup at least once. That saved setup is how the Worker knows whose
  bot a tap came from, and it points their bot's webhook here.
