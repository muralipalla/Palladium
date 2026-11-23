const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const bank = JSON.parse(read("assets/data/question_banks/physics_motion_graphs.json"));
const index = JSON.parse(read("assets/data/question_banks/questionbank_index.json"));
const near = (a, b, tolerance = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
const close = (actual, expected, message) => assert.ok(near(actual, expected, 1e-5), `${message}: ${actual} != ${expected}`);

function ordinate(points, time) {
  assert.ok(time >= points[0][0] && time <= points.at(-1)[0], "Extrapolation is not permitted");
  for (let i = 1; i < points.length; i++) {
    const [t0, y0] = points[i - 1], [t1, y1] = points[i];
    if (time >= t0 && time <= t1) return y0 + (y1 - y0) * (time - t0) / (t1 - t0);
  }
  throw Error("No plotted segment at this time");
}

function gradient(points, time) {
  for (let i = 1; i < points.length; i++) {
    const [t0, y0] = points[i - 1], [t1, y1] = points[i];
    if (time > t0 && time < t1) return (y1 - y0) / (t1 - t0);
  }
  throw Error("Instantaneous gradients must be requested inside a straight segment, away from corners");
}

function area(points, start, end) {
  assert.ok(start < end && start >= points[0][0] && end <= points.at(-1)[0]);
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const left = Math.max(start, points[i - 1][0]), right = Math.min(end, points[i][0]);
    if (left < right) total += (ordinate(points, left) + ordinate(points, right)) / 2 * (right - left);
  }
  return total;
}

function independentAnswer(question) {
  const graph = question.graph, query = question.calculation;
  const points = graph.series?.[0].points;
  const [start, end] = query.interval || [];
  const duration = end - start;
  if (graph.type === "xt") {
    if (query.quantity === "velocity") {
      if (graph.curve) return graph.curve.coefficients[1] + 2 * graph.curve.coefficients[2] * query.time;
      return gradient(points, query.time);
    }
    if (query.quantity === "displacement") return ordinate(points, end) - ordinate(points, start);
    if (query.quantity === "averageVelocity") return (ordinate(points, end) - ordinate(points, start)) / duration;
    if (query.quantity === "relativeVelocity") return gradient(graph.series[0].points, query.time) - gradient(graph.series[1].points, query.time);
  } else {
    if (query.quantity === "velocity") return ordinate(points, query.time);
    if (query.quantity === "acceleration") return gradient(points, query.time);
    if (query.quantity === "averageAcceleration") return (ordinate(points, end) - ordinate(points, start)) / duration;
    if (query.quantity === "displacement") return area(points, start, end);
    if (query.quantity === "averageVelocity") return area(points, start, end) / duration;
    if (query.quantity === "position") return query.initialPosition + area(points, start, end);
  }
  throw Error("Unsupported physical quantity " + query.quantity);
}

function numericOption(option) {
  const match = option.replaceAll("−", "-").match(/^(-?\d+(?:\.\d+)?)(?:\/(\d+))? (m|m\/s|m\/s²)$/);
  assert.ok(match, "Invalid numeric option or missing SI unit: " + option);
  return { value: Number(match[1]) / Number(match[2] || 1), unit: match[3] };
}

function verifySvg(question) {
  const graph = question.graph;
  const file = path.resolve(root, "quizzes", graph.image);
  assert.ok(file.startsWith(path.join(root, "assets", "graphs", "physics_motion") + path.sep));
  const svg = fs.readFileSync(file, "utf8");
  assert.ok(svg.includes('viewBox="0 0 560 390"') && svg.includes('<title id="title">') && svg.includes('<desc id="description">'));
  assert.ok(svg.includes("Time, t (s)") && svg.includes(graph.type === "xt" ? "x (m)" : "v (m/s)"));
  const timeTicks = [...svg.matchAll(/class="time-tick" data-value="([^"]+)" x="([^"]+)"[^>]*>([^<]+)</g)].map(m => ({ value: Number(m[1]), pixel: Number(m[2]), display: m[3] }));
  const valueTicks = [...svg.matchAll(/class="value-tick" data-value="([^"]+)" x="[^"]+" y="([^"]+)"[^>]*>([^<]+)</g)].map(m => ({ value: Number(m[1]), pixel: Number(m[2]) - 7, display: m[3] }));
  assert.equal(timeTicks[0].value, 0);
  assert.equal(timeTicks.at(-1).value, graph.timeMax);
  assert.equal(valueTicks[0].value, graph.valueMin);
  assert.equal(valueTicks.at(-1).value, graph.valueMax);
  for (const tick of [...timeTicks, ...valueTicks]) assert.equal(Number(tick.display.replaceAll("−", "-")), tick.value);
  const calibrated = ([px, py]) => [
    timeTicks[0].value + (px - timeTicks[0].pixel) / (timeTicks.at(-1).pixel - timeTicks[0].pixel) * (timeTicks.at(-1).value - timeTicks[0].value),
    valueTicks[0].value + (py - valueTicks[0].pixel) / (valueTicks.at(-1).pixel - valueTicks[0].pixel) * (valueTicks.at(-1).value - valueTicks[0].value)
  ];
  const pixelPoints = text => text.split(" ").map(pair => pair.split(",").map(Number));
  const checkPoints = (pixels, expected) => {
    assert.equal(pixels.length, expected.length);
    pixels.map(calibrated).forEach(([t, y], i) => { close(t, expected[i][0], graph.id + " plotted time"); close(y, expected[i][1], graph.id + " plotted ordinate"); });
  };
  if (graph.series) {
    const polylines = [...svg.matchAll(/class="motion-series" data-series="([^"]+)" points="([^"]+)"/g)];
    assert.equal(polylines.length, graph.series.length);
    polylines.forEach((line, i) => { assert.equal(line[1], graph.series[i].label); checkPoints(pixelPoints(line[2]), graph.series[i].points); });
  } else {
    const pathMatch = svg.match(/class="motion-curve" d="M([^Q]+) Q([^ ]+) ([^"]+)"/);
    assert.ok(pathMatch);
    const [p0, p1, p2] = [pathMatch[1], pathMatch[2], pathMatch[3]].map(text => calibrated(text.split(",").map(Number)));
    const polynomial = t => graph.curve.coefficients.reduce((sum, coefficient, exponent) => sum + coefficient * t ** exponent, 0);
    for (const u of [0, .25, .5, .75, 1]) {
      const t = (1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u ** 2 * p2[0];
      const y = (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u ** 2 * p2[1];
      close(y, polynomial(t), "Quadratic curve must match its physical model");
    }
    const tangent = svg.match(/class="tangent-line" points="([^"]+)"/);
    assert.ok(tangent);
    checkPoints(pixelPoints(tangent[1]), graph.tangent.points);
    close(ordinate(graph.tangent.points, graph.tangent.time), polynomial(graph.tangent.time), "Tangent touches curve");
    close(gradient(graph.tangent.points, graph.tangent.time), independentAnswer(question), "Tangent gradient equals instantaneous velocity");
  }
}

assert.equal(bank.length, 20);
assert.equal(new Set(bank.map(q => q.id)).size, 20);
assert.equal(new Set(bank.map(q => q.graph.image)).size, 20);
for (const type of ["xt", "vt"]) for (const level of [1, 2]) assert.equal(bank.filter(q => q.graph.type === type && q.difficultyLevel === level).length, 5);
for (const question of bank) {
  assert.equal(question.subject, "Physics");
  assert.equal(question.questionType, "mcq");
  assert.equal(question.difficulty, "Level " + question.difficultyLevel);
  assert.equal(question.optionsLatex.length, 4);
  assert.equal(new Set(question.optionsLatex).size, 4);
  assert.ok(question.explanationLatex && question.hintsLatex[0]);
  assert.ok(question.promptLatex.includes(`src="${question.graph.image}"`) && question.promptLatex.includes('alt="'));
  const expected = independentAnswer(question);
  const quantity = question.calculation.quantity;
  const unit = ["displacement", "position"].includes(quantity) ? "m" : ["acceleration", "averageAcceleration"].includes(quantity) ? "m/s²" : "m/s";
  const correct = question.optionsLatex.filter(option => { const parsed = numericOption(option); assert.equal(parsed.unit, unit); return near(parsed.value, expected); });
  assert.equal(correct.length, 1, question.id + " must have exactly one correct numerical choice");
  assert.equal(question.answerLatex, correct[0], question.id + " key disagrees with the plotted motion");
  verifySvg(question);
}

const graphBank = index.banks.find(item => item.id === "physics-motion-graphs");
assert.ok(graphBank && graphBank.subject === "Physics");
assert.equal(graphBank.file, "../assets/data/question_banks/physics_motion_graphs.json");
assert.ok(graphBank.instructions.includes("fixed origin") && graphBank.instructions.includes("exact"));
const physicsQuestions = index.banks.filter(item => item.subject === "Physics").flatMap(item => {
  const data = JSON.parse(read(item.file.slice(3)));
  return Array.isArray(data) ? data : data.questions;
});
assert.equal(physicsQuestions.length, 80);
assert.equal(new Set(physicsQuestions.map(q => q.id)).size, 80);
assert.equal(index.banks.filter(item => item.subject === "Chemistry").length, 1);
console.log("PASS: 20 independently solved graph questions, unique correct choices and SI units; all 20 SVGs match their labelled axes, points and exact tangent; four selectable groups of five; all three Physics banks load with 80 unique questions.");
