// 学习档案与错题本（本机持久化，一台手机一份）
const storage = require("./storage");
const account = require("./account");

const LEGACY_PROFILE_KEY = "grammar.profile.v1";
const LEGACY_MISTAKE_KEY = "grammar.mistakes.v1";

function profileKey(userId) {
  return "grammar.profile.v2." + (userId || account.currentId());
}

function mistakeKey(userId) {
  return "grammar.mistakes.v2." + (userId || account.currentId());
}

function nowISO() {
  return new Date().toISOString();
}

function pad(value) {
  return value < 10 ? "0" + value : "" + value;
}

function localDay(iso) {
  const date = iso ? new Date(iso) : new Date();
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function ensureMigrated() {
  if (account.hasMigrated()) return;
  const userId = account.currentId();
  const legacyProfile = storage.get(LEGACY_PROFILE_KEY, null);
  const legacyMistakes = storage.get(LEGACY_MISTAKE_KEY, null);
  if (legacyProfile && !storage.get(profileKey(userId), null)) {
    storage.set(profileKey(userId), legacyProfile);
  }
  if (legacyMistakes && !storage.get(mistakeKey(userId), null)) {
    storage.set(mistakeKey(userId), legacyMistakes);
  }
  account.markMigrated();
}

function emptyProfile() {
  return {
    v: 1,
    attempts: {},
    cleared: {},
    exams: {},
    sessions: 0,
    createdAt: nowISO(),
    lastActiveAt: nowISO()
  };
}

function getProfile(userId) {
  ensureMigrated();
  const saved = storage.get(profileKey(userId), null);
  if (!saved || saved.v !== 1 || typeof saved !== "object") return emptyProfile();
  return {
    v: 1,
    attempts: saved.attempts && typeof saved.attempts === "object" ? saved.attempts : {},
    cleared: saved.cleared && typeof saved.cleared === "object" ? saved.cleared : {},
    exams: saved.exams && typeof saved.exams === "object" ? saved.exams : {},
    sessions: Number(saved.sessions) || 0,
    createdAt: saved.createdAt || nowISO(),
    lastActiveAt: saved.lastActiveAt || nowISO()
  };
}

function saveProfile(profile, userId) {
  profile.lastActiveAt = nowISO();
  storage.set(profileKey(userId), profile);
}

function emptyMistakes() {
  return { v: 1, entries: {} };
}

function getMistakes(userId) {
  ensureMigrated();
  const saved = storage.get(mistakeKey(userId), null);
  if (!saved || saved.v !== 1 || !saved.entries || typeof saved.entries !== "object") {
    return emptyMistakes();
  }
  return saved;
}

function saveMistakes(book, userId) {
  storage.set(mistakeKey(userId), book);
}

function mistakeCount(userId) {
  const book = getMistakes(userId);
  return Object.keys(book.entries).length;
}

function addMistake(question, selectedText, source, userId) {
  const book = getMistakes(userId);
  const previous = book.entries[question.id];
  const at = nowISO();
  book.entries[question.id] = {
    id: question.id,
    n: (previous ? previous.n : 0) + 1,
    first: previous ? previous.first : at,
    last: at,
    answer: String(selectedText === undefined || selectedText === null ? "" : selectedText),
    source: source || "practice",
    levelId: question.levelId || ""
  };
  saveMistakes(book, userId);
  return book.entries[question.id];
}

function removeMistake(questionId, userId) {
  const book = getMistakes(userId);
  if (!book.entries[questionId]) return false;
  delete book.entries[questionId];
  saveMistakes(book, userId);
  return true;
}

function mistakeLevelOf(count) {
  if (count >= 3) return "hard";
  if (count >= 2) return "medium";
  return "easy";
}

function listMistakes(userId) {
  const book = getMistakes(userId);
  const ids = Object.keys(book.entries);
  const list = [];
  for (let i = 0; i < ids.length; i += 1) {
    const entry = book.entries[ids[i]];
    list.push({
      id: entry.id,
      count: entry.n,
      level: mistakeLevelOf(entry.n),
      first: entry.first,
      last: entry.last,
      answer: entry.answer,
      source: entry.source,
      levelId: entry.levelId
    });
  }
  list.sort(function (left, right) {
    if (right.count !== left.count) return right.count - left.count;
    return left.id < right.id ? -1 : 1;
  });
  return list;
}

function groupMistakes(userId) {
  const groups = { hard: [], medium: [], easy: [] };
  const list = listMistakes(userId);
  for (let i = 0; i < list.length; i += 1) groups[list[i].level].push(list[i]);
  return groups;
}

// 记录一次作答（每题每次练习只调用一次）
function recordAnswer(options) {
  const question = options.question;
  const correct = Boolean(options.correct);
  const source = options.source || "practice";
  const profile = getProfile();
  const previous = profile.attempts[question.id];
  const at = nowISO();

  profile.attempts[question.id] = {
    t: at,
    ok: correct,
    first: previous ? previous.first : correct,
    tries: (previous ? previous.tries || 1 : 0) + 1,
    levelId: question.levelId || ""
  };
  saveProfile(profile);

  if (!correct) {
    addMistake(question, options.selectedText, source);
  } else if (source === "mistake" || source === "exam" || source === "similar") {
    removeMistake(question.id);
  }

  return profile;
}

function markLevelCleared(levelId, summary) {
  if (!levelId) return;
  if (summary.status !== "passed") return;
  const profile = getProfile();
  const previous = profile.cleared[levelId];
  profile.cleared[levelId] = {
    at: nowISO(),
    percent: summary.percent,
    best: previous ? Math.max(previous.best || 0, summary.percent) : summary.percent,
    total: summary.total,
    correct: summary.correct
  };
  saveProfile(profile);
}

function markExam(phaseId, summary) {
  if (!phaseId) return;
  const profile = getProfile();
  const previous = profile.exams[phaseId];
  profile.exams[phaseId] = {
    at: nowISO(),
    percent: summary.percent,
    best: previous ? Math.max(previous.best || 0, summary.percent) : summary.percent,
    bestCorrect: Math.max((previous && previous.bestCorrect) || 0, summary.correct || 0),
    total: summary.total || 0,
    correct: summary.correct || 0,
    passed: Boolean(previous && previous.passed) || summary.status === "passed"
  };
  saveProfile(profile);
}

function examStats(userId) {
  const exams = getProfile(userId).exams;
  const ids = Object.keys(exams);
  let mastered = 0;
  let passed = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const exam = exams[ids[i]];
    mastered += Number(exam.bestCorrect) || 0;
    if (exam.passed) passed += 1;
  }
  return { exams: ids.length, passed: passed, mastered: mastered };
}

function recordSession() {
  const profile = getProfile();
  profile.sessions = (profile.sessions || 0) + 1;
  saveProfile(profile);
}

function clearedLevelIds(userId) {
  return Object.keys(getProfile(userId).cleared);
}

function isLevelCleared(levelId, userId) {
  return Boolean(getProfile(userId).cleared[levelId]);
}

function attemptRecords(userId) {
  return getProfile(userId).attempts;
}

function activityStats(userId) {
  const attempts = getProfile(userId).attempts;
  const ids = Object.keys(attempts);
  const today = localDay();
  let todayCount = 0;
  let todayCorrect = 0;
  const days = {};

  for (let i = 0; i < ids.length; i += 1) {
    const record = attempts[ids[i]];
    if (!record || !record.t) continue;
    const day = localDay(record.t);
    days[day] = true;
    if (day === today) {
      todayCount += 1;
      if (record.ok) todayCorrect += 1;
    }
  }

  let streak = 0;
  const cursor = new Date();
  for (let guard = 0; guard < 400; guard += 1) {
    const key = localDay(cursor.toISOString());
    if (days[key]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (guard === 0) {
      // 今天还没练，从昨天开始算，不算断
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    todayCount: todayCount,
    todayCorrect: todayCorrect,
    todayAccuracy: todayCount ? Math.round((todayCorrect / todayCount) * 100) : 0,
    totalAnswered: ids.length,
    streak: streak
  };
}

function growthSummary(userId) {
  const profile = getProfile(userId);
  const attempts = profile.attempts;
  const ids = Object.keys(attempts);
  let corrected = 0;
  let retried = 0;

  for (let i = 0; i < ids.length; i += 1) {
    const record = attempts[ids[i]];
    if (record && record.first === false && record.ok) corrected += 1;
    if (record && record.tries > 1) retried += 1;
  }

  const clearedIds = Object.keys(profile.cleared);
  const cleared = clearedIds.length;
  const sessions = profile.sessions || 0;
  const mistakes = mistakeCount(userId);
  const exams = examStats(userId);
  const points = cleared * 10 + corrected * 3 + sessions * 5;

  const badges = [];
  if (corrected >= 1) badges.push({ id: "first-correction", name: "第一次修正", desc: "第一次把错题改对" });
  if (sessions >= 1) badges.push({ id: "careful-observer", name: "认真练习", desc: "完成第一轮练习" });
  if (retried >= 5) badges.push({ id: "mistake-brave", name: "错题小勇士", desc: "重做至少 5 道错题" });
  if (cleared >= 3) badges.push({ id: "map-explorer", name: "地图探险家", desc: "通关 3 个知识点" });
  if (cleared >= 10) badges.push({ id: "steady-walker", name: "稳步前行", desc: "通关 10 个知识点" });

  return {
    points: points,
    cleared: cleared,
    corrected: corrected,
    retried: retried,
    sessions: sessions,
    mistakes: mistakes,
    exams: exams.exams,
    examPassed: exams.passed,
    mastered: exams.mastered,
    badges: badges,
    clearedIds: clearedIds
  };
}

function scoreCard(userId) {
  const growth = growthSummary(userId);
  const activity = activityStats(userId);
  return {
    points: growth.points,
    cleared: growth.cleared,
    corrected: growth.corrected,
    sessions: growth.sessions,
    mistakes: growth.mistakes,
    answered: activity.totalAnswered,
    streak: activity.streak,
    exams: growth.exams,
    examPassed: growth.examPassed,
    mastered: growth.mastered
  };
}

function resetAll() {
  storage.remove(profileKey());
  storage.remove(mistakeKey());
}

module.exports = {
  getProfile: getProfile,
  saveProfile: saveProfile,
  getMistakes: getMistakes,
  mistakeCount: mistakeCount,
  addMistake: addMistake,
  removeMistake: removeMistake,
  listMistakes: listMistakes,
  groupMistakes: groupMistakes,
  recordAnswer: recordAnswer,
  markLevelCleared: markLevelCleared,
  markExam: markExam,
  recordSession: recordSession,
  clearedLevelIds: clearedLevelIds,
  isLevelCleared: isLevelCleared,
  attemptRecords: attemptRecords,
  activityStats: activityStats,
  growthSummary: growthSummary,
  examStats: examStats,
  scoreCard: scoreCard,
  resetAll: resetAll,
  localDay: localDay
};
