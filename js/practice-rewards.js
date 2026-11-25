(() => {
  "use strict";

  const dayMilliseconds = 86_400_000;
  const guestPrefix = "palladium_rewards_v1:";
  const dayPrefix = `${guestPrefix}day:`;
  const challengePrefix = `${guestPrefix}challenge:`;
  const weeklyGoal = 3;
  const badgeDefinitions = [
    { id: "challenge-solver", title: "Challenge Solver", rule: "Solve your first challenge problem.", symbol: "✦", metric: "challenges", target: 1 },
    { id: "challenge-specialist", title: "Challenge Specialist", rule: "Solve 5 different challenge problems.", symbol: "✷", metric: "challenges", target: 5 },
    { id: "challenge-master", title: "Challenge Master", rule: "Solve 15 different challenge problems.", symbol: "✹", metric: "challenges", target: 15 },
    { id: "first-step", title: "First Step", rule: "Complete your first practice day.", symbol: "↗", metric: "practiceDays", target: 1 },
    { id: "three-in-a-row", title: "Three in a Row", rule: "Practise 3 days in a row.", symbol: "⚡", metric: "bestStreak", target: 3 },
    { id: "seven-strong", title: "Seven Strong", rule: "Practise 7 days in a row.", symbol: "★", metric: "bestStreak", target: 7 },
    { id: "two-weeks", title: "Two Weeks", rule: "Practise 14 days in a row.", symbol: "◆", metric: "bestStreak", target: 14 },
    { id: "welcome-back", title: "Welcome Back", rule: "Practise again after taking a day or more away.", symbol: "↻", metric: "returned", target: 1 }
  ];

  function calendarDay(timestamp = new Date()) {
    const date = new Date(timestamp);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayMilliseconds;
  }

  function validChallengeId(id) {
    return typeof id === "string" && /^[a-z0-9_:/.-]{1,180}$/i.test(id);
  }

  function practiceFacts({ quizId, score, total, completedAt, details = {} }) {
    const answered = details.answeredCount ?? details.attempted;
    if (!Number.isInteger(total) || !Number.isInteger(score) || total <= 0 || score < 0 || score > total || answered === 0) return null;
    // Older Units & Dimensions scores can include an empty submission.
    if (quizId === "units-and-dimensions-v1" && answered == null && score === 0) return null;
    const day = Number.isInteger(details.practiceDay) ? details.practiceDay : completedAt && calendarDay(completedAt);
    if (!Number.isInteger(day)) return null;
    const ids = score > 0 && Array.isArray(details.challengeProblemIds) ? details.challengeProblemIds : [];
    return { day, challenges: new Set(ids.filter(validChallengeId)) };
  }

  function summarize({ days, challenges }, today) {
    const orderedDays = [...days].filter(day => day <= today).sort((a, b) => a - b);
    let bestStreak = 0;
    let run = 0;
    let returned = 0;
    let previousDay = -Infinity;
    for (const day of orderedDays) {
      const gap = day - previousDay;
      if (gap > 1 && run) returned = 1;
      run = gap === 1 ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
      previousDay = day;
    }
    const week = Array.from({ length: 7 }, (_, index) => {
      const day = today - 6 + index;
      return { date: new Date(day * dayMilliseconds), practiced: days.has(day) };
    });
    const metrics = { practiceDays: orderedDays.length, bestStreak, challenges: challenges.size, returned };
    return {
      ...metrics,
      currentStreak: today - previousDay <= 1 ? run : 0,
      week,
      weeklyDays: week.filter(day => day.practiced).length,
      points: 10 * metrics.practiceDays + 5 * metrics.challenges,
      badges: badgeDefinitions.map(badge => ({
        ...badge,
        progress: Math.min(badge.target, metrics[badge.metric]),
        earned: metrics[badge.metric] >= badge.target
      }))
    };
  }

  function readGuestFacts() {
    const days = new Set();
    const challenges = new Set();
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(dayPrefix)) {
        const day = Number(key.slice(dayPrefix.length));
        if (Number.isInteger(day)) days.add(day);
      }
      if (key?.startsWith(challengePrefix)) {
        const id = key.slice(challengePrefix.length);
        if (validChallengeId(id)) challenges.add(id);
      }
    }
    return { days, challenges };
  }

  function saveGuestFacts(practice) {
    // Individual keys make repeated writes idempotent across tabs.
    window.localStorage.setItem(`${dayPrefix}${practice.day}`, "1");
    for (const id of practice.challenges) window.localStorage.setItem(`${challengePrefix}${id}`, "1");
  }

  async function readAccountFacts(ownerId, today, excludeAttemptId = null) {
    const days = new Set();
    const challenges = new Set();
    const previousDays = new Set();
    const previousChallenges = new Set();
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const attempts = await window.ProgressStore.listAttempts({ limit: pageSize, offset, expectedUserId: ownerId });
      for (const row of attempts) {
        const practice = practiceFacts({
          quizId: row.quiz_id, score: row.score, total: row.total, completedAt: row.completed_at, details: row.details || {}
        });
        if (!practice) continue;
        days.add(practice.day);
        for (const id of practice.challenges) challenges.add(id);
        if (excludeAttemptId && row.client_attempt_id !== excludeAttemptId) {
          previousDays.add(practice.day);
          for (const id of practice.challenges) previousChallenges.add(id);
        }
      }
      if (attempts.length < pageSize) break;
    }
    return {
      current: summarize({ days, challenges }, today),
      previous: excludeAttemptId ? summarize({ days: previousDays, challenges: previousChallenges }, today) : null
    };
  }

  async function load(ownerId) {
    const today = calendarDay();
    if (!ownerId) return summarize(readGuestFacts(), today);
    return (await readAccountFacts(ownerId, today)).current;
  }

  function renderResult({ mount, announcement }, title, message, badges = [], celebrate = false) {
    mount.classList.toggle("has-reward", celebrate);
    const heading = document.createElement("strong");
    heading.textContent = title;
    announcement.replaceChildren(heading);
    if (message) {
      const detail = document.createElement("p");
      detail.textContent = message;
      announcement.append(detail);
    }
    if (badges.length) {
      const list = document.createElement("ul");
      list.className = "practice-reward-unlocks";
      for (const badge of badges) {
        const item = document.createElement("li");
        item.textContent = `Badge earned · ${badge.title}`;
        list.append(item);
      }
      announcement.append(list);
    }
  }

  let activeResult = null;

  async function showResult(attempt, saving) {
    const mount = document.querySelector("[data-practice-result]");
    if (!mount) return;
    const announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    const link = document.createElement("a");
    link.href = "../rewards.html";
    link.textContent = "My rewards";
    link.hidden = true;
    mount.replaceChildren(announcement, link);
    mount.hidden = false;

    const result = { mount, announcement, ownerId: window.ProgressStore.currentOwnerId() };
    activeResult = result;
    const isCurrent = () => activeResult === result && mount.isConnected;
    const practice = practiceFacts(attempt);
    if (!practice) {
      renderResult(result, "Ready for another try?", "Finish with at least one answer to count a practice day.");
      link.hidden = false;
      return;
    }

    const solved = practice.challenges.size;
    const title = solved ? (solved === 1 ? "Challenge solved!" : `${solved} challenge problems solved!`) : "Practice complete!";
    renderResult(result, title, "Checking your rewards…");

    try {
      const saved = await saving;
      const today = calendarDay();
      let previous;
      let current;
      if (saved.reason === "signed_out" || (!window.supabaseClient && !result.ownerId)) {
        if (isCurrent()) previous = summarize(readGuestFacts(), today);
        saveGuestFacts(practice);
        if (!isCurrent()) return;
        current = summarize(readGuestFacts(), today);
      } else if (saved.saved) {
        if (!isCurrent()) return;
        result.ownerId = saved.userId;
        const newAttemptId = saved.attempt === null ? null : saved.clientAttemptId;
        ({ previous, current } = await readAccountFacts(saved.userId, today, newAttemptId));
      } else {
        throw new Error("The attempt was not saved.");
      }
      if (!isCurrent()) return;
      previous ??= current;
      const points = current.points - previous.points;
      const badges = current.badges.filter((badge, index) => badge.earned && !previous.badges[index].earned);
      const goalReached = current.weeklyDays >= weeklyGoal && previous.weeklyDays < weeklyGoal;
      const message = [
        points > 0 ? `+${points} reward points` : "Practice recorded",
        current.currentStreak ? `${current.currentStreak}-day streak` : null,
        goalReached ? "Weekly goal reached!" : null
      ].filter(Boolean).join(" · ");
      renderResult(result, title, message, badges, badges.length > 0 || goalReached);
    } catch {
      if (isCurrent()) renderResult(result, title, "Rewards could not be updated right now.");
    } finally {
      if (isCurrent()) link.hidden = false;
    }
  }

  window.ProgressStore?.subscribeToOwnerChanges(ownerId => {
    if (activeResult && activeResult.ownerId !== ownerId) {
      activeResult.mount.replaceChildren();
      activeResult.mount.hidden = true;
      activeResult = null;
    }
  });

  window.PracticeRewards = Object.freeze({ calendarDay, load, showResult, guestPrefix, weeklyGoal });
})();
