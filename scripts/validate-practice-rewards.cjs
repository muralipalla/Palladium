const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function element() {
  return {
    children: [], textContent: "", hidden: true, isConnected: true,
    classList: { toggle() {} },
    setAttribute() {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }
  };
}

function text(node) {
  return [node.textContent, ...node.children.map(text)].filter(Boolean).join(" ");
}

const today = new Date(2026, 10, 25, 12);
let clock = today;
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [clock])); }
}

const storage = new Map();
const mount = element();
const ownerListeners = [];
const rows = [];
const offsets = [];
let owner = null;

const supabaseClient = {
  auth: {
    async getSession() { return { data: { session: owner ? { user: { id: owner } } : null } }; },
    onAuthStateChange(callback) {
      ownerListeners.push(callback);
      return { data: { subscription: { unsubscribe() {} } } };
    }
  },
  from(table) {
    assert.equal(table, "quiz_attempts");
    let uid;
    let bounds;
    let pending;
    return {
      select() { return this; },
      eq(column, value) {
        assert.equal(column, "user_id");
        uid = value;
        return this;
      },
      order() { return this; },
      range(from, to) { bounds = [from, to]; return this; },
      upsert(row, options) {
        assert.equal(row.user_id, owner);
        assert.equal(options.ignoreDuplicates, true);
        pending = row;
        return this;
      },
      async maybeSingle() {
        if (rows.some(row => row.client_attempt_id === pending.client_attempt_id && row.user_id === pending.user_id)) {
          return { data: null };
        }
        rows.unshift(pending);
        return { data: pending };
      },
      then(resolve, reject) {
        assert.equal(uid, owner);
        offsets.push(bounds[0]);
        return Promise.resolve({ data: rows.filter(row => row.user_id === uid).slice(bounds[0], bounds[1] + 1) }).then(resolve, reject);
      }
    };
  }
};

const window = {
  crypto: { randomUUID }, supabaseClient,
  localStorage: {
    get length() { return storage.size; },
    key(index) { return [...storage.keys()][index]; },
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); }
  },
  addEventListener() {}
};
const document = {
  addEventListener() {},
  querySelector(selector) { return selector === "[data-practice-result]" ? mount : null; },
  createElement: element
};

const context = vm.createContext({ window, document, console, Date: FixedDate });
for (const file of ["js/progress-store.js", "js/practice-rewards.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
}
const { PracticeRewards: rewards, ProgressStore: store } = window;

function changeOwner(id) {
  owner = id;
  for (const callback of ownerListeners) callback(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id } } : null);
}

function daysAfterToday(days) {
  return new Date(2026, 10, 25 + days, 12);
}

async function finishQuiz(overrides = {}) {
  await store.recordAttempt({ quizId: "test-quiz", score: 1, total: 4, showRewards: true, ...overrides });
  await new Promise(resolve => setImmediate(resolve));
  return text(mount);
}

async function checkGuest() {
  assert.equal((await rewards.load(null)).points, 0);
  assert.match(await finishQuiz({ score: 0, details: { attempted: 0 } }), /at least one answer/);
  assert.equal((await rewards.load(null)).points, 0);
  assert.match(await finishQuiz({ score: 0, details: { attempted: 1 } }), /\+10 reward points.*First Step/);
  const challenge = { details: { challengeProblemIds: ["maths:topic:level-3-first", "maths:topic:level-3-first"] } };
  assert.match(await finishQuiz(challenge), /Challenge solved!.*\+5 reward points.*Challenge Solver/);
  assert.doesNotMatch(await finishQuiz(challenge), /\+\d|Badge earned/);
  assert.equal((await rewards.load(null)).points, 15);

  clock = daysAfterToday(1);
  await finishQuiz();
  clock = daysAfterToday(2);
  assert.equal((await rewards.load(null)).currentStreak, 2, "Yesterday's streak remains active today");
  assert.match(await finishQuiz(), /3-day streak.*Weekly goal reached!.*Three in a Row/);

  clock = daysAfterToday(4);
  const afterGap = await rewards.load(null);
  assert.equal(afterGap.currentStreak, 0);
  assert.equal(afterGap.bestStreak, 3);
  assert.match(await finishQuiz(challenge), /\+10 reward points.*Welcome Back/);
  clock = daysAfterToday(7);
  const rolling = await rewards.load(null);
  assert.equal(rolling.points, 45);
  assert.equal(rolling.weeklyDays, 3);
  assert.equal(rolling.challenges, 1);
}

async function checkAccount() {
  clock = today;
  for (let index = 0; index < 105; index++) {
    rows.push({
      user_id: "student-a", quiz_id: "test-quiz", client_attempt_id: randomUUID(), score: 0, total: 4,
      completed_at: daysAfterToday(index < 100 ? -1 : -2).toISOString(), details: {}
    });
  }
  rows.push({ user_id: "student-b", quiz_id: "test-quiz", score: 1, total: 1, completed_at: today.toISOString(), details: { challengeProblemIds: ["other-student"] } });
  changeOwner("student-a");
  assert.equal(mount.hidden, true, "Switching accounts clears the previous result panel");
  const clientAttemptId = randomUUID();
  const solvedIds = Array.from({ length: 5 }, (_, index) => `bank:chemistry:advanced-${index}`);
  const attempt = { clientAttemptId, score: 5, total: 5, details: { challengeProblemIds: solvedIds } };
  const result = await finishQuiz(attempt);
  assert.match(result, /5 challenge problems solved!.*\+35 reward points.*3-day streak/);
  assert.match(result, /Badge earned · Challenge Specialist/);
  assert.equal(rows[0].details.practiceDay, rewards.calendarDay(today));
  assert.equal(rows[0].completed_at, today.toISOString());
  assert.deepEqual(offsets, [0, 100]);
  assert.doesNotMatch(await finishQuiz(attempt), /\+\d|Badge earned/, "An idempotent cloud save does not re-award badges");
  assert.equal((await rewards.load("student-a")).points, 55);
  rows.shift();
  assert.equal((await rewards.load("student-a")).points, 20, "Removing a score updates rewards from the saved history");

  changeOwner("student-b");
  await assert.rejects(rewards.load("student-a"), /signed-in account changed/);
  assert.equal((await rewards.load("student-b")).points, 15);
  changeOwner(null);
  clock = daysAfterToday(7);
  assert.equal((await rewards.load(null)).points, 45, "Guest rewards remain in this browser");
}

(async () => {
  assert.equal(rewards.calendarDay(new Date(2026, 2, 9)) - rewards.calendarDay(new Date(2026, 2, 8)), 1);
  assert.equal(rewards.calendarDay(new Date(2026, 0, 1)) - rewards.calendarDay(new Date(2025, 11, 31)), 1);
  await checkGuest();
  await checkAccount();
  console.log("PASS: daily points, unique challenges, badges, rolling goals, streaks across calendar boundaries, account pagination and isolation, and score deletion.");
})().catch(error => { console.error(error); process.exitCode = 1; });
