const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const plot = { left: 90, right: 530, top: 80, bottom: 310 };
const colors = ["#1d4ed8", "#9f1239"];
const xml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const number = value => Number(value.toFixed(4));
const label = value => String(value).replaceAll("-", "−");

function renderGraph(graph, description) {
  const sx = t => plot.left + t / graph.timeMax * (plot.right - plot.left);
  const sy = value => plot.bottom - (value - graph.valueMin) / (graph.valueMax - graph.valueMin) * (plot.bottom - plot.top);
  const coordinate = ([t, value]) => `${number(sx(t))},${number(sy(value))}`;
  const title = graph.type === "xt" ? "Displacement–time (x–t)" : "Velocity–time (v–t)";
  const output = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="390" viewBox="0 0 560 390" role="img" aria-labelledby="title description">',
    `<title id="title">${title}</title><desc id="description">${xml(description)}</desc>`,
    '<rect width="560" height="390" rx="12" fill="white"/>',
    '<g font-family="Arial, sans-serif" fill="#14213d">',
    `<text x="28" y="29" font-size="23" font-weight="700">${title}</text>`
  ];
  const legend = (x, text, color, dashed = false) => {
    output.push(`<line x1="${x}" y1="53" x2="${x + 24}" y2="53" stroke="${color}" stroke-width="4"${dashed ? ' stroke-dasharray="7 5"' : ""}/><text x="${x + 33}" y="60" font-size="20">${xml(text)}</text>`);
  };
  if (graph.curve) {
    legend(28, "x–t curve", colors[0]);
    legend(208, `tangent at ${graph.tangent.time} s`, "#b45309", true);
  } else if (graph.series.length > 1) {
    graph.series.forEach((series, index) => legend(28 + index * 220, "Particle " + series.label, colors[index], index === 1));
  } else {
    output.push('<text x="28" y="60" font-size="20" fill="#475569">Straight-line segments</text>');
  }
  for (let t = 0; t <= graph.timeMax; t++) {
    const x = number(sx(t));
    output.push(`<line x1="${x}" y1="80" x2="${x}" y2="310" stroke="#d8e0eb"/>`);
    output.push(`<text class="time-tick" data-value="${t}" x="${x}" y="338" text-anchor="middle" font-size="21">${t}</text>`);
  }
  for (let value = graph.valueMin; value <= graph.valueMax; value += graph.valueTick) {
    const y = number(sy(value));
    output.push(`<line x1="90" y1="${y}" x2="530" y2="${y}" stroke="${value === 0 ? "#475569" : "#d8e0eb"}" stroke-width="${value === 0 ? 2 : 1}"/>`);
    output.push(`<text class="value-tick" data-value="${value}" x="78" y="${y + 7}" text-anchor="end" font-size="21">${label(value)}</text>`);
  }
  output.push('<path d="M90,80 V310 H530" stroke="#475569" stroke-width="2" fill="none"/>');
  output.push('<text x="310" y="376" font-size="22" text-anchor="middle">Time, t (s)</text>');
  output.push(`<text x="25" y="195" transform="rotate(-90 25 195)" font-size="22" text-anchor="middle">${graph.type === "xt" ? "x (m)" : "v (m/s)"}</text>`);
  const point = (pair, color, showLabel = true) => {
    const [t, value] = pair, x = number(sx(t)), y = number(sy(value));
    output.push(`<circle class="data-point" data-time="${t}" data-value="${value}" cx="${x}" cy="${y}" r="5" fill="${color}" stroke="white" stroke-width="1.5"/>`);
    if (showLabel) {
      const right = t > graph.timeMax * .62;
      output.push(`<text x="${x + (right ? -11 : 11)}" y="${y - 12}" text-anchor="${right ? "end" : "start"}" font-size="19" font-weight="700" stroke="white" stroke-width="4" paint-order="stroke" stroke-linejoin="round" fill="${color}">(${label(t)}, ${label(value)})</text>`);
    }
  };
  if (graph.curve) {
    const coefficients = graph.curve.coefficients;
    const f = t => coefficients[0] + coefficients[1] * t + coefficients[2] * t * t;
    const [start, end] = graph.curve.domain;
    const control = [(start + end) / 2, f(start) + (end - start) * (coefficients[1] + 2 * coefficients[2] * start) / 2];
    // A quadratic Bezier draws this quadratic motion exactly, including its tangent.
    output.push(`<path class="motion-curve" d="M${coordinate([start, f(start)])} Q${coordinate(control)} ${coordinate([end, f(end)])}" fill="none" stroke="${colors[0]}" stroke-width="4"/>`);
    output.push(`<polyline class="tangent-line" points="${graph.tangent.points.map(coordinate).join(" ")}" fill="none" stroke="#b45309" stroke-width="3.5" stroke-dasharray="8 6"/>`);
    graph.tangent.points.forEach(pair => point(pair, "#b45309"));
    point([graph.tangent.time, f(graph.tangent.time)], colors[0], false);
  } else {
    graph.series.forEach((series, index) => {
      output.push(`<polyline class="motion-series" data-series="${xml(series.label)}" points="${series.points.map(coordinate).join(" ")}" fill="none" stroke="${colors[index]}" stroke-width="4" stroke-linejoin="round"${index === 1 ? ' stroke-dasharray="8 6"' : ""}/>`);
      series.points.forEach(pair => point(pair, colors[index]));
    });
  }
  output.push('</g></svg>');
  return output.join("\n") + "\n";
}

module.exports = { renderGraph, plot };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const directory = path.join(root, "assets", "graphs", "physics_motion");
  fs.mkdirSync(directory, { recursive: true });
  const bank = JSON.parse(fs.readFileSync(path.join(root, "assets/data/question_banks/physics_motion_graphs.json"), "utf8"));
  for (const question of bank) {
    const target = path.resolve(root, "quizzes", question.graph.image);
    assert.ok(target.startsWith(directory + path.sep) && target.endsWith(".svg"));
    const description = question.promptLatex.match(/alt="([^"]+)"/)[1];
    fs.writeFileSync(target, renderGraph(question.graph, description));
  }
  console.log(`Generated ${bank.length} motion graphs from exact plotted coordinates.`);
}
