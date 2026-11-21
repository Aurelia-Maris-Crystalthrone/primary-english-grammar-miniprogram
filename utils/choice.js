// 把「词形填空」改造成四选一（移植自网页版 choice-question.ts）
const dataset = require("./dataset");

const OPTION_KEYS = ["A", "B", "C", "D"];
const DISTRACTOR_COUNT = 3;
const CANDIDATE_MARGIN = 3;
const SEP = "\u001f";

function answerParts(answer) {
  const text = String(answer === null || answer === undefined ? "" : answer);
  const parts = text.indexOf(SEP) >= 0 ? text.split(SEP) : text.trim().split(/\s{2,}/);
  return parts.map(function (part) { return String(part).trim(); });
}

function choiceOptionText(answer) {
  return answerParts(answer).filter(function (part) { return part !== ""; }).join(" / ");
}

function hintSignature(prompt) {
  const hints = [];
  const pattern = /\(\s*([A-Za-z][A-Za-z' -]{0,18}?)\s*\)/g;
  let match;
  const text = String(prompt || "");
  while ((match = pattern.exec(text)) !== null) {
    hints.push(match[1].trim().toLowerCase());
  }
  return hints.sort().join("|");
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededShuffle(items, seed) {
  const result = items.slice();
  let state = hashString(seed) || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const random = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const swap = Math.floor(random * (index + 1));
    const tmp = result[index];
    result[index] = result[swap];
    result[swap] = tmp;
  }
  return result;
}

/* ---------- 题池索引：按「空数 | 括号提示词」分桶统计答案 ---------- */
const poolIndexCache = new Map();

function indexKey(width, hint) {
  return width + "|" + (hint === null ? "*" : hint);
}

function poolIndex(pool) {
  if (poolIndexCache.has(pool)) return poolIndexCache.get(pool);
  const index = new Map();
  for (let i = 0; i < pool.length; i += 1) {
    const question = pool[i];
    if (question.options && question.options.length) continue;
    const parts = answerParts(question.answerText);
    if (!parts.length || parts.indexOf("") >= 0) continue;
    const text = parts.join(" / ");
    const keys = [
      indexKey(parts.length, hintSignature(question.prompt) || null),
      indexKey(parts.length, null)
    ];
    for (let k = 0; k < keys.length; k += 1) {
      let bucket = index.get(keys[k]);
      if (!bucket) {
        bucket = new Map();
        index.set(keys[k], bucket);
      }
      bucket.set(text, (bucket.get(text) || 0) + 1);
    }
  }
  poolIndexCache.set(pool, index);
  return index;
}

function collectScores(state, pools, width, hint, correctText, wanted) {
  const key = indexKey(width, hint);
  for (; state.poolsScanned < pools.length; state.poolsScanned += 1) {
    const bucket = poolIndex(pools[state.poolsScanned]).get(key);
    if (bucket) {
      bucket.forEach(function (count, text) {
        if (text === correctText) return;
        if (text.toLowerCase() === correctText.toLowerCase()) return;
        state.scores.set(text, (state.scores.get(text) || 0) + count);
      });
    }
    if (state.scores.size >= wanted) return;
  }
}

function combinationDistractors(layers, question, correctText, width, limit, requiredHint) {
  if (width < 2) return [];
  const combos = [];
  for (let p = 0; p < layers.length; p += 1) {
    const pool = layers[p];
    const perBlank = [];
    for (let b = 0; b < width; b += 1) perBlank.push(new Set());
    for (let i = 0; i < pool.length; i += 1) {
      const candidate = pool[i];
      if (candidate.id === question.id) continue;
      if (candidate.options && candidate.options.length) continue;
      if (requiredHint !== null && hintSignature(candidate.prompt) !== requiredHint) continue;
      const parts = answerParts(candidate.answerText);
      if (parts.length !== width) continue;
      for (let b = 0; b < width; b += 1) {
        if (parts[b] !== "") perBlank[b].add(parts[b]);
      }
    }
    let empty = false;
    for (let b = 0; b < width; b += 1) if (!perBlank[b].size) empty = true;
    if (empty) continue;

    const walk = function (index, current) {
      if (combos.length >= limit * 6) return;
      if (index === width) {
        const text = current.join(" / ");
        if (text !== correctText) combos.push(text);
        return;
      }
      perBlank[index].forEach(function (part) {
        walk(index + 1, current.concat([part]));
      });
    };
    walk(0, []);
    if (combos.length >= limit) break;
  }
  return combos;
}

function buildOptions(question, pools) {
  const correctText = choiceOptionText(question.answerText);
  if (!correctText) return null;
  const parts = answerParts(question.answerText).filter(function (part) { return part !== ""; });
  const width = parts.length;
  const hint = hintSignature(question.prompt);
  const layers = [pools.node, pools.level, pools.stage, pools.all].filter(function (layer) {
    return layer && layer.length;
  });
  const wanted = DISTRACTOR_COUNT + CANDIDATE_MARGIN;

  const state = { scores: new Map(), poolsScanned: 0 };
  if (hint) collectScores(state, layers, width, hint, correctText, wanted);
  if (state.scores.size < wanted) {
    const relaxed = { scores: state.scores, poolsScanned: 0 };
    collectScores(relaxed, layers, width, null, correctText, wanted);
  }
  const scores = state.scores;

  if (scores.size < DISTRACTOR_COUNT) {
    const requiredHints = hint ? [hint, null] : [null];
    for (let h = 0; h < requiredHints.length; h += 1) {
      const combos = combinationDistractors(layers, question, correctText, width, DISTRACTOR_COUNT, requiredHints[h]);
      for (let c = 0; c < combos.length; c += 1) {
        if (!scores.has(combos[c])) scores.set(combos[c], 1);
      }
      if (scores.size >= DISTRACTOR_COUNT) break;
    }
  }

  const capitalized = /^[A-Z]/.test(correctText);
  const caseScore = function (text) {
    return Number(/^[A-Z]/.test(text) === capitalized);
  };

  // is / Is 只保留一个，优先与正确答案大小写一致的写法
  const byLowercase = new Map();
  scores.forEach(function (score, text) {
    const key = text.toLowerCase();
    const existing = byLowercase.get(key);
    if (!existing) {
      byLowercase.set(key, text);
      return;
    }
    const better = caseScore(text) > caseScore(existing) ||
      (caseScore(text) === caseScore(existing) && score > (scores.get(existing) || 0));
    if (better) byLowercase.set(key, text);
  });

  const candidates = [];
  byLowercase.forEach(function (text) { candidates.push(text); });
  const distractors = seededShuffle(candidates, question.id + ":distractor")
    .sort(function (left, right) {
      return (scores.get(right) - scores.get(left)) ||
        (caseScore(right) - caseScore(left)) ||
        (Math.abs(left.length - correctText.length) - Math.abs(right.length - correctText.length));
    })
    .slice(0, DISTRACTOR_COUNT);

  if (!distractors.length) return null;

  const texts = seededShuffle([correctText].concat(distractors), question.id + ":option");
  const options = texts.map(function (text, index) {
    return { key: OPTION_KEYS[index], text: text };
  });
  let correctKey = "A";
  for (let i = 0; i < options.length; i += 1) {
    if (options[i].text === correctText) correctKey = options[i].key;
  }
  return { options: options, correctKey: correctKey, correctText: correctText };
}

function toChoiceQuestion(question) {
  if (question.__choice !== undefined) return question.__choice;
  let choice = null;

  if (question.options && question.options.length) {
    choice = {
      options: question.options,
      correctKey: question.correctKey,
      correctText: question.answerText
    };
    const exists = question.options.some(function (option) {
      return option.key === question.correctKey;
    });
    if (!exists) choice = null;
  } else {
    const built = buildOptions(question, {
      node: dataset.questionsForNode(question.primaryNode),
      level: dataset.questionsForLevel(question.levelId),
      stage: dataset.questionsForStage(question.stageId),
      all: dataset.QUESTIONS
    });
    if (built && built.options.length >= 3) choice = built;
  }

  question.__choice = choice;
  return choice;
}

module.exports = {
  answerParts: answerParts,
  choiceOptionText: choiceOptionText,
  hintSignature: hintSignature,
  toChoiceQuestion: toChoiceQuestion
};
