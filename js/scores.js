(() => {
  "use strict";
  const client = window.supabaseClient;
  const store = window.ProgressStore;
  const status = document.getElementById("scoresStatus");
  const signIn = document.getElementById("scoresSignIn");
  const table = document.getElementById("scoresTableWrap");
  const body = document.getElementById("scoresBody");
  const refresh = document.getElementById("refreshScoresButton");
  const controls = document.getElementById("scoreControls");
  const quizFilter = document.getElementById("scoreQuizFilter");
  const deleteButton = document.getElementById("deleteScoresButton");
  const selectionCount = document.getElementById("scoreSelectionCount");
  const selectAll = document.getElementById("selectAllScores");
  const actionStatus = document.getElementById("scoreActionStatus");
  const pagination = document.getElementById("scoresPagination");
  const previous = document.getElementById("previousScoresButton");
  const next = document.getElementById("nextScoresButton");
  const pageLabel = document.getElementById("scoresPageLabel");
  const selected = new Set();
  const pageSize = 50;
  let visibleAttempts = [];
  let page = 0;
  let hasNext = false;
  let loading = false;
  let deleting = false;
  let requestVersion = 0;
  const labels = {
    "general-chemistry-v1": "Custom Chemistry Quiz", "physics-daily-practice-v1": "Physics Daily Practice Quiz",
    "ionic-formula-v1": "Ionic Formula Quiz",
    "multiplication-practice-v1": "Multiplication Practice", "oxidation-numbers-v1": "Oxidation Numbers",
    "trig-angles-v1": "Trigonometric Angles", "units-and-dimensions-v1": "Units and Dimensions",
    "pythagorean-identities-v1": "Pythagorean Identities · Levels 2 and 3",
    "pythagorean-identities-v2": "Pythagorean Identities · 50 marks",
    "sum-difference-identities-v1": "Sum and Difference of Angles · Levels 2 and 3",
    "double-triple-identities-v1": "Double and Triple Angles · Levels 2 and 3",
    "sum-difference-identities-v2": "Sum and Difference of Angles · 40 marks",
    "double-triple-identities-v2": "Double and Triple Angles · 38 marks",
    "vector-addition-v1": "Vector Addition", "vector-subtraction-v1": "Vector Subtraction",
    "dot-product-v1": "Dot Product", "determinants-2x2-v1": "2 × 2 Determinants",
    "cross-product-v1": "Cross Product of Two Vectors",
    "vector-resolution-v1": "Vector Resolution", "vector-magnitude-v1": "Magnitude of a Vector",
    "vocabulary-daily-v1": "Daily Vocabulary", "gre-vocabulary-v1": "Advanced Vocabulary"
  };

  function cell(text, className = "") {
    const element = document.createElement("td");
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function updateControls() {
    const busy = loading || deleting;
    deleteButton.disabled = busy || !selected.size;
    refresh.disabled = busy;
    quizFilter.disabled = busy;
    selectAll.disabled = busy || !visibleAttempts.length;
    selectAll.checked = visibleAttempts.length > 0 && selected.size === visibleAttempts.length;
    selectAll.indeterminate = selected.size > 0 && selected.size < visibleAttempts.length;
    body.querySelectorAll('input[type="checkbox"]').forEach(input => { input.disabled = busy; input.checked = selected.has(input.dataset.attemptId); });
    selectionCount.textContent = `${selected.size} selected`;
    previous.disabled = busy || page === 0;
    next.disabled = busy || !hasNext;
  }

  function notice(text) {
    actionStatus.textContent = text;
    actionStatus.hidden = !text;
  }

  async function load() {
    const version = ++requestVersion;
    loading = true;
    selected.clear();
    visibleAttempts = [];
    body.replaceChildren();
    table.hidden = true;
    controls.hidden = true;
    pagination.hidden = true;
    notice("");
    status.hidden = false;
    status.textContent = "Loading your scores…";
    updateControls();
    try {
      const { data, error } = await client.auth.getSession();
      if (version !== requestVersion) return;
      if (error) throw error;
      if (!data.session?.user) {
        status.hidden = true; signIn.hidden = false; refresh.hidden = true; return;
      }
      signIn.hidden = true;
      refresh.hidden = false;
      const attempts = await store.listAttempts({ quizId: quizFilter.value || null, limit: pageSize + 1, offset: page * pageSize });
      if (version !== requestVersion) return;
      visibleAttempts = attempts.slice(0, pageSize);
      hasNext = attempts.length > pageSize;
      body.replaceChildren(...visibleAttempts.map(attempt => {
        const row = document.createElement("tr");
        const percent = Math.round((attempt.score / attempt.total) * 100);
        const activity = labels[attempt.quiz_id] || attempt.quiz_id;
        const completed = new Date(attempt.completed_at).toLocaleString();
        const selectionCell = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.attemptId = attempt.id;
        checkbox.setAttribute("aria-label", `Select ${activity} score from ${completed}`);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.add(attempt.id);
          else selected.delete(attempt.id);
          updateControls();
        });
        selectionCell.append(checkbox);
        const duration = Number.isInteger(attempt.duration_seconds) ? window.QuizTimer.formatDuration(attempt.duration_seconds) : attempt.details?.timerEnabled === false ? "Not timed" : "Not recorded";
        row.append(selectionCell, cell(activity), cell(`${attempt.score}/${attempt.total}`, "score-value"), cell(`${percent}%`), cell(duration), cell(completed));
        return row;
      }));
      controls.hidden = false;
      table.hidden = visibleAttempts.length === 0;
      pagination.hidden = !visibleAttempts.length && page === 0;
      pageLabel.textContent = `Page ${page + 1}`;
      status.hidden = visibleAttempts.length > 0;
      status.textContent = visibleAttempts.length ? "" : "No saved scores match this selection.";
    } catch (error) {
      if (version !== requestVersion) return;
      table.hidden = true; status.hidden = false; status.textContent = error?.message || "Could not load your scores.";
    } finally {
      if (version === requestVersion) { loading = false; updateControls(); }
    }
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (loading || deleting || !ids.length) return;
    if (!window.confirm(`Permanently delete ${ids.length} selected score${ids.length === 1 ? "" : "s"} from your account? This cannot be undone.`)) return;
    deleting = true;
    updateControls();
    try {
      const result = await store.deleteAttempts(ids);
      page = 0;
      await load();
      notice(`Deleted ${result.deletedCount} selected score${result.deletedCount === 1 ? "" : "s"}.`);
    } catch (error) {
      notice(error?.message || "Could not delete the selected scores.");
    } finally {
      deleting = false;
      updateControls();
    }
  }

  if (!client || !store) { status.textContent = "Account services are not configured."; return; }
  for (const [id, title] of Object.entries(labels).sort((a, b) => a[1].localeCompare(b[1]))) {
    const option = document.createElement("option"); option.value = id; option.textContent = title; quizFilter.append(option);
  }
  selectAll.addEventListener("change", () => {
    selected.clear();
    if (selectAll.checked) visibleAttempts.forEach(attempt => selected.add(attempt.id));
    updateControls();
  });
  quizFilter.addEventListener("change", () => { page = 0; void load(); });
  deleteButton.addEventListener("click", deleteSelected);
  previous.addEventListener("click", () => { if (page > 0) { page--; void load(); } });
  next.addEventListener("click", () => { if (hasNext) { page++; void load(); } });
  refresh.addEventListener("click", load);
  client.auth.onAuthStateChange(() => { page = 0; void load(); });
  void load();
})();
