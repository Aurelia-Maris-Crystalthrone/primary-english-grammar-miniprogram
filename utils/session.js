// 登录态（微信静默登录，本机缓存 + 过期校验）
const storage = require("./storage");

const KEY = "grammar.session.v1";
const TTL_DAYS = 30;

function nowMs() {
  return Date.now();
}

function read() {
  const saved = storage.get(KEY, null);
  if (!saved || saved.v !== 1 || !saved.openid) return null;
  return saved;
}

function isEmpty(value) {
  return value === undefined || value === null || value === "";
}

function isValid(session) {
  const data = session === undefined ? read() : session;
  if (!data || !data.openid) return false;
  const expireAt = Number(data.expireAt) || 0;
  return expireAt > nowMs();
}

function save(user) {
  if (!user || !user.openid) return null;
  const session = {
    v: 1,
    openid: user.openid,
    userId: user.id || "",
    nickName: user.nickName || "",
    avatar: user.avatar || "",
    // 手机号是可选的（绑定过才有），只落脱敏号
    phoneMasked: user.phoneMasked || "",
    loginAt: user.loginAt || new Date().toISOString(),
    expireAt: nowMs() + TTL_DAYS * 24 * 60 * 60 * 1000
  };
  storage.set(KEY, session);
  return session;
}

function clear() {
  storage.remove(KEY);
}

function current() {
  return read();
}

function remainingDays() {
  const session = read();
  if (!isValid(session)) return 0;
  return Math.max(1, Math.ceil((session.expireAt - nowMs()) / (24 * 60 * 60 * 1000)));
}

// 是否需要走一次云端登录（静默，用户无感）
function needsLogin(cloudEnabled) {
  if (!cloudEnabled) return false;
  return !isValid();
}

module.exports = {
  KEY: KEY,
  TTL_DAYS: TTL_DAYS,
  read: read,
  save: save,
  clear: clear,
  current: current,
  isValid: isValid,
  remainingDays: remainingDays,
  needsLogin: needsLogin,
  isEmpty: isEmpty
};
