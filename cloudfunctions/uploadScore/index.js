// 写入 / 更新最高分。openid 取云端上下文，低分不覆盖；昵称头像只在本次有传且合法时才动。
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: "NO_OPENID" };

  const score = Math.max(0, Number(event.score) || 0);
  const nickName = String(event.nickName || "").slice(0, 20);
  const avatarUrl = /^(cloud:\/\/|https:\/\/)/.test(event.avatarUrl || "")
    ? event.avatarUrl
    : "";

  const doc = db.collection("grammar_scores").doc(OPENID);

  try {
    // 文档不存在时 doc.get() 会抛错，用 catch 当作「首次上榜」
    let existing = null;
    try {
      const snap = await doc.get();
      existing = snap && snap.data;
    } catch (e) {
      existing = null;
    }

    if (!existing) {
      // set 在文档不存在时会创建，天然以 OPENID 为主键，防并发重复
      await doc.set({
        data: {
          score: score,
          nickName: nickName,
          avatarUrl: avatarUrl,
          updatedAt: db.serverDate()
        }
      });
      return { success: true, action: "add", score: score };
    }

    const oldScore = Number(existing.score) || 0;
    const keepHigher = oldScore > score;
    const patch = {
      score: keepHigher ? oldScore : score,
      updatedAt: db.serverDate()
    };
    if (nickName) patch.nickName = nickName;
    if (avatarUrl) patch.avatarUrl = avatarUrl;

    await doc.update({ data: patch });
    return { success: true, action: "update", score: patch.score, keptHigher: keepHigher };
  } catch (err) {
    console.error("写入分数失败", err);
    return {
      success: false,
      error: String((err && (err.errMsg || err.message)) || err)
    };
  }
};
