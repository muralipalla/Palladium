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
  let page = 0;
  let loading = false;

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value;
    return td;
  }

  function tabStatus(details) {
    const count = details?.tabHiddenCount;
    if (!Number.isInteger(count) || count < 0) return "Not recorded";
    return count ? `Yes (${count})` : "No";
  }

  function resultRow(attempt) {
    const row = document.createElement("tr");
    const date = new Date(attempt.completed_at);
    const quiz = attempt.quiz_id === "physics-daily-practice-v1" ? "Custom Physics Quiz" : "Custom Chemistry Quiz";
    row.append(
      cell(attempt.display_name || attempt.email?.split("@")[0] || "—"),
      cell(attempt.email || "—"),
      cell(quiz),
      cell(date.toLocaleDateString()),
      cell(date.toLocaleTimeString()),
      cell(`${attempt.score}/${attempt.total}`),
      cell(tabStatus(attempt.details))
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
      status.textContent = attempts.length ? "" : "No completed Physics or Chemistry quizzes found.";
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
