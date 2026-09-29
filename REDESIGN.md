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
| 6 | Nightly C: tick items off from the Telegram nudge (Worker) | done (#29), tested on staging |
| 7 | **Desktop layout** | to do, in scope (owner: last before ship) |
| 8 | Restyle the remaining old-theme screens: sign-in, account menu and Telegram setup, Access, Logins/vault | done (#32) |
| 9 | Staging reminder job and keyless Apps Script | to do (optional before ship) |
| 11 | Themes: picker, per-person sync, Water | Water in review; Earth, Fire, Air and a refreshed Space to follow |
| 10 | Rehearse on staging with a copy of live data, then ship | to do |

## Nightly C

Built: see `workers/telegram-webhook/README.md` for how it works, the one-time
Google setup per project, and how the buttons get turned on.

## Themes

Each person picks a theme from the account menu. The choice is saved to
`users/{uid}/settings/ui` (`{ theme }`) and cached on the device; picking one
reloads the app, the same way a system light/dark change does. Day and night
follow the phone within every theme.

A theme is more than colours: it can redraw the dial and the Nightly
backdrop. Water (`src/themes/water/`) is a pool of light: every screen sits
on a pale teal wash (deep blue at night) with soft light patterns, like sun
on the floor of a pool, built from a small SVG tile with nothing to
download (`caustics.js`); on the home screen they drift slowly. The dial is
a disc of live water drawn with WebGL on a transparent canvas: it fills as
the day gets done, reminders are lily pads, the ring round it is the
progress arc with a chip for the time, and finishing the day makes it
surge. Nightly keeps its animated forest-pool photo. The dial is loaded only
for people using Water, pauses off screen and in the background, lowers its
resolution on slow phones, slows for reduced motion, and falls back to the
plain dial where WebGL isn't available.

On the home screen Water is a beach seen from above (`Shore.jsx`): the
basin sits on sand, the sea starts where the list starts, and every few
seconds a wave washes up the sand with a foam edge and slides back, leaving
wet sand.

Space (`src/themes/space/`) is built the same way (in light mode it's dusk from orbit rather than a pale
page: a lighter indigo sky warming to rose, the brightest stars, a big
sunrise and the near world in dawn light, still with light text): every screen sits on a
starfield with faint nebula drawn in code (`starfield.js`, nothing to
download), and on the home screen a view from orbit: a near world's curved edge crosses
just below the dial and the list sits on its surface (night side with faint
city lights, a glowing band of atmosphere, aurora rippling above it and a
sunrise at one end), under a live nebula (`SpaceSky.jsx`: violet, magenta and teal
clouds, a dusty band across the sky) under crisp stars that drift at three
depths and twinkle, with the odd shooting star. The dial is a live gas
giant on a transparent canvas: the sun comes round it as the day gets done
(crescent to full), its orbit is the progress ring with a chip for the time,
reminders are moons at their hour that break orbit when ticked, and
finishing the day brings a sunrise flare. Its surface is a Gemini map
(`planet.jpg`, a seamless wrap-around map). Nightly shows a
Gemini Milky Way over an observatory, alive: twinkling stars, a breathing
dome light, a shooting star now and then and one on every tick.

Fire (`src/themes/fire/`) is a hearth at night. The dial is a fire pit seen
from above: a Gemini coal bed (`embers.jpg`, made to tile) under three
charred logs, flames that grow as the day gets done, a ring of stones lit
from inside; the progress ring is a line of embers, reminders are glowing
coals that flare and go up in sparks when ticked, and finishing the day makes
the fire roar. Above, night air with smoke and rising sparks; below, where
the list starts, a dark bed of breathing coals. Light mode is a sunset
hybrid with light text. Nightly shows a Gemini campfire (`nightly.jpg`) with
flicker, heat shimmer, twinkling stars and a flurry of sparks on each tick.
Display font: Unbounded.

Adding the next theme: its palettes in `src/dial/tokens.js`, an entry in
`src/themes/themeChoice.js`, and optionally its own dial and Nightly backdrop
under `src/themes/<name>/`. Keep it feeling like an app: we tried a
full-screen photoreal scene for Water and it read as a place, not a tool.
Designed, simplified surroundings with one live, detailed element (the
water) worked better.

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
