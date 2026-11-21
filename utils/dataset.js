// 题库访问层
const raw = require("../data/questions.js");
const curriculum = require("../data/curriculum.js");
const catalog = require("../data/catalog.js");
const lessons = require("../data/lessons.js");

const KEYS = "ABCDEF";
const SEP = "\u001f";

const STAGES = curriculum.stages;
const PHASES = curriculum.phases;
const LEVELS = curriculum.levels;
const CATEGORIES = catalog.categories;
const NODES = catalog.nodes;

const STAGE_BY_ID = {};
const LEVEL_BY_ID = {};
const NODE_BY_ID = {};
const PHASE_BY_ID = {};

STAGES.forEach(function (stage) { STAGE_BY_ID[stage.id] = stage; });
LEVELS.forEach(function (level) { LEVEL_BY_ID[level.id] = level; });
PHASES.forEach(function (phase) { PHASE_BY_ID[phase.id] = phase; });
NODES.forEach(function (node) { NODE_BY_ID[node.id] = node; });

const STAGE_ID_BY_LEVEL = {};
LEVELS.forEach(function (level) { STAGE_ID_BY_LEVEL[level.id] = level.stageId; });

function dictValue(list, index) {
  if (index === null || index === undefined) return "";
  return list[index] === undefined ? "" : list[index];
}

function normalizeText(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\u001f/g, " / ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeOptions(optionTexts, answer) {
  const options = optionTexts.map(function (text, index) {
    return { key: KEYS[index], text: String(text) };
  });
  let correctKey = "";
  let answerText = "";

  if (typeof answer === "number") {
    correctKey = KEYS[answer] || "";
    answerText = options[answer] ? options[answer].text : "";
    return { options: options, correctKey: correctKey, answerText: answerText };
  }

  const text = String(answer === null || answer === undefined ? "" : answer).trim();
  const letter = text.match(/^([A-Za-z])(?:[.、)．。]|\s*$)/);
  if (letter) {
    const key = letter[1].toUpperCase();
    const found = options.filter(function (option) { return option.key === key; })[0];
    if (found) return { options: options, correctKey: key, answerText: found.text };
  }

  const normalized = normalizeText(text);
  const byText = options.filter(function (option) {
    return normalizeText(option.text) === normalized;
  })[0];
  if (byText) return { options: options, correctKey: byText.key, answerText: byText.text };

  return { options: options, correctKey: text.toUpperCase(), answerText: text };
}

function buildQuestion(row, index) {
  const optionTexts = row[5];
  const nodeIds = [];
  const nodeList = raw.dict.nd[row[8]] || [];
  for (let i = 0; i < nodeList.length; i += 1) nodeIds.push(nodeList[i]);

  const levelId = row[14] || "";
  const question = {
    id: row[0],
    index: index,
    source: dictValue(raw.dict.st, row[1]),
    sourceKind: dictValue(raw.dict.sk, row[2]),
    type: dictValue(raw.dict.qt, row[3]),
    prompt: row[4],
    explanation: row[7] || "",
    nodeIds: nodeIds,
    primaryNode: nodeIds[0] || "",
    difficulty: dictValue(raw.dict.df, row[12]) || "基础",
    year: row[10] || "",
    levelId: levelId,
    stageId: STAGE_ID_BY_LEVEL[levelId] || "",
    options: null,
    correctKey: "",
    answerText: ""
  };

  if (optionTexts && optionTexts.length) {
    const normalized = normalizeOptions(optionTexts, row[6]);
    question.options = normalized.options;
    question.correctKey = normalized.correctKey;
    question.answerText = normalized.answerText;
  } else {
    question.correctKey = "";
    question.answerText = String(row[6] === null || row[6] === undefined ? "" : row[6]);
  }

  return question;
}

const QUESTIONS = raw.rows.map(buildQuestion);

const BY_LEVEL = {};
const BY_NODE = {};
const BY_STAGE = {};

QUESTIONS.forEach(function (question) {
  if (question.levelId) {
    (BY_LEVEL[question.levelId] = BY_LEVEL[question.levelId] || []).push(question);
  }
  if (question.stageId) {
    (BY_STAGE[question.stageId] = BY_STAGE[question.stageId] || []).push(question);
  }
  for (let i = 0; i < question.nodeIds.length; i += 1) {
    const nodeId = question.nodeIds[i];
    (BY_NODE[nodeId] = BY_NODE[nodeId] || []).push(question);
  }
});

function questionsForLevel(levelId) {
  return BY_LEVEL[levelId] || [];
}

function questionsForNode(nodeId) {
  return BY_NODE[nodeId] || [];
}

function questionsForStage(stageId) {
  return BY_STAGE[stageId] || [];
}

function levelsForStage(stageId) {
  return LEVELS.filter(function (level) { return level.stageId === stageId; });
}

function phasesForStage(stageId) {
  return PHASES.filter(function (phase) { return phase.stageId === stageId; });
}

function levelsForPhase(phaseId) {
  const phase = PHASE_BY_ID[phaseId];
  if (!phase) return [];
  return phase.levelIds.map(function (id) { return LEVEL_BY_ID[id]; }).filter(Boolean);
}

function nodesForLevel(level) {
  if (!level) return [];
  const ids = level.knowledgeNodeIds && level.knowledgeNodeIds.length
    ? level.knowledgeNodeIds
    : level.practiceNodeIds || [];
  return ids.map(function (id) { return NODE_BY_ID[id]; }).filter(Boolean);
}

function lessonForLevel(level) {
  const nodes = nodesForLevel(level);
  for (let i = 0; i < nodes.length; i += 1) {
    if (lessons[nodes[i].id]) return lessons[nodes[i].id];
  }
  return null;
}

function questionById(questionId) {
  for (let i = 0; i < QUESTIONS.length; i += 1) {
    if (QUESTIONS[i].id === questionId) return QUESTIONS[i];
  }
  return null;
}

const QUESTION_BY_ID = {};
QUESTIONS.forEach(function (question) { QUESTION_BY_ID[question.id] = question; });

function getQuestion(questionId) {
  return QUESTION_BY_ID[questionId] || null;
}

function nodeName(nodeId) {
  return NODE_BY_ID[nodeId] ? NODE_BY_ID[nodeId].name : "";
}

module.exports = {
  KEYS: KEYS,
  SEP: SEP,
  RAW_META: raw.meta,
  STAGES: STAGES,
  PHASES: PHASES,
  LEVELS: LEVELS,
  CATEGORIES: CATEGORIES,
  NODES: NODES,
  LESSONS: lessons,
  STAGE_BY_ID: STAGE_BY_ID,
  LEVEL_BY_ID: LEVEL_BY_ID,
  PHASE_BY_ID: PHASE_BY_ID,
  NODE_BY_ID: NODE_BY_ID,
  QUESTIONS: QUESTIONS,
  questionsForLevel: questionsForLevel,
  questionsForNode: questionsForNode,
  questionsForStage: questionsForStage,
  levelsForStage: levelsForStage,
  phasesForStage: phasesForStage,
  levelsForPhase: levelsForPhase,
  nodesForLevel: nodesForLevel,
  lessonForLevel: lessonForLevel,
  getQuestion: getQuestion,
  nodeName: nodeName
};
