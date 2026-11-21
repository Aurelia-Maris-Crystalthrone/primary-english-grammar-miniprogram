const dataset = require("../../utils/dataset");
const store = require("../../utils/store");
const quiz = require("../../utils/quiz");
const format = require("../../utils/format");
const stageGuard = require("../../utils/stage-guard");

const LEVEL_INFO = {
  hard: { label: "困难", hint: "错过 3 次以上，优先攻克", cls: "pill--red" },
  medium: { label: "中等", hint: "错过 2 次，还要再练", cls: "pill--gold" },
  easy: { label: "简单", hint: "只错过 1 次，巩固一下就好", cls: "pill--green" }
};

Page({
  data: {
    total: 0,
    groups: [],
    retryLabel: "",
    stageAvailable: true,
    stageLabel: ""
  },

  onShow() {
    if (!stageGuard.apply(this)) return;
    this.refresh();
  },

  refresh() {
    const grouped = store.groupMistakes();
    const self = this;
    const groups = [];

    ["hard", "medium", "easy"].forEach(function (key) {
      const list = grouped[key];
      if (!list.length) return;
      const info = LEVEL_INFO[key];
      groups.push({
        key: key,
        label: info.label,
        hint: info.hint,
        cls: info.cls,
        count: list.length,
        items: list.map(function (entry) {
          const question = dataset.getQuestion(entry.id);
          const level = entry.levelId ? dataset.LEVEL_BY_ID[entry.levelId] : null;
          const nodeId = question && question.primaryNode ? question.primaryNode : "";
          const similarCount = nodeId ? dataset.questionsForNode(nodeId).length : 0;
          return {
            id: entry.id,
            prompt: question ? format.plainPrompt(question.prompt, 110) : "（题目已调整，可移出）",
            answer: entry.answer || "（未作答）",
            count: entry.count,
            countLabel: "错 " + entry.count + " 次",
            levelName: level ? level.name : "未归属关卡",
            levelId: entry.levelId || "",
            nodeId: nodeId,
            nodeName: nodeId ? dataset.nodeName(nodeId) : "",
            similarCount: similarCount,
            similarText: similarCount >= 6 ? "练 5 道同类题" : (similarCount >= 2 ? "练同类题" : ""),
            exists: Boolean(question)
          };
        })
      });
    });

    const total = store.mistakeCount();
    this.setData({
      total: total,
      groups: groups,
      retryLabel: total ? (total > 15 ? "全部重做（取最难的 15 道）" : "全部重做（" + total + " 道）") : ""
    });
  },

  onBackToPrimary() {
    stageGuard.backToPrimary(this);
  },

  onRetryOne(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({
      url: "/pages/quiz/quiz?mode=mistake&ids=" + encodeURIComponent(id) + "&amount=1"
    });
  },

  onRetryAll() {
    const all = store.listMistakes();
    if (!all.length) return;
    const ids = all.slice(0, 15).map(function (entry) { return entry.id; });
    wx.navigateTo({
      url: "/pages/quiz/quiz?mode=mistake&ids=" + encodeURIComponent(ids.join(",")) + "&amount=" + ids.length
    });
  },

  onSimilar(event) {
    const datasetInfo = event.currentTarget.dataset;
    const nodeId = datasetInfo.node || "";
    const id = datasetInfo.id || "";
    const levelId = datasetInfo.level || "";
    if (!nodeId && !levelId) {
      wx.showToast({ title: "这道题暂无可替换的同类题", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: "/pages/quiz/quiz?mode=similar&nodeId=" + encodeURIComponent(nodeId) +
        "&levelId=" + encodeURIComponent(levelId) +
        "&excludeId=" + encodeURIComponent(id) +
        "&amount=" + (nodeId ? quiz.SIMILAR_SIZE : 5)
    });
  },

  onRemove(event) {
    const id = event.currentTarget.dataset.id;
    const self = this;
    wx.showModal({
      title: "移出错题本？",
      content: "这题会从错题本里删掉，学习记录仍保留。",
      confirmText: "移出",
      confirmColor: "#B84A46",
      success: function (res) {
        if (!res.confirm) return;
        store.removeMistake(id);
        self.refresh();
      }
    });
  },

  onGoMap() {
    wx.switchTab({ url: "/pages/map/map" });
  }
});
