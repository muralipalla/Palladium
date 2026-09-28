const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "simulations", "Thermal", "random_walk_2d.html");
const stylePath = path.join(root, "simulations", "Thermal", "css", "random_walk_2d.css");
const scriptPath = path.join(root, "simulations", "Thermal", "js", "random_walk_2d.mjs");
const indexPath = path.join(root, "index.html");
const failures = [];

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing file: ${path.relative(root, filePath)}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function expectNear(actual, expected, tolerance, message) {
  expect(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message}: expected about ${expected}, received ${actual}`,
  );
}

function probabilities(weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

function drift(weights) {
  const [positiveX, negativeX, positiveY, negativeY] = probabilities(weights);
  return { x: positiveX - negativeX, y: positiveY - negativeY };
}

function theoryRms(stepCount, weights) {
  const meanStep = drift(weights);
  return Math.sqrt(
    stepCount + stepCount * Math.max(0, stepCount - 1) * (meanStep.x ** 2 + meanStep.y ** 2),
  );
}

const html = requireFile(htmlPath);
const style = requireFile(stylePath);
const script = requireFile(scriptPath);
const index = requireFile(indexPath);

expect(/href="css\/random_walk_2d\.css"/.test(html), "The page does not load its stylesheet.");
expect(/src="js\/random_walk_2d\.mjs"/.test(html), "The page does not load its JavaScript module.");
expect(/href="\.\.\/\.\.\/index\.html#physics"/.test(html), "The page is missing its Palladium back link.");
expect(
  /href="simulations\/Thermal\/random_walk_2d\.html"[\s\S]*?Biased 2D Random Walk/.test(index),
  "The Physics → Thermal list does not link to the random-walk simulation.",
);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, indexValue) => ids.indexOf(id) !== indexValue))];
expect(duplicateIds.length === 0, `Duplicate HTML IDs: ${duplicateIds.join(", ") || "none"}.`);

for (const id of [
  "pathCanvas",
  "cloudCanvas",
  "stepsControl",
  "populationControl",
  "playButton",
  "stepButton",
  "resetButton",
  "newTrialButton",
  "weightPositiveX",
  "weightNegativeX",
  "weightPositiveY",
  "weightNegativeY",
]) {
  expect(ids.includes(id), `Required control or visualization is missing: ${id}.`);
}

for (const id of ["weightPositiveX", "weightNegativeX", "weightPositiveY", "weightNegativeY"]) {
  const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`, "i"))?.[0] ?? "";
  expect(/type="range"/.test(tag), `${id} must be a range slider.`);
  expect(/min="0"/.test(tag) && /max="100"/.test(tag), `${id} must permit weights from 0 to 100.`);
  expect(/value="25"/.test(tag), `${id} must default to the unbiased weight 25.`);
}

expect(/role="status"[^>]*aria-live="polite"/.test(html), "The page needs an accessible live status region.");
expect((html.match(/role="img"/g) || []).length === 2, "Both canvases must expose image semantics.");
expect(/Weights are normalized automatically/.test(html), "The weight normalization must be explained to learners.");
expect(/requestAnimationFrame\(animate\)/.test(script), "The simulation must animate with requestAnimationFrame.");
expect(/new ResizeObserver/.test(script), "The canvases must react to responsive resizing.");
expect(/visibilitychange/.test(script), "The simulation must pause when its page is hidden.");
expect(/prefers-reduced-motion:\s*reduce/.test(style), "Reduced-motion preferences are not respected.");
expect(/@media\s*\(max-width:\s*800px\)/.test(style), "The page needs a mobile layout breakpoint.");
expect(/state\.probabilities\[0\]\s*-\s*state\.probabilities\[1\]/.test(script), "The x drift calculation is missing.");
expect(/state\.probabilities\[2\]\s*-\s*state\.probabilities\[3\]/.test(script), "The y drift calculation is missing.");
expect(/step \+ step \* Math\.max\(0, step - 1\) \* driftSquared/.test(script), "The biased-walk RMS theory is missing.");

expectNear(theoryRms(100, [25, 25, 25, 25]), 10, 1e-12, "Unbiased 100-step RMS fixture failed");
expectNear(theoryRms(100, [100, 0, 0, 0]), 100, 1e-12, "Deterministic +x RMS fixture failed");
expectNear(drift([55, 15, 15, 15]).x, 0.4, 1e-12, "+x preset drift fixture failed");
expectNear(drift([55, 15, 15, 15]).y, 0, 1e-12, "+x preset transverse drift fixture failed");
expectNear(drift([40, 10, 40, 10]).x, 0.3, 1e-12, "Diagonal preset x-drift fixture failed");
expectNear(drift([40, 10, 40, 10]).y, 0.3, 1e-12, "Diagonal preset y-drift fixture failed");

if (failures.length) {
  console.error(`2D random-walk validation failed (${failures.length} issue${failures.length === 1 ? "" : "s"}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("2D random-walk validation passed: structure, accessibility, responsiveness, and biased-walk physics are sound.");
