(function (global) {
  const DEFAULT_STATE = {
    totalStudyTime: 0,
    pomodoroTime: 1500,
    idleTime: 300,
    mode: "timer",
    timer: {
      duration: 1500,
      remaining: 1500,
      isRunning: false,
      alertMode: "ring",
      loop: false,
    },
    focus: {
      projects: [
        { id: 1, name: "\u5b66\u4e60", totalSeconds: 0, todaySeconds: 0 },
      ],
      activeProjectId: 1,
      isRunning: false,
      runningSince: null,
      lastUpdated: null,
      currentSessionSeconds: 0,
    },
    settings: {
      linkEnabled: false,
    },
    meta: {
      lastDate: getTodayKey(),
    },
  };

  function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function getDateKey(date = new Date()) {
    const value = new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  function getWeekKey(date = new Date()) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    const day = value.getDay();
    const diff = value.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(value);
    monday.setDate(diff);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  }

  function getMonthKey(date = new Date()) {
    const value = new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }

  function getYearKey(date = new Date()) {
    const value = new Date(date);
    return `${value.getFullYear()}`;
  }

  function normalizeState(raw) {
    const state = JSON.parse(JSON.stringify(DEFAULT_STATE));

    if (!raw || typeof raw !== "object") {
      return state;
    }

    state.totalStudyTime = Number(raw.totalStudyTime) || 0;
    state.pomodoroTime = Number(raw.pomodoroTime) || 1500;
    state.idleTime = Number(raw.idleTime) || 300;

    if (raw.mode === "focus") {
      state.mode = "focus";
    }

    if (raw.timer && typeof raw.timer === "object") {
      state.timer.duration = Number(raw.timer.duration) || state.pomodoroTime;
      state.timer.remaining = Number(raw.timer.remaining) || state.timer.duration;
      state.timer.isRunning = Boolean(raw.timer.isRunning);
      state.timer.alertMode = raw.timer.alertMode === "vibrate" ? "vibrate" : "ring";
      state.timer.loop = Boolean(raw.timer.loop);
    }

    state.pomodoroTime = state.timer.duration;

    if (raw.focus && typeof raw.focus === "object") {
      state.focus.isRunning = Boolean(raw.focus.isRunning);
      state.focus.activeProjectId = Number(raw.focus.activeProjectId) || state.focus.activeProjectId;
      state.focus.runningSince = raw.focus.runningSince || null;
      state.focus.lastUpdated = raw.focus.lastUpdated || null;
      state.focus.currentSessionSeconds = Number(raw.focus.currentSessionSeconds) || 0;

      if (Array.isArray(raw.focus.history)) {
        state.focus.history = raw.focus.history.map((entry, index) => normalizeHistoryEntry(entry, index));
      }

      if (Array.isArray(raw.focus.projects) && raw.focus.projects.length) {
        state.focus.projects = raw.focus.projects.map((project, index) => ({
          id: Number(project.id) || index + 1,
          name: buildProjectName(project.name, index + 1),
          totalSeconds: Number(project.totalSeconds) || 0,
          todaySeconds: Number(project.todaySeconds) || 0,
        }));
      }
    }

    if (raw.settings && typeof raw.settings === "object") {
      state.settings.linkEnabled = Boolean(raw.settings.linkEnabled);
    }

    if (raw.meta && typeof raw.meta === "object") {
      state.meta.lastDate = String(raw.meta.lastDate || getTodayKey());
    }

    state.meta.lastDate = state.meta.lastDate || getTodayKey();

    if (state.meta.lastDate !== getTodayKey()) {
      state.focus.projects.forEach((project) => {
        project.todaySeconds = 0;
      });
      state.meta.lastDate = getTodayKey();
    }

    return state;
  }

  function parseDurationInput(value) {
    const clean = String(value || "").trim();
    if (!clean) {
      return 0;
    }

    const parts = clean.split(":");
    if (parts.length === 2) {
      const minutes = Number(parts[0]);
      const seconds = Number(parts[1]);
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
        return Math.max(0, minutes * 60 + seconds);
      }
    }

    const direct = Number(clean);
    if (Number.isFinite(direct)) {
      return Math.max(0, direct);
    }

    return 0;
  }

  function formatDuration(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function formatMinutes(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    return `${minutes}\u5206\u949f`;
  }

  function sanitizeProjectName(name, fallbackIndex) {
    const raw = String(name || "").trim();
    if (!raw) {
      return `\u9879\u76ee${fallbackIndex}`;
    }

    const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    const hasChinese = /[\u4e00-\u9fff]/.test(cleaned);
    const hasLatin = /[A-Za-z]/.test(cleaned);
    const hasDigit = /\d/.test(cleaned);

    if (!cleaned || (!hasChinese && !hasLatin && !hasDigit)) {
      return `\u9879\u76ee${fallbackIndex}`;
    }

    return cleaned;
  }

  function buildProjectName(name, fallbackIndex) {
    return sanitizeProjectName(name, fallbackIndex);
  }

  function normalizeHistoryEntry(entry, index) {
    const startedAt = Number(entry?.startedAt) || 0;
    const endedAt = Number(entry?.endedAt) || startedAt;
    const computedDuration = Math.max(0, Number(entry?.durationSeconds) || Math.floor(Math.max(0, endedAt - startedAt) / 1000) || 0);
    return {
      id: Number(entry?.id) || index + 1,
      projectId: Number(entry?.projectId) || null,
      projectName: buildProjectName(entry?.projectName, index + 1),
      startedAt: startedAt || null,
      endedAt: endedAt || null,
      durationSeconds: computedDuration,
      dateKey: String(entry?.dateKey || getDateKey(endedAt ? new Date(endedAt) : new Date())),
    };
  }

  function recordFocusSession(state, projectId, projectName, startedAt, endedAt, durationSeconds) {
    const entry = {
      id: Date.now(),
      projectId,
      projectName: buildProjectName(projectName, 1),
      startedAt,
      endedAt,
      durationSeconds: Math.max(0, Number(durationSeconds) || 0),
      dateKey: getDateKey(endedAt ? new Date(endedAt) : new Date()),
    };
    state.focus.history.unshift(entry);
    if (state.focus.history.length > 500) {
      state.focus.history = state.focus.history.slice(0, 500);
    }
    return entry;
  }

  function summarizeFocusHistory(history, options = {}) {
    const normalizedHistory = Array.isArray(history)
      ? history.map((entry, index) => normalizeHistoryEntry(entry, index))
      : [];
    const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
    const projectId = options.projectId ?? null;
    const dayKey = getDateKey(referenceDate);
    const weekKey = getWeekKey(referenceDate);
    const monthKey = getMonthKey(referenceDate);
    const yearKey = getYearKey(referenceDate);

    const totals = {
      day: 0,
      week: 0,
      month: 0,
      year: 0,
    };

    normalizedHistory.forEach((entry) => {
      if (projectId !== null && entry.projectId !== projectId) {
        return;
      }
      const startedAt = entry.startedAt ? new Date(entry.startedAt) : null;
      const recordDate = startedAt || (entry.endedAt ? new Date(entry.endedAt) : referenceDate);
      if (getDateKey(recordDate) === dayKey) {
        totals.day += entry.durationSeconds;
      }
      if (getWeekKey(recordDate) === weekKey) {
        totals.week += entry.durationSeconds;
      }
      if (getMonthKey(recordDate) === monthKey) {
        totals.month += entry.durationSeconds;
      }
      if (getYearKey(recordDate) === yearKey) {
        totals.year += entry.durationSeconds;
      }
    });

    return totals;
  }

  function createProject(state, name) {
    const newName = buildProjectName(name, state.focus.projects.length + 1);
    const newProject = {
      id: Date.now(),
      name: newName,
      totalSeconds: 0,
      todaySeconds: 0,
    };
    state.focus.projects.push(newProject);
    state.focus.activeProjectId = newProject.id;
    return newProject;
  }

  function removeProject(state, projectId) {
    const index = state.focus.projects.findIndex((project) => project.id === projectId);
    if (index === -1) {
      return false;
    }
    state.focus.projects.splice(index, 1);
    if (state.focus.activeProjectId === projectId) {
      state.focus.activeProjectId = state.focus.projects[0]?.id || null;
    }
    return true;
  }

  function renameProject(state, projectId, newName) {
    const project = state.focus.projects.find((p) => p.id === projectId);
    if (!project) {
      return null;
    }
    project.name = buildProjectName(newName, 1);
    return project;
  }

  function addElapsedToProject(state, projectId, seconds) {
    const project = state.focus.projects.find((item) => item.id === projectId);
    if (!project || seconds <= 0) {
      return null;
    }
    project.totalSeconds += seconds;
    project.todaySeconds += seconds;
    return project;
  }

  function getActiveProject(state) {
    return state.focus.projects.find((project) => project.id === state.focus.activeProjectId) || null;
  }

  const api = {
    DEFAULT_STATE,
    getTodayKey,
    normalizeState,
    parseDurationInput,
    formatDuration,
    formatMinutes,
    createProject,
    removeProject,
    renameProject,
    addElapsedToProject,
    getActiveProject,
    normalizeHistoryEntry,
    recordFocusSession,
    summarizeFocusHistory,
    getDateKey,
    getWeekKey,
    getMonthKey,
    getYearKey,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.AppLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
