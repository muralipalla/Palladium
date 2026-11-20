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
    "gre-vocabulary-v1": "Advanced Vocabulary"
  };
  let page = 0;
  let loading = false;

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
    row.append(
      cell(attempt.display_name || attempt.email?.split("@")[0] || "—"),
      cell(attempt.email || "—"),
      cell(quiz),
      cell(date.toLocaleDateString()),
      cell(date.toLocaleTimeString()),
      cell(`${attempt.score}/${attempt.total}`),
      cell(activityStatus(attempt.details, "tabHiddenCount")),
      cell(activityStatus(attempt.details, "focusLossCount"))
    );
    return row;
  }

  async function load() {
    if (loading) return;
    loading = true;
    status.hidden = false;
    status.textContent = "Loading quiz results…";
    denied.hidden = true;
    table.hidden = true;
    refresh.hidden = true;
    usersLink.hidden = true;
    previous.disabled = true;
    next.disabled = true;

    try {
      if (!client) throw new Error("Account services are not configured.");
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user) {
        status.hidden = true;
        denied.hidden = false;
        return;
      }

      const { data, error } = await client.rpc("admin_list_quiz_attempts", {
        p_limit: pageSize + 1,
        p_offset: page * pageSize
      });
      if (error?.code === "42501") {
        status.hidden = true;
        denied.hidden = false;
        return;
      }
      if (error) throw error;

      usersLink.hidden = false;

      const attempts = data || [];
      body.replaceChildren(...attempts.slice(0, pageSize).map(resultRow));
      table.hidden = attempts.length === 0;
      status.hidden = attempts.length > 0;
      status.textContent = attempts.length ? "" : "No completed quizzes found.";
      pageLabel.textContent = `Page ${page + 1}`;
      previous.disabled = page === 0;
      next.disabled = attempts.length <= pageSize;
      refresh.hidden = false;
    } catch (error) {
      status.textContent = error?.message || "Could not load quiz results.";
      refresh.hidden = false;
    } finally {
      loading = false;
    }
  }

  refresh.addEventListener("click", load);
  previous.addEventListener("click", () => { if (page > 0) { page--; void load(); } });
  next.addEventListener("click", () => { page++; void load(); });
  void load();
})();
