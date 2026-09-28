const pathCanvas = document.querySelector("#pathCanvas");
const cloudCanvas = document.querySelector("#cloudCanvas");
const pathContext = pathCanvas.getContext("2d");
const cloudContext = cloudCanvas.getContext("2d");

const controls = {
  steps: document.querySelector("#stepsControl"),
  population: document.querySelector("#populationControl"),
  speed: document.querySelector("#speedControl"),
  play: document.querySelector("#playButton"),
  step: document.querySelector("#stepButton"),
  reset: document.querySelector("#resetButton"),
  newTrial: document.querySelector("#newTrialButton"),
  unbiased: document.querySelector("#unbiasedButton"),
};

const outputs = {
  steps: document.querySelector("#stepsValue"),
  population: document.querySelector("#populationValue"),
  position: document.querySelector("#singlePosition"),
  populationChip: document.querySelector("#walkerCountChip"),
  currentStep: document.querySelector("#stepMetric"),
  mean: document.querySelector("#meanMetric"),
  rms: document.querySelector("#rmsMetric"),
  theory: document.querySelector("#theoryMetric"),
  expected: document.querySelector("#expectedMetric"),
  status: document.querySelector("#statusMessage"),
  badge: document.querySelector("#biasBadge"),
  driftVector: document.querySelector("#driftVector"),
  driftMagnitude: document.querySelector("#driftMagnitude"),
  biasArrow: document.querySelector("#biasArrow"),
};

const directionControls = [
  {
    key: "px",
    dx: 1,
    dy: 0,
    label: "+x",
    input: document.querySelector("#weightPositiveX"),
    output: document.querySelector("#weightPositiveXValue"),
  },
  {
    key: "nx",
    dx: -1,
    dy: 0,
    label: "−x",
    input: document.querySelector("#weightNegativeX"),
    output: document.querySelector("#weightNegativeXValue"),
  },
  {
    key: "py",
    dx: 0,
    dy: 1,
    label: "+y",
    input: document.querySelector("#weightPositiveY"),
    output: document.querySelector("#weightPositiveYValue"),
  },
  {
    key: "ny",
    dx: 0,
    dy: -1,
    label: "−y",
    input: document.querySelector("#weightNegativeY"),
    output: document.querySelector("#weightNegativeYValue"),
  },
];

const state = {
  targetSteps: Number(controls.steps.value),
  population: Number(controls.population.value),
  step: 0,
  singleX: 0,
  singleY: 0,
  path: [{ x: 0, y: 0 }],
  walkerX: new Int32Array(Number(controls.population.value)),
  walkerY: new Int32Array(Number(controls.population.value)),
  probabilities: [0.25, 0.25, 0.25, 0.25],
  driftX: 0,
  driftY: 0,
  measuredRms: 0,
  meanX: 0,
  meanY: 0,
  seed: createSeed(),
  rng: null,
  running: false,
  animationFrame: 0,
  animationStartTime: 0,
  animationStartStep: 0,
};

function createSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0x100000000);
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function formatNumber(value, digits = 2) {
  const cleanValue = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return cleanValue.toFixed(digits);
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function readProbabilities(changedInput = null) {
  let weights = directionControls.map(({ input }) => Number(input.value));
  let total = weights.reduce((sum, weight) => sum + weight, 0);

  if (total === 0) {
    const fallback = changedInput ?? directionControls[0].input;
    fallback.value = "1";
    weights = directionControls.map(({ input }) => Number(input.value));
    total = 1;
  }

  state.probabilities = weights.map((weight) => weight / total);
  state.driftX = state.probabilities[0] - state.probabilities[1];
  state.driftY = state.probabilities[2] - state.probabilities[3];

  directionControls.forEach(({ input, output }, index) => {
    output.textContent = `${input.value} → ${(state.probabilities[index] * 100).toFixed(1)}%`;
  });

  const magnitude = Math.hypot(state.driftX, state.driftY);
  const isBiased = magnitude > 1e-9;
  outputs.badge.textContent = isBiased ? "Biased" : "Unbiased";
  outputs.badge.classList.toggle("is-biased", isBiased);
  outputs.driftVector.textContent = `μ = (${formatNumber(state.driftX, 3)}, ${formatNumber(state.driftY, 3)})`;
  outputs.driftMagnitude.textContent = `Drift magnitude: ${magnitude.toFixed(3)} a/step`;

  const angle = Math.atan2(-state.driftY, state.driftX) * 180 / Math.PI;
  outputs.biasArrow.style.width = `${Math.min(29, magnitude * 29)}px`;
  outputs.biasArrow.style.transform = `rotate(${angle}deg)`;
}

function sampleDirection() {
  const draw = state.rng();
  let cumulative = 0;
  for (let index = 0; index < state.probabilities.length; index += 1) {
    cumulative += state.probabilities[index];
    if (draw < cumulative || index === state.probabilities.length - 1) {
      return directionControls[index];
    }
  }
  return directionControls[3];
}

function advanceOneStep() {
  if (state.step >= state.targetSteps) return false;

  const singleDirection = sampleDirection();
  state.singleX += singleDirection.dx;
  state.singleY += singleDirection.dy;
  state.path.push({ x: state.singleX, y: state.singleY });

  for (let index = 0; index < state.population; index += 1) {
    const direction = sampleDirection();
    state.walkerX[index] += direction.dx;
    state.walkerY[index] += direction.dy;
  }

  state.step += 1;
  return true;
}

function stopAnimation() {
  state.running = false;
  if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
  state.animationFrame = 0;
  controls.play.textContent = state.step >= state.targetSteps ? "Replay" : "Animate";
}

function resetTrial(message = "Reset. All walkers are back at the origin.") {
  stopAnimation();
  state.step = 0;
  state.singleX = 0;
  state.singleY = 0;
  state.path = [{ x: 0, y: 0 }];
  state.walkerX = new Int32Array(state.population);
  state.walkerY = new Int32Array(state.population);
  state.rng = mulberry32(state.seed);
  outputs.status.textContent = message;
  updateDisplay();
}

function newTrial() {
  state.seed = createSeed();
  resetTrial("New random trial ready. All walkers begin at the origin.");
}

function animate(timestamp) {
  if (!state.running) return;
  if (!state.animationStartTime) state.animationStartTime = timestamp;

  const totalDuration = Number(controls.speed.value);
  const remainingStepsAtStart = state.targetSteps - state.animationStartStep;
  const remainingDuration = totalDuration * remainingStepsAtStart / state.targetSteps;
  const progress = Math.min(1, (timestamp - state.animationStartTime) / Math.max(1, remainingDuration));
  const desiredStep = Math.min(
    state.targetSteps,
    state.animationStartStep + Math.max(1, Math.floor(progress * remainingStepsAtStart)),
  );

  while (state.step < desiredStep) advanceOneStep();
  updateDisplay();

  if (state.step >= state.targetSteps) {
    stopAnimation();
    outputs.status.textContent = `Trial complete after ${formatInteger(state.targetSteps)} steps.`;
    return;
  }

  state.animationFrame = requestAnimationFrame(animate);
}

function toggleAnimation() {
  if (state.running) {
    stopAnimation();
    outputs.status.textContent = `Paused at step ${formatInteger(state.step)}.`;
    return;
  }

  if (state.step >= state.targetSteps) resetTrial("Replaying the same random trial.");
  state.running = true;
  state.animationStartTime = 0;
  state.animationStartStep = state.step;
  controls.play.textContent = "Pause";
  outputs.status.textContent = "Walking…";
  state.animationFrame = requestAnimationFrame(animate);
}

function takeOneStep() {
  if (state.running) stopAnimation();
  if (state.step >= state.targetSteps) {
    outputs.status.textContent = "The trial is complete. Reset or start a new trial to continue.";
    return;
  }
  advanceOneStep();
  updateDisplay();
  outputs.status.textContent = `Advanced to step ${formatInteger(state.step)}.`;
}

function measureEnsemble() {
  let sumX = 0;
  let sumY = 0;
  let sumRadiusSquared = 0;

  for (let index = 0; index < state.population; index += 1) {
    const x = state.walkerX[index];
    const y = state.walkerY[index];
    sumX += x;
    sumY += y;
    sumRadiusSquared += x * x + y * y;
  }

  state.meanX = sumX / state.population;
  state.meanY = sumY / state.population;
  state.measuredRms = Math.sqrt(sumRadiusSquared / state.population);
}

function theoreticalRms(step = state.step) {
  const driftSquared = state.driftX ** 2 + state.driftY ** 2;
  return Math.sqrt(step + step * Math.max(0, step - 1) * driftSquared);
}

function updateMetrics() {
  measureEnsemble();
  const theory = theoreticalRms();
  const expectedX = state.step * state.driftX;
  const expectedY = state.step * state.driftY;

  outputs.steps.textContent = formatInteger(state.targetSteps);
  outputs.population.textContent = formatInteger(state.population);
  outputs.populationChip.textContent = `${formatInteger(state.population)} walkers`;
  outputs.position.textContent = `(${state.singleX}, ${state.singleY})`;
  outputs.currentStep.textContent = `${formatInteger(state.step)} / ${formatInteger(state.targetSteps)}`;
  outputs.mean.textContent = `(${formatNumber(state.meanX)}, ${formatNumber(state.meanY)})`;
  outputs.rms.textContent = `${formatNumber(state.measuredRms)} a`;
  outputs.theory.textContent = `${formatNumber(theory)} a`;
  outputs.expected.textContent = `(${formatNumber(expectedX)}, ${formatNumber(expectedY)})`;

  pathCanvas.setAttribute(
    "aria-label",
    `One random walker at coordinate ${state.singleX}, ${state.singleY} after ${state.step} of ${state.targetSteps} steps.`,
  );
  cloudCanvas.setAttribute(
    "aria-label",
    `${state.population} random-walker endpoints after ${state.step} steps. Mean position ${formatNumber(state.meanX)}, ${formatNumber(state.meanY)} and root-mean-square distance ${formatNumber(state.measuredRms)} lattice spacings.`,
  );
}

function prepareCanvas(canvas, context) {
  const rectangle = canvas.getBoundingClientRect();
  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
  const displayWidth = Math.max(1, Math.round(rectangle.width));
  const displayHeight = Math.max(1, Math.round(rectangle.height));
  const requiredWidth = Math.round(displayWidth * ratio);
  const requiredHeight = Math.round(displayHeight * ratio);

  if (canvas.width !== requiredWidth || canvas.height !== requiredHeight) {
    canvas.width = requiredWidth;
    canvas.height = requiredHeight;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: displayWidth, height: displayHeight };
}

function paintBackground(context, width, height) {
  context.clearRect(0, 0, width, height);
  const gradient = context.createRadialGradient(width * 0.34, height * 0.33, 0, width * 0.34, height * 0.33, width * 0.68);
  gradient.addColorStop(0, "rgba(14, 165, 233, 0.08)");
  gradient.addColorStop(1, "rgba(2, 6, 23, 0)");
  context.fillStyle = "#020617";
  context.fillRect(0, 0, width, height);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function chooseGridStep(unitsPerPixel) {
  const rawStep = unitsPerPixel * 42;
  const power = 10 ** Math.floor(Math.log10(Math.max(rawStep, 1e-9)));
  const normalized = rawStep / power;
  if (normalized <= 1) return power;
  if (normalized <= 2) return 2 * power;
  if (normalized <= 5) return 5 * power;
  return 10 * power;
}

function drawGrid(context, width, height, transform) {
  const { toCanvasX, toCanvasY, minX, maxX, minY, maxY, scale } = transform;
  const gridStep = chooseGridStep(1 / scale);

  context.save();
  context.lineWidth = 1;
  context.strokeStyle = "rgba(148, 163, 184, 0.12)";
  context.beginPath();

  for (let x = Math.ceil(minX / gridStep) * gridStep; x <= maxX; x += gridStep) {
    const canvasX = toCanvasX(x);
    context.moveTo(canvasX, 22);
    context.lineTo(canvasX, height - 30);
  }
  for (let y = Math.ceil(minY / gridStep) * gridStep; y <= maxY; y += gridStep) {
    const canvasY = toCanvasY(y);
    context.moveTo(42, canvasY);
    context.lineTo(width - 16, canvasY);
  }
  context.stroke();

  context.lineWidth = 1.3;
  context.strokeStyle = "rgba(186, 230, 253, 0.32)";
  context.beginPath();
  if (minX <= 0 && maxX >= 0) {
    context.moveTo(toCanvasX(0), 18);
    context.lineTo(toCanvasX(0), height - 28);
  }
  if (minY <= 0 && maxY >= 0) {
    context.moveTo(40, toCanvasY(0));
    context.lineTo(width - 14, toCanvasY(0));
  }
  context.stroke();

  context.fillStyle = "rgba(148, 163, 184, 0.78)";
  context.font = "11px system-ui, sans-serif";
  context.fillText(`grid: ${gridStep}a`, 12, height - 11);
  context.fillText("+x", width - 33, Math.min(height - 35, Math.max(14, toCanvasY(0) - 7)));
  context.fillText("+y", Math.min(width - 34, Math.max(45, toCanvasX(0) + 7)), 17);
  context.restore();
}

function pathTransform(width, height) {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const point of state.path) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const expectedX = state.step * state.driftX;
  const expectedY = state.step * state.driftY;
  minX = Math.min(minX, expectedX);
  maxX = Math.max(maxX, expectedX);
  minY = Math.min(minY, expectedY);
  maxY = Math.max(maxY, expectedY);

  const rangeX = Math.max(12, maxX - minX + 6);
  const rangeY = Math.max(12, maxY - minY + 6);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const drawableWidth = Math.max(1, width - 64);
  const drawableHeight = Math.max(1, height - 54);
  const scale = Math.min(drawableWidth / rangeX, drawableHeight / rangeY);
  const visibleRangeX = drawableWidth / scale;
  const visibleRangeY = drawableHeight / scale;
  const visibleMinX = centerX - visibleRangeX / 2;
  const visibleMaxX = centerX + visibleRangeX / 2;
  const visibleMinY = centerY - visibleRangeY / 2;
  const visibleMaxY = centerY + visibleRangeY / 2;

  return {
    minX: visibleMinX,
    maxX: visibleMaxX,
    minY: visibleMinY,
    maxY: visibleMaxY,
    scale,
    toCanvasX: (x) => 42 + (x - visibleMinX) * scale,
    toCanvasY: (y) => 22 + (visibleMaxY - y) * scale,
  };
}

function drawArrow(context, fromX, fromY, toX, toY, color, lineWidth = 2) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headSize = 8;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(toX - headSize * Math.cos(angle - Math.PI / 6), toY - headSize * Math.sin(angle - Math.PI / 6));
  context.lineTo(toX - headSize * Math.cos(angle + Math.PI / 6), toY - headSize * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
  context.restore();
}

function drawPathCanvas() {
  const { width, height } = prepareCanvas(pathCanvas, pathContext);
  paintBackground(pathContext, width, height);
  const transform = pathTransform(width, height);
  drawGrid(pathContext, width, height, transform);

  if (state.path.length > 1) {
    pathContext.save();
    pathContext.lineJoin = "round";
    pathContext.lineCap = "round";
    pathContext.lineWidth = Math.max(1.4, Math.min(3, transform.scale * 0.18));
    pathContext.strokeStyle = "rgba(56, 189, 248, 0.88)";
    pathContext.beginPath();
    pathContext.moveTo(transform.toCanvasX(0), transform.toCanvasY(0));
    for (let index = 1; index < state.path.length; index += 1) {
      const point = state.path[index];
      pathContext.lineTo(transform.toCanvasX(point.x), transform.toCanvasY(point.y));
    }
    pathContext.stroke();
    pathContext.restore();
  }

  const originX = transform.toCanvasX(0);
  const originY = transform.toCanvasY(0);
  pathContext.fillStyle = "#a78bfa";
  pathContext.beginPath();
  pathContext.arc(originX, originY, 5, 0, Math.PI * 2);
  pathContext.fill();

  const expectedX = state.step * state.driftX;
  const expectedY = state.step * state.driftY;
  if (Math.hypot(expectedX, expectedY) > 0.05) {
    drawArrow(
      pathContext,
      originX,
      originY,
      transform.toCanvasX(expectedX),
      transform.toCanvasY(expectedY),
      "rgba(245, 158, 11, 0.88)",
      2.2,
    );
  }

  const walkerX = transform.toCanvasX(state.singleX);
  const walkerY = transform.toCanvasY(state.singleY);
  pathContext.shadowColor = "rgba(251, 146, 60, 0.9)";
  pathContext.shadowBlur = 14;
  pathContext.fillStyle = "#fb923c";
  pathContext.beginPath();
  pathContext.arc(walkerX, walkerY, 7, 0, Math.PI * 2);
  pathContext.fill();
  pathContext.shadowBlur = 0;

  pathContext.fillStyle = "rgba(226, 232, 240, 0.86)";
  pathContext.font = "600 12px system-ui, sans-serif";
  pathContext.fillText("start", originX + 8, originY + 17);
  pathContext.fillText("walker", walkerX + 10, walkerY - 9);
}

function cloudTransform(width, height, extent) {
  const drawableWidth = Math.max(1, width - 64);
  const drawableHeight = Math.max(1, height - 54);
  const scale = Math.min(drawableWidth, drawableHeight) / (2 * extent);
  const centerX = 42 + drawableWidth / 2;
  const centerY = 22 + drawableHeight / 2;
  const visibleRangeX = drawableWidth / scale;
  const visibleRangeY = drawableHeight / scale;

  return {
    minX: -visibleRangeX / 2,
    maxX: visibleRangeX / 2,
    minY: -visibleRangeY / 2,
    maxY: visibleRangeY / 2,
    scale,
    toCanvasX: (x) => centerX + x * scale,
    toCanvasY: (y) => centerY - y * scale,
  };
}

function drawCloudCanvas() {
  const { width, height } = prepareCanvas(cloudCanvas, cloudContext);
  paintBackground(cloudContext, width, height);
  const theory = theoreticalRms();
  let extent = 8;
  for (let index = 0; index < state.population; index += 1) {
    extent = Math.max(extent, Math.abs(state.walkerX[index]), Math.abs(state.walkerY[index]));
  }
  extent = Math.max(extent, state.measuredRms, theory) * 1.16;
  const transform = cloudTransform(width, height, extent);
  drawGrid(cloudContext, width, height, transform);

  const centerX = transform.toCanvasX(0);
  const centerY = transform.toCanvasY(0);
  if (state.step > 0) {
    cloudContext.save();
    cloudContext.setLineDash([7, 6]);
    cloudContext.lineWidth = 1.5;
    cloudContext.strokeStyle = "rgba(167, 139, 250, 0.8)";
    cloudContext.beginPath();
    cloudContext.arc(centerX, centerY, theory * transform.scale, 0, Math.PI * 2);
    cloudContext.stroke();

    cloudContext.setLineDash([]);
    cloudContext.lineWidth = 1.8;
    cloudContext.strokeStyle = "rgba(52, 211, 153, 0.9)";
    cloudContext.beginPath();
    cloudContext.arc(centerX, centerY, state.measuredRms * transform.scale, 0, Math.PI * 2);
    cloudContext.stroke();
    cloudContext.restore();
  }

  cloudContext.save();
  const pointRadius = state.population > 2500 ? 1.5 : state.population > 1000 ? 1.8 : 2.2;
  cloudContext.fillStyle = state.population > 2500 ? "rgba(56, 189, 248, 0.38)" : "rgba(56, 189, 248, 0.58)";
  cloudContext.beginPath();
  for (let index = 0; index < state.population; index += 1) {
    const x = transform.toCanvasX(state.walkerX[index]);
    const y = transform.toCanvasY(state.walkerY[index]);
    cloudContext.moveTo(x + pointRadius, y);
    cloudContext.arc(x, y, pointRadius, 0, Math.PI * 2);
  }
  cloudContext.fill();
  cloudContext.restore();

  cloudContext.fillStyle = "#a78bfa";
  cloudContext.beginPath();
  cloudContext.arc(centerX, centerY, 4.5, 0, Math.PI * 2);
  cloudContext.fill();

  const meanCanvasX = transform.toCanvasX(state.meanX);
  const meanCanvasY = transform.toCanvasY(state.meanY);
  cloudContext.strokeStyle = "#f59e0b";
  cloudContext.lineWidth = 2;
  cloudContext.beginPath();
  cloudContext.moveTo(meanCanvasX - 6, meanCanvasY);
  cloudContext.lineTo(meanCanvasX + 6, meanCanvasY);
  cloudContext.moveTo(meanCanvasX, meanCanvasY - 6);
  cloudContext.lineTo(meanCanvasX, meanCanvasY + 6);
  cloudContext.stroke();

  cloudContext.font = "600 11px system-ui, sans-serif";
  cloudContext.fillStyle = "rgba(52, 211, 153, 0.94)";
  cloudContext.fillText("measured RMS", 12, 19);
  cloudContext.fillStyle = "rgba(167, 139, 250, 0.94)";
  cloudContext.fillText("theory RMS", 12, 36);
  cloudContext.fillStyle = "rgba(245, 158, 11, 0.94)";
  cloudContext.fillText("+ ensemble mean", 12, 53);
}

function updateDisplay() {
  updateMetrics();
  drawPathCanvas();
  drawCloudCanvas();
  controls.step.disabled = state.step >= state.targetSteps;
}

function setWeights(values, message) {
  directionControls.forEach(({ input }, index) => {
    input.value = String(values[index]);
  });
  readProbabilities();
  resetTrial(message);
}

controls.steps.addEventListener("input", () => {
  state.targetSteps = Number(controls.steps.value);
  resetTrial(`Step target changed to ${formatInteger(state.targetSteps)}. The trial was reset.`);
});

controls.population.addEventListener("input", () => {
  state.population = Number(controls.population.value);
  resetTrial(`Population changed to ${formatInteger(state.population)} walkers. The trial was reset.`);
});

controls.play.addEventListener("click", toggleAnimation);
controls.step.addEventListener("click", takeOneStep);
controls.reset.addEventListener("click", () => resetTrial());
controls.newTrial.addEventListener("click", newTrial);
controls.unbiased.addEventListener("click", () => setWeights([25, 25, 25, 25], "Unbiased probabilities restored."));

directionControls.forEach(({ input }) => {
  input.addEventListener("input", () => {
    readProbabilities(input);
    resetTrial("Directional probabilities changed. The trial was reset with the new bias.");
  });
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const presets = {
      right: { weights: [55, 15, 15, 15], message: "Preset applied: drift in the +x direction." },
      up: { weights: [15, 15, 55, 15], message: "Preset applied: drift in the +y direction." },
      diagonal: { weights: [40, 10, 40, 10], message: "Preset applied: diagonal drift toward +x and +y." },
    };
    const preset = presets[button.dataset.preset];
    setWeights(preset.weights, preset.message);
  });
});

const resizeObserver = new ResizeObserver(() => {
  drawPathCanvas();
  drawCloudCanvas();
});
resizeObserver.observe(pathCanvas);
resizeObserver.observe(cloudCanvas);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.running) {
    stopAnimation();
    outputs.status.textContent = `Paused at step ${formatInteger(state.step)} because the page was hidden.`;
  }
});

readProbabilities();
resetTrial("Ready. All walkers begin at the origin.");
