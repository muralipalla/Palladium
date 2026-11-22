const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const s = Math.sin, c = Math.cos, t = Math.tan, pi = Math.PI;
const degrees = radians => radians * 180 / pi;
const near = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-8 * Math.max(1, Math.abs(x), Math.abs(y));
const acute = a => a > 0 && a < pi / 2;
const pair = (sum, difference) => [(sum + difference) / 2, (sum - difference) / 2];
const tangentPair = (x, y) => [Math.atan(x), Math.atan(y)];
const closeTo = (actual, expected) => assert.ok(near(actual, expected), `${actual} differs from ${expected}`);

// Numerical roots are obtained from the original equations, without consulting a key.
function roots(fn, low, high) {
  const found = [];
  const epsilon = 1e-7;
  let left = low + epsilon, leftValue = fn(left);
  for (let step = 1; step <= 4096; step++) {
    const right = low + epsilon + (high - low - 2 * epsilon) * step / 4096;
    const rightValue = fn(right);
    if (leftValue * rightValue <= 0) {
      let a = left, b = right, fa = leftValue;
      for (let n = 0; n < 65; n++) {
        const middle = (a + b) / 2, fm = fn(middle);
        if (fa * fm <= 0) b = middle;
        else { a = middle; fa = fm; }
      }
      const result = (a + b) / 2;
      if (near(fn(result), 0) && !found.some(value => near(value, result))) found.push(result);
    }
    left = right; leftValue = rightValue;
  }
  assert.ok(found.length, "No feasible solution in the stated interval");
  return found;
}

function optionValue(text, a, b = 0) {
  const expressions = {
    "tan A": () => t(a), "tan B": () => t(b), "cot A": () => 1 / t(a), "cot B": () => 1 / t(b),
    "cos A": () => c(a), "sin A": () => s(a), "cos(A + 2B)": () => c(a + 2 * b), "sin(A − B)": () => s(a - b),
    "sin 2A": () => s(2 * a), "sin 2B": () => s(2 * b), "cos 2A": () => c(2 * a), "cos 2B": () => c(2 * b),
    "tan B/tan A": () => t(b) / t(a), "sin 2B/sin 2A": () => s(2 * b) / s(2 * a),
    "cos 2B/cos 2A": () => c(2 * b) / c(2 * a), "tan 2B/tan 2A": () => t(2 * b) / t(2 * a),
    "2 cos A": () => 2 * c(a), "2 sin A": () => 2 * s(a), "2 cos 2A": () => 2 * c(2 * a),
    "−2 sin A": () => -2 * s(a), "−2 cos A": () => -2 * c(a), "−sin A": () => -s(a),
    "tan² A": () => t(a) ** 2, "cot² A": () => 1 / t(a) ** 2, "tan 2A": () => t(2 * a), "sin² A": () => s(a) ** 2,
    "(√6 + √2)/2": () => (Math.sqrt(6) + Math.sqrt(2)) / 2,
    "(√6 − √2)/2": () => (Math.sqrt(6) - Math.sqrt(2)) / 2
  };
  if (expressions[text]) return expressions[text]();
  const match = text.replaceAll("−", "-").replace(/°$/, "").match(/^(-?)(?:(\d+(?:\.\d+)?)|√(\d+))(?:\/(\d+(?:\.\d+)?|√\d+))?$/);
  assert.ok(match, "Unverified option syntax: " + text);
  const numerator = match[2] === undefined ? Math.sqrt(Number(match[3])) : Number(match[2]);
  const denominator = !match[4] ? 1 : match[4].startsWith("√") ? Math.sqrt(Number(match[4].slice(1))) : Number(match[4]);
  return (match[1] ? -1 : 1) * numerator / denominator;
}

const sumCases = {
  "L2-01": { points: [[Math.asin(3 / 5), Math.acos(12 / 13)]], value: (a, b) => s(a + b), given: (a, b) => { assert.ok(acute(a) && acute(b)); closeTo(s(a), 3 / 5); closeTo(c(b), 12 / 13); } },
  "L2-02": { points: [[Math.acos(4 / 5), Math.asin(8 / 17)]], value: (a, b) => c(a - b), given: (a, b) => { assert.ok(acute(a) && acute(b)); closeTo(c(a), 4 / 5); closeTo(s(b), 8 / 17); } },
  "L2-03": { points: [tangentPair(1 / 2, 1 / 3)], value: (a, b) => t(a + b) },
  "L2-04": { points: [tangentPair(3 / 4, 1 / 2)], value: (a, b) => t(a - b) },
  "L2-05": { identity: (a, b) => (s(a + b) + s(a - b)) / (c(a + b) + c(a - b)) },
  "L2-06": { identity: (a, b) => c(a + b) * c(b) + s(a + b) * s(b) },
  "L2-07": { identity: (a, b) => s(a + b) * c(a - b) - c(a + b) * s(a - b) },
  "L2-08": { points: [[0, 0]], value: () => s(75 * pi / 180) + s(15 * pi / 180) },
  "L2-09": { points: [pair(Math.acos(1 / 5), Math.acos(3 / 5)), pair(-Math.acos(1 / 5), Math.acos(3 / 5)), pair(Math.acos(1 / 5), -Math.acos(3 / 5))], value: (a, b) => s(a) * s(b), given: (a, b) => { closeTo(c(a + b), 1 / 5); closeTo(c(a - b), 3 / 5); } },
  "L2-10": { points: [pair(Math.asin(4 / 5), Math.asin(2 / 5)), pair(pi - Math.asin(4 / 5), Math.asin(2 / 5))], value: (a, b) => t(a) / t(b), given: (a, b) => { assert.ok(acute(a) && acute(b)); closeTo(s(a + b), 4 / 5); closeTo(s(a - b), 2 / 5); } },
  "L3-01": { points: [[Math.asin(3 / 5), Math.acos(-5 / 13)]], value: (a, b) => s(a + b) / c(a - b), given: (a, b) => { assert.ok(acute(a) && b > pi / 2 && b < pi); closeTo(s(a), 3 / 5); closeTo(c(b), -5 / 13); } },
  "L3-02": { points: [pair(Math.atan(3), Math.atan(1 / 3))], value: (a, b) => t(a) ** 2 + t(b) ** 2, given: (a, b) => { assert.ok(b > 0 && a > b && a + b < pi / 2); closeTo(t(a + b), 3); closeTo(t(a - b), 1 / 3); } },
  "L3-03": { points: [tangentPair((3 + Math.sqrt(7)) / 2, (3 - Math.sqrt(7)) / 2), tangentPair((3 - Math.sqrt(7)) / 2, (3 + Math.sqrt(7)) / 2)], value: (a, b) => c(a + b), given: (a, b) => { assert.ok(acute(a) && acute(b)); closeTo(t(a) + t(b), 3); closeTo(t(a) * t(b), 1 / 2); } },
  "L3-04": { points: [pair(Math.asin(3 / 5), Math.acos(12 / 13))], value: a => s(2 * a), given: (a, b) => { assert.ok(b > 0 && a > b && a + b < pi / 2); closeTo(s(a + b), 3 / 5); closeTo(c(a - b), 12 / 13); } },
  "L3-05": { points: [pair(Math.acos(-3 / 5), Math.acos(12 / 13))], value: (a, b) => t(a) * t(b), given: (a, b) => { assert.ok(b > 0 && a > b && acute(a)); closeTo(c(a + b), -3 / 5); closeTo(c(a - b), 12 / 13); } },
  "L3-06": { points: [tangentPair(1, 3), tangentPair(3, 1)], value: (a, b) => t(a - b) ** 2, given: (a, b) => { assert.ok(acute(a) && acute(b)); closeTo(t(a) + t(b), 4); closeTo(t(a + b), -2); } },
  "L3-07": { points: [pair(Math.asin(4 / 5), Math.asin(3 / 5))], value: (a, b) => c(2 * b), given: (a, b) => { assert.ok(b > 0 && a > b && a + b < pi / 2); closeTo(s(a + b), 4 / 5); closeTo(s(a - b), 3 / 5); } },
  "L3-08": { points: [tangentPair(1, 2), tangentPair(2, 1)], value: (a, b) => Math.abs(t(a) - t(b)), given: (a, b) => { assert.ok(acute(a) && acute(b)); closeTo(c(a + b) / c(a - b), -1 / 3); closeTo(t(a) + t(b), 3); } },
  "L3-09": { points: [[pi / 4, pi / 6]], value: (a, b) => s(a + b) + c(a - b) },
  "L3-10": { identity: (a, b) => (t(a + b) - t(a - b)) / (t(a + b) + t(a - b)) }
};

const sineRatioRoots = roots(a => s(3 * a) / s(a) - 2, 0, pi / 2);
const cosineRatioRoots = roots(a => c(3 * a) / c(a) + 2, 0, pi / 2);
const doubleTangentRoots = roots(a => t(2 * a) - 3 / 4, 0, pi / 4);
// The expanded equation has a repeated root at 90 degrees. A sign-change
// search alone can miss it, so enumerate both complete sine-equation families.
const expandedEquationDegrees = [...new Set(Array.from({ length: 11 }, (_, n) => n - 5)
  .flatMap(k => [18 + 72 * k, 90 + 360 * k]).filter(a => a > 0 && a < 180))].sort((a, b) => a - b);
assert.deepEqual(expandedEquationDegrees, [18, 90, 162]);
const expandedEquationRoots = expandedEquationDegrees.map(a => a * pi / 180);
for (const a of expandedEquationRoots) closeTo(s(3 * a) - c(2 * a), 0);
const allAngleRoots = roots(a => s(3 * a) - c(a), 0, pi / 2);
const reciprocalRoots = roots(a => t(a) + 1 / t(a) - 4, 0, pi / 2);
const combinedRoots = roots(a => s(3 * a) / s(a) + c(3 * a) / c(a) - 2, 0, pi / 2);
for (const result of [sineRatioRoots, cosineRatioRoots, doubleTangentRoots, combinedRoots]) assert.equal(result.length, 1);
assert.equal(allAngleRoots.length, 2);
assert.equal(reciprocalRoots.length, 2);

const doubleCases = {
  "L2-01": { points: [[Math.asin(5 / 13)]], value: a => c(2 * a) },
  "L2-02": { points: [[Math.atan(2 / 3)]], value: a => t(2 * a) },
  "L2-03": { points: [[Math.asin(3 / 5)]], value: a => s(3 * a) },
  "L2-04": { points: [[Math.acos(2 / 3)]], value: a => c(3 * a) },
  "L2-05": { points: [[Math.atan(1 / 2)]], value: a => t(3 * a) },
  "L2-06": { identity: a => (s(3 * a) + s(a)) / s(2 * a) },
  "L2-07": { identity: a => (c(3 * a) - c(a)) / s(2 * a) },
  "L2-08": { points: [[pi - Math.asin(4 / 5)]], value: a => s(2 * a), given: a => { assert.ok(a > pi / 2 && a < pi); closeTo(s(a), 4 / 5); } },
  "L2-09": { identity: a => (1 - c(2 * a)) / (1 + c(2 * a)) },
  "L2-10": { points: [[Math.asin(6 / (5 * Math.sqrt(2))) - pi / 4], [3 * pi / 4 - Math.asin(6 / (5 * Math.sqrt(2)))]], value: a => s(2 * a), given: a => { assert.ok(acute(a)); closeTo(s(a) + c(a), 6 / 5); } },
  "L3-01": { points: [[Math.atan(2)]], value: a => s(3 * a) / s(a) },
  "L3-02": { points: [[Math.acos(-7 / 25) / 2]], value: a => c(3 * a) },
  "L3-03": { points: sineRatioRoots.map(a => [a]), value: a => t(2 * a) ** 2 },
  "L3-04": { points: cosineRatioRoots.map(a => [a]), value: a => s(2 * a) },
  "L3-05": { points: doubleTangentRoots.map(a => [a]), value: a => t(a) },
  "L3-06": { points: [[0]], value: () => expandedEquationRoots.reduce((sum, a) => sum + degrees(a), 0) },
  "L3-07": { points: [[0]], value: () => allAngleRoots.reduce((sum, a) => sum + degrees(a), 0) },
  "L3-08": { points: reciprocalRoots.map(a => [a]), value: a => c(4 * a) },
  "L3-09": { points: [[Math.asin(Math.sqrt(3 / 8))]], value: a => s(a) * s(3 * a) },
  "L3-10": { points: combinedRoots.map(a => [a]), value: a => t(2 * a) }
};

// Cover positive/negative angles and several quadrants, including regular boundary values.
const sampleA = [-3.1, -1.5, -.7, 0, .13, .6, pi / 4, 1.4, pi / 2, 2.2, 3, pi, 4.8];
const sampleB = [-2.7, -1.2, -.3, 0, .23, .8, 1.6, 2.8, 4.4];
const identityPoints = sampleA.flatMap(a => sampleB.map(b => [a, b]));
const configurations = [
  { slug: "sum_difference", topicId: "sum-difference-identities", prefix: "sum-difference", cases: sumCases, total: 40, counts: [4, 12, 4], levels: [2,2,1,1,2,1,1,2,2,2,2,3,2,2,2,3,2,3,3,2] },
  { slug: "double_triple", topicId: "double-triple-identities", prefix: "double-triple", cases: doubleCases, total: 38, counts: [5, 12, 3], levels: [1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,3,3,2,3,2] }
];
const engine = read("js/maths-vector-quiz.js");
const engineIds = [...engine.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]);
const topics = [];

for (const config of configurations) {
  const bankPath = `../assets/data/question_banks/maths_${config.slug}_identities.json`;
  const bank = JSON.parse(read(bankPath.slice(3)));
  const topic = bank[0];
  assert.equal(bank.length, 1);
  assert.equal(topic.id, config.topicId);
  assert.equal(topic.quizId, config.topicId + "-v2");
  assert.equal(topic.questionCount, 20);
  assert.equal(topic.marksPerQuestion, undefined);
  assert.deepEqual(topic.marksByLevel, { 1: 1, 2: 2, 3: 3 });
  assert.equal(topic.totalMarks, config.total);
  assert.equal(topic.questions.reduce((sum, q) => sum + q.level, 0), config.total);
  assert.equal(topic.questions.length, 20);
  assert.equal(topic.orderByLevel, true);
  assert.equal(topic.showExplanations, true);
  assert.equal(new Set(topic.questions.map(q => q.id)).size, 20);
  assert.equal(new Set(topic.questions.map(q => q.prompt)).size, 20);
  for (const level of [1, 2, 3]) assert.equal(topic.questions.filter(q => q.level === level).length, config.counts[level - 1]);

  for (const [index, q] of topic.questions.entries()) {
    // Unchanged question IDs stay stable when their reviewed level changes.
    const suffix = q.id.replace(config.prefix + "-", "").replace(/-v2$/, "");
    const check = config.cases[suffix];
    assert.ok(check, "Missing independent mathematical check: " + q.id);
    assert.equal(q.level, config.levels[index], q.id + " has the wrong reviewed level");
    assert.equal(q.difficulty, { 1: "easy", 2: "medium", 3: "hard" }[q.level]);
    assert.ok(q.explanation.trim(), q.id + " is missing its worked solution");
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    const formula = check.identity || check.value;
    const points = (check.identity ? identityPoints : check.points).filter(([a, b = 0]) =>
      Number.isFinite(formula(a, b)) && Math.abs(formula(a, b)) < 1e10
    );
    assert.ok(points.length >= (check.identity ? 50 : 1), q.id + " has insufficient domain coverage");
    for (const [a, b = 0] of points) check.given?.(a, b);
    const validOptions = q.options.filter(option => points.every(([a, b = 0]) => near(optionValue(option, a, b), formula(a, b))));
    assert.equal(validOptions.length, 1, q.id + " has ambiguous or missing correct options");
    assert.equal(q.answer, validOptions[0], q.id + " has an incorrect key");
  }

  const pageName = config.slug + "_identities_quiz.html";
  const page = read("quizzes/" + pageName);
  assert.ok(page.includes(`data-quiz-bank="${bankPath}"`));
  assert.ok(page.includes(`data-quiz-topic="${topic.id}"`));
  for (const id of engineIds) assert.ok(page.includes(`id="${id}"`), pageName + " is missing " + id);
  for (const text of ["1 mark at Level 1, 2 marks at Level 2 and 3 marks at Level 3", "no negative marking", "All angles are measured in degrees", "wherever the original is defined", "Retain all original restrictions", "score percentage", 'href="trigonometry_skill_builder.html"', 'maths-vector-quiz.js?v=level-marks-2', `20 MCQs · ${config.total} marks.`, `id="finalScore">0/${config.total}`]) assert.ok(page.includes(text), pageName + " is missing " + text);
  assert.ok(read("quizzes/trigonometry_skill_builder.html").includes(`href="${pageName}"`));
  for (const file of ["js/account.js", "js/scores.js"]) {
    assert.ok(read(file).includes(`"${topic.quizId}"`));
    assert.ok(read(file).includes(`"${config.topicId}-v1"`), "Historical score labels must remain available");
  }
  topics.push({ bank, topic, bankPath });
}

// Check upper bounds across a complete revolution and equality at actual angles.
const sumMaximum = s(pi / 4 + pi / 6) + c(pi / 4 - pi / 6);
const productAttainer = Math.asin(Math.sqrt(3 / 8));
const productMaximum = s(productAttainer) * s(3 * productAttainer);
for (let step = 0; step <= 8192; step++) {
  const a = step * 2 * pi / 8192, x = s(a) ** 2;
  assert.ok(s(a + pi / 6) + c(a - pi / 6) <= sumMaximum + 1e-12);
  closeTo(s(a) * s(3 * a), 9 / 16 - 4 * (x - 3 / 8) ** 2);
  closeTo(s(3 * a) - c(2 * a), 2 * c(a / 2 + pi / 4) * s(5 * a / 2 - pi / 4));
  assert.ok(s(a) * s(3 * a) <= productMaximum + 1e-12);
}

class Element {
  constructor() { this.children = []; this.attributes = {}; this.events = {}; this.style = {}; this.hidden = false; this.disabled = false; this.textContent = ""; this.className = ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  focus() {}
  querySelector() { return this.children.find(child => child.className.includes("is-selected")); }
  click() { return this.events.click(); }
}

async function boot({ bank, topic, bankPath }) {
  const nodes = Object.fromEntries(engineIds.map(id => [id, new Element()]));
  for (const id of ["quizScreen", "resultScreen", "loadError"]) nodes[id].hidden = true;
  const level = new Element(), records = [];
  const document = {
    body: { dataset: { quizTopic: topic.id, quizBank: bankPath } },
    getElementById: id => nodes[id], querySelector: () => level, createElement: () => new Element()
  };
  const window = {
    setInterval: () => 1, addEventListener() {},
    ProgressStore: { createAttemptId: () => "test-only", startTabTracking() {}, finishTabTracking: () => ({}), recordAttempt: async record => records.push(record) }
  };
  vm.runInNewContext(engine, { document, window, console, clearInterval() {}, fetch: async url => { assert.equal(url, bankPath); return { ok: true, json: async () => structuredClone(bank) }; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.loadError.hidden, true);
  assert.equal(nodes.quizScreen.hidden, false);
  return { nodes, level, records };
}

async function finish(session, topic, wrong = new Set()) {
  const seen = new Set();
  const ordered = [];
  const sortedLevels = topic.questions.map(q => q.level).sort((a, b) => a - b);
  const maximum = topic.questions.reduce((sum, q) => sum + q.level, 0);
  let earned = 0;
  for (let index = 0; index < 20; index++) {
    const question = topic.questions.find(q => q.prompt === session.nodes.question.textContent);
    assert.ok(question && !seen.has(question.id));
    seen.add(question.id);
    ordered.push(question);
    assert.equal(question.level, sortedLevels[index]);
    assert.equal(session.level.textContent, `Level ${question.level} · ${question.level} ${question.level === 1 ? "mark" : "marks"}`);
    if (!wrong.has(index)) earned += question.level;
    const choice = session.nodes.options.children.find(button => (button.children[1].textContent === question.answer) === !wrong.has(index));
    assert.ok(choice);
    choice.click();
    if (index === 1) {
      session.nodes.prevBtn.click();
      assert.equal(session.nodes.options.children.filter(button => button.attributes["aria-pressed"] === "true").length, 1);
      session.nodes.nextBtn.click();
    }
    if (index < 19) session.nodes.nextBtn.click();
  }
  assert.equal(session.nodes.submitBtn.disabled, false);
  session.nodes.submitBtn.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.nodes.finalScore.textContent, `${earned}/${maximum}`);
  assert.equal(session.nodes.finalPercent.textContent, `${Math.round(earned / maximum * 100)}%`);
  assert.equal(session.nodes.reviewList.children.length, 20);
  assert.equal(session.nodes.reviewList.children.filter(item => item.children.some(child => child.className === "review-explanation")).length, 20);
  for (const [index, item] of session.nodes.reviewList.children.entries()) {
    const marks = ordered[index].level;
    assert.ok(item.children.some(child => child.textContent === `Level ${marks} · ${marks} ${marks === 1 ? "mark" : "marks"} · Earned ${wrong.has(index) ? 0 : marks}/${marks}`));
  }
  const record = session.records.at(-1);
  assert.equal(record.quizId, topic.quizId);
  assert.equal(record.total, maximum);
  assert.equal(record.score, earned);
  assert.equal(record.details.questionCount, 20);
  assert.equal(record.details.correctCount, 20 - wrong.size);
  assert.equal(record.details.percent, Math.round(earned / maximum * 100));
  assert.deepEqual(Array.from(record.details.questionMarks), ordered.map(q => q.level));
}

(async () => {
  for (const config of topics) {
    const session = await boot(config);
    session.nodes.submitBtn.click();
    assert.match(session.nodes.quizStatus.textContent, /Answer every question/);
    await finish(session, config.topic, new Set([2, 9, 18]));
    session.nodes.againBtn.click();
    await finish(session, config.topic);
    session.nodes.againBtn.click();
    await finish(session, config.topic, new Set(Array.from({ length: 20 }, (_, n) => n)));
    session.nodes.againBtn.click();
    await finish(session, config.topic, new Set([0]));
    session.nodes.againBtn.click();
    await finish(session, config.topic, new Set([19]));
  }
  console.log("PASS: all 40 reviewed keys and unique choices, revised angle-equation branches and attainable maxima; 40/38-mark totals, 1/2/3 level weights, partial and zero scores, weighted percentages, review marks, navigation, retakes and separate v2 score records.");
})().catch(error => { console.error(error); process.exitCode = 1; });
