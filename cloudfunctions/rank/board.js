// 排行榜纯逻辑（不依赖云环境，可被 Node 自测直接 require）
const RULES = {
  level_clear: 10, // 通关一关（按关卡幂等）
  correction: 3,   // 首次答错后改对（按题目幂等）
  session: 5       // 完成一轮练习
};

const MAX_PER_MINUTE = 40;
const MAX_PER_DAY = 400;

function scoreFor(type) {
  return RULES[String(type || "")] || 0;
}

function normalizeEvent(raw, openid) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "");
  const delta = scoreFor(type);
  if (!delta) return null;
  const eventId = String(raw.eventId || "").slice(0, 80);
  if (!eventId) return null;
  return {
    openid: String(openid || ""),
    eventId: eventId,
    type: type,
    delta: delta,
    refId: String(raw.refId || "").slice(0, 80)
  };
}

function allowEvent(recentTimes, now) {
  const perMinute = recentTimes.filter(function (t) { return now - t < 60000; }).length;
  const perDay = recentTimes.filter(function (t) { return now - t < 86400000; }).length;
  return perMinute < MAX_PER_MINUTE && perDay < MAX_PER_DAY;
}

// 未授权显示「用户***」
function maskName(name, authorized) {
  const text = String(name || "").trim();
  if (!authorized || !text) return "用户***";
  const chars = Array.from(text);
  if (chars.length <= 2) return chars[0] + "*";
  return chars[0] + "***" + chars[chars.length - 1];
}

function safeAvatar(avatar, authorized) {
  const url = String(avatar || "");
  if (!authorized || !/^(https:\/\/|cloud:\/\/)/.test(url)) return "";
  return url.slice(0, 300);
}

function publicId(openid) {
  let hash = 5381;
  const text = String(openid || "");
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return "u" + hash.toString(36);
}

function timeOf(value) {
  const time = value ? new Date(value).getTime() : 0;
  return isNaN(time) ? 0 : time;
}

function isActive(account) {
  return account && account.status !== "closed" && account.status !== "banned"
    && account.status !== "test" && !account.riskBlocked;
}

function compare(left, right) {
  const lp = Number(left.totalScore) || 0;
  const rp = Number(right.totalScore) || 0;
  if (lp !== rp) return rp - lp;
  const lt = timeOf(left.reachedAt);
  const rt = timeOf(right.reachedAt);
  if (lt !== rt) return lt - rt;
  const lo = String(left.openid || "");
  const ro = String(right.openid || "");
  return lo < ro ? -1 : (lo > ro ? 1 : 0);
}

function buildSnapshot(accounts) {
  const active = (accounts || []).filter(isActive);
  active.sort(compare);
  return active.map(function (account, index) {
    return {
      rank: index + 1,
      openid: account.openid || "",
      id: publicId(account.openid),
      name: maskName(account.nickName, account.authorized),
      avatar: safeAvatar(account.avatar, account.authorized),
      totalScore: Number(account.totalScore) || 0,
      reachedAt: account.reachedAt || account.updatedAt || ""
    };
  });
}

function pageSizeOf(value) {
  const size = Math.floor(Number(value) || 50);
  return Math.min(Math.max(size, 1), 100);
}

function slice(rows, page, pageSize) {
  const size = pageSizeOf(pageSize);
  const current = Math.max(1, Math.floor(Number(page) || 1));
  const start = (current - 1) * size;
  return {
    rows: rows.slice(start, start + size),
    page: current,
    pageSize: size,
    total: rows.length,
    hasMore: start + size < rows.length
  };
}

function rankOf(rows, openid) {
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].openid === openid) return rows[i].rank;
  }
  return null;
}

// 出参清洗：去掉 openid / reachedAt 等内部字段，只加一个 me 标记
function sanitize(rows, openid) {
  return rows.map(function (row) {
    return {
      rank: row.rank,
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      totalScore: row.totalScore,
      me: Boolean(openid) && row.openid === openid
    };
  });
}

module.exports = {
  RULES: RULES,
  scoreFor: scoreFor,
  normalizeEvent: normalizeEvent,
  allowEvent: allowEvent,
  maskName: maskName,
  safeAvatar: safeAvatar,
  buildSnapshot: buildSnapshot,
  slice: slice,
  rankOf: rankOf,
  sanitize: sanitize,
  isActive: isActive
};
