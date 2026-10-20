# CLAUDE.md

Guidance for Claude Code working in this repository.

Simple Chores is a Home Assistant custom integration for household chores (rooms, people,
recurring schedules, completion history), plus the Lovelace card that ships inside it.
`README.md` is the full reference for services, entities, the websocket API and card options.
This file covers what to know before changing code.

## Layout

```
custom_components/simple_chores/
  __init__.py            setup, service registration
  store.py               persistence (HA Store), validation; rooms, users, chores, history
  coordinator.py         DataUpdateCoordinator: due windows, revision digest, all mutations
  recurrence.py          next-due calculation (interval and anchored)
  websocket.py           simple_chores/chores and simple_chores/history commands
  sensor.py, binary_sensor.py, calendar.py
  statistics.py          the fixed-size `statistics` attribute
  notifications.py       daily due-chore push notifications
  frontend_resources.py  copies the card to www/community/simple_chores/ and registers it
  www/simple-chores-card.js   the card: one LitElement file, ~8,400 lines, no build step
tests/                   pytest suite; conftest.py stubs Home Assistant
tests/js/focus-view.test.mjs  loads the card into a stubbed context (Node only)
dashboards/chores-display.yaml  panel dashboard for the Cozyla wall tablet (focus board)
```

Other docs, oldest first: `NEXT_STEPS.md` is historical (it predates the rename and still talks
about `household-tasks-card`). `simple-chores-card/README.md` is older than the automatic card
registration; its resource path uses `simple-chores` with a hyphen, while the code uses
`simple_chores`. `STANDALONE_PLAN.md` plans a separate Supabase/React app, not this code.
`ROADMAP.md` lists planned work, with finished items under "Completed Features".

## Commands

```bash
pip install -r requirements_dev.txt     # the real homeassistant package is not needed
pytest tests/ -v                        # ~280 tests, under a second
node tests/js/focus-view.test.mjs       # card logic tests
ruff check custom_components/simple_chores
ruff format --check custom_components/simple_chores
mypy custom_components/simple_chores --config-file pyproject.toml
```

CI (`.github/workflows/ci.yaml`) runs all of these, plus `node --check` on the card and
hassfest, on every PR to `main`. `main` is protected, so changes land through pull requests.

## Data model

- **Rooms** are Home Assistant areas (`area_<area_id>`) or custom rooms (`custom_<hex>`).
- **Users** are HA users (32-character hex id) or custom users (`custom_user_<8 hex>`), which
  need no HA login. A child can be a custom user. `assigned_to` holds one of these ids. Resolve
  it to a name through the `users` attribute on `sensor.total_chores`, never show the raw id.
- **Chores** have a `frequency` (once, daily, weekly, biweekly, monthly, bimonthly, quarterly,
  biannual, yearly) and a `recurrence_type`. `interval` counts from the completion date.
  `anchored` pins to specific weekdays, a day of the month, or the nth weekday (see
  `recurrence.py`). Optional `estimated_minutes`, and up to 12 `steps` whose ticks persist in
  `step_progress`.
- **History** keeps up to `MAX_HISTORY_ENTRIES` (1000) completions in storage; the websocket
  exposes a recent subset.

## Rules that came from real bugs

1. **Never put growing data in state attributes.** Attributes go to every client on every
   update and are capped at 16 KB; the chore list once pushed `sensor.total_chores` to 30 KB
   and the recorder silently dropped it. The chore list and history are served over the
   websocket. Attributes stay fixed-size, and a `revision` digest tells clients when to
   re-fetch. Due windows are sent as id lists, nested: overdue ⊂ due_today ⊂ due_this_week.
2. **Refresh immediately after a user action.** Mutations call `_async_refresh_now()`
   (`async_refresh`), never `async_request_refresh()`, which is debounced by 10 seconds and
   made the UI lag behind each edit. `TestRefreshIsNotDebounced` enforces this.
3. **Sensor entity ids are fixed** in `const.py` (`SENSOR_*`): `sensor.chores_due_today`,
   `sensor.chores_due_next_7_days`, `sensor.overdue_chores`, `sensor.total_chores`. Other
   dashboards depend on them, including the wall card in `darthmario/ha-dashboards`. Don't
   rename them.
4. **Bump `version` in `manifest.json` whenever the card changes.** The integration serves the
   card as `/local/community/simple_chores/simple-chores-card.js?v=<version>`. Without a bump,
   browsers and the wall tablet keep running the cached old card. `manifest.json` is the
   version that matters; the one in `pyproject.toml` is stale.
5. **The card runs on a wall display**, so lists page instead of rendering every chore
   (`DEFAULT_CHORE_LIMIT`, `FOCUS_BOARD_LIMIT`). Keep new views paged as well.

## Deploying

`deploy.sh` (needs a `deploy.env`, which is gitignored) deletes `custom_components/simple_chores`
on the live Home Assistant box, copies this one over, and restarts Home Assistant unless given
`--no-restart`. That is the real house, so only deploy when Nate asks.

## Related

`darthmario/ha-dashboards` holds the Headwaters dashboards. Its wall card reads
`simple_chores/chores` over the websocket, re-fetches when `revision` changes, and calls
`simple_chores.complete_chore`. A kid-friendly chore view for Nova is a likely next project; the
focus view and custom users are the natural starting points.
