/* ============================================================
   Weekmark — interaction, persistence and configurations
   ============================================================ */

(() => {
  "use strict";

  const STORAGE_CURRENT = "weekmark.current.v1";
  const STORAGE_CONFIGS = "weekmark.configs.v1";
  const STORAGE_MOTION = "weekmark.motion.v1";
  const STORAGE_THEME = "weekmark.theme.v1";
  const THEME_COLORS = { light: "#f5f2ee", dark: "#0c0d11" };
  const TOTAL_DAYS = 14;
  const DAYS_PER_WEEK = 7;
  const WEEKS = [
    { label: "Week 1", short: "W1" },
    { label: "Week 2", short: "W2" },
  ];
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MARK_LABELS = ["unmarked", "M", "D"];
  const MAX_CONFIGS = 30;

  const fmtDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const fmtToday = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const $ = (id) => document.getElementById(id);

  const el = {
    header: document.querySelector(".site-header"),
    themeButton: $("themeButton"),
    motionButton: $("motionButton"),
    motionCopy: document.querySelector(".motion-copy"),
    grid: $("scheduleGrid"),
    resetButton: $("resetButton"),
    resetDialog: $("resetDialog"),
    saveState: $("saveState"),
    saveCopy: document.querySelector(".save-copy"),
    markedCount: $("markedCount"),
    ring: $("balanceRing"),
    ringPercent: $("ringPercent"),
    mPercent: $("overallMPercent"),
    mCount: $("overallMCount"),
    dPercent: $("overallDPct"),
    dCount: $("overallDCount"),
    blankPercent: $("overallBlankPct"),
    blankCount: $("overallBlankCount"),
    barM: $("barM"),
    barD: $("barD"),
    barBlank: $("barBlank"),
    configName: $("configName"),
    saveConfigButton: $("saveConfigButton"),
    configList: $("configList"),
    configEmpty: $("configEmpty"),
    exportButton: $("exportButton"),
    importButton: $("importButton"),
    importFile: $("importFile"),
    toastRegion: $("toastRegion"),
    todayLabel: $("todayLabel"),
  };

  function readStoredMotion() {
    try {
      return localStorage.getItem(STORAGE_MOTION);
    } catch {
      return null;
    }
  }

  let motionOn = readStoredMotion() !== "off";
  const motionEnabled = () => motionOn;

  let state = new Array(TOTAL_DAYS).fill(0);
  let configurations = [];
  let saveTimer = 0;

  /* ---------------- Date helpers ---------------- */

  function startOfCurrentWeek() {
    const now = new Date();
    const offset = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - offset);
    monday.setHours(12, 0, 0, 0);
    return monday;
  }

  const weekStart = startOfCurrentWeek();

  const todayMid = new Date();
  todayMid.setHours(12, 0, 0, 0);

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  const isTodayIndex = (index) => isSameDay(dateForIndex(index), todayMid);

  function dateForIndex(index) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  }

  function weekRange(weekIndex) {
    const first = dateForIndex(weekIndex * DAYS_PER_WEEK);
    const last = dateForIndex(weekIndex * DAYS_PER_WEEK + DAYS_PER_WEEK - 1);
    return `${fmtDate.format(first)} – ${fmtDate.format(last)}`;
  }

  /* ---------------- State helpers ---------------- */

  function sanitizeMarks(value) {
    if (!Array.isArray(value)) return null;

    let flat = value;

    if (value.length === 2 && value.every((week) => Array.isArray(week))) {
      flat = value.flat();
    } else if (value.length === 2 && value.every((week) => week && typeof week === "object" && !Array.isArray(week))) {
      const ordered = [];
      for (const week of value) {
        const days = week.days || Object.values(week);
        if (!Array.isArray(days) || days.length !== DAYS_PER_WEEK) return null;
        ordered.push(...days);
      }
      flat = ordered;
    }

    if (flat.length !== TOTAL_DAYS) return null;

    const marks = flat.map((mark) => Number(mark));
    if (marks.some((mark) => !Number.isInteger(mark) || mark < 0 || mark > 2)) return null;
    return marks;
  }

  function countsFor(marks) {
    const counts = { m: 0, d: 0, blank: 0 };
    for (const mark of marks) {
      if (mark === 1) counts.m += 1;
      else if (mark === 2) counts.d += 1;
      else counts.blank += 1;
    }
    return counts;
  }

  /* ---------------- Persistence ---------------- */

  function readStorage(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function persistCurrent({ silent = false } = {}) {
    const ok = writeStorage(STORAGE_CURRENT, {
      app: "weekmark",
      version: 1,
      updatedAt: new Date().toISOString(),
      marks: [...state],
    });

    if (!silent) flashSaveState(ok);
    return ok;
  }

  function loadCurrent() {
    const stored = readStorage(STORAGE_CURRENT);
    const marks = stored && sanitizeMarks(stored.marks || stored.state || stored.schedule);
    if (marks) state = marks;
  }

  function loadConfigurations() {
    const stored = readStorage(STORAGE_CONFIGS);
    if (!Array.isArray(stored)) return;

    configurations = stored
      .map((config) => {
        const marks = sanitizeMarks(config && (config.marks || config.state || config.schedule));
        if (!config || !marks) return null;
        return {
          id: String(config.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          name: String(config.name || "Untitled").slice(0, 40),
          marks,
          createdAt: config.createdAt || new Date().toISOString(),
          updatedAt: config.updatedAt || config.createdAt || new Date().toISOString(),
        };
      })
      .filter(Boolean)
      .slice(0, MAX_CONFIGS);
  }

  function persistConfigurations() {
    return writeStorage(STORAGE_CONFIGS, configurations);
  }

  function flashSaveState(ok) {
    if (!el.saveState) return;
    window.clearTimeout(saveTimer);
    el.saveState.classList.remove("is-error");
    el.saveState.classList.add("is-saving");
    el.saveState.classList.add("bump");
    if (el.saveCopy) el.saveCopy.textContent = "Saving…";

    saveTimer = window.setTimeout(() => {
      el.saveState.classList.remove("is-saving", "bump");
      el.saveState.classList.toggle("is-error", !ok);
      if (el.saveCopy) el.saveCopy.textContent = ok ? "Saved locally" : "Storage unavailable";
    }, 560);
  }

  /* ---------------- Toast ---------------- */

  function toast(message, tone = "blue") {
    if (!el.toastRegion) return;

    while (el.toastRegion.children.length >= 3) {
      el.toastRegion.firstElementChild.remove();
    }

    const node = document.createElement("div");
    node.className = `toast tone-${tone}`;
    node.setAttribute("role", "status");
    const dot = document.createElement("i");
    dot.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = message;
    node.append(dot, text);
    el.toastRegion.append(node);

    window.setTimeout(() => {
      node.classList.add("is-leaving");
      node.addEventListener("animationend", () => node.remove(), { once: true });
      window.setTimeout(() => node.remove(), 500);
    }, 2600);
  }

  /* ---------------- Schedule rendering ---------------- */

  function buildSchedule() {
    if (!el.grid) return;
    const parts = [];

    parts.push('<div class="schedule-header">');
    parts.push('<div class="header-week">Week</div>');
    for (const day of DAY_LABELS) parts.push(`<div>${day}</div>`);
    parts.push('<div class="header-mix">Balance</div>');
    parts.push("</div>");

    WEEKS.forEach((week, weekIndex) => {
      parts.push('<div class="week-row" role="group">');
      parts.push(
        `<div class="week-title"><strong>${week.label}</strong><span class="week-dates">${weekRange(weekIndex)}</span></div>`
      );

      for (let day = 0; day < DAYS_PER_WEEK; day += 1) {
        const index = weekIndex * DAYS_PER_WEEK + day;
        const date = dateForIndex(index);
        const isToday = isTodayIndex(index);
        parts.push(
          `<button class="day-cell${isToday ? " is-today" : ""}" type="button" data-index="${index}">` +
            `<span class="day-name">${DAY_LABELS[day]}</span>` +
            '<span class="day-badge"></span>' +
            `<span class="day-date">${fmtDate.format(date)}</span>` +
            `<span class="sr-only day-status">${week.label}, unmarked. Activate for M.</span>` +
            "</button>"
        );
      }

      parts.push(
        '<div class="week-summary">' +
          '<div class="summary-row"><span class="chip chip-m"><i></i>M</span><b class="pct-m" id="weekM' +
          weekIndex +
          '">0%</b></div>' +
          '<div class="summary-row"><span class="chip chip-d"><i></i>D</span><b class="pct-d" id="weekD' +
          weekIndex +
          '">0%</b></div>' +
          '<div class="week-summary-bar" aria-hidden="true">' +
          '<span class="mini-m" id="miniM' +
          weekIndex +
          '"></span>' +
          '<span class="mini-d" id="miniD' +
          weekIndex +
          '"></span>' +
          '<span class="mini-blank" id="miniB' +
          weekIndex +
          '"></span>' +
          "</div>" +
          "</div>"
      );

      parts.push("</div>");
    });

    el.grid.innerHTML = parts.join("");
  }

  function updateDay(index, animate, delay = 0) {
    const button = el.grid && el.grid.querySelector(`.day-cell[data-index="${index}"]`);
    if (!button) return;

    const mark = state[index];
    const weekIndex = Math.floor(index / DAYS_PER_WEEK);

    button.classList.toggle("is-m", mark === 1);
    button.classList.toggle("is-d", mark === 2);

    const badge = button.querySelector(".day-badge");
    if (badge) badge.textContent = mark === 0 ? "" : MARK_LABELS[mark];

    const status = button.querySelector(".day-status");
    if (status) {
      status.textContent = `${WEEKS[weekIndex].label}, ${
        mark === 0 ? "unmarked" : `marked ${MARK_LABELS[mark]}`
      }. Activate for ${MARK_LABELS[(mark + 1) % 3]}.`;
    }

    if (animate && motionEnabled()) {
      button.classList.remove("is-pop", "is-flip");
      button.style.animationDelay = delay ? `${delay}ms` : "";
      void button.offsetWidth;
      button.classList.add("is-pop", "is-flip");
      window.setTimeout(() => {
        button.style.animationDelay = "";
      }, delay + 700);
    }
  }

  function renderSchedule(animateAll = false) {
    state.forEach((_, index) => {
      updateDay(index, animateAll, animateAll ? (index % DAYS_PER_WEEK) * 45 : 0);
    });
  }

  /* ---------------- Statistics ---------------- */

  const wheelCache = new WeakMap();

  function setWheelNumber(node, target) {
    if (!node) return;

    const value = Math.round(target);
    const text = String(value);
    node.dataset.value = String(value);

    let info = wheelCache.get(node);

    if (!info || info.length !== text.length) {
      const visual = document.createElement("span");
      visual.className = "wheel-num";
      visual.setAttribute("aria-hidden", "true");
      const strips = [];

      for (let index = 0; index < text.length; index += 1) {
        const column = document.createElement("span");
        column.className = "wheel-digit";
        const strip = document.createElement("span");
        strip.className = "wheel-strip";

        for (let digit = 0; digit <= 9; digit += 1) {
          const cellDigit = document.createElement("span");
          cellDigit.textContent = String(digit);
          strip.append(cellDigit);
        }

        column.append(strip);
        visual.append(column);
        strips.push(strip);
      }

      const suffix = document.createElement("span");
      suffix.className = "wheel-suffix";
      suffix.textContent = "%";
      visual.append(suffix);

      let live = node.querySelector(".wheel-text");
      if (!live) {
        live = document.createElement("span");
        live.className = "sr-only wheel-text";
      }

      node.textContent = "";
      node.append(visual, live);
      info = { length: text.length, strips, live };
      wheelCache.set(node, info);
    }

    info.strips.forEach((strip, index) => {
      void strip.offsetWidth;
      const digit = Number(text[index]);
      window.setTimeout(() => strip.style.setProperty("--wheel-d", digit), 20 + index * 55);
    });

    info.live.textContent = `${value}%`;
  }

  function animateNumber(node, target) {
    if (!node) return;
    const from = Number(node.dataset.value || 0);
    const to = Math.round(target);
    node.dataset.value = String(to);

    if (!motionEnabled() || from === to) {
      node.textContent = `${to}%`;
      return;
    }

    const start = performance.now();
    const duration = 620;

    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = `${Math.round(from + (to - from) * eased)}%`;
      if (progress < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  function pulseMetric(selector) {
    if (!motionEnabled()) return;
    const metric = document.querySelector(selector);
    if (!metric) return;
    metric.classList.remove("is-updated");
    void metric.offsetWidth;
    metric.classList.add("is-updated");
  }

  function burst(cell, mark) {
    if (!motionEnabled()) return;

    const host = document.createElement("span");
    host.className = "burst";
    host.setAttribute("aria-hidden", "true");
    const palette =
      mark === 1
        ? ["#ff4f8b", "#ff9ec0", "#ffd6e6"]
        : mark === 2
          ? ["#3b7bff", "#8fb2ff", "#d6e3ff"]
          : ["#b9b4aa", "#e6e3dc", "#8d8a84"];

    const count = 10;

    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement("i");
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.5;
      const distance = 24 + Math.random() * 28;
      particle.style.background = palette[index % palette.length];
      host.append(particle);

      particle.animate(
        [
          { transform: "translate(0, 0) scale(0.4)", opacity: 1 },
          {
            transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0)`,
            opacity: 0,
          },
        ],
        {
          duration: 480 + Math.random() * 260,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        }
      );
    }

    cell.append(host);
    window.setTimeout(() => host.remove(), 840);
  }

  function celebrate() {
    if (!motionEnabled()) return;

    const colors = ["#ff4f8b", "#3b7bff", "#a05ae8", "#ffce4f", "#ffffff"];

    for (let index = 0; index < 32; index += 1) {
      const piece = document.createElement("i");
      piece.className = "confetti";
      piece.setAttribute("aria-hidden", "true");
      const width = 6 + Math.random() * 8;
      piece.style.width = `${width}px`;
      piece.style.height = `${width * (0.45 + Math.random() * 0.7)}px`;
      piece.style.background = colors[index % colors.length];
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.top = `-${8 + Math.random() * 14}vh`;
      piece.style.borderRadius = Math.random() > 0.5 ? "999px" : "2px";
      document.body.append(piece);

      const drift = (Math.random() - 0.5) * 180;
      const animation = piece.animate(
        [
          { transform: "translate3d(0, 0, 0) rotate(0deg)", opacity: 1 },
          {
            transform: `translate3d(${drift}px, ${window.innerHeight + 90}px, 0) rotate(${
              360 + Math.random() * 720
            }deg)`,
            opacity: 0.85,
          },
        ],
        {
          duration: 2600 + Math.random() * 1800,
          easing: "cubic-bezier(0.16, 0.6, 0.32, 1)",
          fill: "forwards",
        }
      );
      animation.onfinish = () => piece.remove();
    }

    toast("Two full weeks marked", "pink");
  }

  function setBar(node, percent, isZero) {
    if (!node) return;
    node.style.width = `${percent}%`;
    node.classList.toggle("is-zero", isZero);
  }

  let previousCounts = null;

  function updateStats() {
    const counts = countsFor(state);
    const marked = counts.m + counts.d;
    const mPct = (counts.m / TOTAL_DAYS) * 100;
    const dPct = (counts.d / TOTAL_DAYS) * 100;
    const blankPct = (counts.blank / TOTAL_DAYS) * 100;

    if (el.markedCount) el.markedCount.textContent = String(marked);
    setWheelNumber(el.ringPercent, (marked / TOTAL_DAYS) * 100);
    setWheelNumber(el.mPercent, mPct);
    setWheelNumber(el.dPercent, dPct);
    setWheelNumber(el.blankPercent, blankPct);

    if (el.mCount) el.mCount.textContent = `${counts.m} of ${TOTAL_DAYS} days`;
    if (el.dCount) el.dCount.textContent = `${counts.d} of ${TOTAL_DAYS} days`;
    if (el.blankCount) el.blankCount.textContent = `${counts.blank} of ${TOTAL_DAYS} days`;

    if (el.ring) {
      el.ring.style.setProperty("--ring-m", `${mPct}%`);
      el.ring.style.setProperty("--ring-d", `${dPct}%`);
      el.ring.classList.toggle("is-empty", marked === 0);
      if (previousCounts && previousCounts.m + previousCounts.d !== marked) {
        el.ring.classList.remove("is-pulse");
        void el.ring.offsetWidth;
        el.ring.classList.add("is-pulse");
      }
      el.ring.setAttribute(
        "aria-label",
        `Marked ${Math.round((marked / TOTAL_DAYS) * 100)} percent. ${Math.round(mPct)} percent M, ${Math.round(
          dPct
        )} percent D, ${Math.round(blankPct)} percent unmarked`
      );
    }

    setBar(el.barM, mPct, counts.m === 0);
    setBar(el.barD, dPct, counts.d === 0);
    if (el.barBlank) el.barBlank.classList.toggle("is-zero", counts.blank === 0);

    WEEKS.forEach((_, weekIndex) => {
      const weekMarks = state.slice(weekIndex * DAYS_PER_WEEK, weekIndex * DAYS_PER_WEEK + DAYS_PER_WEEK);
      const weekCounts = countsFor(weekMarks);
      const weekM = (weekCounts.m / DAYS_PER_WEEK) * 100;
      const weekD = (weekCounts.d / DAYS_PER_WEEK) * 100;

      animateNumber($(`weekM${weekIndex}`), weekM);
      animateNumber($(`weekD${weekIndex}`), weekD);

      setBar($(`miniM${weekIndex}`), weekM, weekCounts.m === 0);
      setBar($(`miniD${weekIndex}`), weekD, weekCounts.d === 0);
      const miniBlank = $(`miniB${weekIndex}`);
      if (miniBlank) miniBlank.classList.toggle("is-zero", weekCounts.blank === 0);
    });

    if (previousCounts) {
      if (counts.m !== previousCounts.m) pulseMetric(".metric-m");
      if (counts.d !== previousCounts.d) pulseMetric(".metric-d");
      if (counts.blank !== previousCounts.blank) pulseMetric(".metric-blank");
      if (previousCounts.m + previousCounts.d < TOTAL_DAYS && marked === TOTAL_DAYS) celebrate();
    }

    previousCounts = counts;
  }

  /* ---------------- Schedule interaction ---------------- */

  function onGridClick(event) {
    const cell = event.target.closest(".day-cell");
    if (!cell || !el.grid.contains(cell)) return;

    const index = Number(cell.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= TOTAL_DAYS) return;

    state[index] = (state[index] + 1) % 3;
    updateDay(index, true);
    burst(cell, state[index]);
    updateStats();
    persistCurrent();
  }

  /* ---------------- Configurations ---------------- */

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function configTime(config) {
    const date = new Date(config.updatedAt || config.createdAt || Date.now());
    if (Number.isNaN(date.getTime())) return "Saved";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function renderConfigurations() {
    if (!el.configList) return;

    el.configList.innerHTML = configurations
      .map((config) => {
        const counts = countsFor(config.marks);
        const strip = config.marks
          .map((mark) => `<i class="${mark === 1 ? "state-m" : mark === 2 ? "state-d" : ""}"></i>`)
          .join("");

        return (
          '<article class="config-card" data-config-id="' +
          escapeHtml(config.id) +
          '">' +
          '<div class="config-card-top">' +
          `<h3>${escapeHtml(config.name)}</h3>` +
          `<time datetime="${escapeHtml(config.updatedAt || config.createdAt || "")}" title="Saved config">${configTime(
            config
          )}</time>` +
          "</div>" +
          `<div class="mini-strip" aria-hidden="true">${strip}</div>` +
          '<div class="config-card-stats">' +
          `<span class="stat-m">M ${counts.m}</span>` +
          `<span class="stat-d">D ${counts.d}</span>` +
          `<span>Blank ${counts.blank}</span>` +
          "</div>" +
          '<div class="config-card-actions">' +
          `<button class="load-button" type="button" data-action="load" data-config-id="${escapeHtml(config.id)}">Load</button>` +
          `<button class="export-config" type="button" data-action="export-config" data-config-id="${escapeHtml(config.id)}">Export</button>` +
          `<button class="delete-button" type="button" data-action="delete" data-config-id="${escapeHtml(config.id)}">Delete</button>` +
          "</div>" +
          "</article>"
        );
      })
      .join("");

    if (el.configEmpty) el.configEmpty.hidden = configurations.length > 0;
    el.configList.dataset.confirmDelete = "";
  }

  function saveConfiguration() {
    if (!el.configName) return;
    const name = el.configName.value.trim();

    if (!name) {
      toast("Give the configuration a name first", "red");
      el.configName.focus();
      el.configName.closest(".config-input-wrap").animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(5px)" },
          { transform: "translateX(0)" },
        ],
        { duration: 320, easing: "ease-out" }
      );
      return;
    }

    const existing = configurations.find((config) => config.name.toLowerCase() === name.toLowerCase());
    const now = new Date().toISOString();

    if (existing) {
      existing.marks = [...state];
      existing.updatedAt = now;
      toast(`Updated “${existing.name}”`, "green");
    } else {
      configurations.unshift({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.slice(0, 40),
        marks: [...state],
        createdAt: now,
        updatedAt: now,
      });
      configurations = configurations.slice(0, MAX_CONFIGS);
      toast(`Saved “${name.slice(0, 40)}”`, "green");
    }

    persistConfigurations();
    renderConfigurations();
    el.configName.value = "";
    el.configName.blur();
  }

  function loadConfiguration(id) {
    const config = configurations.find((item) => item.id === id);
    if (!config) return;

    state = [...config.marks];
    persistCurrent();
    renderSchedule(true);
    updateStats();
    toast(`Loaded “${config.name}”`, "blue");

    const schedule = document.querySelector(".schedule");
    if (schedule) schedule.scrollIntoView({ behavior: motionEnabled() ? "smooth" : "auto", block: "start" });
  }

  function deleteConfiguration(id) {
    const config = configurations.find((item) => item.id === id);
    if (!config) return;

    configurations = configurations.filter((item) => item.id !== id);
    persistConfigurations();

    const card = el.configList.querySelector(`[data-config-id="${CSS.escape(id)}"]`);
    if (card && motionEnabled()) {
      card.classList.add("is-leaving");
      card.addEventListener("animationend", () => renderConfigurations(), { once: true });
    } else {
      renderConfigurations();
    }

    window.setTimeout(renderConfigurations, motionEnabled() ? 320 : 0);
    toast(`Deleted “${config.name}”`, "red");
  }

  function onConfigListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.configId;

    if (action === "load") {
      loadConfiguration(id);
      return;
    }

    if (action === "export-config") {
      const config = configurations.find((item) => item.id === id);
      if (config) exportSchedule(config.marks, config.name);
      return;
    }

    if (action === "delete") {
      if (el.configList.dataset.confirmDelete === id) {
        deleteConfiguration(id);
        return;
      }

      el.configList.dataset.confirmDelete = id;
      button.classList.add("is-confirm");
      button.textContent = "Confirm?";
      window.setTimeout(() => {
        if (el.configList.dataset.confirmDelete === id) {
          el.configList.dataset.confirmDelete = "";
          button.classList.remove("is-confirm");
          button.textContent = "Delete";
        }
      }, 2600);
    }
  }

  /* ---------------- Export / import ---------------- */

  function exportSchedule(marks, name) {
    const payload = {
      app: "weekmark",
      version: 1,
      type: "weekmark-schedule",
      name: name || "Weekmark schedule",
      exportedAt: new Date().toISOString(),
      marks: [...marks],
    };

    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
    const file = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `weekmark-${stamp}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("Exported schedule as JSON", "blue");
  }

  function extractionToMarks(data) {
    const candidates = [data.marks, data.state, data.schedule, data.tracker, data.data];

    for (const candidate of candidates) {
      const direct = sanitizeMarks(candidate);
      if (direct) return direct;

      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        const keys = Object.keys(candidate)
          .filter((key) => /^week\s*\d+$/i.test(key))
          .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));

        if (keys.length >= 2) {
          const weeks = keys.map((key) => {
            const value = candidate[key];
            if (Array.isArray(value)) return value;
            if (value && typeof value === "object") return Object.values(value);
            return null;
          });
          const nested = sanitizeMarks(weeks);
          if (nested) return nested;
        }
      }
    }

    return null;
  }

  function importScheduleFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const data = JSON.parse(String(reader.result));
        const marks = extractionToMarks(data);
        if (!marks) throw new Error("Invalid schedule");

        state = marks;
        persistCurrent();
        renderSchedule(true);
        updateStats();
        if (el.configName && typeof data.name === "string") el.configName.value = data.name.slice(0, 40);
        toast("Schedule imported", "green");
      } catch {
        toast("That file is not a valid Weekmark schedule", "red");
      } finally {
        el.importFile.value = "";
      }
    });
    reader.addEventListener("error", () => toast("Could not read that file", "red"));
    reader.readAsText(file);
  }

  /* ---------------- Reset ---------------- */

  function requestReset() {
    if (!el.resetDialog) {
      if (window.confirm("Clear the whole schedule?")) resetSchedule();
      return;
    }

    if (typeof el.resetDialog.showModal === "function") el.resetDialog.showModal();
    else if (window.confirm("Clear the whole schedule?")) resetSchedule();
  }

  function resetSchedule() {
    state = new Array(TOTAL_DAYS).fill(0);
    persistCurrent();
    renderSchedule(true);
    updateStats();
    toast("Schedule cleared", "red");
  }

  /* ---------------- Theme ---------------- */

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem(STORAGE_THEME, theme);
    } catch {
      /* theme stays for this session */
    }

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLORS[theme]);

    if (el.themeButton) {
      el.themeButton.setAttribute("aria-pressed", String(theme === "dark"));
      el.themeButton.setAttribute(
        "aria-label",
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
  }

  function toggleTheme(event) {
    const next = currentTheme() === "dark" ? "light" : "dark";
    const button = el.themeButton;

    if (button) {
      button.classList.remove("is-switching");
      void button.offsetWidth;
      button.classList.add("is-switching");
      window.setTimeout(() => button.classList.remove("is-switching"), 780);
    }

    const commit = () => applyTheme(next);

    if (motionEnabled() && typeof document.startViewTransition === "function") {
      const rect = button
        ? button.getBoundingClientRect()
        : { left: window.innerWidth - 60, top: 60, width: 0, height: 0 };
      const x =
        event && typeof event.clientX === "number" && event.clientX
          ? event.clientX
          : rect.left + rect.width / 2;
      const y =
        event && typeof event.clientY === "number" && event.clientY
          ? event.clientY
          : rect.top + rect.height / 2;
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      const transition = document.startViewTransition(commit);
      transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${radius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 720,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              pseudoElement: "::view-transition-new(root)",
            }
          );
        })
        .catch(() => {});
    } else {
      commit();
    }

    toast(next === "dark" ? "Dark mode on" : "Light mode on", next === "dark" ? "blue" : "pink");
  }

  /* ---------------- Motion preference ---------------- */

  function applyMotionPreference() {
    document.documentElement.classList.toggle("no-motion", !motionOn);

    if (el.motionButton) {
      el.motionButton.classList.toggle("is-off", !motionOn);
      el.motionButton.setAttribute("aria-pressed", String(motionOn));
    }

    if (el.motionCopy) el.motionCopy.textContent = motionOn ? "Effects on" : "Effects off";
  }

  function toggleMotion() {
    motionOn = !motionOn;

    try {
      localStorage.setItem(STORAGE_MOTION, motionOn ? "on" : "off");
    } catch {
      /* preference stays in memory */
    }

    applyMotionPreference();
    toast(motionOn ? "Effects on" : "Effects off", motionOn ? "blue" : "red");
  }

  /* ---------------- Initialisation ---------------- */

  function init() {
    applyTheme(currentTheme());
    applyMotionPreference();
    loadCurrent();
    buildSchedule();
    renderSchedule();
    updateStats();
    loadConfigurations();
    renderConfigurations();

    if (el.todayLabel) el.todayLabel.textContent = fmtToday.format(new Date());

    if (el.grid) el.grid.addEventListener("click", onGridClick);
    if (el.ring) el.ring.addEventListener("animationend", () => el.ring.classList.remove("is-pulse"));
    if (el.themeButton) el.themeButton.addEventListener("click", toggleTheme);
    if (el.motionButton) el.motionButton.addEventListener("click", toggleMotion);
    if (el.resetButton) el.resetButton.addEventListener("click", requestReset);
    if (el.saveConfigButton) el.saveConfigButton.addEventListener("click", saveConfiguration);
    if (el.configList) el.configList.addEventListener("click", onConfigListClick);
    if (el.exportButton) el.exportButton.addEventListener("click", () => exportSchedule(state, el.configName && el.configName.value.trim()));

    if (el.importButton && el.importFile) {
      el.importButton.addEventListener("click", () => el.importFile.click());
      el.importFile.addEventListener("change", () => importScheduleFile(el.importFile.files && el.importFile.files[0]));
    }

    if (el.configName) {
      el.configName.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveConfiguration();
        }
      });
    }

    if (el.resetDialog) {
      el.resetDialog.addEventListener("close", () => {
        if (el.resetDialog.returnValue === "confirm") resetSchedule();
      });
    }

    if (el.header) {
      const onScroll = () => el.header.classList.toggle("is-stuck", window.scrollY > 8);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    window.addEventListener("pagehide", () => persistCurrent({ silent: true }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persistCurrent({ silent: true });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
