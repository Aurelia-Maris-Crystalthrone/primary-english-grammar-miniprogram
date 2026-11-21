const { getProfile } = require("./utils/store");
const session = require("./utils/session");
const cloud = require("./utils/cloud");
const config = require("./utils/config");

App({
  globalData: {
    appName: "伴随英语 · 小学语法",
    lastTab: 0,
    user: null
  },

  onLaunch() {
    // 初始化云开发（环境 ID 在 utils/config.js）。基础库过低或未开通时静默降级为本机模式。
    try {
      if (typeof wx !== "undefined" && wx.cloud && config.cloudEnv) {
        wx.cloud.init({ env: config.cloudEnv, traceUser: true });
      }
    } catch (error) {
      console.warn("[云开发] 初始化失败", error);
    }

    // 只做一次轻量自检：题库与课程数据是否已经随包导出。
    try {
      const questions = require("./data/questions.js");
      const curriculum = require("./data/curriculum.js");
      console.log(
        "[小学语法] 题库 " + questions.meta.total + " 道，课程 " +
        curriculum.stages.length + " 册 / " + curriculum.levels.length + " 关"
      );
    } catch (error) {
      console.error("[小学语法] 数据加载失败", error);
    }
    // 确保学习档案结构完整，避免旧版本数据缺字段。
    getProfile();

    // 先把本地登录态读进内存，页面可以同步拿到
    this.globalData.user = session.current();
    // 没有就静默登录一次（不弹窗、不打断）
    this.silentLogin().catch(function () {});
  },

  // 微信静默登录：云函数自带 OPENID，不需要 wx.login，也没有授权弹窗
  silentLogin() {
    if (!cloud.enabled()) return Promise.resolve(null);

    if (session.isValid()) {
      this.globalData.user = session.current();
      return Promise.resolve(this.globalData.user);
    }

    const cached = session.current();
    const request = cached && cached.openid ? cloud.ensureSession() : cloud.wxLogin();

    return request.then((result) => {
      if (result && result.ok && result.user) {
        const saved = session.save(result.user);
        this.globalData.user = saved;
        return saved;
      }
      this.globalData.user = null;
      return null;
    }).catch(() => {
      // 云端不可用就老实退回本机模式，别影响刷题
      this.globalData.user = null;
      return null;
    });
  },

  syncName(nickName) {
    if (!cloud.enabled() || !nickName) return Promise.resolve(null);
    return cloud.updateProfile({ nickName: nickName }).then((result) => {
      if (result && result.ok && result.user) {
        const saved = session.save(result.user);
        this.globalData.user = saved;
        return saved;
      }
      return null;
    }).catch(function () {
      return null;
    });
  },

  setUser(user) {
    this.globalData.user = user || null;
  },

  clearUser() {
    session.clear();
    this.globalData.user = null;
  }
});
