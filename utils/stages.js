// 学段：小学 / 中学 / 大学 / 雅思 / 托福
// 大学下分四六级、考研；考研再分英语一、英语二。
// 现在只有小学有真题库，其余学段 available 一律 false。
const storage = require("./storage");

const KEY = "grammar.stage.v1";

const STAGES = [
  {
    id: "primary",
    name: "小学",
    desc: "六册语法闯关 · 8 大语法分类",
    available: true,
    contentKey: "primary"
  },
  {
    id: "middle",
    name: "中学",
    desc: "初中 / 高中语法体系",
    available: false,
    contentKey: ""
  },
  {
    id: "university",
    name: "大学",
    desc: "大学英语考试方向",
    available: false,
    contentKey: "",
    subStages: [
      { id: "cet", name: "四六级", sub: "CET-4 / CET-6", available: false, contentKey: "" },
      {
        id: "kaoyan",
        name: "考研",
        sub: "英语一 / 英语二",
        available: false,
        contentKey: "",
        children: [
          { id: "eng1", name: "英语一", available: false, contentKey: "" },
          { id: "eng2", name: "英语二", available: false, contentKey: "" }
        ]
      }
    ]
  },
  { id: "ielts", name: "雅思", desc: "IELTS 语法与长难句", available: false, contentKey: "" },
  { id: "toefl", name: "托福", desc: "TOEFL 语法与长难句", available: false, contentKey: "" }
];

function findById(list, id) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function stageById(id) {
  return findById(STAGES, id);
}

// 读本地选择。存了脏数据就当没选过，回到小学。
function current() {
  const saved = storage.get(KEY, null) || {};
  const stage = stageById(saved.stageId);
  if (!stage) return { stageId: "primary", subId: "", childId: "" };

  let subId = "";
  let childId = "";
  if (stage.subStages && stage.subStages.length) {
    const sub = findById(stage.subStages, saved.subId) || stage.subStages[0];
    subId = sub.id;
    const kids = sub.children || [];
    if (kids.length) childId = findById(kids, saved.childId) ? saved.childId : kids[0].id;
  }
  return { stageId: stage.id, subId: subId, childId: childId };
}

function select(stageId) {
  const stage = stageById(stageId);
  if (!stage) return current();

  const sub = stage.subStages && stage.subStages[0];
  const kids = sub && sub.children ? sub.children : [];
  storage.set(KEY, {
    stageId: stage.id,
    subId: sub ? sub.id : "",
    childId: kids.length ? kids[0].id : ""
  });
  return current();
}

function selectSub(subId) {
  const cur = current();
  const stage = stageById(cur.stageId);
  const sub = stage && findById(stage.subStages || [], subId);
  if (!sub) return cur;

  const kids = sub.children || [];
  storage.set(KEY, {
    stageId: stage.id,
    subId: sub.id,
    childId: kids.length ? kids[0].id : ""
  });
  return current();
}

function selectChild(childId) {
  const cur = current();
  const stage = stageById(cur.stageId);
  const sub = stage && findById(stage.subStages || [], cur.subId);
  if (!sub || !findById(sub.children || [], childId)) return cur;

  storage.set(KEY, { stageId: stage.id, subId: sub.id, childId: childId });
  return current();
}

function activeStage() {
  return stageById(current().stageId);
}

function activeSub() {
  const cur = current();
  const stage = stageById(cur.stageId);
  return stage ? findById(stage.subStages || [], cur.subId) : null;
}

function activeChild() {
  const sub = activeSub();
  return sub ? findById(sub.children || [], current().childId) : null;
}

// 页面直接拿这个渲染，不用自己拼层级
function viewModel() {
  const cur = current();
  const stage = stageById(cur.stageId) || STAGES[0];
  const sub = activeSub();
  const child = activeChild();

  const stages = STAGES.map(function (item) {
    return {
      id: item.id,
      name: item.name,
      available: Boolean(item.available),
      active: item.id === cur.stageId,
      hasSub: Boolean(item.subStages && item.subStages.length)
    };
  });

  const subStages = (stage.subStages || []).map(function (item) {
    return {
      id: item.id,
      name: item.name,
      sub: item.sub,
      available: Boolean(item.available),
      active: item.id === cur.subId
    };
  });

  const children = ((sub && sub.children) || []).map(function (item) {
    return {
      id: item.id,
      name: item.name,
      available: Boolean(item.available),
      active: item.id === cur.childId
    };
  });

  let label = stage.name;
  if (sub) label += " · " + sub.name;
  if (child) label += " · " + child.name;

  return {
    stageId: cur.stageId,
    subId: cur.subId,
    childId: cur.childId,
    contentKey: stage.contentKey || "",
    stageName: stage.name,
    stageDesc: stage.desc,
    stageLabel: label,
    available: Boolean(stage.available),
    stages: stages,
    subStages: subStages,
    children: children,
    showSub: subStages.length > 0,
    showChild: children.length > 0
  };
}

module.exports = {
  STAGES: STAGES,
  current: current,
  select: select,
  selectSub: selectSub,
  selectChild: selectChild,
  activeStage: activeStage,
  activeSub: activeSub,
  activeChild: activeChild,
  viewModel: viewModel
};
