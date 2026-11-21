const dataset = require("../../utils/dataset");
const store = require("../../utils/store");
const format = require("../../utils/format");
const unlock = require("../../utils/unlock");
const account = require("../../utils/account");
const stages = require("../../utils/stages");

function orderedLevels() {
  const bookNumber = {};
  dataset.STAGES.forEach(function (stage) { bookNumber[stage.id] = stage.bookNumber; });
  return dataset.LEVELS.slice().sort(function (left, right) {
    const a = bookNumber[left.stageId] || 0;
    const b = bookNumber[right.stageId] || 0;
    if (a !== b) return a - b;
    return left.number - right.number;
  });
}

function levelMeta(level) {
  const stage = dataset.STAGE_BY_ID[level.stageId] || { name: "", bookNumber: 0 };
  const phrase = "阶段" + (level.phaseIndex === 1 ? "一" : "二");
  return {
    stageName: stage.name,
    bookNumber: stage.bookNumber,
    phaseName: phrase
  };
}

Page({
  data: {
    dateLabel: "",
    clearedCount: 0,
    totalLevels: 0,
    percent: 0,
    mistakeCount: 0,
    points: 0,
    mission: null,
    today: { count: 0, accuracy: 0, streak: 0 },
    stats: { questions: 0, levels: 0, stages: 0 },
    stage: null,          // 阶段展示模型（utils/stages.viewModel()）
    stageAvailable: true, // 当前阶段是否有真实内容（目前仅小学为 true）
    categories: []        // 语法地图分类（仅小学阶段有）
  },

  onShow() {
    this.refresh();
    this.syncLogin();
  },

  syncLogin() {
    const app = typeof getApp === "function" ? getApp() : null;
    if (!app || typeof app.silentLogin !== "function") return;
    app.silentLogin().then((user) => {
      // 云端有昵称就回填本机，避免两边名字不一致
      if (user && user.nickName) account.update({ name: user.nickName });
    }).catch(function () {
      /* 登录失败不打扰用户 */
    });
  },

  refresh() {
    const view = stages.viewModel();
    const levels = orderedLevels();
    const profile = store.getProfile();
    const cleared = profile.cleared || {};
    const clearedCount = levels.filter(function (level) { return cleared[level.id]; }).length;
    const activity = store.activityStats();
    const growth = store.growthSummary();

    // 现有题库（六册关卡 + 语法地图）只挂在「小学」下面
    const mission = view.available ? this.pickMission(levels, cleared) : null;
    const categories = view.available ? this.buildCategories() : [];
    const questionCount = dataset.RAW_META.total;
    view.contentSummary = levels.length + " 关 · " + questionCount + " 道题 · 8 大语法分类";
    if (view.available) view.stageDesc = "六册课程 · " + view.contentSummary;

    this.setData({
      stage: view,
      stageAvailable: view.available,
      categories: categories,
      dateLabel: format.dateLabel(),
      clearedCount: clearedCount,
      totalLevels: levels.length,
      percent: format.percent(clearedCount, levels.length),
      mistakeCount: store.mistakeCount(),
      points: growth.points,
      mission: mission,
      today: {
        count: activity.todayCount,
        accuracy: activity.todayAccuracy,
        streak: activity.streak
      },
      stats: {
        questions: dataset.RAW_META.total,
        levels: levels.length,
        stages: dataset.STAGES.length
      }
    });

    if (typeof wx !== "undefined" && wx.setNavigationBarTitle) {
      wx.setNavigationBarTitle({ title: "伴随英语 · " + view.stageLabel });
    }
  },

  // 学习台按「语法地图」分类重组（目前内容全部属于小学）
  buildCategories() {
    const attempts = store.attemptRecords();
    const sorted = dataset.CATEGORIES.slice().sort(function (a, b) {
      return (a.displayOrder || 0) - (b.displayOrder || 0);
    });

    return sorted.map(function (category) {
      const nodes = dataset.NODES.filter(function (node) {
        return node.categoryId === category.id;
      });
      const seen = {};
      const ids = [];
      nodes.forEach(function (node) {
        dataset.questionsForNode(node.id).forEach(function (question) {
          if (seen[question.id]) return;
          seen[question.id] = 1;
          ids.push(question.id);
        });
      });

      let practiced = 0;
      ids.forEach(function (id) { if (attempts[id]) practiced += 1; });

      return {
        id: category.id,
        title: category.title,
        icon: category.icon || "✦",
        nodeCount: nodes.length,
        questionCount: ids.length,
        practiced: practiced,
        percent: format.percent(practiced, ids.length)
      };
    });
  },

  // 推荐：线性闯关下「当前该练的那一关」（已解锁且未通过）
  pickMission(levels, cleared) {
    let target = unlock.nextPlayable(cleared);
    let label = "开始这一关";
    let reason = "";

    if (!target) {
      const mistakes = store.listMistakes();
      target = levels[levels.length - 1];
      for (let i = 0; i < mistakes.length; i += 1) {
        const level = dataset.LEVEL_BY_ID[mistakes[i].levelId];
        if (level) {
          target = level;
          break;
        }
      }
      label = "回头再练";
      reason = "六册已经全部走完一遍，挑错题最多的关卡再稳一稳。";
    } else {
      const nodes = dataset.nodesForLevel(target);
      reason = nodes.length && nodes[0].shortRule ? nodes[0].shortRule : "按六册顺序，这一关是接下来的内容。";
    }

    const meta = levelMeta(target);
    return {
      id: target.id,
      name: target.name,
      number: target.number,
      stageName: meta.stageName,
      phaseName: meta.phaseName,
      count: dataset.questionsForLevel(target.id).length,
      reason: reason,
      label: label,
      cleared: Boolean(cleared[target.id])
    };
  },

  onSelectStage(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.stage || id === this.data.stage.stageId) return;
    stages.select(id);
    this.refresh();
  },

  onSelectSub(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.stage || id === this.data.stage.subId) return;
    stages.selectSub(id);
    this.refresh();
  },

  onSelectChild(event) {
    const id = event.currentTarget.dataset.id;
    if (!this.data.stage || id === this.data.stage.childId) return;
    stages.selectChild(id);
    this.refresh();
  },

  onBackToPrimary() {
    stages.select("primary");
    this.refresh();
  },

  // 按语法分类进入练习（quiz.js 的 mode=category，题目池实时去重）
  onOpenCategory(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: "/pages/quiz/quiz?mode=category&categoryId=" + encodeURIComponent(id) + "&amount=10"
    });
  },

  onStartMission() {
    const mission = this.data.mission;
    if (!mission) return;
    wx.navigateTo({ url: "/pages/level/level?id=" + encodeURIComponent(mission.id) });
  },

  onGoMap() {
    wx.switchTab({ url: "/pages/map/map" });
  },

  onGoMistakes() {
    wx.switchTab({ url: "/pages/mistakes/mistakes" });
  },

  onGoGrowth() {
    wx.navigateTo({ url: "/pages/growth/growth" });
  },

  onGoRank() {
    wx.switchTab({ url: "/pages/rank/rank" });
  },

  onCopyPromo() {
    wx.setClipboardData({
      data: "https://zerocode.xin/",
      success() {
        wx.showToast({ title: "链接已复制", icon: "success" });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: "伴随英语 · 语法闯关刷题",
      path: "/pages/index/index"
    };
  }
});
