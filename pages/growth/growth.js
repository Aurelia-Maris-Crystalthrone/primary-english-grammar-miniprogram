const dataset = require("../../utils/dataset");
const store = require("../../utils/store");
const format = require("../../utils/format");
const stageGuard = require("../../utils/stage-guard");

Page({
  data: {
    points: 0,
    cleared: 0,
    totalLevels: 0,
    corrected: 0,
    sessions: 0,
    mistakes: 0,
    answered: 0,
    streak: 0,
    badges: [],
    stages: [],
    suggestion: "",
    suggestionAction: "",
    questionTotal: 0,
    stageAvailable: true,
    stageLabel: ""
  },

  onShow() {
    if (!stageGuard.apply(this)) return;
    this.refresh();
  },

  refresh() {
    const growth = store.growthSummary();
    const activity = store.activityStats();
    const profile = store.getProfile();
    const cleared = profile.cleared || {};

    const stages = dataset.STAGES.map(function (stage) {
      const levels = dataset.levelsForStage(stage.id);
      let count = 0;
      for (let i = 0; i < levels.length; i += 1) if (cleared[levels[i].id]) count += 1;
      return {
        id: stage.id,
        name: stage.name,
        bookLabel: "第 " + stage.bookNumber + " 册",
        cleared: count,
        total: levels.length,
        percent: format.percent(count, levels.length)
      };
    });

    let suggestion = "从第一关开始，先做 10 道看看手感。";
    let action = "map";
    if (growth.mistakes > 0) {
      suggestion = "错题本里还有 " + growth.mistakes + " 道题，先重做一遍，比刷新题更划算。";
      action = "mistakes";
    } else if (growth.cleared > 0) {
      suggestion = "已经通关 " + growth.cleared + " 关，继续按六册顺序往前走。";
    }

    this.setData({
      points: growth.points,
      cleared: growth.cleared,
      totalLevels: dataset.LEVELS.length,
      corrected: growth.corrected,
      sessions: growth.sessions,
      mistakes: growth.mistakes,
      answered: activity.totalAnswered,
      streak: activity.streak,
      badges: growth.badges,
      stages: stages,
      suggestion: suggestion,
      suggestionAction: action,
      questionTotal: dataset.RAW_META.total
    });
  },

  onBackToPrimary() {
    stageGuard.backToPrimary(this);
  },

  onSuggestion() {
    if (this.data.suggestionAction === "mistakes") {
      wx.switchTab({ url: "/pages/mistakes/mistakes" });
      return;
    }
    wx.switchTab({ url: "/pages/map/map" });
  },

  onGoRank() {
    wx.switchTab({ url: "/pages/rank/rank" });
  },

  onAbout() {
    const meta = dataset.RAW_META;
    wx.showModal({
      title: "关于题库",
      content: "共 " + meta.total + " 道题，其中真题 " + meta.published + " 道、课程练习 " + meta.course + " 道。题目保留原题号与来源，错题只代表这一轮的作答，不等同于长期诊断。",
      showCancel: false,
      confirmText: "知道了"
    });
  },

  onReset() {
    const self = this;
    wx.showModal({
      title: "清空本机学习记录？",
      content: "会清掉通关进度、错题本和积分，只影响这台手机，且无法恢复。",
      confirmText: "清空",
      confirmColor: "#B84A46",
      success: function (res) {
        if (!res.confirm) return;
        store.resetAll();
        self.refresh();
        wx.showToast({ title: "已清空", icon: "success" });
      }
    });
  }
});
