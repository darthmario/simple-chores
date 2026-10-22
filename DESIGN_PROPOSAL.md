# Design proposal: seeing steps, bringing the fun, and a creature for Nova

Written 2026-10-22 from a review of the card (`custom_components/simple_chores/www/simple-chores-card.js`,
v1.8.2), the backend, and the Headwaters wall card in `D:\Projects\ha-dashboards`. Nothing here is
built yet; it is a proposal to react to. Each part can land as its own PR.

Decisions so far (2026-10-22): Nova is 3¾ and not reading yet. The creature is a Headwaters-only
thing and lives in `ha-dashboards`, not in this integration. Parts 1 and 2 stay here.

---

## 1. Steps exist but you can't see them

### What the code does today

Steps (`steps`, `step_progress`) are rendered in exactly one place: `_renderSteps()` in the focus view.

| Where you look | What you see about steps |
|---|---|
| Focus view, deck layout | Checklist always open |
| Focus view, board layout | A small `2/5` chip next to the time chip; tap to open the checklist |
| List view (Due Today / Next 7 Days) | Nothing |
| All Chores modal | Nothing |
| Calendar agenda | Nothing |
| Complete Chore modal | Nothing |
| Edit Chore form | The step text inputs (editing, not progress) |
| Headwaters wall card | Nothing |

So unless you are in the focus view, a chore with twelve carefully written steps looks identical to one
with none. The list view is the default view, which is why it feels like steps are hidden.

### Proposal

- **List rows get a step chip.** In `_renderChore()`, add a `mdi:format-list-checks 2/5` item to the
  meta line whenever `chore.steps.length > 0`. Tapping it toggles an inline checklist under the row,
  reusing `_renderSteps()` and the existing optimistic `_toggleStep()`, so ticks sync across devices as
  they do in the focus view. The same row renderer serves the All Chores modal, so it comes free there.
- **A thin progress bar** under the chore name when progress is between 0 and 100 percent, so a
  half-done chore reads as half-done from across the room.
- **Auto-open when started.** A checklist with no ticks stays collapsed; one with any ticks opens by
  default (list and board). Finishing or completing the chore collapses it again, since
  `complete_chore` already resets `step_progress`.
- **Complete Chore modal shows the steps** read-only with their ticks, so when you mark something done
  you can see what was and wasn't ticked. No behaviour change: completing still clears progress.
- **Calendar agenda** shows only the count chip, no checklist, to keep the agenda dense.
- **Wall card** (other repo): a `2/5` suffix in the chore row's subline. Small follow-up over there.

Size: small. One card PR, a version bump in `manifest.json`, a focus-view test case or two in
`tests/js/focus-view.test.mjs` for the open-by-default rule.

---

## 2. Bringing the Headwaters fun into the card

### Why the card feels flat

The card's look is hard-coded and generic: a cyan-to-blue gradient header (`#06b6d4` to `#3b82f6`),
Tailwind-ish greens and oranges for status, square-ish buttons, system font, and it does not read any HA
theme variables for colour. The Headwaters wall card is the opposite: an illustrated scene that changes
with the season and time of day, cream translucent "paper" cards, soft green shadows, terracotta accents,
Bricolage Grotesque headings and Nunito Sans body, round check circles, pill badges.

Headwaters palette for reference (from `themes/headwaters-scene.yaml`):

| Role | Value |
|---|---|
| Card surface | `rgba(255, 253, 246, 0.92)`, radius 20px, shadow `0 6px 24px rgba(46,90,79,0.16)` |
| Ink / soft ink | `#274740` / `#4d6a5e` |
| Accent (terracotta) | `#de6a2f`, dark `#b9531f`, pale `#fdf1e4` |
| Secondary (forest) | `#4d7c6a` |
| Muted | `#9bb3a4`, `#7d958a` |
| Headings / body | Bricolage Grotesque / Nunito Sans |

### Proposal: a "paper" skin driven by theme variables

1. **Tokenise the card's colours.** Replace the hard-coded colours with `--sc-*` custom properties
   declared once on `:host`, each defaulting to an HA theme variable with a Headwaters-ish fallback:
   `--sc-ink: var(--primary-text-color, #274740)`, `--sc-accent: var(--primary-color, #de6a2f)`,
   `--sc-surface: var(--ha-card-background, ...)`, `--sc-heading-font: var(--ha-font-family-heading, ...)`.
   On the Cozyla, which runs the Headwaters Scene theme, the card automatically picks up the cream
   surfaces, terracotta, and the fonts without this repo shipping any font files. On a stock HA theme it
   still looks coherent, just less Headwaters. No new config options needed for the basics.
2. **Let the scene through.** Make the card background translucent paper rather than opaque, and set
   `theme: Headwaters Scene` on the chores dashboard (`dashboards/chores-display.yaml`) so the living
   scene from `headwaters-scene.js` paints behind the focus board on the wall tablet. That is the single
   biggest "fun" win and it is mostly a YAML line plus a few CSS rules.
3. **Replace the gradient header** with a paper header: title in the heading font, a one-line greeting
   that changes with the time of day and progress ("Good morning. 3 to go." / "All done, nice."), and a
   small day-progress ring (done today out of due today). Filters and view buttons become pill chips like
   the wall card's.
4. **Round check circles** like the wall card's `.chk` (2.5px muted border, fills terracotta with a
   check on tap) replace the square action buttons in list rows. Add a 250ms pop on tick.
5. **Celebrate everywhere.** The confetti in `_celebrate()` only fires from the focus view. Fire it from
   list completions too, and give the "nothing due" state a small illustration (a sleeping critter on a
   rock) instead of plain text.
6. **Status colours** come from the same palette: overdue uses the terracotta ink rather than red, done
   uses forest green, so the card stops looking like a status dashboard and more like a kitchen list.

What stays: layout, paging limits, all behaviour. This is a CSS-and-markup pass plus the header rewrite.

Size: medium. One card PR, mostly in `static get styles()`, plus the dashboard theme line. Screenshot
the list, board and deck before and after in a browser against a mock `hass`, as `tests/js` does.

---

## 3. A creature Nova feeds by doing chores (lives in `ha-dashboards`)

### Why no backend is needed

Everything the creature needs can be derived on the client from data the integration already serves,
so the companion can be a custom card in `ha-dashboards` with no changes to this integration:

| Need | Source already available |
|---|---|
| Nova's chores and their step ticks | `simple_chores/chores` websocket, filtered by `assigned_to`, re-fetched on `revision` |
| Last time Nova fed it | `simple_chores/history` websocket (300 entries, 365 days), newest entry with `completed_by` = Nova |
| Lifetime meals (XP) | `statistics.by_user` on `sensor.total_chores`, counts the full 1000-entry history |
| Streak | Count back through the history entries by Nova, same rule as `statistics._streak_days` |
| Season and daypart | `headwaters-scene.js` already computes both |
| Name and species | Card config in `wall/home.yaml` or `nova.yaml`; Nova picks once, Nate types it in |

Because fullness, XP, stage, mood and unlocks are all pure functions of history plus the clock, there is
nothing to persist and nothing to get out of sync across devices. The only thing a tap does is call
`simple_chores.complete_chore` or `simple_chores.toggle_chore_step` with Nova's custom user id, exactly
as the wall card completes chores today.

Two small, generic integration changes would make this nicer but are optional:

- **A chore `icon` field** (like rooms already have), so a pre-reader's tiles can show "make the bed"
  as a bed. Without it, the card config maps chore ids to icons by hand, which is fine for a list of
  three.
- **A `simple_chores_chore_completed` event** on the HA bus, so an automation can play a chime on the
  Cozyla or pulse Nova's room light when she feeds it. The card can call `tts.speak` or
  `media_player.play_media` itself instead, so this is a nice-to-have.

### Designing for a 3¾-year-old who doesn't read

- **Pictures, not words.** Each tile is one big icon and a photo-sized tap target. Names stay as small
  captions for the grown-ups.
- **One to three chores a day.** The view shows only chores assigned to Nova and due today or overdue,
  with no paging controls. Anything else is hidden.
- **Two taps to feed, like the garage.** Tap a tile: the otter sits up and the bowl wobbles. Tap the
  bowl (or the tile again) within three seconds: it eats. This reuses the wall card's double-tap
  convention and stops a passing swipe from completing "feed the dog".
- **Steps are bites.** A chore with steps shows them as a row of fish; tapping a fish feeds one bite
  (a `toggle_chore_step` call) and the otter nibbles. The last fish completes the chore.
- **No undo in her view.** If she taps something by mistake, a parent fixes it from the main card. Her
  view only ever feeds.
- **Sound.** A short chime on a bite, a happier one on a meal, a fanfare on a stage change. Generated
  with Web Audio so nothing has to be hosted; an optional `tts` line says "Pip says thank you, Nova."
- **It never dies.** Hungry means the otter looks at the empty bowl and its tummy rumbles (a little
  wobble). Asleep at night per the scene's daypart bands. Nothing is ever lost or taken away.
- **Growth she can see.** Egg on the rock for the first few meals, then a hatchling, then bigger.
  Milestones unlock a hat, a scarf in winter, a fish friend in the water. All derived from XP and
  season, so nothing to store.

### Mechanics (first cut, all numbers tunable)

| Thing | Rule |
|---|---|
| Meal | A chore completed by Nova. Fullness jumps to 100 and decays to 0 over 36 hours, paused during the night band. |
| Bite | A ticked step on one of Nova's open chores: +10 fullness on top of the decayed value, so partial chores keep it fed. |
| XP | 10 per meal (from `by_user.total_completed`), so stages are: egg 0, hatchling 5 meals, kid 25 meals, grown 75 meals. At one chore a day that is about a week, a month and two and a half months. |
| Streak | Consecutive days with a Nova completion, shown as a row of stars under the name (a 3-year-old counts stars; she doesn't read "4"). |
| Mood | asleep (night), happy (meal in the last hour), content (fullness over 30), hungry (under 30). |
| Unlocks | First meal: a bowl with a fish on it. Hatchling: a leaf hat. 7-day streak: a scarf. Winter: a snowball. Kid stage: a fish friend. Grown: a lily pad to lounge on. |

### Where it lives

- **A new custom card** in `www/resources/`, say `headwaters-nova-card.js`, following the wall card's
  conventions: plain custom element, no build step, conservative syntax (no `?.`, `??`, spread), data
  attributes and one delegated click handler, `esc()` on chore names, and the preview harness in `dev/`
  with a mock `hass` so it can be built in a browser.
- **A dashboard `nova.yaml`** with one panel view holding the card, registered beside `wall.yaml`. That
  makes it reachable from any device by URL, and from the Cozyla by tapping Nova's room pill or a new
  otter chip in the header.
- **A companion chip on the wall home screen** (small face with mood, fullness ring) that opens the
  nova dashboard. Follows once the card exists.
- **Art:** one otter as inline SVG with named parts (body, head, eyes, mouth, bowl, accessory slots)
  recoloured by CSS variables. CSS keyframes for idle bob, blink, eat, hop, and sleep. Season from the
  scene script picks the accessory. Draw a placeholder blob first and wire every state, then draw the
  otter once the motion feels right.

### Phasing

1. Steps visibility (part 1, this repo): small, ship first.
2. Paper skin plus scene theme on the chores dashboard (part 2, this repo).
3. `headwaters-nova-card` with placeholder creature, tiles, double-tap feed, bites, sounds
   (`ha-dashboards`).
4. Otter art, stages, unlocks, seasonal accessories; the wall-screen chip.
5. Optional: chore `icon` field and a completion event in this integration.

### Open questions

- Which custom user id is Nova's, and should her view also show unassigned chores a parent taps "with"
  her? Recommendation: assigned only, keep it hers.
- Otter to start, or let her pick between otter, fox and frog on day one? Picking is fun, but each
  species is a day of drawing, so otter first and a picker later.
