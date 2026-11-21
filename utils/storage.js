// 极薄的本地存储封装
const memory = {};

function nativeStorage() {
  if (typeof wx !== "undefined" && wx && typeof wx.getStorageSync === "function") return wx;
  return null;
}

function get(key, fallback) {
  const api = nativeStorage();
  try {
    const value = api ? api.getStorageSync(key) : memory[key];
    if (value === "" || value === null || value === undefined) return fallback;
    return value;
  } catch (error) {
    return fallback;
  }
}

function set(key, value) {
  const api = nativeStorage();
  try {
    if (api) api.setStorageSync(key, value);
    else memory[key] = value;
  } catch (error) {
    console.warn("本地存储写入失败", error);
  }
}

function remove(key) {
  const api = nativeStorage();
  try {
    if (api) api.removeStorageSync(key);
    else delete memory[key];
  } catch (error) {
    /* ignore */
  }
}

module.exports = { get, set, remove };
