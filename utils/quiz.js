// 抽题、判分与结果口径
const choice = require("./choice");

const ROUND_SIZE = 10;
const SIMILAR_SIZE = 5;
const DEFAULT_AMOUNT = ROUND_SIZE;
const PASS_RATIO = 0.8;
const REVIEW_RATIO = 0.6;

const DIFFICULTY_LABEL = {
  基础: "简单",
  提升: "中等",
  综合: "困难"
};

const DIFFICULTY_TONE = {
  基础: "easy",
  提升: "medium",
  综合: "hard"
};

const viableCache = new Map();

function viableQuestions(pool) {
  if (viableCache.has(pool)) return viableCache.get(pool);
  const result = [];
  for (let i = 0; i < pool.length; i += 1) {
    const question = pool[i];
    const built = choice.toChoiceQuestion(question);
    if (built) result.push({ question: question, choice: built });
  }
  viableCache.set(pool, result);
  return result;
}

function countViable(pool) {
  return viableQuestions(pool).length;
}

function shuffle(items) {
  const list = items.slice();
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const tmp = list[index];
    list[index] = list[swap];
    list[swap] = tmp;
  }
  return list;
}

// 抽一轮题：先随机打散，再把「最久没练过的」排前面，避免每次都是同几道
function pickFrom(items, amount, attempts) {
  const list = shuffle(items);
  const records = attempts || {};
  list.sort(function (left, right) {
    const a = records[left.question.id];
    const b = records[right.question.id];
    const at = a ? a.t : "";
    const bt = b ? b.t : "";
    if (at === bt) return 0;
    return at < bt ? -1 : 1;
  });
  return list.slice(0, Math.max(0, amount));
}

function buildRound(pool, amount, attempts) {
  return pickFrom(viableQuestions(pool), amount, attempts);
}

function buildItemsByIds(questionIds, getQuestion) {
  const items = [];
  for (let i = 0; i < questionIds.length; i += 1) {
    const question = getQuestion(questionIds[i]);
    if (!question) continue;
    const built = choice.toChoiceQuestion(question);
    if (built) items.push({ question: question, choice: built });
  }
  return items;
}

// 题干拆成「文字 / 空格」片段，空格用下划线样式渲染
function promptParts(prompt) {
  const text = String(prompt || "");
  const pieces = text.split(/(_{2,})/);
  const parts = [];
  for (let i = 0; i < pieces.length; i += 1) {
    if (!pieces[i]) continue;
    parts.push({
      k: parts.length,
      blank: /^_{2,}$/.test(pieces[i]),
      text: pieces[i]
    });
  }

  for (let i = 0; i < parts.length; i += 1) {
    if (!parts[i].blank) continue;
    const prev = parts[i - 1];
    const next = parts[i + 1];
    if (prev && !prev.blank && prev.text.charAt(prev.text.length - 1) === " ") {
      prev.text = prev.text.slice(0, -1) + "\u00a0";
    }
    if (next && !next.blank && next.text.charAt(0) === " ") {
      next.text = "\u00a0" + next.text.slice(1);
    }
  }
  return parts;
}

function difficultyLabel(question) {
  return DIFFICULTY_LABEL[question.difficulty] || "简单";
}

function difficultyTone(question) {
  return DIFFICULTY_TONE[question.difficulty] || "easy";
}

function sourceLabel(question) {
  if (question.sourceKind === "real-exam") {
    return question.year ? question.year + " 真题" : "真题";
  }
  return "课程练习";
}

function summarize(total, correct) {
  const safeTotal = Math.max(0, total);
  const safeCorrect = Math.min(Math.max(0, correct), safeTotal);
  const accuracy = safeTotal ? safeCorrect / safeTotal : 0;
  const percent = Math.round(accuracy * 100);
  let status = "relearn";
  let statusLabel = "再学一遍";
  let tone = "red";
  if (accuracy >= PASS_RATIO) {
    status = "passed";
    statusLabel = "通过";
    tone = "green";
  } else if (accuracy >= REVIEW_RATIO) {
    status = "review";
    statusLabel = "待巩固";
    tone = "yellow";
  }
  return {
    total: safeTotal,
    correct: safeCorrect,
    wrong: safeTotal - safeCorrect,
    accuracy: accuracy,
    percent: percent,
    status: status,
    statusLabel: statusLabel,
    tone: tone
  };
}

// 同类题：同一语法点里换 5 道没做过的
function buildSimilarRound(pools, excludeId, amount, attempts) {
  const size = amount || SIMILAR_SIZE;
  const seen = {};
  if (excludeId) seen[excludeId] = true;
  const merged = [];

  for (let i = 0; i < pools.length; i += 1) {
    const items = viableQuestions(pools[i] || []);
    for (let j = 0; j < items.length; j += 1) {
      const id = items[j].question.id;
      if (seen[id]) continue;
      seen[id] = true;
      merged.push(items[j]);
    }
  }

  return pickFrom(merged, size, attempts);
}

module.exports = {
  ROUND_SIZE: ROUND_SIZE,
  SIMILAR_SIZE: SIMILAR_SIZE,
  DEFAULT_AMOUNT: DEFAULT_AMOUNT,
  buildSimilarRound: buildSimilarRound,
  PASS_RATIO: PASS_RATIO,
  viableQuestions: viableQuestions,
  countViable: countViable,
  buildRound: buildRound,
  buildItemsByIds: buildItemsByIds,
  promptParts: promptParts,
  difficultyLabel: difficultyLabel,
  difficultyTone: difficultyTone,
  sourceLabel: sourceLabel,
  summarize: summarize
};
