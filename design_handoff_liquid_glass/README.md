# Handoff: Orbit liquid-glass redesign

## Overview

A complete visual redesign of **Orbit** (`javoseabaugh-tech/orbit-todo`) — a React + Firestore
PWA for todos, thoughts, projects, a nightly routine and a household budget.

**Every feature and option is unchanged.** This is a re-skin plus a small amount of
regrouping, not a rewrite. No Firestore schema changes, no new collections, no new fields.

The visual direction is *liquid glass*: frosted translucent surfaces over a slowly drifting
coloured background, springy physics-based motion, and five generated colour themes that
replace the old five palettes.

## About the design files

`Orbit-prototype.html` in this bundle is a **design reference**, not production code.
It is a single self-contained HTML prototype with seeded demo data that shows the intended
look, layout and behaviour of every screen.

**The task is to recreate this design inside the existing React codebase**, using its
established patterns — inline style objects, `lucide-react` icons, Firestore listeners.
Do not copy the prototype's markup or its custom template syntax into the app.

Open it in a browser to click through: sign-in, the four lists, add-task sheet, theme menu,
Telegram wizard, Nightly, the Face ID gate, Budget, the Logins vault and Access.

## Fidelity

**High-fidelity.** Colours, typography, spacing, radii, shadows, easing curves and timings
are all final. Recreate them exactly. Where the prototype and the current app disagree on a
value, the prototype wins.

---

## Port order

Do these in order and deploy between steps. **Work on a branch** — a half-migrated `main`
must not ship. Each screen is independent, so a partially-migrated app still runs.

| # | Step | Files | Notes |
|---|------|-------|-------|
| 1 | Theme layer | `src/theme.js` | Replace wholesale with the `theme.js` in this bundle. Mostly mechanical — see below. |
| 2 | Fonts | `index.html` | Swap the Fraunces link for the Google Fonts link below. |
| 3 | App shell + task cards | `src/App.jsx` | Largest file, but already inline styles. |
| 4 | Thoughts | `src/App.jsx` | `GroupList`, `PersonChip`, modals. |
| 5 | Projects | `src/Workbench.jsx` | Self-contained. |
| 6 | Ask Star | `src/BrainDump.jsx` | New listening/parsing states. |
| 7 | Nightly | `src/Nightly.jsx` | Self-contained; own dark palette. |
| 8 | Access + gates | `src/AccessScreen.jsx`, `src/BudgetGate.jsx` | Small. |
| 9 | Budget | `src/Budget.jsx` | **Slowest.** Tailwind classes + a large `<style>` block to unwind. |
| 10 | Device pass | — | See the testing checklist. |

### Step 1 in detail — the theme layer

`theme.js` in this bundle is a **drop-in replacement** for `src/theme.js`. It keeps the same
public API (`theme`, `PALETTE`, `PALETTE_OPTIONS`, `paletteId`, `setPaletteId`, `prefersDark`)
and still exports **every key the old file exported**, so existing `theme.cardBg` /
`theme.textPrimary` references keep compiling against new values.

It adds:

- `glass` — surface recipes (`glass.card`, `glass.panel`, `glass.raised`, `glass.sheet`,
  `glass.bar`, `glass.accentFill`). Spread into inline styles:
  `<div style={{ ...glass.card, borderRadius: 22, padding: 14 }}>`
- `applyThemeVars(el)` — writes every token as a CSS custom property, so components can use
  `var(--tx)` instead of importing `theme`. Call once on the app root.
- `SPRING` and `EASE_OUT` easing constants.

**Critically: category colours are untouched.** Categories and people still store the keys
`blue | green | orange | yellow`. Those four keys now index four hues spread around the
active theme. Nothing in Firestore needs migrating, and category *names* are never used for
logic anywhere — only `category.color` (for tint) and `category.list` (to route a promoted
milestone into Work or Personal).

Per screen, the migration is: replace solid `background: theme.cardBg` with
`...glass.card`, bump `borderRadius` to the values in the token table, and swap transition
easing to `SPRING`.

---

## Design tokens

### Themes

Five themes replace Plum & Sage / Rose / Forest / Slate / Ember. Each is generated from a
single hue seed — adding a sixth is one line in `THEMES`.

| id | Label | Accent hue | Neutral hue | Blob hues |
|----|-------|-----------|-------------|-----------|
| `aurora` | Aurora | 195 | 230 | 195, 245, 285 |
| `nocturne` | Nocturne | 272 | 265 | 272, 225, 310 |
| `solstice` | Solstice | 58 | 62 | 58, 28, 92 |
| `bloom` | Bloom | 350 | 340 | 350, 310, 20 |
| `verdant` | Verdant | 158 | 152 | 158, 195, 120 |

Default is `aurora`. Light/dark still follows the OS, with a manual override added under the
theme list in the user menu. All colours are `oklch()` so light and dark derive from the same
seed at matched lightness.

### Glass surfaces

| Token | Blur | Shadow |
|-------|------|--------|
| `glass.card` | 22px | `0 10px 28px -20px` |
| `glass.panel` | 22px | `0 18px 44px -26px` |
| `glass.raised` (menus, modals) | 28px | `0 24px 60px -24px` |
| `glass.sheet` (bottom sheet) | 34px | `0 -20px 60px -24px` |
| `glass.bar` (top bar) | 18px | none, `border-bottom` only |

Every glass surface is:
`linear-gradient(157deg, --gh, --gl)` + `backdrop-filter: blur(N) saturate(180%)` +
`1px solid --gb` + `inset 0 1px 0 --ghi` (the specular top edge) + the drop shadow.
The inset highlight is what sells the glass — don't drop it.

### Typography

```html
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

| Role | Family | Usage |
|------|--------|-------|
| Display | Bricolage Grotesque 600, `letter-spacing: -.03em` | Page titles (30–42px), card titles (16–20px) |
| UI / body | Geist 400–600 | Everything else. Task text 15px/1.4 |
| Numerals | Geist Mono 400–600 | Money, dates, counts, tokens |

Replaces Fraunces + Inter. Task text uses `overflow-wrap: anywhere` and `text-wrap: pretty`.

### Radii

Task cards, project cards, thought cards **22px** · Columns, panels **26px** ·
Modals, drawers **28–30px** · Bottom sheet **30px** · Buttons, inputs **12–14px** ·
FAB **20–22px** · Pills, chips, tabs **999px**

### Motion

| Curve | Value | Used for |
|-------|-------|----------|
| `SPRING` | `cubic-bezier(.34,1.56,.64,1)` | Interactive state changes — checkboxes, chips, tabs, FAB, buttons |
| `EASE_OUT` | `cubic-bezier(.22,1,.36,1)` | Entrances — screens, rows, sheets |

Durations: micro-interactions 250–380ms · row/screen entrances 400–500ms ·
sheet 420ms · progress bars 700ms.

Named keyframes (see the prototype's `<style>` block): `drift1/2/3` (background blobs,
26–38s), `screenIn`, `rowIn` (staggered 35ms per row), `sheetIn`, `popIn`, `burst`
(check-off ring), `tick` (checkmark), `shimmer` (progress bar), `listen` (voice bars),
`glowPulse`, `spin`. All are disabled under `prefers-reduced-motion`.

---

## Screens

### Sign-in
Centred 380px glass card on the drifting background. New Orbit mark at 62px, "Orbit" in
Bricolage 34px, subtitle *"Everything you're carrying — work, life and the things still on
your mind."*, then the Google button (glass fill, real Google `G`). Footnote: *"Orbit is
private. Only invited accounts can sign in."*

### Main — mobile (below 1100px)
Sticky glass top bar: logo + wordmark left; Budget / Nightly / Access as 34px glass squircles
plus the avatar right. Then the page title (`Today's focus` / `Clear your head` / `Projects`)
with a live subtitle, the All dates ⇄ Today only pill, and the Ask Star row.

**The four lists moved to a floating glass tab bar at the bottom** (Work · Personal ·
Thoughts · Projects) — the main regrouping in this redesign. Active tab is an accent-filled
pill. The `+` FAB sits above it at `bottom: 100px`.

Task cards: drag handle, 23px circular checkbox, text, badge row (due / time / repeat /
category), pencil. Overdue cards get a red-tinted glass fill and border. Swipe left to
delete, swipe right to set a reminder.

### Main — desktop (1100px and up)
Three glass columns — Work, Personal, Projects. Clicking one focuses it (accent border +
soft ring); the `+` FAB adds to the focused column. Each column keeps **its own** category
filter. Thoughts becomes a 460px right-hand drawer opened by a secondary FAB.

Desktop task rows have **no drag handle** and gain explicit **clock** (time-sensitive) and
**trash** buttons — swipe is mobile-only.

### Thoughts
Glass capture card with textarea, date pill, person chips, "New person", and an accent
Capture button that only fills once there's text. Below: groups (Unassigned first, then each
person) with a glowing colour dot, uppercase name, count. Stale thoughts get a gold-tinted
border and a "Sitting 9d ago" badge.

### Projects
Filter pills (Work / Personal) + "New project", which opens a glass panel with title,
category chips and an optional deadline. Project cards show a shimmering accent progress bar,
`40% · 2/5 milestones · due Sep 12`, and expand to milestones. Promote (↗) copies a milestone
into today's list and turns into an "In today ✕" pill; done-state stays in sync both ways.

### Ask Star
Idle: glass pill with a gradient badge and a pulsing ring, plus keyboard and paperclip
buttons. Listening: accent-ringed card with five animated bars and live transcript.
Parsing: spinner, *"Star is sorting that out…"*. Typing: inline input with a send button.

### Nightly
**Intentionally dark regardless of theme** — `radial-gradient(120% 80% at 50% -10%, #1b1830,
#0c0a14 62%, #07060c)`, gold accent `#e8c184`, text `#e9e3f2`. An 88px moon waxes with
completion (a gold disc with a dark disc sliding across it, 800ms `EASE_OUT`) with a warm
glow. Tonight's list, "Coming up", carried-over items marked with a pulsing gold dot, then
the add field with date + repeat pills and the repeating-templates section.

### Budget
Face ID gate first (prompt → verifying spinner → open; "Not now" and "Back to Orbit" both
work). Then Budget / Logins segmented control, 15th / 30th period toggle, glass account
cards with editable name and balance and live Assigned / Left, an "Add account" dashed card
(max 3), and a **floating bubble bottom-right that minimises the account cards** — collapsed
it shows each account's name and remaining.

Bills: name is a dropdown of saved logins, plus status, amount and account. Paid and
"no payment needed" rows hide themselves; "Unhide N hidden" and "Reset all to unpaid" bring
them back. Add-bill row at the bottom. When everything is handled, an accent celebration card
appears.

Logins: locked vault (Face ID button, divider, passphrase) or unlocked list with
website / username / password rows, reveal and copy buttons, monospace values.

### Access
Add-person card (email + role select), then a card per person with role dropdown, and
role-specific controls: household shows "Shares the budget automatically", guardian gets the
budget-shared toggle, assistant gets Shared Work + Projects with a category scope dropdown.
The owner row is locked with a shield pill.

### Menus
User menu is a 246px raised-glass popover: name/role header, Theme (expands to the five
swatches + light/dark toggle), Notifications, Request shared budget, Sign out.
The Telegram wizard is a three-step glass modal matching the current copy exactly.

---

## Interactions to preserve

- **Check off a task** — checkbox fills with the accent gradient, the tick animates in
  (`tick`, 450ms spring), an accent ring bursts outward (`burst`, 620ms), the row fades to
  62% and the text strikes through.
- **Swipe (mobile only)** — the row translates up to ±150px over a revealed action layer;
  past −95px it deletes.
- **Drag to reorder (mobile only)** — grab the handle; the row lifts (scale 1.02, deeper
  shadow) and follows the pointer.
- **Tab switch** — the active pill morphs with the spring curve.
- **Today only** — hides strictly-future due dates. Overdue and undated always stay visible.
- **Category filters are per-list** — filtering Work must not affect Personal. Matches the
  existing `desktopCategoryFilters`.

## Assets

- **Icons** — `lucide-react`, already a dependency. The prototype inlines an SVG sprite built
  from the Lucide source (`icons.svg` is included for reference only). In the app, keep using
  `lucide-react` components. Sizes: 14px in rows, 15–16px in chrome, 18px in the tab bar,
  19–26px in headers and the FAB. Default colour `theme.textFainter`, accent on hover/active.
- **Logo** — new mark: a filled accent-gradient disc, a rotated elliptical orbit ring at 55%
  opacity, and a small satellite dot. Drawn inline as SVG in the prototype; export to replace
  `src/assets/orbit-icon.png`, the favicons and the apple-touch-icon.
- **`theme-color` meta** in `index.html` should follow the active theme accent.

## Performance note — read before shipping

`backdrop-filter` is the one real risk. Every card in a long scrolling list is a separately
composited blurred layer, which can drop frames on older iPhones. Mitigations, in order:

1. Keep blur radii as specified — don't raise them.
2. Consider dropping list-item cards to `glass.card` without blur when a list exceeds ~30
   rows, keeping true blur for chrome, sheets and modals.
3. Provide a solid-tint fallback behind `@supports not (backdrop-filter: blur(1px))`.

Test on the oldest device that actually runs the app before deploying.

## Testing checklist

- [ ] All five themes in both light and dark; check contrast on muted text
- [ ] Existing categories and people keep sensible colours (no migration run)
- [ ] Resize across the 1100px breakpoint — columns appear, swipe turns off, row buttons appear
- [ ] Scroll performance on the oldest real device
- [ ] iOS standalone PWA: safe-area insets under the bottom tab bar
- [ ] `prefers-reduced-motion` disables the drifting blobs and all entrances
- [ ] Firestore writes unchanged — add, edit, toggle, delete, reorder, promote
- [ ] Face ID gate and vault unlock still work on device

## Files in this bundle

| File | What it is |
|------|-----------|
| `Orbit-prototype.html` | The full interactive design reference. Open in a browser. |
| `theme.js` | Drop-in replacement for `src/theme.js`. Production-ready. |
| `icons.svg` | Lucide sprite used by the prototype. Reference only — the app uses `lucide-react`. |
