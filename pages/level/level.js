const dataset = require("../../utils/dataset");
const store = require("../../utils/store");
const quiz = require("../../utils/quiz");
const handout = require("../../utils/handout");
const unlock = require("../../utils/unlock");

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

Page({
  data: {
    id: "",
    level: null,
    status: null,
    nodes: [],
    lesson: null,
    poolCount: 0,
    roundCount: 0,
    roundSize: quiz.ROUND_SIZE,
    startLabel: "",
    cleared: null,
    prev: null,
    next: null,
    handout: null
  },

  onLoad(options) {
    const id = decodeURIComponent(options.id || "");
    const level = dataset.LEVEL_BY_ID[id];
    if (!level) {
      wx.showModal({
        title: "关卡不存在",
        content: "这个关卡可能已经调整，请回到语法地图重新选择。",
        showCancel: false,
        success: function () { wx.navigateBack(); }
      });
      return;
    }

    const cleared = store.getProfile().cleared || {};
    const info = unlock.lockInfo(id, cleared);
    if (info.locked) {
      this.blockOnLock(info, cleared);
      return;
    }

    this.levelId = id;
    this.build(level);
  },

  blockOnLock(info, cleared) {
    const prev = info.required;
    const target = unlock.nextPlayable(cleared);
    wx.showModal({
      title: "这一关还没解锁",
      content: "先通过「" + (prev ? prev.name : "上一关") + "」（首答正确率 80% 以上），这一关才会打开。"
        + (target ? "要现在去练「" + target.name + "」吗？" : ""),
      showCancel: true,
      confirmText: target ? "去练" : "知道了",
      cancelText: "回地图",
      success: function (res) {
        if (res.confirm && target) {
          wx.redirectTo({ url: "/pages/level/level?id=" + encodeURIComponent(target.id) });
        } else {
          wx.switchTab({ url: "/pages/map/map" });
        }
      }
    });
  },

  onShow() {
    if (this.levelId && dataset.LEVEL_BY_ID[this.levelId]) {
      this.build(dataset.LEVEL_BY_ID[this.levelId]);
    }
  },

  build(level) {
    const stage = dataset.STAGE_BY_ID[level.stageId] || { name: "", bookNumber: 0 };
    const nodes = dataset.nodesForLevel(level);
    const lesson = dataset.lessonForLevel(level);
    const pool = dataset.questionsForLevel(level.id);
    const poolCount = quiz.countViable(pool);
    const record = store.getProfile().cleared[level.id];
    const clearedMap = store.getProfile().cleared || {};
    const roundCount = Math.min(quiz.ROUND_SIZE, poolCount);

    const levels = orderedLevels();
    let index = -1;
    for (let i = 0; i < levels.length; i += 1) if (levels[i].id === level.id) index = i;
    const prev = index > 0 ? levels[index - 1] : null;
    const next = index >= 0 && index < levels.length - 1 ? levels[index + 1] : null;
    const nextLocked = next ? unlock.lockInfo(next.id, clearedMap).locked : false;

    const scenes = lesson && lesson.scenes ? lesson.scenes.map(function (sentence, i) {
      return {
        en: sentence,
        zh: lesson.translations && lesson.translations[i] ? lesson.translations[i] : ""
      };
    }) : [];

    const book = handout.forLevel(level.id);
    const best = record ? (record.best || record.percent || 0) : 0;

    this.setData({
      id: level.id,
      status: record ? { label: "已通过 · 最佳 " + best + "%", cls: "pill--green" } : { label: "可以开始", cls: "pill--gold" },
      level: {
        name: level.name,
        number: level.number,
        numberLabel: level.number < 10 ? "0" + level.number : "" + level.number,
        stageName: stage.name,
        bookNumber: stage.bookNumber,
        phaseName: "阶段" + (level.phaseIndex === 1 ? "一" : "二"),
        kindLabel: level.kind === "review" ? "巩固关" : "知识点关"
      },
      nodes: nodes.map(function (node) {
        return { id: node.id, name: node.name, shortRule: node.shortRule };
      }),
      lesson: lesson ? { name: lesson.name, rule: lesson.rule, contrast: lesson.contrast, scenes: scenes } : null,
      poolCount: poolCount,
      roundCount: roundCount,
      startLabel: poolCount ? "开始练习 · " + roundCount + " 道" : "这一关暂无题目",
      cleared: record ? { best: record.best || record.percent || 0 } : null,
      prev: prev ? { id: prev.id, name: prev.name } : null,
      next: next ? { id: next.id, name: next.name, locked: nextLocked } : null,
      handout: book ? { pages: book.pages, url: handout.viewerUrl(level.id) } : null
    });
  },

  onStart() {
    if (!this.data.poolCount) {
      wx.showToast({ title: "这一关暂时没有可练的题", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: "/pages/quiz/quiz?mode=level&levelId=" + encodeURIComponent(this.data.id) +
        "&amount=" + this.data.roundCount
    });
  },

  onOpenHandout() {
    const book = this.data.handout;
    if (!book) return;
    wx.navigateTo({ url: book.url });
  },

  onOpenPrev() {
    const prev = this.data.prev;
    if (!prev) return;
    wx.redirectTo({ url: "/pages/level/level?id=" + encodeURIComponent(prev.id) });
  },

  onOpenNext() {
    const next = this.data.next;
    if (!next) return;
    if (next.locked) {
      wx.showModal({
        title: "下一关还没解锁",
        content: "把这一关练到首答正确率 80% 以上（记为通过），「" + next.name + "」才会打开。",
        showCancel: false,
        confirmText: "继续练"
      });
      return;
    }
    wx.redirectTo({ url: "/pages/level/level?id=" + encodeURIComponent(next.id) });
  },

  onBackMap() {
    wx.switchTab({ url: "/pages/map/map" });
  },

  onShareAppMessage() {
    return {
      title: this.data.level ? this.data.level.name + " · 小学英语语法" : "小学英语语法",
      path: "/pages/level/level?id=" + encodeURIComponent(this.data.id)
    };
  }
});
