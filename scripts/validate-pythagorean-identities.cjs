const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const bankPath = "../assets/data/question_banks/maths_pythagorean_identities.json";
const bank = JSON.parse(fs.readFileSync(path.join(root, "assets/data/question_banks/maths_pythagorean_identities.json"), "utf8"));
const topic = bank[0];
const engine = fs.readFileSync(path.join(root, "js/maths-vector-quiz.js"), "utf8");
const page = fs.readFileSync(path.join(root, "quizzes/pythagorean_identities_quiz.html"), "utf8");
const hub = fs.readFileSync(path.join(root, "quizzes/maths_skill_builders.html"), "utf8");
const sampleAngles = [0.13, 0.38, 0.71, 1.11, 1.44, 1.9, 2.3, 2.9, 3.4, 3.9, 4.4, 4.9, 5.3, 5.9, 6.2];
const epsilon = 1e-6;

const s = Math.sin;
const c = Math.cos;
const t = Math.tan;
const cot = theta => 1 / t(theta);
const sec = theta => 1 / c(theta);
const cosec = theta => 1 / s(theta);

function near(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
}

// Solve the stated givens numerically, independently of the stored answer key.
function angleFor(fn, target, low = epsilon, high = Math.PI / 2 - epsilon) {
  let lowValue = fn(low) - target;
  assert.ok(lowValue * (fn(high) - target) < 0, "Given has no root in its stated quadrant");
  for (let iteration = 0; iteration < 100; iteration++) {
    const middle = (low + high) / 2;
    const value = fn(middle) - target;
    if (lowValue * value <= 0) high = middle;
    else { low = middle; lowValue = value; }
  }
  const theta = (low + high) / 2;
  assert.ok(near(fn(theta), target));
  return theta;
}

function evaluateOption(option, theta) {
  const expressions = {
    "sin² θ": () => s(theta) ** 2,
    "cos² θ": () => c(theta) ** 2,
    "tan² θ": () => t(theta) ** 2,
    "cot² θ": () => cot(theta) ** 2,
    "sec² θ": () => sec(theta) ** 2,
    "sec² θ + cosec² θ": () => sec(theta) ** 2 + cosec(theta) ** 2,
    "1 + sin² θ": () => 1 + s(theta) ** 2,
    "1 − sin² θ": () => 1 - s(theta) ** 2,
    "1 + cos² θ": () => 1 + c(theta) ** 2
  };
  if (expressions[option]) return expressions[option]();
  const numeric = option.replaceAll("−", "-").match(/^(-?\d+)(?:\/(\d+))?$/);
  assert.ok(numeric, "Unsupported mathematical option: " + option);
  return Number(numeric[1]) / Number(numeric[2] || 1);
}

const firstQuadrant = [epsilon, Math.PI / 2 - epsilon];
const secondQuadrant = [Math.PI / 2 + epsilon, Math.PI - epsilon];
const belowFortyFive = [epsilon, Math.PI / 4];
const cases = {
  "pythagorean-L2-01": { identity: x => (1 - c(x) ** 2) / s(x) ** 2 },
  "pythagorean-L2-02": { identity: x => (sec(x) ** 2 - 1) / sec(x) ** 2 },
  "pythagorean-L2-03": { theta: angleFor(t, 3 / 4), value: x => s(x) ** 2 },
  "pythagorean-L2-04": { theta: angleFor(c, -5 / 13, ...secondQuadrant), value: t },
  "pythagorean-L2-05": { identity: x => sec(x) ** 2 + cosec(x) ** 2 - t(x) ** 2 - cot(x) ** 2 },
  "pythagorean-L2-06": { theta: angleFor(sec, 13 / 5), value: x => t(x) ** 2 },
  "pythagorean-L2-07": { identity: x => (1 - s(x) ** 4) / c(x) ** 2 },
  "pythagorean-L2-08": { identity: x => s(x) ** 2 * (1 + t(x) ** 2) },
  "pythagorean-L2-09": { theta: angleFor(x => s(x) ** 2, 2 / 5), value: x => t(x) ** 2 + cot(x) ** 2 },
  "pythagorean-L2-10": { theta: angleFor(x => sec(x) + t(x), 4), value: x => sec(x) - t(x) },
  "pythagorean-L3-01": { theta: angleFor(x => s(x) + c(x), 1 / 2, ...secondQuadrant), value: x => s(x) * c(x) },
  "pythagorean-L3-02": { theta: angleFor(x => t(x) + cot(x), 5, ...belowFortyFive), value: x => sec(x) ** 2 + cosec(x) ** 2 },
  "pythagorean-L3-03": { theta: angleFor(x => s(x) * c(x), 1 / 3, ...belowFortyFive), value: x => s(x) ** 6 + c(x) ** 6 },
  "pythagorean-L3-04": { theta: angleFor(x => sec(x) + t(x), 3), value: s },
  "pythagorean-L3-05": { theta: angleFor(x => cosec(x) - cot(x), 2, ...secondQuadrant), value: c },
  "pythagorean-L3-06": { identity: x => (s(x) ** 6 + c(x) ** 6 - 1) / (s(x) ** 2 * c(x) ** 2) },
  "pythagorean-L3-07": { theta: angleFor(x => t(x) ** 2 + cot(x) ** 2, 7, ...belowFortyFive), value: x => s(x) ** 2 * c(x) ** 2 },
  "pythagorean-L3-08": { theta: Math.PI / 4, value: x => s(x) ** 2 * c(x) ** 2 },
  "pythagorean-L3-09": { theta: angleFor(x => s(x) ** 4 + c(x) ** 4, 5 / 8, ...belowFortyFive), value: x => (t(x) + cot(x)) ** 2 },
  "pythagorean-L3-10": { theta: angleFor(x => t(x) - cot(x), 2, ...firstQuadrant), value: x => s(x) ** 4 + c(x) ** 4 }
};

assert.equal(bank.length, 1);
assert.equal(topic.questionCount, 20);
assert.equal(topic.marksPerQuestion, 1);
assert.equal(topic.questions.length, 20);
assert.equal(new Set(topic.questions.map(q => q.id)).size, 20);
for (const level of [2, 3]) assert.equal(topic.questions.filter(q => q.level === level).length, 10);

for (const question of topic.questions) {
  assert.equal(question.options.length, 4);
  assert.equal(new Set(question.options).size, 4);
  assert.ok(question.explanation);
  assert.equal(question.difficulty, question.level === 2 ? "medium" : "hard");
  const check = cases[question.id];
  assert.ok(check, "Missing independent solution: " + question.id);
  const angles = check.identity ? sampleAngles : [check.theta];
  const fn = check.identity || check.value;
  const correctOptions = question.options.filter(option => angles.every(theta => near(evaluateOption(option, theta), fn(theta))));
  assert.equal(correctOptions.length, 1, question.id + " does not have exactly one correct answer");
  assert.equal(question.answer, correctOptions[0], question.id + " has an incorrect key");
}

// Check the claimed maximum throughout a complete revolution and its attainer.
for (let step = 0; step <= 4096; step++) {
  const theta = step * 2 * Math.PI / 4096;
  assert.ok(s(theta) ** 2 * c(theta) ** 2 <= .25 + 1e-12);
}
assert.ok(near(s(Math.PI / 4) ** 2 * c(Math.PI / 4) ** 2, .25));
assert.match(page, /where all displayed terms are defined/);
assert.match(page, /Each correct answer earns 1 mark/);
assert.ok(page.includes('data-quiz-bank="' + bankPath + '"'));
assert.ok(hub.includes('href="pythagorean_identities_quiz.html"'));
assert.ok(fs.readFileSync(path.join(root, "index.html"), "utf8").includes('href="quizzes/maths_skill_builders.html"'));
for (const file of ["js/account.js", "js/scores.js"]) {
  assert.ok(fs.readFileSync(path.join(root, file), "utf8").includes('"pythagorean-identities-v1"'));
}
const engineIds = [...engine.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]);
for (const id of engineIds) assert.ok(page.includes('id="' + id + '"'), "Missing quiz control: " + id);

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

async function boot(data, activeTopic, customBank) {
  const nodes = Object.fromEntries(engineIds.map(id => [id, new Element()]));
  for (const id of ["quizScreen", "resultScreen", "loadError"]) nodes[id].hidden = true;
  const level = customBank ? new Element() : null;
  const records = [];
  const document = {
    body: { dataset: { quizTopic: activeTopic, ...(customBank ? { quizBank: bankPath } : {}) } },
    getElementById: id => nodes[id],
    querySelector: () => level,
    createElement: () => new Element()
  };
  const window = {
    setInterval: () => 1,
    addEventListener() {},
    ProgressStore: {
      createAttemptId: () => "test-only-attempt",
      startTabTracking() {},
      finishTabTracking: () => ({}),
      recordAttempt: async record => records.push(record)
    }
  };
  vm.runInNewContext(engine, {
    document, window, console, clearInterval() {},
    fetch: async url => {
      assert.equal(url, customBank ? bankPath : "../assets/data/question_banks/maths_vectors_matrices.json");
      return { ok: true, json: async () => structuredClone(data) };
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.loadError.hidden, true);
  assert.equal(nodes.loadError.textContent, "");
  assert.equal(nodes.quizScreen.hidden, false);
  return { nodes, level, records };
}

function answerCurrent(session, question, correct) {
  const option = session.nodes.options.children.find(button => (button.children[1].textContent === question.answer) === correct);
  assert.ok(option);
  option.click();
}

async function complete(session, activeTopic, wrongIndices = new Set()) {
  const seen = new Set();
  for (let index = 0; index < activeTopic.questionCount; index++) {
    const question = activeTopic.questions.find(q => q.prompt === session.nodes.question.textContent);
    assert.ok(question);
    assert.ok(!seen.has(question.id));
    seen.add(question.id);
    if (session.level) {
      assert.equal(question.level, index < 10 ? 2 : 3);
      assert.equal(session.level.textContent, `Level ${question.level} · 1 mark`);
    }
    answerCurrent(session, question, !wrongIndices.has(index));
    if (index === 1) {
      session.nodes.prevBtn.click();
      assert.equal(session.nodes.options.children.filter(b => b.attributes["aria-pressed"] === "true").length, 1);
      session.nodes.nextBtn.click();
    }
    if (index < activeTopic.questionCount - 1) session.nodes.nextBtn.click();
  }
  assert.equal(session.nodes.submitBtn.disabled, false);
  session.nodes.submitBtn.click();
  await new Promise(resolve => setImmediate(resolve));
  const score = activeTopic.questionCount - wrongIndices.size;
  assert.equal(session.nodes.finalScore.textContent, score + "/" + activeTopic.questionCount);
  assert.equal(session.nodes.finalPercent.textContent, Math.round(score / activeTopic.questionCount * 100) + "%");
  assert.equal(session.nodes.reviewList.children.length, activeTopic.questionCount);
  const explanationCount = session.nodes.reviewList.children.filter(item => item.children.some(child => child.className === "review-explanation")).length;
  assert.equal(explanationCount, activeTopic.showExplanations ? activeTopic.questionCount : 0);
  const record = session.records.at(-1);
  assert.equal(record.quizId, activeTopic.quizId);
  assert.equal(record.score, score);
  assert.equal(record.total, activeTopic.questionCount);
  assert.equal(new Set(record.details.questionIds).size, activeTopic.questionCount);
}

(async () => {
  const session = await boot(bank, topic.id, true);
  assert.equal(session.nodes.prevBtn.disabled, true);
  session.nodes.submitBtn.click();
  assert.match(session.nodes.quizStatus.textContent, /Answer every question/);
  await complete(session, topic, new Set([2, 7, 19]));
  session.nodes.againBtn.click();
  await complete(session, topic);
  session.nodes.againBtn.click();
  await complete(session, topic, new Set(Array.from({ length: 20 }, (_, n) => n)));

  const vectorBank = JSON.parse(fs.readFileSync(path.join(root, "assets/data/question_banks/maths_vectors_matrices.json"), "utf8"));
  for (const existing of vectorBank) {
    await complete(await boot(vectorBank, existing.id, false), existing);
  }
  console.log("PASS: all 20 keys independently solved; one valid choice per question; 10 questions per level; 20-mark scoring, navigation, retakes, explanations and score payloads; all 7 existing vector quizzes retain their behavior.");
})().catch(error => { console.error(error); process.exitCode = 1; });
