const dataset = require("../../utils/dataset");
const store = require("../../utils/store");
const quiz = require("../../utils/quiz");
const format = require("../../utils/format");
const unlock = require("../../utils/unlock");
const stageGuard = require("../../utils/stage-guard");

function stageLevels(stageId) {
  return dataset.levelsForStage(stageId).slice().sort(function (left, right) {
    return left.number - right.number;
  });
}

function phaseQuestions(levelIds) {
  let pool = [];
  for (let i = 0; i < levelIds.length; i += 1) {
    pool = pool.concat(dataset.questionsForLevel(levelIds[i]));
  }
  return pool;
}

Page({
  data: {
    stages: [],
    activeStageId: "",
    stage: null,
    phases: [],
    totalCleared: 0,
    totalLevels: 0,
    stageAvailable: true,
    stageLabel: ""
  },

  onShow() {
    if (!stageGuard.apply(this)) return;
    this.refresh(this.data.activeStageId);
  },

  onLoad() {
    if (!stageGuard.apply(this)) return;
    this.refresh("");
  },

  refresh(preferredStageId) {
    const profile = store.getProfile();
    const cleared = profile.cleared || {};

    const stages = dataset.STAGES.map(function (stage) {
      const levels = stageLevels(stage.id);
      let clearedCount = 0;
      for (let i = 0; i < levels.length; i += 1) if (cleared[levels[i].id]) clearedCount += 1;
      return {
        id: stage.id,
        name: stage.name,
        bookNumber: stage.bookNumber,
        label: "第 " + stage.bookNumber + " 册",
        levelCount: levels.length,
        clearedCount: clearedCount,
        percent: format.percent(clearedCount, levels.length),
        active: false
      };
    });

    let activeId = preferredStageId;
    if (!activeId) {
      // 默认停在新手最该去的那一册：第一个还有未通关关卡的册
      for (let i = 0; i < stages.length; i += 1) {
        if (stages[i].clearedCount < stages[i].levelCount) {
          activeId = stages[i].id;
          break;
        }
      }
    }
    if (!activeId) activeId = stages[0].id;

    for (let i = 0; i < stages.length; i += 1) stages[i].active = stages[i].id === activeId;

    const stage = dataset.STAGE_BY_ID[activeId];
    const phases = this.buildPhases(activeId, cleared);

    let totalCleared = 0;
    for (let i = 0; i < stages.length; i += 1) totalCleared += stages[i].clearedCount;

    this.setData({
      stages: stages,
      activeStageId: activeId,
      stage: {
        id: stage.id,
        name: stage.name,
        bookNumber: stage.bookNumber,
        guide: stage.unnumberedGuide || ""
      },
      phases: phases,
      totalCleared: totalCleared,
      totalLevels: dataset.LEVELS.length
    });
  },

  buildPhases(stageId, cleared) {
    const profile = store.getProfile();
    const phases = dataset.phasesForStage(stageId);

    return phases.map(function (phase) {
      const levels = phase.levelIds.map(function (id) {
        return dataset.LEVEL_BY_ID[id];
      }).filter(Boolean).sort(function (left, right) { return left.number - right.number; });

      const items = levels.map(function (level) {
        const record = cleared[level.id];
        const count = quiz.countViable(dataset.questionsForLevel(level.id));
        const best = record ? (record.best || record.percent || 0) : 0;
        const info = unlock.lockInfo(level.id, cleared);
        let metaLine = count + " 道可练";
        if (record) metaLine = "最佳 " + best + "% · " + count + " 道可练";
        else if (info.locked) metaLine = "先过「" + (info.required ? info.required.name : "上一关") + "」";
        return {
          id: level.id,
          name: level.name,
          number: level.number,
          numberLabel: level.number < 10 ? "0" + level.number : "" + level.number,
          kindLabel: level.kind === "review" ? "巩固" : "知识点",
          cleared: Boolean(record),
          locked: info.locked,
          best: best,
          count: count,
          metaLine: metaLine
        };
      });

      let clearedCount = 0;
      for (let i = 0; i < items.length; i += 1) if (items[i].cleared) clearedCount += 1;

      const pool = phaseQuestions(phase.levelIds);
      const examRecord = profile.exams[phase.id];
      const examBest = examRecord ? (examRecord.best || examRecord.percent || 0) : 0;
      let examTag = "挑战";
      if (examRecord && examRecord.passed) examTag = "已通过";
      else if (examRecord) examTag = examBest + "%";

      return {
        id: phase.id,
        name: phase.name,
        index: phase.index,
        levels: items,
        clearedCount: clearedCount,
        levelCount: items.length,
        percent: format.percent(clearedCount, items.length),
        exam: {
          count: quiz.countViable(pool),
          best: examBest,
          passed: Boolean(examRecord && examRecord.passed),
          tag: examTag
        }
      };
    });
  },

  onBackToPrimary() {
    stageGuard.backToPrimary(this);
  },

  onSelectStage(event) {
    const id = event.currentTarget.dataset.id;
    if (id === this.data.activeStageId) return;
    this.refresh(id);
  },

  onOpenLevel(event) {
    const id = event.currentTarget.dataset.id;
    const cleared = store.getProfile().cleared || {};
    const info = unlock.lockInfo(id, cleared);
    if (info.locked) {
      const prev = info.required;
      wx.showModal({
        title: "这一关还没解锁",
        content: "先通过「" + (prev ? prev.name : "上一关") + "」（首答正确率 80% 以上），这一关才会打开。",
        showCancel: false,
        confirmText: "知道了"
      });
      return;
    }
    wx.navigateTo({ url: "/pages/level/level?id=" + encodeURIComponent(id) });
  },

  onStartExam(event) {
    const phaseId = event.currentTarget.dataset.id;
    const stageId = this.data.activeStageId;
    wx.navigateTo({
      url: "/pages/quiz/quiz?mode=phase&phaseId=" + encodeURIComponent(phaseId) +
        "&stageId=" + encodeURIComponent(stageId) + "&amount=20"
    });
  },

  onGoGrowth() {
    wx.navigateTo({ url: "/pages/growth/growth" });
  }
});
