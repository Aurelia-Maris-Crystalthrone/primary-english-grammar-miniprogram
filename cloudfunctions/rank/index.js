// 云函数：线上全量用户积分排行榜（服务端权威）
const cloud = require("wx-server-sdk");
const B = require("./board");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const USERS = "grammar_users";
const SCORES = "integral_account";
const LOGS = "integral_log";
const SNAPSHOT = "rank_snapshot";
const META = "sys_meta";
const MAX_REFRESH_MS = 60 * 1000; // 榜单准实时，允许分钟级延迟

function now() {
  return new Date();
}

async function findAccount(openid) {
  const res = await db.collection(SCORES).where({ openid: openid }).limit(1).get();
  return res.data.length ? res.data[0] : null;
}

async function ensureAccount(openid) {
  const found = await findAccount(openid);
  if (found) return found;
  const at = now();
  const doc = {
    openid: openid,
    totalScore: 0,
    reachedAt: at,
    updatedAt: at,
    createdAt: at,
    status: "active",
    nickName: "",
    avatar: "",
    authorized: false,
    riskBlocked: false
  };
  const added = await db.collection(SCORES).add({ data: doc });
  return Object.assign({ _id: added._id }, doc);
}

async function getMeta() {
  try {
    const res = await db.collection(META).doc("board").get();
    return res.data || null;
  } catch (error) {
    return null;
  }
}

async function touchMeta(at, total) {
  const patch = { updatedAt: at, dirty: true };
  if (typeof total === "number") patch.total = total;
  try {
    await db.collection(META).doc("board").update({ data: patch });
  } catch (error) {
    await db.collection(META).doc("board").set({
      data: { key: "board", total: total || 0, updatedAt: at, dirty: true }
    });
  }
}

// 积分事件：幂等 + 频控 + 服务端计分
async function report(openid, events) {
  if (!Array.isArray(events) || !events.length) return { ok: false, code: "BAD_EVENTS" };

  const account = await ensureAccount(openid);
  if (!B.isActive(account)) return { ok: true, applied: 0, blocked: true, totalScore: account.totalScore || 0 };

  const since = new Date(Date.now() - 86400000);
  const recent = await db.collection(LOGS)
    .where({ openid: openid, createdAt: _.gte(since) })
    .limit(1000)
    .get();
  const times = recent.data.map(function (row) { return new Date(row.createdAt).getTime(); });

  let totalScore = Number(account.totalScore) || 0;
  let applied = 0;
  const at = now();

  for (let i = 0; i < events.slice(0, 20).length; i += 1) {
    const event = B.normalizeEvent(events[i], openid);
    if (!event) continue;
    if (!B.allowEvent(times, at.getTime())) break;

    const dup = await db.collection(LOGS)
      .where({ openid: openid, eventId: event.eventId })
      .limit(1)
      .get();
    if (dup.data.length) continue;

    await db.collection(LOGS).add({
      data: {
        openid: openid,
        eventId: event.eventId,
        type: event.type,
        delta: event.delta,
        refId: event.refId,
        createdAt: at
      }
    });
    totalScore += event.delta;
    times.push(at.getTime());
    applied += 1;
  }

  if (applied) {
    await db.collection(SCORES).doc(account._id).update({
      data: { totalScore: totalScore, reachedAt: at, updatedAt: at }
    });
    await touchMeta(at);
  }

  return { ok: true, applied: applied, totalScore: totalScore, blocked: false };
}

async function refresh() {
  const accounts = [];
  const size = 100;
  for (let skip = 0; skip < 5000; skip += size) {
    const res = await db.collection(SCORES).skip(skip).limit(size).get();
    accounts.push.apply(accounts, res.data);
    if (res.data.length < size) break;
  }

  const rows = B.buildSnapshot(accounts);

  // 清空旧快照（服务端批量删除），再分批写回
  await db.collection(SNAPSHOT).where({ _id: _.exists(true) }).remove();
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    for (let j = 0; j < batch.length; j += 1) {
      await db.collection(SNAPSHOT).add({ data: batch[j] });
    }
  }

  const at = now();
  await db.collection(META).doc("board").set({
    data: { key: "board", total: rows.length, updatedAt: at, dirty: false }
  });
  return { ok: true, total: rows.length, updatedAt: at.toISOString() };
}

async function adjust(openid, event) {
  const token = process.env.BOARD_ADMIN_TOKEN;
  if (!token || event.adminToken !== token) return { ok: false, code: "FORBIDDEN" };

  const target = String(event.targetOpenid || "");
  const delta = -Math.abs(Math.floor(Number(event.delta) || 0));
  const reason = String(event.reason || "").slice(0, 60);
  if (!target || !delta) return { ok: false, code: "BAD_ADJUST" };

  const account = await findAccount(target);
  if (!account) return { ok: false, code: "NO_ACCOUNT" };
  const eventId = "adjust:" + String(event.eventId || Date.now()).slice(0, 60);
  const dup = await db.collection(LOGS).where({ openid: target, eventId: eventId }).limit(1).get();
  if (dup.data.length) return { ok: true, applied: 0, totalScore: account.totalScore };

  const at = now();
  await db.collection(LOGS).add({
    data: { openid: target, eventId: eventId, type: "adjust", delta: delta, refId: reason, createdAt: at }
  });
  const totalScore = Math.max(0, (Number(account.totalScore) || 0) + delta);
  await db.collection(SCORES).doc(account._id).update({
    data: { totalScore: totalScore, reachedAt: at, updatedAt: at }
  });
  await touchMeta(at);
  return { ok: true, applied: 1, totalScore: totalScore };
}

async function consent(openid, allowed) {
  const account = await ensureAccount(openid);
  let nickName = "";
  let avatar = "";

  if (allowed) {
    const user = await db.collection(USERS).where({ openid: openid }).limit(1).get();
    if (user.data.length) {
      nickName = String(user.data[0].nickName || "").slice(0, 20);
      avatar = B.safeAvatar(user.data[0].avatar, true);
    }
  }

  await db.collection(SCORES).doc(account._id).update({
    data: { authorized: Boolean(allowed), nickName: nickName, avatar: avatar, updatedAt: now() }
  });
  await touchMeta(now());
  return { ok: true, authorized: Boolean(allowed) };
}

async function board(openid, event) {
  let meta = await getMeta();
  const stale = !meta || (Date.now() - new Date(meta.updatedAt).getTime() > MAX_REFRESH_MS);
  if (event.force || stale || meta.dirty) await refresh();
  meta = await getMeta();

  const size = B.slice([], 1, event.pageSize).pageSize;
  const current = Math.max(1, Math.floor(Number(event.page) || 1));
  const start = (current - 1) * size;
  const total = Number(meta && meta.total) || 0;

  const res = await db.collection(SNAPSHOT)
    .orderBy("rank", "asc")
    .skip(start)
    .limit(size)
    .get();

  const mine = await findAccount(openid);
  let myRank = null;
  if (B.isActive(mine)) {
    const found = await db.collection(SNAPSHOT).where({ openid: openid }).limit(1).get();
    if (found.data.length) myRank = found.data[0].rank;
  }

  return {
    ok: true,
    rows: B.sanitize(res.data, openid),
    page: current,
    pageSize: size,
    total: total,
    hasMore: start + size < total,
    myRank: myRank,
    myPoints: mine ? (Number(mine.totalScore) || 0) : 0,
    authorized: mine ? Boolean(mine.authorized) : false,
    updatedAt: meta ? meta.updatedAt : "",
    loggedIn: Boolean(openid)
  };
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();

  // 定时触发器：每 10 分钟重建快照
  if (event.Type === "Timer" || event.action === "refresh") return refresh();

  if (!OPENID) return { ok: false, code: "NO_OPENID", message: "请在小程序内登录后查看" };

  const action = event.action || "board";
  try {
    if (action === "report") return await report(OPENID, event.events);
    if (action === "consent") return await consent(OPENID, event.allowed);
    if (action === "board" || action === "top") return await board(OPENID, event);
    if (action === "adjust") return await adjust(OPENID, event);
    // 旧版 submit 由前端直接上传积分，已废弃，防止篡改
    if (action === "submit") return { ok: false, code: "DEPRECATED", message: "积分以服务端流水为准" };
    return { ok: false, code: "UNKNOWN_ACTION" };
  } catch (error) {
    console.error("[rank] " + action + " 失败", error);
    return { ok: false, code: "SERVER_ERROR", message: String(error && error.message || error) };
  }
};
