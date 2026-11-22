const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];

function read(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const vectorPages = [
  "vectors_skill_builder.html",
  "vector_addition_quiz_v1.html",
  "vector_subtraction_quiz_v1.html",
  "dot_product_quiz_v1.html",
  "determinants_2x2_quiz_v1.html",
  "cross_product_quiz_v1.html",
  "vector_resolution_quiz_v1.html",
  "vector_magnitude_quiz_v1.html"
];
const foundationPages = [
  "trig_angles_quiz_v1.html",
  "multiplication_practice_v1.html"
];

for (const file of vectorPages) {
  const html = read(path.join("quizzes", file));
  expect(
    html.includes('<meta name="theme-color" content="#ffffff">'),
    `${file} must declare the light browser theme.`
  );
  expect(
    html.includes('href="../styles/maths_vector_quiz.css?v=2"'),
    `${file} must load the shared light vector-quiz theme.`
  );
}

for (const file of foundationPages) {
  const html = read(path.join("quizzes", file));
  expect(
    html.includes('<meta name="theme-color" content="#ffffff" />'),
    `${file} must declare the light browser theme.`
  );
  const themeLinkPosition = html.indexOf('href="../styles/maths_foundation_light.css?v=1"');
  expect(themeLinkPosition > html.lastIndexOf("</style>"), `${file} light overrides must load after its legacy inline theme.`);
  expect(themeLinkPosition < html.indexOf("</head>"), `${file} light theme must load inside the document head.`);
}

const vectorTheme = read(path.join("styles", "maths_vector_quiz.css"));
for (const snippet of [
  "color-scheme: light",
  "--page: #ffffff",
  "--panel: #ffffff",
  "--text: #111111",
  "--control-border: #767676",
  "--surface-soft: #f4f4f4",
  "background: var(--page)",
  "outline: 3px solid var(--accent)",
  ".option.is-selected",
  ".review-item.is-correct",
  ".review-item.is-wrong",
  "prefers-reduced-motion"
]) {
  expect(vectorTheme.includes(snippet), `Shared vector theme is missing: ${snippet}`);
}
for (const staleDarkToken of ["#06162f", "#0d2746", "#071a31", "#0a203a", "rgba(13, 39, 70"] ) {
  expect(!vectorTheme.includes(staleDarkToken), `Shared vector theme retains dark token: ${staleDarkToken}`);
}

const foundationTheme = read(path.join("styles", "maths_foundation_light.css"));
for (const snippet of [
  "color-scheme: light",
  "body {",
  "background: #ffffff",
  ".quiz-card",
  ".practice-card",
  ".option.selected",
  ".mode-pill.active",
  ".table-chip.active",
  ".table-chip {\n  width: auto",
  "button:focus-visible",
  "prefers-reduced-motion"
]) {
  expect(foundationTheme.includes(snippet), `Foundation theme is missing: ${snippet}`);
}
expect(
  (foundationTheme.match(/border(?:-color)?:[^;]*#767676/g) ?? []).length >= 4,
  "Foundation quiz inputs and choices need persistent high-contrast boundaries."
);

const trig = read(path.join("quizzes", "trig_angles_quiz_v1.html"));
for (const snippet of [
  '<button type="button" class="mode-pill active"',
  '<button type="button" class="mode-pill"',
  'button.setAttribute("aria-pressed", String(isSelected))',
  'const button = document.createElement("button")',
  'id="feedback" class="feedback" role="status" aria-live="polite"',
  'id="question" tabindex="-1"',
  'id="trigResultTitle" class="start-title" tabindex="-1"',
  'document.getElementById("trigResultTitle").focus()',
  'id="trigReviewTitle" tabindex="-1"',
  'document.getElementById("trigReviewTitle").focus()'
]) {
  expect(trig.includes(snippet), `Trigonometry accessibility contract is missing: ${snippet}`);
}

const multiplication = read(path.join("quizzes", "multiplication_practice_v1.html"));
for (const snippet of [
  'const chip = document.createElement("button")',
  'chip.setAttribute("aria-pressed", String(isSelected))',
  'aria-labelledby="question answerInputLabel"',
  'id="feedback" class="feedback" role="status" aria-live="polite"',
  'id="multiplicationResultTitle" class="start-title" tabindex="-1"',
  'aria-controls="wrongList" aria-expanded="false"',
  'reviewBtn.setAttribute("aria-expanded", String(shouldOpen))'
]) {
  expect(multiplication.includes(snippet), `Multiplication accessibility contract is missing: ${snippet}`);
}
expect(
  multiplication.includes('showQuestion({ announceQuestion: true })') &&
    multiplication.includes('Next question: ${q.q}') &&
    multiplication.includes("submitButton.disabled = true") &&
    multiplication.includes("submitButton.disabled = false"),
  "Multiplication must announce the next question after correct-answer feedback."
);
expect(foundationTheme.includes("color: #6b6b6b"), "Input placeholder text needs sufficient contrast.");

const index = read("index.html");
for (const route of [
  "quizzes/vectors_skill_builder.html",
  "quizzes/trigonometry_skill_builder.html",
  "quizzes/basic_arithmetic_skill_builder.html"
]) {
  expect(index.includes(`href="${route}"`), `Mathematics section is missing active route: ${route}`);
}

const mathsSection = index.match(/<article class="subject-card mathematics"[\s\S]*?<\/article>/)?.[0] || "";
const categoryRoutes = [...mathsSection.matchAll(/class="app-link" href="([^"]+)"/g)].map(match => match[1]);
expect(
  JSON.stringify(categoryRoutes) === JSON.stringify([
    "quizzes/vectors_skill_builder.html",
    "quizzes/trigonometry_skill_builder.html",
    "quizzes/basic_arithmetic_skill_builder.html"
  ]),
  "Mathematics must show Vectors, Trigonometry and Basic Arithmetic once each, in that order."
);
expect(!mathsSection.includes("Foundations") && !mathsSection.includes("Maths Skill Builders"), "Mathematics retains a duplicate navigation layer.");

for (const [category, children] of [
  ["trigonometry_skill_builder.html", ["trig_angles_quiz_v1.html", "pythagorean_identities_quiz.html", "sum_difference_identities_quiz.html", "double_triple_identities_quiz.html"]],
  ["basic_arithmetic_skill_builder.html", ["multiplication_practice_v1.html"]]
]) {
  const html = read(path.join("quizzes", category));
  const childRoutes = [...html.matchAll(/class="skill-card" href="([^"]+)"/g)].map(match => match[1]);
  expect(JSON.stringify(childRoutes) === JSON.stringify(children), `${category} must list its quizzes exactly once.`);
  expect(html.includes('href="maths_skill_builders.html"'), `${category} must return to Skill Builders.`);
  expect(html.includes('href="../styles/maths_vector_quiz.css?v=2"'), `${category} must use the shared maths theme.`);
  for (const child of children) {
    expect(read(path.join("quizzes", child)).includes(`class="back-link" href="${category}"`), `${child} must return to its own category.`);
  }
}

const skillBuilders = read(path.join("quizzes", "maths_skill_builders.html"));
expect(skillBuilders.includes("<h1>Skill Builders</h1>"), "The category overview has the wrong title.");
expect(
  JSON.stringify([...skillBuilders.matchAll(/class="skill-card" href="([^"]+)"/g)].map(match => match[1])) === JSON.stringify([
    "vectors_skill_builder.html", "trigonometry_skill_builder.html", "basic_arithmetic_skill_builder.html"
  ]),
  "The Skill Builders overview must contain only the three category links."
);

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("Maths theme and navigation passed: three categories, correct quiz parents, and the light quiz palette.");
}
