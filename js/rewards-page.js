(() => {
  "use strict";

  const rewards = window.PracticeRewards;
  const store = window.ProgressStore;
  const status = document.getElementById("rewardsStatus");
  const content = document.getElementById("rewardsContent");
  const source = document.getElementById("rewardsSource");
  const retry = document.getElementById("retryRewards");
  const weekdays = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
  const fullDates = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  let request = 0;
  let activeOwner;
  let shownDay;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function dayCount(count) {
    return `${count} ${count === 1 ? "day" : "days"}`;
  }

  function renderWeek(snapshot) {
    const remaining = Math.max(0, rewards.weeklyGoal - snapshot.weeklyDays);
    document.getElementById("weeklyCount").textContent = `${snapshot.weeklyDays} of 7 days`;
    document.getElementById("weeklyMessage").textContent = remaining
      ? `${dayCount(remaining)} to reach your goal.`
      : "Weekly goal reached. Nicely done!";
    const tiles = snapshot.week.map(({ date, practiced }, index) => {
      const tile = element("li", practiced ? "is-practiced" : "");
      const today = index === snapshot.week.length - 1;
      tile.setAttribute("aria-label", `${fullDates.format(date)}${today ? ", today" : ""} · ${practiced ? "Practised" : "No practice"}`);
      const label = element("span", "rewards-day-label", today ? "Today" : weekdays.format(date));
      const mark = element("span", "rewards-day-mark", practiced ? "✓" : "·");
      label.setAttribute("aria-hidden", "true");
      mark.setAttribute("aria-hidden", "true");
      tile.append(label, mark);
      return tile;
    });
    document.getElementById("practiceWeek").replaceChildren(...tiles);
  }

  function renderBadges(badges) {
    const earned = badges.filter(badge => badge.earned).length;
    document.getElementById("badgeCount").textContent = `${earned} of ${badges.length} earned`;
    const cards = badges.map(badge => {
      const card = element("li", "rewards-badge");
      card.dataset.earned = String(badge.earned);
      if (badge.metric === "challenges") card.classList.add("is-challenge");
      const symbol = element("span", "rewards-medal", badge.symbol);
      symbol.setAttribute("aria-hidden", "true");
      const label = element("div", "rewards-badge-text");
      label.append(element("h3", "", badge.title), element("p", "", badge.rule));
      const progress = element("div", "rewards-badge-progress");
      if (badge.earned) {
        progress.textContent = "✓ Earned";
      } else {
        const bar = element("progress");
        bar.max = badge.target;
        bar.value = badge.progress;
        bar.setAttribute("aria-label", `${badge.title} progress`);
        progress.append(bar, element("span", "", `${badge.progress}/${badge.target}`));
      }
      label.append(progress);
      card.append(symbol, label);
      return card;
    });
    document.getElementById("badgeCollection").replaceChildren(...cards);
  }

  function render(snapshot, ownerId) {
    document.getElementById("currentStreak").textContent = dayCount(snapshot.currentStreak);
    document.getElementById("bestStreak").textContent = dayCount(snapshot.bestStreak);
    document.getElementById("rewardPoints").textContent = snapshot.points.toLocaleString();
    document.getElementById("challengeCount").textContent = snapshot.challenges.toLocaleString();
    renderWeek(snapshot);
    renderBadges(snapshot.badges);
    source.textContent = ownerId ? "Based on the quiz history in your account." : "Guest rewards are saved in this browser. ";
    if (!ownerId) {
      const signIn = element("a", "", "Sign in");
      signIn.href = "account.html";
      source.append(signIn, " to build your account history.");
    }
    source.hidden = false;
    content.hidden = false;
  }

  async function load() {
    const version = ++request;
    const day = rewards.calendarDay();
    content.hidden = true;
    source.hidden = true;
    retry.hidden = true;
    status.hidden = false;
    status.textContent = "Loading your rewards…";
    try {
      const ownerId = window.supabaseClient ? await store.getCurrentUserId() : null;
      if (request !== version) return;
      activeOwner = ownerId;
      const snapshot = await rewards.load(ownerId);
      if (request !== version) return;
      render(snapshot, ownerId);
      shownDay = day;
      status.hidden = true;
    } catch {
      if (request !== version) return;
      status.textContent = "Your rewards could not load.";
      retry.hidden = false;
    }
  }

  retry.addEventListener("click", load);
  store.subscribeToOwnerChanges(ownerId => {
    if (activeOwner === undefined || ownerId === activeOwner) return;
    ++request;
    content.hidden = true;
    source.hidden = true;
    window.setTimeout(load, 0);
  });
  window.addEventListener("storage", event => {
    if (activeOwner === null && (!event.key || event.key.startsWith(rewards.guestPrefix))) void load();
  });
  window.addEventListener("pageshow", event => {
    if (event.persisted) void load();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && shownDay !== rewards.calendarDay()) void load();
  });
  void load();
})();
