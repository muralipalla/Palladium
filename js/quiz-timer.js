(() => {
  "use strict";

  let startedAt = null;
  let stoppedAt = null;
  let finishedTiming = null;
  let interval = null;
  let checkbox = null;
  let output = null;

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

  function start() {
    startedAt = Date.now();
    stoppedAt = null;
    finishedTiming = null;
    clearInterval(interval);
    interval = window.setInterval(render, 1000);
    render();
  }

  function finish() {
    if (finishedTiming) return { ...finishedTiming };
    stoppedAt = Date.now();
    clearInterval(interval);
    interval = null;
    const enabled = Boolean(checkbox?.checked && startedAt !== null);
    finishedTiming = { timerEnabled: enabled, durationSeconds: enabled ? elapsed() : null };
    render();
    return { ...finishedTiming };
  }

  function mount() {
    const host = document.querySelector("[data-quiz-timer]");
    if (!host) return;
    host.classList.add("quiz-timing-option");
    const label = document.createElement("label");
    checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "quizTimerEnabled";
    checkbox.setAttribute("aria-describedby", "quizTimingDescription");
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
    checkbox.addEventListener("change", render);
    render();
    if (host.dataset.quizTimerMode === "puzzle") {
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
