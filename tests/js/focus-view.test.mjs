// Focus view ("chore book") tests.
//
// Loads simple-chores-card.js into a stubbed browser context so the card's
// logic can be exercised without a real DOM or Home Assistant. This is not a
// substitute for looking at the card in HA - it covers the ordering,
// filtering, date and optimistic-update logic that is easy to get wrong.
//
// Run with: node tests/js/focus-view.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = readFileSync(
  path.join(repoRoot, 'custom_components', 'simple_chores', 'www', 'simple-chores-card.js'),
  'utf8'
);

const tag = (strings, ...values) => ({ _tpl: true, strings, values });

class StubLitElement {
  static get properties() { return {}; }
  constructor() { this._stubProps = {}; }
  requestUpdate() {}
  connectedCallback() {}
  disconnectedCallback() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
  get shadowRoot() { return { querySelector: () => null, querySelectorAll: () => [] }; }
}
StubLitElement.prototype.html = tag;
StubLitElement.prototype.css = tag;

const defined = new Map();
const sandbox = {
  console: { info() {}, warn() {}, error: console.error, debug() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Event: class { constructor(t) { this.type = t; } },
  CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
  ResizeObserver: class { observe() {} disconnect() {} },
  customElements: {
    define: (name, ctor) => defined.set(name, ctor),
    get: (name) => defined.get(name),
    whenDefined: () => Promise.resolve(),
  },
  document: {
    readyState: 'complete',
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    // The effective _showToast builds a real DOM node and appends it to body
    createElement: () => ({ style: {}, remove() {}, textContent: '' }),
    body: { appendChild() {}, removeChild() {} },
  },
};
sandbox.window = sandbox;
sandbox.window.LitElement = StubLitElement;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const Card = defined.get('simple-chores-card');
assert.ok(Card, 'card class was registered');

// The card does `instanceof Date` checks, and instanceof is realm-scoped -
// a Date built out here is not an instance of the sandbox's Date. Use the
// sandbox constructor whenever a Date crosses the boundary.
const SandboxDate = vm.runInContext('Date', sandbox);

// --- Fixtures -------------------------------------------------------------

const TODAY = new Date();
const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const daysAgo = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; };

const chore = (over) => ({
  id: 'x', name: 'Chore', room_id: 'area_kitchen', room: 'Kitchen',
  frequency: 'daily', next_due: iso(TODAY), days_overdue: 0,
  estimated_minutes: null, steps: [], step_progress: [], assigned_to: null,
  ...over,
});

const CHORES = [
  chore({ id: 'a', name: 'Wipe stove', estimated_minutes: 5 }),
  chore({ id: 'b', name: 'Fold laundry', estimated_minutes: 30 }),
  chore({ id: 'c', name: 'Dishes', estimated_minutes: 15, days_overdue: 3 }),
  chore({ id: 'd', name: 'Mystery chore' }),                       // no estimate
  chore({ id: 'e', name: 'Water plants', estimated_minutes: 2 }),
];

function choresResponse(chores, revision = 'rev1') {
  return {
    revision,
    chores,
    due_today: chores.map(c => c.id),
    due_this_week: [],
    overdue: chores.filter(c => c.days_overdue > 0).map(c => c.id),
    today: '2026-07-26',
    seven_days_from_today: '2026-08-02',
  };
}

/**
 * Seed the websocket-backed chore cache synchronously, mirroring what
 * _fetchChores does, so tests of render/filter logic don't all have to await.
 */
function seedChores(card, chores, revision = 'rev1') {
  const normalized = chores.map(c => card._normalizeChore(c));
  card._choresData = {
    revision,
    loaded: true,
    chores: normalized,
    byId: new Map(normalized.map(c => [c.id, c])),
    dueToday: normalized.map(c => c.id),
    dueThisWeek: [],
    overdue: normalized.filter(c => c.days_overdue > 0).map(c => c.id),
  };
  return card;
}

function makeCard(stats = null, chores = CHORES, { seed = true } = {}) {
  const card = new Card();
  card.setConfig({ type: 'custom:simple-chores-card' });
  card.hass = {
    user: { id: 'u1' },
    areas: {},
    states: {
      'sensor.chores_due_today': { state: String(chores.length), attributes: { date: '2026-07-26' } },
      'sensor.chores_due_next_7_days': { state: '0', attributes: {} },
      'sensor.overdue_chores': { state: '1', attributes: { max_days_overdue: 3 } },
      'sensor.total_chores': {
        state: String(chores.length),
        attributes: {
          total_count: chores.length,
          revision: 'rev1',
          rooms: [{ id: 'area_kitchen', name: 'Kitchen', icon: 'mdi:silverware-fork-knife' }],
          users: [{ id: 'u1', name: 'Nate' }],
          ...(stats ? { statistics: stats } : {}),
        },
      },
    },
    callService: async () => {},
    callWS: async (msg) => {
      if (msg.type === 'simple_chores/chores') return choresResponse(chores);
      if (msg.type === 'simple_chores/history') return { history: [] };
      return {};
    },
  };
  if (seed) seedChores(card, chores);
  return card;
}

const results = [];
const sameList = (a, b) => assert.equal(JSON.stringify(Array.from(a)), JSON.stringify(b));
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', `${name} -> ${e.message}`]); }
};

// --- Ordering -------------------------------------------------------------

await check('most overdue chore comes first', () => {
  const q = makeCard()._getFocusQueue();
  assert.equal(q[0].id, 'c');
});

await check('quickest chore comes first among non-overdue', () => {
  const q = makeCard()._getFocusQueue().filter(c => !c.days_overdue);
  sameList(q.map(c => c.id), ['e', 'a', 'b', 'd']);
});

await check('chore with no estimate sorts last', () => {
  const q = makeCard()._getFocusQueue();
  assert.equal(q[q.length - 1].id, 'd');
});

// --- Time budget ----------------------------------------------------------

await check('5 minute budget keeps only chores at or under 5', () => {
  const card = makeCard();
  card._setTimeBudget(5);
  sameList(card._getFocusQueue().map(c => c.id).sort(), ['a', 'e']);
});

await check('time budget excludes chores with no estimate', () => {
  const card = makeCard();
  card._setTimeBudget(30);
  assert.ok(!card._getFocusQueue().some(c => c.id === 'd'));
});

await check('null budget shows everything', () => {
  const card = makeCard();
  card._setTimeBudget(5);
  card._setTimeBudget(null);
  assert.equal(card._getFocusQueue().length, CHORES.length);
});

// --- Shuffle --------------------------------------------------------------

await check('shuffle keeps every chore and resets to the first card', () => {
  const card = makeCard();
  card._focusIndex = 3;
  card._focusShuffle();
  const q = card._getFocusQueue();
  assert.equal(q.length, CHORES.length);
  sameList(q.map(c => c.id).sort(), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(card._focusIndex, 0);
});

await check('shuffle never lands on the card already showing', () => {
  for (let i = 0; i < 200; i++) {
    const card = makeCard();
    const before = card._getFocusQueue()[card._clampFocusIndex(card._getFocusQueue())].id;
    card._focusShuffle();
    assert.notEqual(card._getFocusQueue()[0].id, before);
  }
});

await check('a chore added after a shuffle still appears', () => {
  const card = makeCard();
  card._focusShuffle();
  card._focusOrder = ['a', 'b'];  // simulate a stale order
  assert.equal(card._getFocusQueue().length, CHORES.length);
});

// --- Dismissal ------------------------------------------------------------

await check('dismissing removes a chore from the queue immediately', () => {
  const card = makeCard();
  card._dismissFromFocus('a');
  assert.ok(!card._getFocusQueue().some(c => c.id === 'a'));
});

await check('restoring after a failed service call brings it back', () => {
  const card = makeCard();
  card._dismissFromFocus('a');
  card._restoreToFocus('a');
  assert.ok(card._getFocusQueue().some(c => c.id === 'a'));
});

await check('index clamps when the queue shrinks under it', () => {
  const card = makeCard();
  card._focusIndex = 4;
  card._dismissFromFocus('a');
  card._dismissFromFocus('b');
  const q = card._getFocusQueue();
  assert.equal(card._clampFocusIndex(q), q.length - 1);
});

await check('clamp returns 0 for an empty queue', () => {
  assert.equal(makeCard()._clampFocusIndex([]), 0);
});

// --- Steps ----------------------------------------------------------------

await check('step state reads from the backend by default', () => {
  const card = makeCard();
  const c = chore({ id: 's', steps: ['one', 'two'], step_progress: [1] });
  assert.equal(card._stepIsDone(c, 0), false);
  assert.equal(card._stepIsDone(c, 1), true);
  assert.equal(card._countDoneSteps(c), 1);
});

await check('an optimistic tick wins over stale backend state', () => {
  const card = makeCard();
  const c = chore({ id: 's', steps: ['one', 'two'], step_progress: [] });
  card._stepOptimistic = { 's:0': true };
  assert.equal(card._stepIsDone(c, 0), true);
  assert.equal(card._countDoneSteps(c), 1);
});

// --- Statistics (now precomputed by the backend) --------------------------

await check('done-today reads the statistics attribute', () => {
  assert.equal(makeCard({ done_today: 4 })._getDoneTodayCount(), 4);
});

await check('streak reads the statistics attribute', () => {
  assert.equal(makeCard({ streak_days: 6 })._getStreak(), 6);
});

await check('missing statistics degrade to zero, not NaN', () => {
  const card = makeCard();
  assert.equal(card._getStats(), null);
  assert.equal(card._getDoneTodayCount(), 0);
  assert.equal(card._getStreak(), 0);
});

await check('stats data maps the backend shapes onto the dashboard', () => {
  const card = makeCard({
    total_completions: 12,
    top_chores: { most_completed: [{ name: 'Dishes', count: 5 }], least_completed: [] },
    by_room: [{ id: 'area_kitchen', name: 'Kitchen', icon: 'mdi:pot', completions: 5 }],
    by_user: [{ id: 'u1', name: 'Nate', count: 12 }],
    by_period: { '4w': [{ start: '2026-07-06', count: 2 }, { start: '2026-07-13', count: 3 }] },
  });
  card._statsTimePeriod = '4w';
  const stats = card._calculateStatsData();
  assert.equal(stats.totalCompletions, 12);
  assert.equal(stats.topChores.mostCompleted[0].name, 'Dishes');
  assert.equal(stats.roomStats[0].completions, 5);
  assert.equal(stats.userStats[0].count, 12);
  sameList(stats.completionsOverTime.map(b => b.count), [2, 3]);
});

await check('empty statistics produce a renderable zero state', () => {
  const stats = makeCard()._calculateStatsData();
  assert.equal(stats.totalCompletions, 0);
  sameList(stats.completionsOverTime, []);
  sameList(stats.roomStats, []);
  sameList(stats.userStats, []);
  sameList(stats.topChores.mostCompleted, []);
});

await check('period buckets get the right labels per grouping', () => {
  const card = makeCard();
  const buckets = [{ start: '2026-07-20', count: 1 }, { start: '2026-07-21', count: 2 }];
  sameList(card._formatPeriodBuckets(buckets, 'day').map(b => b.label), ['Mon', 'Tue']);
  sameList(card._formatPeriodBuckets(buckets, 'week').map(b => b.label), ['W1', 'W2']);
  sameList(card._formatPeriodBuckets([{ start: '2026-03-01', count: 0 }], 'month').map(b => b.label), ['Mar']);
});

await check('bucket labels use local dates, not UTC-shifted ones', () => {
  // "2026-07-20" is a Monday; naive Date() parsing would drift it a day west of UTC
  assert.equal(makeCard()._formatPeriodBuckets([{ start: '2026-07-20', count: 0 }], 'day')[0].label, 'Mon');
});

await check('an unknown period yields an empty chart rather than throwing', () => {
  const card = makeCard({ total_completions: 3, by_period: {} });
  card._statsTimePeriod = 'nope';
  sameList(card._calculateStatsData().completionsOverTime, []);
});

// --- History over the websocket -------------------------------------------

await check('history is fetched over the websocket and sorted newest first', async () => {
  const card = makeCard({ total_completions: 2 });
  const calls = [];
  card.hass.callWS = async (msg) => {
    calls.push(msg);
    return { history: [
      { chore_name: 'Old', completed_at: '2026-07-01T10:00:00+00:00' },
      { chore_name: 'New', completed_at: '2026-07-20T10:00:00+00:00' },
    ] };
  };
  await card._fetchHistory();
  assert.equal(calls[0].type, 'simple_chores/history');
  assert.equal(card._getCompletionHistorySync()[0].chore_name, 'New');
});

await check('history is not re-fetched while the completion count is unchanged', async () => {
  const card = makeCard({ total_completions: 2 });
  let calls = 0;
  card.hass.callWS = async () => { calls++; return { history: [] }; };
  await card._fetchHistory();
  await card._fetchHistory();
  await card._fetchHistory();
  assert.equal(calls, 1);
});

await check('a new completion invalidates the cached history', async () => {
  const card = makeCard({ total_completions: 2 });
  let calls = 0;
  card.hass.callWS = async () => { calls++; return { history: [] }; };
  await card._fetchHistory();
  card.hass = { ...card.hass, states: { ...card.hass.states,
    'sensor.total_chores': { attributes: { ...card.hass.states['sensor.total_chores'].attributes,
      statistics: { total_completions: 3 } } } } };
  await card._fetchHistory();
  assert.equal(calls, 2);
});

await check('a websocket failure leaves the card usable', async () => {
  const card = makeCard({ total_completions: 1 });
  card.hass.callWS = async () => { throw new Error('disconnected'); };
  await card._fetchHistory();
  sameList(card._getCompletionHistorySync(), []);
});

await check('history modal fetch forces a refresh', async () => {
  const card = makeCard({ total_completions: 1 });
  let calls = 0;
  card.hass.callWS = async () => { calls++; return { history: [] }; };
  await card._fetchHistory();
  await card._getCompletionHistory();
  assert.equal(calls, 2, 'opening the modal should always re-read');
});

// --- Formatting -

await check('minutes format readably', () => {
  const card = makeCard();
  assert.equal(card._formatMinutes(5), '5 min');
  assert.equal(card._formatMinutes(60), '1 hr');
  assert.equal(card._formatMinutes(90), '1 hr 30 min');
});

await check('clock pads seconds', () => {
  const card = makeCard();
  assert.equal(card._formatClock(300), '5:00');
  assert.equal(card._formatClock(65), '1:05');
  assert.equal(card._formatClock(9), '0:09');
});

await check('estimate parsing handles blanks, junk and clamping', () => {
  const card = makeCard();
  assert.equal(card._parseEstimatedMinutes(''), null);
  assert.equal(card._parseEstimatedMinutes(null), null);
  assert.equal(card._parseEstimatedMinutes('abc'), null);
  assert.equal(card._parseEstimatedMinutes(0), null);
  assert.equal(card._parseEstimatedMinutes(-5), null);
  assert.equal(card._parseEstimatedMinutes('7'), 7);
  assert.equal(card._parseEstimatedMinutes(99999), 480);
});

await check('step cleaning drops blanks and trims', () => {
  const card = makeCard();
  sameList(card._cleanSteps(['  a  ', '', '   ', 'b']), ['a', 'b']);
  sameList(card._cleanSteps(undefined), []);
});

await check('chore minutes rejects zero and garbage', () => {
  const card = makeCard();
  assert.equal(card._choreMinutes({ estimated_minutes: 0 }), null);
  assert.equal(card._choreMinutes({ estimated_minutes: 'x' }), null);
  assert.equal(card._choreMinutes({}), null);
  assert.equal(card._choreMinutes({ estimated_minutes: 5 }), 5);
});

// --- Timer ----------------------------------------------------------------

await check('timer starts, ticks down and stops', () => {
  const card = makeCard();
  card._startTimer(chore({ id: 'a', estimated_minutes: 5 }));
  assert.equal(card._focusTimer.total, 300);
  assert.equal(card._focusTimer.choreId, 'a');
  card._focusTimer.endsAt = Date.now() + 1000;
  card._tickTimer();
  assert.ok(card._focusTimer.remaining <= 1);
  card._focusTimer.endsAt = Date.now() - 1;
  card._tickTimer();
  assert.equal(card._focusTimer.remaining, 0);
  assert.equal(card._focusTimer.finished, true);
  card._stopTimer();
  assert.equal(card._focusTimer, null);
});

await check('timer refuses to start without an estimate', () => {
  const card = makeCard();
  card._startTimer(chore({ id: 'd' }));
  assert.equal(card._focusTimer, null);
});

await check('stopping another chore\'s timer leaves this one running', () => {
  const card = makeCard();
  card._startTimer(chore({ id: 'a', estimated_minutes: 5 }));
  card._stopTimer('other');
  assert.ok(card._focusTimer);
  card._stopTimer('a');
  assert.equal(card._focusTimer, null);
});

// --- Config ---------------------------------------------------------------

await check('default_view focus opens the focus view', () => {
  const card = new Card();
  card.setConfig({ type: 'custom:simple-chores-card', default_view: 'focus' });
  assert.equal(card._currentView, 'focus');
});

await check('focus_layout board pins the board layout', () => {
  const card = new Card();
  card.setConfig({ type: 'custom:simple-chores-card', focus_layout: 'board' });
  assert.equal(card._focusMode, 'board');
  assert.equal(card._userOverrodeFocusMode, true);
});

await check('view toggle returns to list on second press', () => {
  const card = makeCard();
  card._setView('focus');
  assert.equal(card._currentView, 'focus');
  card._setView('focus');
  assert.equal(card._currentView, 'list');
});

// --- Render smoke test ----------------------------------------------------

await check('focus view renders in both layouts without throwing', () => {
  for (const mode of ['deck', 'board']) {
    const card = makeCard([{ completed_at: new Date().toISOString() }]);
    card._focusMode = mode;
    card._renderFocusView();
    card._setTimeBudget(5);
    card._renderFocusView();
    card._setTimeBudget(2);   // filters everything but one
    card._renderFocusView();
    card._timeBudget = 1;     // empty state
    card._renderFocusView();
  }
});

await check('empty and celebration states render', () => {
  const card = makeCard();
  for (const id of ['a', 'b', 'c', 'd', 'e']) card._dismissFromFocus(id);
  card._renderFocusView();
  card._focusStartGetAhead();
  card._renderFocusView();
  card._celebrate('a');
  assert.equal(card._celebration.particles.length, Card.constants.CELEBRATION_PARTICLES);
  card._renderFocusView();
  card._stopTimer();
});

await check('a card with steps and a running timer renders', () => {
  const card = makeCard();
  const c = chore({ id: 'a', estimated_minutes: 5, steps: ['one', 'two'], step_progress: [0] });
  card._startTimer(c);
  card._renderFocusCard(c, { expanded: true });
  card._renderFocusCard(c, { expanded: false });
  card._stopTimer();
});

await check('chore form fields render for add and edit', () => {
  const card = makeCard();
  card._formData.chore.steps = ['one', 'two'];
  card._formData.chore.estimatedMinutes = 5;
  card._renderFocusFields();
});

// --- updated() housekeeping ----------------------------------------------

const hassChanged = new Map([['hass', {}]]);

await check('dismissal is kept while the sensor still lists the chore', () => {
  const card = makeCard();
  card._dismissFromFocus('a');
  card.updated(hassChanged);
  assert.equal(card._focusDismissed.a, true);
});

await check('dismissal is dropped once the backend catches up', () => {
  const card = makeCard();
  card._dismissFromFocus('a');
  // Same revision, so _fetchChores stays out of the way and we isolate the
  // housekeeping in updated()
  seedChores(card, CHORES.filter(c => c.id !== 'a'));
  card.updated(hassChanged);
  assert.equal('a' in card._focusDismissed, false);
});

await check('updated() is a no-op when nothing is pending', () => {
  const card = makeCard();
  const before = card._focusDismissed;
  card.updated(hassChanged);
  assert.equal(card._focusDismissed, before);
});

await check('optimistic step tick clears once the backend agrees', () => {
  const card = makeCard();
  card._stepOptimistic = { 'a:0': true };
  card.updated(hassChanged);
  assert.equal(card._stepOptimistic['a:0'], true, 'held while backend disagrees');

  seedChores(card, CHORES.map(c => (c.id === 'a' ? { ...c, steps: ['one'], step_progress: [0] } : c)));
  card.updated(hassChanged);
  assert.equal('a:0' in card._stepOptimistic, false, 'released once backend agrees');
});

await check('updated() ignores non-hass changes', () => {
  const card = makeCard();
  card._dismissFromFocus('a');
  card.updated(new Map([['_focusIndex', 0]]));
  assert.equal(card._focusDismissed.a, true);
});

// --- Optimistic actions ---------------------------------------------------

await check('a successful action leaves the chore dismissed', async () => {
  const card = makeCard();
  const calls = [];
  card.hass.callService = async (...args) => { calls.push(args); };
  card._focusComplete(CHORES[0]);
  assert.equal(card._focusDismissed.a, true);
});

await check('a failed action puts the chore back', async () => {
  const card = makeCard();
  card.hass.callService = async () => { throw new Error('boom'); };
  await card._focusSnooze(CHORES[0]);
  assert.equal('a' in card._focusDismissed, false);
});

await check('completing passes the current user through', async () => {
  const card = makeCard();
  const calls = [];
  card.hass.callService = async (domain, service, data) => { calls.push([domain, service, data]); };
  await card._focusComplete(CHORES[0]);
  assert.equal(calls[0][1], 'complete_chore');
  assert.equal(calls[0][2].chore_id, 'a');
  assert.equal(calls[0][2].user_id, 'u1');
  card._stopTimer();
});

await check('toggling a step calls the service with an explicit value', async () => {
  const card = makeCard();
  const calls = [];
  card.hass.callService = async (domain, service, data) => { calls.push([service, data]); };
  const c = chore({ id: 's', steps: ['one', 'two'], step_progress: [] });
  await card._toggleStep(c, 1);
  assert.equal(calls[0][0], 'toggle_chore_step');
  assert.equal(calls[0][1].step_index, 1);
  assert.equal(calls[0][1].completed, true);
  assert.equal(card._stepOptimistic['s:1'], true);
});

await check('a failed step toggle rolls back', async () => {
  const card = makeCard();
  card.hass.callService = async () => { throw new Error('boom'); };
  const c = chore({ id: 's', steps: ['one'], step_progress: [] });
  await card._toggleStep(c, 0);
  assert.equal('s:0' in card._stepOptimistic, false);
});

await check('setting an estimate calls update_chore', async () => {
  const card = makeCard();
  const calls = [];
  card.hass.callService = async (domain, service, data) => { calls.push([service, data]); };
  await card._setEstimate(CHORES[3], 10);
  assert.equal(calls[0][0], 'update_chore');
  assert.equal(calls[0][1].estimated_minutes, 10);
  assert.equal(card._estimatePromptFor, null);
});

// --- Slimmed chore payloads -----------------------------------------------
//
// sensor.py omits fields that are null/empty to keep the attribute small, so
// the card must read a missing key exactly as it read null.

const SLIM = [
  // Only what a minimal chore actually carries - no anchor fields, no steps,
  // no estimate, no days_overdue, no room_name
  { id: 's1', name: 'Sweep', room_id: 'area_kitchen', frequency: 'daily', next_due: '2026-07-26' },
  { id: 's2', name: 'Mop', room_id: 'area_kitchen', frequency: 'weekly', next_due: '2026-07-26',
    estimated_minutes: 15, recurrence_type: 'anchored', anchor_days_of_week: [0] },
];

function slimCard() {
  return makeCard({ done_today: 0, streak_days: 0, total_completions: 0 }, SLIM);
}

await check('slimmed chores flow through the focus queue', () => {
  const q = slimCard()._getFocusQueue();
  assert.equal(q.length, 2);
  // Missing days_overdue must read as 0, not NaN, or sorting breaks
  assert.ok(q.every(c => !Number.isNaN(Number(c.days_overdue) || 0)));
});

await check('missing estimated_minutes reads as no estimate', () => {
  const card = slimCard();
  assert.equal(card._choreMinutes(SLIM[0]), null);
  assert.equal(card._choreMinutes(SLIM[1]), 15);
  card._setTimeBudget(15);
  sameList(card._getFocusQueue().map(c => c.id), ['s2']);
});

await check('missing steps and step_progress read as empty', () => {
  const card = slimCard();
  assert.equal(card._countDoneSteps(SLIM[0]), 0);
  assert.equal(card._stepIsDone(SLIM[0], 0), false);
});

await check('room name resolves from room_id when room_name is omitted', () => {
  assert.equal(slimCard()._resolveRoomName(SLIM[0]), 'Kitchen');
});

await check('slimmed chores render in both focus layouts', () => {
  for (const mode of ['deck', 'board']) {
    const card = slimCard();
    card._focusMode = mode;
    card._renderFocusView();
  }
});

await check('recurrence maths tolerates missing anchor fields', () => {
  const card = slimCard();
  // Interval chore with no recurrence_type key at all
  const from = new SandboxDate('2026-07-26T00:00:00');
  const interval = card._calculateNextOccurrenceForChore(SLIM[0], from);
  assert.ok(interval instanceof SandboxDate && !isNaN(interval), 'daily/interval resolved');
  // Anchored chore that only has the fields its frequency needs
  const anchored = card._calculateNextOccurrenceForChore(SLIM[1], from);
  assert.ok(anchored instanceof SandboxDate && !isNaN(anchored), 'weekly/anchored resolved');
  // 2026-07-26 is a Sunday and the anchor is Sunday, so the next one is a week on
  assert.equal(anchored.getDay(), 0);
});

await check('editing a slimmed chore prefills without null leakage', () => {
  const card = slimCard();
  card._editChore(SLIM[0]);
  const form = card._formData.chore;
  assert.equal(form.estimatedMinutes, '');
  sameList(form.steps, []);
  assert.equal(form.interval, 1);
  assert.equal(form.recurrenceType, 'interval');
  assert.equal(form.anchorType, 'day_of_month');
});

await check('calendar view renders with slimmed chores', () => {
  const card = slimCard();
  card._currentView = 'calendar';
  card._renderCalendarView();
});

// --- Chores over the websocket --------------------------------------------

await check('chores are fetched over the websocket and indexed', async () => {
  const card = makeCard(null, CHORES, { seed: false });
  const calls = [];
  const inner = card.hass.callWS;
  card.hass.callWS = async (msg) => { calls.push(msg.type); return inner(msg); };

  assert.equal(card._choresData.loaded, false, 'starts unloaded');
  await card._fetchChores();

  assert.ok(calls.includes('simple_chores/chores'));
  assert.equal(card._choresData.loaded, true);
  assert.equal(card._getAllChores().length, CHORES.length);
  assert.equal(card._choresData.byId.get('a').name, 'Wipe stove');
});

await check('due windows resolve from the id lists', async () => {
  const card = makeCard(null, CHORES, { seed: false });
  await card._fetchChores();
  sameList(card._getDueChores('today').map(c => c.id).sort(), ['a', 'b', 'c', 'd', 'e']);
  sameList(card._getDueChores('week'), []);
});

await check('unknown ids in a due list are skipped, not rendered as holes', () => {
  const card = makeCard();
  card._choresData = { ...card._choresData, dueToday: ['a', 'ghost', 'b'] };
  sameList(card._getDueChores('today').map(c => c.id), ['a', 'b']);
});

await check('no re-fetch while the revision is unchanged', async () => {
  const card = makeCard(null, CHORES, { seed: false });
  let calls = 0;
  card.hass.callWS = async () => { calls++; return choresResponse(CHORES); };
  await card._fetchChores();
  await card._fetchChores();
  await card._fetchChores();
  assert.equal(calls, 1);
});

await check('a changed revision triggers a re-fetch', async () => {
  const card = makeCard(null, CHORES, { seed: false });
  let calls = 0;
  card.hass.callWS = async () => { calls++; return choresResponse(CHORES, `rev${calls}`); };
  await card._fetchChores();
  card.hass = { ...card.hass, states: { ...card.hass.states,
    'sensor.total_chores': { attributes: {
      ...card.hass.states['sensor.total_chores'].attributes, revision: 'rev2' } } } };
  await card._fetchChores();
  assert.equal(calls, 2);
});

await check('a failed fetch keeps existing chores and clears the loading state', async () => {
  const card = makeCard();
  const before = card._getAllChores().length;
  card.hass.callWS = async () => { throw new Error('disconnected'); };
  await card._fetchChores(true);
  assert.equal(card._choresData.loaded, true, 'stops showing the spinner');
  assert.equal(card._getAllChores().length, before, 'keeps what it had');
});

await check('a failed first fetch still leaves a renderable card', async () => {
  const card = makeCard(null, CHORES, { seed: false });
  card.hass.callWS = async () => { throw new Error('disconnected'); };
  await card._fetchChores();
  assert.equal(card._choresData.loaded, true);
  sameList(card._getAllChores(), []);
  card.render();
});

await check('the card renders a loading state before chores arrive', () => {
  const card = makeCard(null, CHORES, { seed: false });
  assert.equal(card._choresData.loaded, false);
  card.render();          // must not throw with an empty cache
  card._renderLoading();
});

await check('normalize fills in the aliases render paths expect', () => {
  const card = makeCard();
  const n = card._normalizeChore({ id: 'x', name: 'X', next_due: '2026-07-26' });
  assert.equal(n.due_date, '2026-07-26');
  assert.equal(n.days_overdue, 0, 'omitted days_overdue becomes 0, not NaN');
  // A chore with no due date at all still gets one rather than rendering blank
  assert.ok(card._normalizeChore({ id: 'y', name: 'Y' }).next_due);
});

// --- Render caps ----------------------------------------------------------

const MANY = Array.from({ length: 60 }, (_u, i) =>
  chore({ id: `m${i}`, name: `Chore ${i}`, estimated_minutes: 5 }));

await check('the focus board caps how many cards it renders', () => {
  const card = makeCard({ done_today: 0, streak_days: 0, total_completions: 0 }, MANY);
  card._focusMode = 'board';
  assert.equal(card._getFocusQueue().length, 60);
  assert.equal(card._choreLimits.focusBoard, Card.constants.FOCUS_BOARD_LIMIT);
  card._renderFocusView();   // renders only up to the cap
});

await check('show more lifts the focus board cap', () => {
  const card = makeCard({ done_today: 0, streak_days: 0, total_completions: 0 }, MANY);
  card._focusMode = 'board';
  card._loadMoreChores('focusBoard', 60);
  assert.equal(card._choreLimits.focusBoard, 60);
  card._renderFocusView();
});

await check('the deck is unaffected by the board cap', () => {
  const card = makeCard({ done_today: 0, streak_days: 0, total_completions: 0 }, MANY);
  card._focusMode = 'deck';
  card._focusIndex = 50;     // well past FOCUS_BOARD_LIMIT
  card._renderFocusView();
  assert.equal(card._clampFocusIndex(card._getFocusQueue()), 50);
});

await check('the all-chores modal caps and can load more', () => {
  const card = makeCard({ done_today: 0, streak_days: 0, total_completions: 0 }, MANY);
  card._showAllChoresModal = true;
  assert.equal(card._choreLimits.allChores, Card.constants.DEFAULT_CHORE_LIMIT);
  card._renderAllChoresModal();
  card._loadMoreChores('allChores', 60);
  assert.equal(card._choreLimits.allChores, 60);
  card._renderAllChoresModal();
});

await check('60 chores render in every view without throwing', () => {
  for (const view of ['list', 'focus', 'calendar']) {
    const card = makeCard({ done_today: 2, streak_days: 1, total_completions: 5 }, MANY);
    card._currentView = view;
    card.render();
  }
});

// --- Report ---------------------------------------------------------------

let failed = 0;
for (const [status, name] of results) {
  if (status === 'FAIL') failed++;
  console.error(`${status}  ${name}`);
}
console.error(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
