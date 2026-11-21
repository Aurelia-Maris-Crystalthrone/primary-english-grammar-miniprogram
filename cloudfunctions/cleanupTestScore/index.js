// 清理联调期那条测试分数。只认 TARGETS 里的 _id，四项特征对不上就跳过；{"preview":true} 先看不删。
// 用完删掉这个目录。
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const COLLECTION = "grammar_scores";

// 来自云控制台测试截图：2026-11-05T16:56:50.147Z 写入的 100 分、无昵称头像的测试记录
const TARGETS = [
  {
    _id: "oFMRP3V1lRSOfwfSecf2OLUNTghI",
    score: 100,
    updatedAtPrefix: "2026-11-05T16:56"
  }
];

exports.main = async (event = {}) => {
  const preview = event.preview === true;
  const result = { success: true, preview: preview, matched: [], deleted: [], skipped: [] };

  for (const target of TARGETS) {
    let doc = null;
    try {
      const snap = await db.collection(COLLECTION).doc(target._id).get();
      doc = snap && snap.data;
    } catch (e) {
      result.skipped.push({ _id: target._id, reason: "not-found" });
      continue;
    }

    const updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : "";
    const brief = {
      _id: target._id,
      score: doc.score,
      nickName: doc.nickName || "",
      avatarUrl: doc.avatarUrl || "",
      updatedAt: updatedAt
    };

    const isTestDoc =
      Number(doc.score) === target.score &&
      !doc.nickName &&
      !doc.avatarUrl &&
      updatedAt.indexOf(target.updatedAtPrefix) === 0;

    if (!isTestDoc) {
      result.skipped.push(Object.assign({ reason: "not-test-doc" }, brief));
      continue;
    }

    result.matched.push(brief);
    if (!preview) {
      try {
        await db.collection(COLLECTION).doc(target._id).remove();
        result.deleted.push(target._id);
      } catch (e) {
        result.skipped.push(Object.assign({ reason: "remove-failed", error: String(e && (e.errMsg || e.message) || e) }, brief));
      }
    }
  }

  return result;
};
