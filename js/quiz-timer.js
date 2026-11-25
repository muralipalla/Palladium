(() => {
  "use strict";

  let startedAt = null;
  let stoppedAt = null;
  let finishedTiming = null;
  let interval = null;
  let checkbox = null;
  let output = null;
  let target = null;
  let secondsPerQuestion = 120;
  let timeTargetSeconds = null;

  function formatDuration(seconds) {
    if (!Number.isInteger(seconds) || seconds < 0) return "Not timed";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return (hours ? `${hours}:` : "") + String(hours ? minutes : Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
  }

  function elapsed() {
    return startedAt === null ? 0 : Math.max(0, Math.floor(((stoppedAt ?? Date.now()) - startedAt) / 1000));
  }

  function render() {
    if (!checkbox || !output) return;
    const enabled = finishedTiming ? finishedTiming.timerEnabled : checkbox.checked;
    output.hidden = !enabled || startedAt === null;
    output.textContent = `${stoppedAt === null ? "Elapsed time" : "Time taken"}: ${formatDuration(elapsed())}`;
  }

  function showTarget() {
    if (!target) return;
    const rate = secondsPerQuestion === 120 ? "2 minutes per question" : `${secondsPerQuestion} seconds per question`;
    target.textContent = timeTargetSeconds === null
      ? `Reward target · ${rate}`
      : `Quiz target · ${formatDuration(timeTargetSeconds)} · ${rate}`;
  }

  function start(questionCount) {
    startedAt = Date.now();
    stoppedAt = null;
    finishedTiming = null;
    timeTargetSeconds = target && Number.isInteger(questionCount) && questionCount > 0 ? questionCount * secondsPerQuestion : null;
    clearInterval(interval);
    interval = window.setInterval(render, 1000);
    showTarget();
    render();
  }

  function finish() {
    if (finishedTiming) return { ...finishedTiming };
    stoppedAt = Date.now();
    clearInterval(interval);
    interval = null;
    const enabled = Boolean(checkbox?.checked && startedAt !== null);
    finishedTiming = { timerEnabled: enabled, durationSeconds: enabled ? elapsed() : null };
    if (enabled && timeTargetSeconds !== null) finishedTiming.timeTargetSeconds = timeTargetSeconds;
    render();
    return { ...finishedTiming };
  }

  function mount() {
    const host = document.querySelector("[data-quiz-timer]");
    if (!host) return;
    const isPuzzle = host.dataset.quizTimerMode === "puzzle";
    host.classList.add("quiz-timing-option");
    const label = document.createElement("label");
    checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "quizTimerEnabled";
    checkbox.setAttribute("aria-describedby", isPuzzle ? "quizTimingDescription" : "quizTimingDescription quizTimeTarget");
    const labelText = document.createElement("span");
    labelText.textContent = "Record time taken (optional)";
    label.append(checkbox, labelText);
    const description = document.createElement("p");
    description.id = "quizTimingDescription";
    description.textContent = host.dataset.quizTimerDescription || "Time runs from the start of the quiz until submission, including time away from this tab.";
    output = document.createElement("output");
    output.id = "quizElapsedTime";
    output.hidden = true;
    output.setAttribute("aria-live", "off");
    host.append(label, description, output);
    if (!isPuzzle) {
      const rate = Number(host.dataset.quizTargetSecondsPerQuestion);
      if (Number.isInteger(rate) && rate > 0) secondsPerQuestion = rate;
      target = document.createElement("p");
      target.id = "quizTimeTarget";
      host.append(target);
      showTarget();
    }
    checkbox.addEventListener("change", render);
    render();
    if (isPuzzle) {
      start();
      document.getElementById("solution")?.addEventListener("toggle", event => {
        if (event.currentTarget.open) finish();
      });
    }
  }

  window.QuizTimer = Object.freeze({ start, finish, formatDuration, isEnabled: () => Boolean(checkbox?.checked) });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
  window.addEventListener("pagehide", () => clearInterval(interval));
})();
