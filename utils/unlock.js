// 关卡解锁规则（线性闯关）
const dataset = require("./dataset");

let order = null;

function orderLevels() {
  if (order) return order;
  const bookNumber = {};
  dataset.STAGES.forEach(function (stage) {
    bookNumber[stage.id] = stage.bookNumber;
  });
  order = dataset.LEVELS.slice().sort(function (left, right) {
    const a = bookNumber[left.stageId] || 0;
    const b = bookNumber[right.stageId] || 0;
    if (a !== b) return a - b;
    return left.number - right.number;
  });
  return order;
}

function indexOf(levelId) {
  const list = orderLevels();
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].id === levelId) return i;
  }
  return -1;
}

function previousOf(levelId) {
  const list = orderLevels();
  const index = indexOf(levelId);
  return index > 0 ? list[index - 1] : null;
}

function nextOf(levelId) {
  const list = orderLevels();
  const index = indexOf(levelId);
  return index >= 0 && index < list.length - 1 ? list[index + 1] : null;
}

function isUnlocked(levelId, cleared) {
  const passed = cleared || {};
  if (passed[levelId]) return true;
  const index = indexOf(levelId);
  if (index < 0) return false;
  if (index === 0) return true;
  const prev = orderLevels()[index - 1];
  return Boolean(passed[prev.id]);
}

function lockInfo(levelId, cleared) {
  const unlocked = isUnlocked(levelId, cleared);
  const prev = previousOf(levelId);
  const stage = prev ? dataset.STAGE_BY_ID[prev.stageId] : null;
  return {
    locked: !unlocked,
    required: unlocked || !prev ? null : {
      id: prev.id,
      name: prev.name,
      number: prev.number,
      bookNumber: stage ? stage.bookNumber : 0
    }
  };
}

function nextPlayable(cleared) {
  const list = orderLevels();
  const passed = cleared || {};
  for (let i = 0; i < list.length; i += 1) {
    if (!passed[list[i].id] && isUnlocked(list[i].id, passed)) return list[i];
  }
  return null;
}

function unlockedCount(cleared) {
  const list = orderLevels();
  let count = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (isUnlocked(list[i].id, cleared)) count += 1;
  }
  return count;
}

module.exports = {
  orderLevels: orderLevels,
  indexOf: indexOf,
  previousOf: previousOf,
  nextOf: nextOf,
  isUnlocked: isUnlocked,
  lockInfo: lockInfo,
  nextPlayable: nextPlayable,
  unlockedCount: unlockedCount
};
