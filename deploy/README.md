# Deploy notes

## Why there is no `firebase deploy` in CI

`.github/workflows/_deploy-firebase.yml` deploys Firestore rules, indexes and
Hosting with direct REST API calls, using an access token from
`gcloud auth print-access-token`.

This is deliberate. firebase-tools can't authenticate with the credentials that
Workload Identity Federation issues. It expects a JSON file shaped like a
service account key, with a `client_email` field that WIF credentials don't
have, and it fails with *"Failed to authenticate, have you run firebase
login?"*. The pipeline is keyless by design, so the CLI isn't an option in CI.
This is the same approach the Pulse app uses.

**Don't replace the REST calls with `firebase deploy`.** Doing so breaks the pipeline.

## Hosting config lives in two places

The REST API never reads `firebase.json`. Serving config (the SPA rewrite and
cache headers) is sent in the version payload from `deploy/hosting-config.json`
instead. If you change the `hosting` block of `firebase.json`, change this file
too.

## Cache headers

Everything is served `no-cache` (the browser must check for a newer copy),
except the content-hashed files under `/assets/`, which are `immutable` for a
year. Before this, Hosting's default `max-age=3600` let an installed app keep
serving an old `index.html` for up to an hour after a deploy.

Header globs match the path the browser **requested**, and the last matching
rule wins, so the broad `**` rule comes first and the `/assets/**` rule after
it. A new rule goes after `**` or it will be overridden.

The app also checks `/version.json` (written by `vite.config.js` on every
build) when it comes back to the foreground, and reloads itself if a newer
version is live. See `src/updateCheck.js`.

## Indexes

Each entry in `firestore.indexes.json` is POSTed to the Firestore Admin API.
An index that already exists comes back `ALREADY_EXISTS`, which counts as
success. Index builds run asynchronously, and the deploy doesn't wait for them.
Deleting an entry from the file does **not** drop the index; delete it in the
console.
