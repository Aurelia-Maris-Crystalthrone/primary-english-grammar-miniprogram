// 本机学员档案（一机一位学员）
const storage = require("./storage");

const KEY = "grammar.account.v1";
const DEFAULT_AVATAR = "🐣";

function nowISO() {
  return new Date().toISOString();
}

function blankUser(id) {
  return {
    id: id || "u1",
    name: "",
    avatar: "",
    emoji: DEFAULT_AVATAR,
    phone: "",
    phoneMasked: "",
    createdAt: nowISO()
  };
}

function pickUser(raw) {
  if (!raw || typeof raw !== "object") return blankUser();
  return {
    id: raw.id || "u1",
    name: typeof raw.name === "string" ? raw.name : "",
    avatar: typeof raw.avatar === "string" ? raw.avatar : "",
    emoji: raw.emoji || DEFAULT_AVATAR,
    phone: typeof raw.phone === "string" ? raw.phone : "",
    phoneMasked: typeof raw.phoneMasked === "string" ? raw.phoneMasked : "",
    createdAt: raw.createdAt || nowISO()
  };
}

function state() {
  const saved = storage.get(KEY, null);

  if (saved && saved.v === 2 && saved.user) {
    return { v: 2, user: pickUser(saved.user), migrated: Boolean(saved.migrated) };
  }

  // 旧版（v1，多学员）：留当时正在用的那位
  if (saved && saved.v === 1 && saved.users && typeof saved.users === "object") {
    const current = saved.users[saved.currentId] || saved.users[Object.keys(saved.users)[0]];
    const next = {
      v: 2,
      user: pickUser(current),
      migrated: Boolean(saved.migrated)
    };
    storage.set(KEY, next);
    return next;
  }

  const fresh = { v: 2, user: blankUser(), migrated: false };
  storage.set(KEY, fresh);
  return fresh;
}

function write(snapshot) {
  storage.set(KEY, snapshot);
  return snapshot;
}

function current() {
  return state().user;
}

function currentId() {
  return state().user.id;
}

function update(patch) {
  const snapshot = state();
  const keys = Object.keys(patch || {});
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key === "id" || key === "createdAt") continue;
    snapshot.user[key] = patch[key];
  }
  write(snapshot);
  return snapshot.user;
}

function hasMigrated() {
  return state().migrated;
}

function markMigrated() {
  const snapshot = state();
  snapshot.migrated = true;
  write(snapshot);
}

function maskPhone(phone) {
  const text = String(phone || "");
  if (text.length < 7) return text;
  return text.slice(0, 3) + "****" + text.slice(-4);
}

function displayName(user) {
  const name = String((user && user.name) || "").trim();
  return name || "小学员";
}

module.exports = {
  KEY: KEY,
  state: state,
  current: current,
  currentId: currentId,
  update: update,
  hasMigrated: hasMigrated,
  markMigrated: markMigrated,
  maskPhone: maskPhone,
  displayName: displayName
};
