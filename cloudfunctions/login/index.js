// 微信静默登录 + 档案。action: wx（默认建档）/ profile（改昵称头像）/ phone（选配）。
// openid 只认云端上下文，前端传的身份字段一律不收。
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const USERS = "grammar_users";

function maskPhone(phone) {
  const text = String(phone || "");
  if (text.length < 7) return text;
  return text.slice(0, 3) + "****" + text.slice(-4);
}

function publicUser(doc) {
  if (!doc) return null;
  return {
    id: doc._id || "",
    openid: doc.openid || "",
    nickName: doc.nickName || "",
    avatar: doc.avatar || "",
    phoneMasked: doc.phoneMasked || "",
    createdAt: doc.createdAt || "",
    loginAt: doc.lastLoginAt || doc.updatedAt || doc.createdAt || ""
  };
}

async function findUser(openid) {
  const res = await db.collection(USERS).where({ openid }).limit(1).get();
  return res.data.length ? res.data[0] : null;
}

exports.main = async (event = {}) => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext();
  const action = event.action || "wx";

  if (!OPENID) {
    return { ok: false, code: "NO_OPENID", message: "拿不到 openid，请在小程序内调用" };
  }

  /* ---------- 1. 微信静默登录（默认） ---------- */
  if (action === "wx" || action === "session") {
    const existing = await findUser(OPENID);

    if (existing) {
      await db.collection(USERS).doc(existing._id).update({
        data: { lastLoginAt: db.serverDate(), updatedAt: db.serverDate() }
      });
      return {
        ok: true,
        openid: OPENID,
        user: publicUser(Object.assign({}, existing, { lastLoginAt: new Date().toISOString() })),
        isNew: false
      };
    }

    const now = db.serverDate();
    const created = {
      openid: OPENID,
      unionid: UNIONID || "",
      appid: APPID || "",
      nickName: String(event.nickName || "").slice(0, 20),
      avatar: "",
      phone: "",
      phoneMasked: "",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
      loginCount: 1
    };
    const added = await db.collection(USERS).add({ data: created });

    return {
      ok: true,
      openid: OPENID,
      user: publicUser(Object.assign({ _id: added._id }, created, {
        lastLoginAt: new Date().toISOString()
      })),
      isNew: true
    };
  }

  /* ---------- 2. 更新昵称头像 ---------- */
  if (action === "profile") {
    const existing = await findUser(OPENID);
    if (!existing) return { ok: false, code: "NEED_LOGIN", message: "请先登录" };

    const patch = { updatedAt: db.serverDate() };
    if (typeof event.nickName === "string") {
      patch.nickName = event.nickName.trim().slice(0, 20);
    }
    // 只接受云存储 fileID 或 https 地址；chooseAvatar 给的本地临时路径存了也没用
    if (typeof event.avatar === "string" && /^(cloud:\/\/|https:\/\/)/.test(event.avatar)) {
      patch.avatar = event.avatar;
    }

    await db.collection(USERS).doc(existing._id).update({ data: patch });
    return {
      ok: true,
      openid: OPENID,
      user: publicUser(Object.assign({}, existing, {
        nickName: patch.nickName === undefined ? existing.nickName : patch.nickName,
        avatar: patch.avatar === undefined ? existing.avatar : patch.avatar
      }))
    };
  }

  /* ---------- 3. 可选：绑定手机号 ---------- */
  if (action === "phone") {
    if (!event.code) return { ok: false, code: "MISSING_CODE", message: "缺少 code" };

    let phoneInfo = null;
    try {
      const res = await cloud.openapi.phonenumber.getPhoneNumber({ code: event.code });
      phoneInfo = (res && res.phoneInfo) || null;
    } catch (error) {
      // 常见原因：code 过期（5 分钟）、code 已用过、主体不是非个人主体
      return {
        ok: false,
        code: "PHONE_VERIFY_FAILED",
        message: (error && (error.errMsg || error.message)) || "手机号验证失败"
      };
    }

    const phone = (phoneInfo && (phoneInfo.purePhoneNumber || phoneInfo.phoneNumber)) || "";
    if (!phone) return { ok: false, code: "EMPTY_PHONE", message: "微信没有返回手机号" };

    const patch = {
      phone,
      phoneMasked: maskPhone(phone),
      countryCode: (phoneInfo && phoneInfo.countryCode) || "86",
      updatedAt: db.serverDate()
    };

    const existing = await findUser(OPENID);
    if (existing) {
      await db.collection(USERS).doc(existing._id).update({ data: patch });
    } else {
      const now = db.serverDate();
      await db.collection(USERS).add({
        data: Object.assign({
          openid: OPENID,
          unionid: UNIONID || "",
          appid: APPID || "",
          nickName: "",
          avatar: "",
          createdAt: now,
          lastLoginAt: now,
          loginCount: 1
        }, patch)
      });
    }

    return { ok: true, openid: OPENID, phoneMasked: patch.phoneMasked };
  }

  return { ok: false, code: "UNKNOWN_ACTION", message: "不支持的 action：" + action };
};
