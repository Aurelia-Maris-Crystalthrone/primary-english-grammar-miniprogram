// 简易排行榜（getLeaderboard / uploadScore 方案）前端封装
const session = require("./session");
const cloud = require("./cloud");

// 上传 / 更新当前用户最高分
async function uploadScore(currentScore, userInfo) {
  // init() 幂等，保证云 SDK 已就绪，不依赖 app.js onLaunch 的执行时序
  if (!cloud.enabled() || !cloud.init()) return { ok: false, reason: "cloud-off" };

  const s = session.current();
  const payload = {
    score: Number(currentScore) || 0,
    nickName: (userInfo && userInfo.nickName) || (s && s.nickName) || "",
    avatarUrl: (userInfo && userInfo.avatarUrl) || (s && s.avatar) || ""
  };

  try {
    const res = await wx.cloud.callFunction({ name: "uploadScore", data: payload });
    const result = res && res.result;
    if (result && result.success) return { ok: true, action: result.action };
    console.error("上传分数失败", result);
    return { ok: false, reason: "cloud-failed", error: result };
  } catch (err) {
    console.error("上传分数失败", err);
    return { ok: false, reason: "cloud-error", error: err };
  }
}

// 调用 getLeaderboard 云函数
async function getRank() {
  if (!cloud.enabled() || !cloud.init()) return null;
  try {
    const res = await wx.cloud.callFunction({ name: "getLeaderboard" });
    const result = res && res.result;
    if (result && result.success) {
      return {
        list: Array.isArray(result.data) ? result.data : [],
        myOpenid: result.myOpenid || ""
      };
    }
    console.error("获取排行榜失败", result);
    return null;
  } catch (err) {
    console.error("调用 getLeaderboard 失败", err);
    return null;
  }
}

module.exports = { uploadScore, getRank };
