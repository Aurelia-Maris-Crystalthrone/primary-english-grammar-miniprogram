// 微信云开发适配层（可选）
const config = require("./config");

let inited = false;

function hasApi() {
  return typeof wx !== "undefined" && wx && typeof wx.cloud === "object" && wx.cloud;
}

function enabled() {
  return Boolean(config.cloudEnv) && hasApi();
}

function init() {
  if (!enabled()) return false;
  if (inited) return true;
  try {
    wx.cloud.init({ env: config.cloudEnv, traceUser: true });
    inited = true;
    return true;
  } catch (error) {
    console.warn("[云开发] 初始化失败", error);
    return false;
  }
}

function call(name, data) {
  return new Promise(function (resolve, reject) {
    if (!init()) {
      reject(new Error("cloud-disabled"));
      return;
    }
    wx.cloud.callFunction({
      name: name,
      data: data || {},
      success: function (res) {
        resolve(res && res.result ? res.result : null);
      },
      fail: function (error) {
        reject(error);
      }
    });
  });
}

// 旧 rank 云函数（积分流水 / 榜单快照）的前端调用已全部移除

// 微信静默登录：云函数自带 OPENID，不需要任何授权弹窗
function wxLogin(nickName) {
  if (!init()) return Promise.reject(new Error("cloud-disabled"));
  return call("login", { action: "wx", nickName: nickName || "" });
}

function updateProfile(patch) {
  if (!init()) return Promise.reject(new Error("cloud-disabled"));
  const payload = Object.assign({ action: "profile" }, patch || {});
  return call("login", payload);
}

function loginPhone(code) {
  if (!init()) return Promise.reject(new Error("cloud-disabled"));
  return call("login", { action: "phone", code: code });
}

function ensureSession() {
  if (!init()) return Promise.reject(new Error("cloud-disabled"));
  return call("login", { action: "session" });
}

function logoutRemote() {
  if (!init()) return Promise.resolve(null);
  return Promise.resolve(null);
}

module.exports = {
  enabled: enabled,
  init: init,
  wxLogin: wxLogin,
  updateProfile: updateProfile,
  loginPhone: loginPhone,
  ensureSession: ensureSession,
  logoutRemote: logoutRemote
};
