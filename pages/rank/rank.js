// 全站用户积分排行榜
const dataset = require("../../utils/dataset");
const account = require("../../utils/account");
const store = require("../../utils/store");
const cloud = require("../../utils/cloud");
const leaderboard = require("../../utils/leaderboard");
const storage = require("../../utils/storage");
const stageGuard = require("../../utils/stage-guard");

const MEDALS = ["🥇", "🥈", "🥉"];
const CONSENT_KEY = "grammar.rank.consent.v1";

function readConsent() {
  const value = storage.get(CONSENT_KEY, false);
  return value === true || value === "true";
}

function localMe() {
  const user = account.current() || {};
  const card = store.scoreCard();
  return {
    id: user.id || "u1",
    name: account.displayName(user),
    avatar: user.avatar || "",
    emoji: user.emoji || "🐣",
    points: card.points,
    cleared: card.cleared,
    answered: card.answered,
    corrected: card.corrected,
    mistakes: card.mistakes,
    streak: card.streak,
    exams: card.exams,
    mastered: card.mastered,
    mainNo: card.points,
    mainUnit: "分"
  };
}

function pad(value) {
  return value < 10 ? "0" + value : "" + value;
}

function timeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

Page({
  data: {
    state: "loading", // loading | ready | empty | error | off
    rows: [],
    page: 1,
    hasMore: false,
    loadingMore: false,
    total: 0,
    updatedAt: "",
    myRank: null,
    myPoints: 0,
    myName: "用户***",
    loggedIn: false,
    authorized: readConsent(),
    errorText: "",
    totalLevels: dataset.LEVELS.length,
    me: localMe(),
    cloudState: "off" // 兼容旧版本自测的降级标记
  },

  onShow() {
    // 排行榜是全站积分，内容不随学段变化，只同步导航栏标题
    stageGuard.syncTitle();
    this.loadBoard();
  },

  onPullDownRefresh() {
    this.loadBoard().then(function () {
      if (typeof wx !== "undefined" && wx.stopPullDownRefresh) wx.stopPullDownRefresh();
    }, function () {
      if (typeof wx !== "undefined" && wx.stopPullDownRefresh) wx.stopPullDownRefresh();
    });
  },

  // 主榜单唯一数据来源：getLeaderboard 云函数（grammar_scores 前 50）
  loadBoard() {
    const self = this;

    if (!cloud.enabled()) {
      const me = localMe();
      this.setData({
        state: "off", cloudState: "off", rows: [], hasMore: false, total: 0,
        myRank: null, myPoints: me.points, loadingMore: false, errorText: ""
      });
      return Promise.resolve(null);
    }

    this.setData({ state: "loading", cloudState: "loading", errorText: "", loadingMore: false });

    return leaderboard.getRank().then(function (board) {
      if (!board || !Array.isArray(board.list)) {
        self.setData({
          state: "error", cloudState: "error",
          errorText: "获取榜单失败，请点击重试", loadingMore: false
        });
        return null;
      }

      const list = board.list;
      const myOpenid = board.myOpenid || "";
      const showName = Boolean(self.data.authorized);
      const rows = list.map(function (item, i) {
        const rank = i + 1;
        const me = Boolean(myOpenid && item._id === myOpenid);
        const rawName = item.nickName || "用户";
        const rawAvatar = item.avatarUrl || "";
        return {
          id: item._id,
          rank: rank,
          // 保留原值，供「显示昵称」开关做纯前端切换，不必重新请求云端
          rawName: rawName,
          rawAvatar: rawAvatar,
          name: showName ? rawName : "用户***",
          avatar: showName ? rawAvatar : "",
          totalScore: Number(item.score) || 0,
          me: me,
          medal: rank <= 3 ? MEDALS[rank - 1] : ""
        };
      });
      const myRow = rows.filter(function (r) { return r.me; })[0];

      // 更新时间取全表最新一条，而不是第 1 名那条（第 1 名可能很久没动过）
      let latest = 0;
      list.forEach(function (item) {
        const t = new Date(item.updatedAt).getTime();
        if (!isNaN(t) && t > latest) latest = t;
      });

      self.setData({
        rows: rows,
        page: 1,
        hasMore: false,
        total: rows.length,
        myRank: myRow ? myRow.rank : null,
        myPoints: myRow ? myRow.totalScore : 0,
        myName: myRow ? myRow.name : "用户***",
        loggedIn: Boolean(myOpenid),
        authorized: self.data.authorized,
        updatedAt: timeLabel(latest || (list[0] && list[0].updatedAt)),
        state: rows.length ? "ready" : "empty",
        cloudState: rows.length ? "ready" : "empty",
        loadingMore: false,
        errorText: ""
      });
      return rows;
    }).catch(function (err) {
      console.error("[排行榜] 加载失败", err);
      self.setData({
        state: "error", cloudState: "error",
        errorText: "网络异常，请检查网络后重试", loadingMore: false
      });
      return null;
    });
  },

  onRetry() {
    this.loadBoard();
  },

  // 昵称/头像展示开关：纯前端显示偏好（关闭时统一显示为「用户***」+ 默认头像）
  onToggleConsent(event) {
    const allowed = Boolean(event.detail.value);
    storage.set(CONSENT_KEY, allowed);

    // 纯前端即时切换：只重映射已加载的 rows，不重新请求云端
    // （旧写法会 await 一次云函数，网络慢/失败时开关看起来「点了没反应」）
    const rows = (this.data.rows || []).map(function (row) {
      return Object.assign({}, row, {
        name: allowed ? (row.rawName || "用户") : "用户***",
        avatar: allowed ? (row.rawAvatar || "") : ""
      });
    });
    const myRow = rows.filter(function (r) { return r.me; })[0];
    this.setData({
      authorized: allowed,
      rows: rows,
      myName: myRow ? myRow.name : "用户***"
    });
  },

  onShareAppMessage() {
    return {
      title: "小学英语语法 · 全站排行榜",
      path: "/pages/rank/rank"
    };
  }
});
