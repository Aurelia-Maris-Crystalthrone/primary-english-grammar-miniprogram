const dataset = require("../../utils/dataset");
const account = require("../../utils/account");
const store = require("../../utils/store");
const cloud = require("../../utils/cloud");
const session = require("../../utils/session");
const stageGuard = require("../../utils/stage-guard");

Page({
  data: {
    user: { id: "", name: "", avatar: "", emoji: "🐣" },
    card: { points: 0, cleared: 0, mistakes: 0, answered: 0 },
    totalLevels: dataset.LEVELS.length,
    cloudEnabled: false,
    loggedIn: false,
    accountText: "本机模式",
    accountDesc: "还没开通云开发，学习记录只保存在这台手机",
    stageAvailable: true,
    stageLabel: ""
  },

  onShow() {
    if (!stageGuard.apply(this)) return;
    this.refresh();
  },

  refresh() {
    const user = account.current() || {};
    const card = store.scoreCard();
    const login = session.current();
    const logged = session.isValid(login);
    this.setData({
      user: {
        id: user.id || "",
        name: user.name || "",
        avatar: user.avatar || "",
        emoji: user.emoji || "🐣"
      },
      card: card,
      cloudEnabled: cloud.enabled(),
      loggedIn: logged,
      accountText: logged ? "微信登录 · 已同步" : (cloud.enabled() ? "正在登录…" : "本机模式"),
      accountDesc: logged
        ? "进度和这个微信号绑定，换设备用同一个微信也能找回"
        : "还没开通云开发，学习记录只保存在这台手机"
    });
  },

  onChooseAvatar(event) {
    const url = event.detail && event.detail.avatarUrl;
    if (!url) return;
    const self = this;
    const canSave = typeof wx !== "undefined" && typeof wx.getFileSystemManager === "function";
    if (!canSave) {
      account.update({ avatar: url });
      this.refresh();
      return;
    }
    // 临时路径会过期，存进小程序用户目录才能长期用
    wx.getFileSystemManager().saveFile({
      tempFilePath: url,
      success: function (res) {
        account.update({ avatar: res.savedFilePath });
        self.refresh();
      },
      fail: function () {
        account.update({ avatar: url });
        self.refresh();
      }
    });
  },

  onNameBlur(event) {
    const value = String((event.detail && event.detail.value) || "").trim();
    if (!value) {
      this.refresh();
      return;
    }
    if (value === this.data.user.name) return;

    account.update({ name: value });
    this.refresh();
    wx.showToast({ title: "已保存", icon: "none" });

    const app = typeof getApp === "function" ? getApp() : null;
    if (app && typeof app.syncName === "function") {
      app.syncName(value).then(() => this.refresh()).catch(function () {});
    }
  },

  onRetryLogin() {
    const app = typeof getApp === "function" ? getApp() : null;
    if (!app || typeof app.silentLogin !== "function" || !cloud.enabled()) return;
    wx.showLoading({ title: "登录中", mask: true });
    const self = this;
    app.silentLogin().then(function () {
      wx.hideLoading();
      self.refresh();
    }).catch(function () {
      wx.hideLoading();
      wx.showToast({ title: "还是连不上云服务", icon: "none" });
    });
  },

  onBackToPrimary() {
    stageGuard.backToPrimary(this);
  },

  onGoRank() {
    wx.switchTab({ url: "/pages/rank/rank" });
  },

  onGoGrowth() {
    wx.navigateTo({ url: "/pages/growth/growth" });
  },

  onAboutData() {
    wx.showModal({
      title: "数据存在哪",
      content: "题库随小程序包一起下发，不联网也能刷。学习档案、错题本都存在这台手机上。开启云开发后会用微信登录（openid）建档，只上报积分事件参与全站排行榜：积分以服务端流水为准，不上传本地积分值，也不包含题目作答明细。",
      showCancel: false,
      confirmText: "知道了"
    });
  }
});
