(() => {
  "use strict";

  const client = window.supabaseClient;
  const status = document.getElementById("resultsStatus");
  const denied = document.getElementById("resultsDenied");
  const table = document.getElementById("resultsTableWrap");
  const body = document.getElementById("resultsBody");
  const refresh = document.getElementById("refreshResultsButton");
  const previous = document.getElementById("previousResultsButton");
  const next = document.getElementById("nextResultsButton");
  const pageLabel = document.getElementById("resultsPageLabel");
  const usersLink = document.getElementById("usersNavLink");
  const filters = document.getElementById("resultsFilters");
  const studentFilter = document.getElementById("studentFilter");
  const quizFilter = document.getElementById("resultsQuizFilter");
  const beforeDate = document.getElementById("resultsBeforeDate");
  const deleteControls = document.getElementById("resultDeleteControls");
  const deleteButton = document.getElementById("deleteResultsButton");
  const selectAll = document.getElementById("selectAllResults");
  const selectionCount = document.getElementById("resultSelectionCount");
  const actionStatus = document.getElementById("resultActionStatus");
  const selected = new Set();
  const pageSize = 100;
  const quizLabels = {
    "general-chemistry-v1": "Custom Chemistry Quiz",
    "physics-daily-practice-v1": "Custom Physics Quiz",
    "ionic-formula-v1": "Ionic Formula Quiz",
    "multiplication-practice-v1": "Multiplication Practice",
    "oxidation-numbers-v1": "Oxidation Numbers",
    "trig-angles-v1": "Trigonometric Angles",
    "units-and-dimensions-v1": "Units and Dimensions",
    "vector-addition-v1": "Vector Addition",
    "vector-subtraction-v1": "Vector Subtraction",
    "dot-product-v1": "Dot Product",
    "determinants-2x2-v1": "2 × 2 Determinants",
    "cross-product-v1": "Cross Product of Two Vectors",
    "vector-resolution-v1": "Vector Resolution",
    "vector-magnitude-v1": "Magnitude of a Vector",
    "vocabulary-daily-v1": "Daily Vocabulary",
    "gre-vocabulary-v1": "Advanced Vocabulary",
    "pythagorean-identities-v1": "Pythagorean Identities · Original scoring",
    "pythagorean-identities-v2": "Pythagorean Identities · 50 marks",
    "sum-difference-identities-v1": "Sum and Difference of Angles · Original scoring",
    "double-triple-identities-v1": "Double and Triple Angles · Original scoring",
    "sum-difference-identities-v2": "Sum and Difference of Angles · 40 marks",
    "double-triple-identities-v2": "Double and Triple Angles · 38 marks"
  };
  let page = 0;
  let loading = false;
  let deleting = false;
  let hasNext = false;
  let visibleAttempts = [];
  let requestVersion = 0;
  let appliedFilters = { p_before: null, p_student: null, p_quiz_id: null };

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value;
    return td;
  }

  function activityStatus(details, key) {
    const count = details?.[key];
    if (!Number.isInteger(count) || count < 0) return "Not recorded";
    return count ? `Yes (${count})` : "No";
  }

  function resultRow(attempt) {
    const row = document.createElement("tr");
    const date = new Date(attempt.completed_at);
    const quiz = quizLabels[attempt.quiz_id] || attempt.quiz_id;
    const selectionCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.attemptId = attempt.attempt_id;
    checkbox.setAttribute("aria-label", `Select ${quiz} record for ${attempt.display_name || attempt.email || "student"} from ${date.toLocaleString()}`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selected.add(attempt.attempt_id);
      else selected.delete(attempt.attempt_id);
      updateControls();
    });
    selectionCell.append(checkbox);
    const duration = Number.isInteger(attempt.duration_seconds) ? window.QuizTimer.formatDuration(attempt.duration_seconds) : attempt.details?.timerEnabled === false ? "Not timed" : "Not recorded";
    row.append(
      selectionCell,
      cell(attempt.display_name || attempt.email?.split("@")[0] || "—"),
      cell(attempt.email || "—"),
      cell(quiz),
      cell(date.toLocaleDateString()),
      cell(date.toLocaleTimeString()),
      cell(`${attempt.score}/${attempt.total}`),
      cell(duration),
      cell(activityStatus(attempt.details, "tabHiddenCount")),
      cell(activityStatus(attempt.details, "focusLossCount"))
    );
    return row;
  }

  function notice(text) { actionStatus.textContent = text; actionStatus.hidden = !text; }

  function updateControls() {
    const busy = loading || deleting;
    deleteButton.disabled = busy || !selected.size;
    selectAll.disabled = busy || !visibleAttempts.length;
    selectAll.checked = visibleAttempts.length > 0 && selected.size === visibleAttempts.length;
    selectAll.indeterminate = selected.size > 0 && selected.size < visibleAttempts.length;
    selectionCount.textContent = `${selected.size} selected`;
    refresh.disabled = busy;
    filters.querySelectorAll("input, select, button").forEach(input => { input.disabled = busy; });
    body.querySelectorAll('input[type="checkbox"]').forEach(input => { input.disabled = busy; input.checked = selected.has(input.dataset.attemptId); });
    previous.disabled = busy || page === 0;
    next.disabled = busy || !hasNext;
  }

  async function load() {
    const version = ++requestVersion;
    loading = true;
    selected.clear();
    visibleAttempts = [];
    body.replaceChildren();
    notice("");
    status.hidden = false;
    status.textContent = "Loading quiz results…";
    denied.hidden = true;
    table.hidden = true;
    refresh.hidden = true;
    usersLink.hidden = true;
    filters.hidden = true;
    deleteControls.hidden = true;
    previous.disabled = true;
    next.disabled = true;
    updateControls();

    try {
      if (!client) throw new Error("Account services are not configured.");
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (version !== requestVersion) return;
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user) {
        status.hidden = true;
        denied.hidden = false;
        return;
      }

      const { data, error } = await client.rpc("admin_list_quiz_attempts_v2", {
        p_limit: pageSize + 1,
        p_offset: page * pageSize,
        ...appliedFilters
      });
      if (version !== requestVersion) return;
      if (error?.code === "42501") {
        status.hidden = true;
        denied.hidden = false;
        return;
      }
      if (error) throw error;

      usersLink.hidden = false;
      filters.hidden = false;
      deleteControls.hidden = false;

      const attempts = data || [];
      visibleAttempts = attempts.slice(0, pageSize);
      hasNext = attempts.length > pageSize;
      body.replaceChildren(...visibleAttempts.map(resultRow));
      table.hidden = attempts.length === 0 && page === 0;
      status.hidden = attempts.length > 0;
      status.textContent = attempts.length ? "" : "No completed quizzes found.";
      pageLabel.textContent = `Page ${page + 1}`;
      refresh.hidden = false;
    } catch (error) {
      if (version !== requestVersion) return;
      status.textContent = error?.message || "Could not load quiz results.";
      refresh.hidden = false;
    } finally {
      if (version === requestVersion) { loading = false; updateControls(); }
    }
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (loading || deleting || !ids.length) return;
    const students = new Set(visibleAttempts.filter(attempt => selected.has(attempt.attempt_id)).map(attempt => attempt.user_id));
    if (!window.confirm(`Permanently delete ${ids.length} selected quiz record${ids.length === 1 ? "" : "s"} for ${students.size} student${students.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    deleting = true;
    updateControls();
    try {
      const { data, error } = await client.rpc("admin_delete_quiz_attempts", { p_attempt_ids: ids });
      if (error) throw error;
      page = 0;
      await load();
      notice(`Deleted ${data} selected quiz record${data === 1 ? "" : "s"}.`);
    } catch (error) {
      notice(error?.message || "Could not delete the selected records.");
    } finally {
      deleting = false;
      updateControls();
    }
  }

  for (const [id, title] of Object.entries(quizLabels).sort((a, b) => a[1].localeCompare(b[1]))) {
    const option = document.createElement("option"); option.value = id; option.textContent = title; quizFilter.append(option);
  }
  filters.addEventListener("submit", event => {
    event.preventDefault();
    const cutoff = beforeDate.value ? new Date(`${beforeDate.value}T00:00:00`) : null;
    appliedFilters = { p_before: cutoff ? cutoff.toISOString() : null, p_student: studentFilter.value.trim() || null, p_quiz_id: quizFilter.value || null };
    page = 0;
    void load();
  });
  selectAll.addEventListener("change", () => {
    selected.clear();
    if (selectAll.checked) visibleAttempts.forEach(attempt => selected.add(attempt.attempt_id));
    updateControls();
  });
  deleteButton.addEventListener("click", deleteSelected);

  refresh.addEventListener("click", load);
  previous.addEventListener("click", () => { if (page > 0) { page--; void load(); } });
  next.addEventListener("click", () => { if (hasNext) { page++; void load(); } });
  client?.auth.onAuthStateChange(() => { page = 0; void load(); });
  void load();
})();
