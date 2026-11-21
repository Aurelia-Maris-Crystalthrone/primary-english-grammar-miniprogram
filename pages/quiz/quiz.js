const dataset = require("../../utils/dataset");
const store = require("../../utils/store");
const quiz = require("../../utils/quiz");
const leaderboard = require("../../utils/leaderboard");

const SOURCE_LABEL = {
  level: "随堂练习",
  phase: "阶段挑战",
  mistake: "错题重做",
  similar: "同类题",
  category: "分类练习"
};

const TONE_CLASS = {
  easy: "pill--green",
  medium: "pill--gold",
  hard: "pill--red"
};

Page({
  data: {
    mode: "level",
    title: "",
    subtitle: "",
    total: 0,
    index: 0,
    question: null,
    selected: "",
    answered: false,
    isCorrect: false,
    correctText: "",
    explanation: "",
    progressPercent: 0,
    isLast: false,
    finished: false,
    summary: null,
    empty: false
  },

  onLoad(options) {
    this.mode = options.mode || "level";
    this.levelId = options.levelId ? decodeURIComponent(options.levelId) : "";
    this.phaseId = options.phaseId ? decodeURIComponent(options.phaseId) : "";
    this.nodeId = options.nodeId ? decodeURIComponent(options.nodeId) : "";
    this.categoryId = options.categoryId ? decodeURIComponent(options.categoryId) : "";
    this.excludeId = options.excludeId ? decodeURIComponent(options.excludeId) : "";
    this.ids = options.ids ? decodeURIComponent(options.ids).split(",").filter(Boolean) : [];
    this.amount = Number(options.amount) || quiz.DEFAULT_AMOUNT;
    this.correctCount = 0;
    this.answeredCount = 0;

    const label = SOURCE_LABEL[this.mode] || "练习";
    wx.setNavigationBarTitle({ title: label });
    this.start();
  },

  start() {
    const mode = this.mode;
    let items = [];
    let title = "";
    let subtitle = "";

    if (mode === "level") {
      const level = dataset.LEVEL_BY_ID[this.levelId];
      if (!level) {
        this.setData({ empty: true, title: "关卡不存在" });
        return;
      }
      items = quiz.buildRound(dataset.questionsForLevel(level.id), this.amount, store.attemptRecords());
      title = level.name;
      subtitle = "每轮 " + items.length + " 道 · 首答正确率 80% 通过";
    } else if (mode === "phase") {
      const phase = dataset.PHASE_BY_ID[this.phaseId];
      if (!phase) {
        this.setData({ empty: true, title: "阶段不存在" });
        return;
      }
      const levels = dataset.levelsForPhase(phase.id);
      let pool = [];
      for (let i = 0; i < levels.length; i += 1) {
        pool = pool.concat(dataset.questionsForLevel(levels[i].id));
      }
      items = quiz.buildRound(pool, this.amount, store.attemptRecords());
      title = phase.name + "挑战";
      subtitle = "本阶段 " + levels.length + " 关合并抽题 · 本轮 " + items.length + " 道 · 80% 通过";
    } else if (mode === "mistake") {
      let ids = this.ids;
      if (!ids.length) {
        ids = store.listMistakes().map(function (entry) { return entry.id; });
      }
      items = quiz.buildItemsByIds(ids, dataset.getQuestion);
      title = "错题重做";
      subtitle = "错题 " + items.length + " 道 · 做对就从错题本移出";
    } else if (mode === "similar") {
      const base = this.excludeId ? dataset.getQuestion(this.excludeId) : null;
      const nodeId = this.nodeId || (base ? base.primaryNode : "");
      const levelId = this.levelId || (base ? base.levelId : "");
      const pools = [];
      if (nodeId) pools.push(dataset.questionsForNode(nodeId));
      if (levelId) pools.push(dataset.questionsForLevel(levelId));
      items = quiz.buildSimilarRound(pools, this.excludeId, quiz.SIMILAR_SIZE, store.attemptRecords());
      const nodeName = nodeId ? dataset.nodeName(nodeId) : "";
      title = nodeName || "同类题";
      subtitle = "同一个语法点换 " + items.length + " 道 · 做对就移出错题本";
    } else if (mode === "category") {
      // 语法地图分类练习：把该分类下所有知识点涉及的题目合并去重后抽题
      const categoryId = this.categoryId;
      const category = dataset.CATEGORIES.filter(function (c) { return c.id === categoryId; })[0];
      if (!category) {
        this.setData({ empty: true, title: "分类不存在" });
        return;
      }
      const seen = {};
      const catPool = [];
      dataset.NODES.forEach(function (node) {
        if (node.categoryId !== categoryId) return;
        dataset.questionsForNode(node.id).forEach(function (question) {
          if (seen[question.id]) return;
          seen[question.id] = 1;
          catPool.push(question);
        });
      });
      items = quiz.buildRound(catPool, this.amount, store.attemptRecords());
      title = category.title;
      subtitle = "本分类 " + catPool.length + " 道题 · 每轮 " + items.length + " 道";
    }

    if (!items.length) {
      this.setData({ empty: true, title: title || "没有可练的题", subtitle: subtitle });
      return;
    }

    this.items = items;
    this.correctCount = 0;
    this.answeredCount = 0;

    this.setData({
      mode: mode,
      title: title,
      subtitle: subtitle,
      total: items.length,
      empty: false,
      finished: false,
      summary: null
    }, () => {
      this.showItem(0);
    });
  },

  showItem(index) {
    const item = this.items[index];
    const parts = quiz.promptParts(item.question.prompt);
    const options = item.choice.options.map(function (option) {
      return { key: option.key, text: option.text };
    });
    const correctText = item.choice.correctText ||
      item.question.answerText.replace(/\u001f/g, " / ");

    this.setData({
      index: index,
      question: {
        id: item.question.id,
        promptParts: parts,
        options: options,
        multiBlank: correctText.indexOf(" / ") >= 0,
        difficultyLabel: quiz.difficultyLabel(item.question),
        difficultyClass: TONE_CLASS[quiz.difficultyTone(item.question)] || "pill--green",
        sourceLabel: quiz.sourceLabel(item.question)
      },
      selected: "",
      answered: false,
      isCorrect: false,
      correctText: correctText,
      explanation: item.question.explanation || "",
      isLast: index === this.items.length - 1,
      progressPercent: Math.round((index / this.items.length) * 100)
    });
  },

  onSelect(event) {
    if (this.data.answered) return;
    const key = event.currentTarget.dataset.key;
    this.setData({ selected: key });
  },

  onSubmit() {
    if (this.data.answered) return;
    const key = this.data.selected;
    if (!key) {
      wx.showToast({ title: "先选一个答案", icon: "none" });
      return;
    }

    const item = this.items[this.data.index];
    const isCorrect = key === item.choice.correctKey;
    const selectedOption = item.choice.options.filter(function (option) {
      return option.key === key;
    })[0];
    const source = this.mode === "phase" ? "exam"
      : (this.mode === "mistake" ? "mistake"
        : (this.mode === "similar" ? "similar" : "practice"));

    store.recordAnswer({
      question: item.question,
      correct: isCorrect,
      selectedText: selectedOption ? selectedOption.text : key,
      source: source
    });

    // 积分由本机档案计算（cleared / corrected / sessions），
    // 结算时统一由 leaderboard.uploadScore 同步到全站榜，不再逐题上报旧 rank 云函数。
    if (isCorrect) this.correctCount += 1;
    this.answeredCount += 1;

    this.setData({
      answered: true,
      isCorrect: isCorrect,
      progressPercent: Math.round(((this.data.index + 1) / this.items.length) * 100)
    });
  },

  onNext() {
    if (this.data.index + 1 >= this.items.length) {
      this.finish();
      return;
    }
    this.showItem(this.data.index + 1);
  },

  finish() {
    const summary = quiz.summarize(this.items.length, this.correctCount);

    if (this.mode === "level") store.markLevelCleared(this.levelId, summary);
    if (this.mode === "phase") store.markExam(this.phaseId, summary);
    store.recordSession();

    // 每轮结算后把本机累计成长积分同步到全站榜单（云端只保留历史最高分）。
    // 云函数未部署 / 无网络时静默降级，不影响本轮结果页，也不阻塞刷题。
    try {
      leaderboard.uploadScore(store.scoreCard().points).catch(function () {});
    } catch (e) {
      /* 云开发不可用时忽略 */
    }

    const result = this.buildSummary(summary);
    this.setData({ finished: true, summary: result });
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  buildSummary(summary) {
    let headline = "";
    let message = "";
    let primaryLabel = "再练一轮";
    let secondaryLabel = "回到地图";

    if (this.mode === "level") {
      if (summary.status === "passed") {
        headline = "这一关通过";
        message = "首答正确率 " + summary.percent + "%，达到了 80% 的通过线。做错的题已经收进错题本，随时可以重做。";
      } else {
        headline = "再练一轮更稳";
        message = "首答正确率 " + summary.percent + "%，还没到 80%。把解析看明白，再抽一轮新的题。";
      }
    } else if (this.mode === "phase") {
      if (summary.status === "passed") {
        headline = "阶段挑战通过";
        message = "这一阶段的 " + summary.total + " 道题里，一次做对 " + summary.correct + " 道。做对的错题已经从错题本清理。";
      } else {
        headline = "还没到 80%";
        message = "这一阶段错了 " + summary.wrong + " 道，先回错题本把它们练明白，再来挑战一次。";
      }
      secondaryLabel = "回地图";
    } else if (this.mode === "similar") {
      headline = "同类题练完";
      message = "同一个语法点的 " + summary.total + " 道题，一次做对 " + summary.correct + " 道。做对的错题已经移出错题本。";
      primaryLabel = "再练 5 道同类题";
      secondaryLabel = "回错题本";
    } else if (this.mode === "category") {
      headline = "分类练习完成";
      message = "本轮 " + summary.total + " 道题，一次做对 " + summary.correct + " 道。累计成长积分已同步到全站排行榜。";
      primaryLabel = "再练一轮";
      secondaryLabel = "回语法地图";
    } else {
      headline = "错题重做完成";
      message = "本轮 " + summary.total + " 道错题，做对 " + summary.correct + " 道。做对的题已经从错题本移出。";
      primaryLabel = "再练错题";
      secondaryLabel = "回错题本";
    }

    return {
      percent: summary.percent,
      statusLabel: summary.statusLabel,
      tone: summary.tone,
      toneClass: summary.tone === "green" ? "pill--green" : (summary.tone === "yellow" ? "pill--gold" : "pill--red"),
      headline: headline,
      message: message,
      primaryLabel: primaryLabel,
      secondaryLabel: secondaryLabel,
      total: summary.total,
      correct: summary.correct,
      wrong: summary.wrong,
      passed: summary.status === "passed"
    };
  },

  onRestart() {
    this.correctCount = 0;
    this.answeredCount = 0;
    this.start();
  },

  onSecondary() {
    if (this.mode === "mistake" || this.mode === "similar") {
      wx.switchTab({ url: "/pages/mistakes/mistakes" });
    } else {
      wx.switchTab({ url: "/pages/map/map" });
    }
  },

  onEmptyBack() {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: "/pages/map/map" });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: "来练一轮小学英语语法题",
      path: "/pages/index/index"
    };
  }
});
