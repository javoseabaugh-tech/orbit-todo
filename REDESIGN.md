# Orbit redesign: roadmap

The redesign is built on the `redesign` branch and tested on staging
(https://orbit-staging-49988.web.app). Nothing reaches live until the owner
asks for the ship PR (`redesign` → `main`); see CLAUDE.md and STAGING.md.

## Agreed spec

- **Look:** "Orbit Dial" (direction B). Deep-space dark, a pale light mode,
  inverse sheets, amber for anything assigned to someone else. Tokens live in
  `src/dial/tokens.js`.
- **Sections:** Work, Personal and Thoughts, clearly separated.
- **Reminders:** quick add with chips for when, remind-at time, repeat, who and list.
- **Assigning replaces categories:** a todo assigned to someone is filed in
  their shared category, which their existing access rule already lets them
  see. No data migration.
- **Thoughts:** a private Messages-style inbox, one conversation per person
  plus "Just me".
- **Budget:** same data and save path, but the whole pay period fits on one screen.
- **Nightly:** kept, plus A to D below.
- **Removed:** Star (in-app AI) and Workbench. The Gemini key and the Gemini
  morning digest stay.
- **Constraints:** free Spark plan, no service account keys, and nothing
  deployed by hand.

## Status

| Step | What | State |
| --- | --- | --- |
| 1 | Shell, Work/Personal with the dial, quick add, assigning | done (#19) |
| 2 | Thoughts inbox | done (#20) |
| 3 | Budget on one screen, staging-only import from backup | done (#23) |
| 4 | Nightly A (set up tomorrow) and B (streaks) | done (#26) |
| 5 | Nightly D: shared household items (new rules, nudge script) | done (#27) |
| 6 | Nightly C: tick items off from the Telegram nudge (Worker) | next, see below |
| 7 | **Desktop layout** | to do, in scope |
| 8 | Restyle the remaining old-theme screens: sign-in, account menu and Telegram setup, Access, Logins/vault, Nightly's add controls | to do |
| 9 | Staging reminder job and keyless Apps Script | to do (optional before ship) |
| 10 | Rehearse on staging with a copy of live data, then ship | to do |

## Nightly C: plan and where it stands

Goal: the 6pm Telegram nudge gets a button per item, and tapping it marks
that Nightly item done without opening the app.

- Taps arrive at each person's bot webhook, the Cloudflare Worker
  `orbit-telegram-webhook` (`https://orbit-telegram-webhook.javoseabaugh.workers.dev/<botToken>`).
  Its source isn't in this repo yet. Step one is to read it through the
  Cloudflare API (`CLOUDFLARE_API_TOKEN` in the session environment) and
  commit it under `workers/telegram-webhook/` unchanged, so every later change
  is a reviewable diff.
- Worker change: handle `callback_query` with data like
  `n:<scope>:<itemId>` (scope `u` = the person's own list, `h` = household).
  Mark that item done (household items also get `doneBy`), answer the
  callback, and edit the message to tick the line. Only act for the chat that
  owns the bot. It must never touch anything outside `nightly`.
- Nudge change (`apps-script/nightly/Code.js`): send an inline keyboard with
  one button per pending item. Items that only exist as a template tonight
  (the app hasn't generated them yet) need the button to create the
  deterministic `${templateId}_${date}` doc, so the Worker handles a create
  for that ID if it's missing.
- Live impact at ship time: Worker deploy plus the nudge script push. Decide
  first how the Worker deploys: a GitHub Actions job using a Cloudflare token
  stored as a GitHub secret, since Cloudflare has no keyless OIDC login.
  Until then, by hand.

## Desktop layout (in scope, not started)

Live Orbit has a real desktop layout: three columns at 1100px and up
(Work · Personal · Projects), two columns at 760px, and explicit row buttons
for mouse users. So far the redesign is phone-first: every screen is a single
column capped at 640px and centered, which works on a laptop but wastes the
width. **Shipping the redesign as it stands would be a step back on desktop,
so this has to land before the ship PR.**

What it should cover, to be confirmed with the owner before building:
- Work and Personal side by side on wide screens, with the dial shared or one per list.
- Thoughts as a two-pane layout: the inbox on the left, the open conversation on the right.
- Budget with the overview and accounts beside the bill grid instead of above it.
- The add/edit sheet as a centered dialog, not a bottom sheet.
- Hover states and keyboard use (Enter to save, Esc to close, focus rings)
  everywhere, since there's no swipe on desktop.
