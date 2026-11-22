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
  "L3-02": { points: [pair(Math.atan(3), Math.atan(1 / 2))], value: a => t(2 * a), given: (a, b) => { assert.ok(a - b > 0 && a - b < a + b && a + b < pi / 2); closeTo(t(a + b), 3); closeTo(t(a - b), 1 / 2); } },
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
const equationRoots = roots(a => s(3 * a) - c(2 * a), 0, pi / 6);
const allAngleRoots = roots(a => s(3 * a) - c(a), 0, pi / 2);
const reciprocalRoots = roots(a => t(a) + 1 / t(a) - 4, 0, pi / 2);
const combinedRoots = roots(a => s(3 * a) / s(a) + c(3 * a) / c(a) - 2, 0, pi / 2);
for (const result of [sineRatioRoots, cosineRatioRoots, doubleTangentRoots, equationRoots, combinedRoots]) assert.equal(result.length, 1);
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
  "L3-06": { points: equationRoots.map(a => [a]), value: a => degrees(a) },
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
  { slug: "sum_difference", topicId: "sum-difference-identities", prefix: "sum-difference", cases: sumCases },
  { slug: "double_triple", topicId: "double-triple-identities", prefix: "double-triple", cases: doubleCases }
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
  assert.equal(topic.quizId, config.topicId + "-v1");
  assert.equal(topic.questionCount, 20);
  assert.equal(topic.marksPerQuestion, 1);
  assert.equal(topic.questions.length, 20);
  assert.equal(topic.orderByLevel, true);
  assert.equal(topic.showExplanations, true);
  assert.equal(new Set(topic.questions.map(q => q.id)).size, 20);
  assert.equal(new Set(topic.questions.map(q => q.prompt)).size, 20);
  for (const level of [2, 3]) assert.equal(topic.questions.filter(q => q.level === level).length, 10);

  for (const q of topic.questions) {
    const suffix = q.id.replace(config.prefix + "-", "");
    const check = config.cases[suffix];
    assert.ok(check, "Missing independent mathematical check: " + q.id);
    assert.equal(q.difficulty, q.level === 2 ? "medium" : "hard");
    assert.ok(q.explanation.trim(), q.id + " is missing its worked solution");
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    const formula = check.identity || check.value;
    const points = (check.identity ? identityPoints : check.points).filter(([a, b = 0]) =>
      [formula(a, b), ...q.options.map(option => optionValue(option, a, b))].every(value => Number.isFinite(value) && Math.abs(value) < 1e10)
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
  for (const text of ["Each correct answer earns 1 mark", "no negative marking", "All angles are measured in degrees", "where all displayed terms are defined", 'href="trigonometry_skill_builder.html"']) assert.ok(page.includes(text));
  assert.ok(read("quizzes/trigonometry_skill_builder.html").includes(`href="${pageName}"`));
  for (const file of ["js/account.js", "js/scores.js"]) assert.ok(read(file).includes(`"${topic.quizId}"`));
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
  for (let index = 0; index < 20; index++) {
    const question = topic.questions.find(q => q.prompt === session.nodes.question.textContent);
    assert.ok(question && !seen.has(question.id));
    seen.add(question.id);
    assert.equal(question.level, index < 10 ? 2 : 3);
    assert.equal(session.level.textContent, `Level ${question.level} · 1 mark`);
    const choice = session.nodes.options.children.find(button => (button.children[1].textContent === question.answer) === !wrong.has(index));
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
  assert.equal(session.nodes.finalScore.textContent, `${20 - wrong.size}/20`);
  assert.equal(session.nodes.finalPercent.textContent, `${(20 - wrong.size) * 5}%`);
  assert.equal(session.nodes.reviewList.children.length, 20);
  assert.equal(session.nodes.reviewList.children.filter(item => item.children.some(child => child.className === "review-explanation")).length, 20);
  assert.equal(session.records.at(-1).quizId, topic.quizId);
  assert.equal(session.records.at(-1).total, 20);
  assert.equal(session.records.at(-1).score, 20 - wrong.size);
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
  }
  console.log("PASS: 40 independently evaluated keys, unique correct choices, feasible givens and angle branches, attainable maxima; both 20-mark quizzes support level ordering, navigation, retakes, worked solutions and distinct score IDs.");
})().catch(error => { console.error(error); process.exitCode = 1; });
