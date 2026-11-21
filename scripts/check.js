// 页面逻辑自测（在 Node 里模拟小程序运行环境）
const path = require("path");
const root = path.resolve(__dirname, "..");

const storage = {};

global.wx = {
  getStorageSync(key) { return storage[key] === undefined ? "" : storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  setNavigationBarTitle(options) { lastNavigation = options.title; },
  navigateTo(options) { lastNav = options.url; },
  redirectTo(options) { lastNav = options.url; },
  switchTab(options) { lastNav = options.url; },
  navigateBack() { lastNav = "back"; },
  showToast(options) { lastToast = options.title; },
  showModal(options) { lastModal = options.title; if (options.success) options.success({ confirm: true }); },
  pageScrollTo() {}
};

let lastNav = "";
let lastToast = "";
let lastModal = "";
let lastNavigation = "";

let registeredApp = null;
global.App = function (config) { registeredApp = config; };
global.getApp = function () { return registeredApp; };

const registeredPages = {};

global.Page = function (config) {
  registeredPages[currentFile] = config;
};

let currentFile = "";

function loadPage(relative) {
  currentFile = relative;
  require(path.join(root, relative));
  return registeredPages[relative];
}

function instantiate(config) {
  const instance = Object.assign({}, config);
  instance.data = JSON.parse(JSON.stringify(config.data || {}));
  instance.setData = function (patch, callback) {
    Object.keys(patch).forEach((key) => {
      instance.data[key] = patch[key];
    });
    if (typeof callback === "function") callback();
  };
  return instance;
}

function run(relative, options, actions) {
  const config = loadPage(relative);
  const page = instantiate(config);
  if (page.onLoad) page.onLoad(options || {});
  if (page.onShow) page.onShow();
  if (actions) actions(page);
  return page;
}

const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: Boolean(condition), detail });
  console.log((condition ? "PASS " : "FAIL ") + name + (condition ? "" : "  → " + (detail || "")));
}

/* ---------------- 首页 ---------------- */
const index = run("pages/index/index.js");
check("首页有推荐任务", index.data.mission && index.data.mission.id, JSON.stringify(index.data.mission));
check("首页关卡总数 37", index.data.totalLevels === 37, index.data.totalLevels);
check("首页进度为 0", index.data.percent === 0, index.data.percent);
check("首页题量统计", index.data.stats.questions === 4145, index.data.stats.questions);
index.onStartMission();
check("首页跳关卡", lastNav.indexOf("/pages/level/level?id=") === 0, lastNav);

/* ---------------- 地图 ---------------- */
const map = run("pages/map/map.js");
check("地图有 6 册", map.data.stages.length === 6, map.data.stages.length);
check("地图默认册有阶段", map.data.phases.length >= 1, map.data.phases.length);
const totalNodes = map.data.phases.reduce((sum, phase) => sum + phase.levels.length, 0);
check("中级上关卡数 11", map.data.activeStageId !== "intermediate-upper" || totalNodes === 11, totalNodes);

map.onSelectStage({ currentTarget: { dataset: { id: "intermediate-upper" } } });
check("切换册生效", map.data.activeStageId === "intermediate-upper", map.data.activeStageId);
const exam = map.data.phases[0].exam;
check("阶段挑战题量 >= 20", exam.count >= 20, exam.count);

map.onOpenLevel({ currentTarget: { dataset: { id: "sweet-junior-upper-01" } } });
check("地图跳转关卡", lastNav.indexOf("/pages/level/level?id=") === 0, lastNav);
map.onStartExam({ currentTarget: { dataset: { id: map.data.phases[0].id } } });
check("地图跳转阶段挑战", lastNav.indexOf("/pages/quiz/quiz?mode=phase") === 0, lastNav);

/* ---------------- 线性解锁 ---------------- */
const unlockCheck = require(path.join(root, "utils/unlock.js"));
const noCleared = {};
check("第一关默认解锁", unlockCheck.isUnlocked("sweet-junior-upper-01", noCleared), "第一关被锁");
check("第二关默认锁着", !unlockCheck.isUnlocked("sweet-junior-upper-02", noCleared), "第二关直接开了");
const lockInfo = unlockCheck.lockInfo("sweet-junior-upper-02", noCleared);
check("锁信息指向上一关", lockInfo.locked && lockInfo.required && lockInfo.required.id === "sweet-junior-upper-01",
  JSON.stringify(lockInfo));
check("跨册也要接上", !unlockCheck.isUnlocked("sweet-junior-lower-01", noCleared), "第二册第一关没锁");
check("推荐的是第一关", unlockCheck.nextPlayable(noCleared) && unlockCheck.nextPlayable(noCleared).id === "sweet-junior-upper-01",
  unlockCheck.nextPlayable(noCleared) && unlockCheck.nextPlayable(noCleared).id);

map.onSelectStage({ currentTarget: { dataset: { id: "junior-upper" } } });
const freshNodes = map.data.phases[0].levels;
const firstNode = freshNodes.filter((node) => node.id === "sweet-junior-upper-01")[0];
const secondNode = freshNodes.filter((node) => node.id === "sweet-junior-upper-02")[0];
check("地图第一关未锁", firstNode && firstNode.locked === false, firstNode && firstNode.locked);
check("地图第二关显示锁", secondNode && secondNode.locked === true, secondNode && secondNode.locked);
check("锁住的关卡写明前置", secondNode && secondNode.metaLine.indexOf("先过") === 0, secondNode && secondNode.metaLine);

map.onOpenLevel({ currentTarget: { dataset: { id: "sweet-junior-upper-02" } } });
check("点锁着的关卡给提示", lastModal === "这一关还没解锁", lastModal);
const lockedLevel = run("pages/level/level.js", { id: "sweet-junior-upper-03" });
check("直接进锁关卡被拦", lockedLevel.data.level === null, JSON.stringify(lockedLevel.data.level));

/* ---------------- 关卡 ---------------- */
const level = run("pages/level/level.js", { id: "sweet-junior-upper-01" });
check("关卡标题", level.data.level && level.data.level.name === "be 动词三姐妹", level.data.level && level.data.level.name);
check("关卡题库 > 0", level.data.poolCount > 0, level.data.poolCount);
check("关卡固定 10 道", level.data.roundCount === 10, level.data.roundCount);
check("题量不可再选", typeof level.onSelectAmount === "undefined", typeof level.onSelectAmount);
check("关卡有讲解", Boolean(level.data.lesson), level.data.lesson && level.data.lesson.name);
check("关卡有讲义", Boolean(level.data.handout && level.data.handout.pages > 0), JSON.stringify(level.data.handout));
check("关卡上下关", Boolean(level.data.next), level.data.next && level.data.next.name);

level.onStart();
check("关卡跳转练习", lastNav.indexOf("/pages/quiz/quiz?mode=level") === 0, lastNav);

/* ---------------- 练习：全对 ---------------- */
function runQuiz(options, answerCorrect) {
  const config = loadPage("pages/quiz/quiz.js");
  const page = instantiate(config);
  page.onLoad(options);
  if (!page.items) return page;
  for (let i = 0; i < page.items.length; i += 1) {
    const item = page.items[page.data.index];
    const key = answerCorrect === false ? "Z" : item.choice.correctKey;
    page.onSelect({ currentTarget: { dataset: { key } } });
    page.onSubmit();
    if (i < page.items.length - 1) page.onNext();
  }
  page.onNext(); // 最后一题触发结算
  return page;
}

const quizPass = runQuiz({ mode: "level", levelId: "sweet-junior-upper-01", amount: "10" }, true);
check("练习生成 10 题", quizPass.data.total === 10, quizPass.data.total);
check("练习结算出现", quizPass.data.finished === true, quizPass.data.finished);
check("全对百分比 100", quizPass.data.summary && quizPass.data.summary.percent === 100, quizPass.data.summary && quizPass.data.summary.percent);
check("全对显示通过", quizPass.data.summary && quizPass.data.summary.statusLabel === "通过", quizPass.data.summary && quizPass.data.summary.statusLabel);
check("答题页不显示题型", quizPass.data.question && quizPass.data.question.typeLabel === undefined, JSON.stringify(quizPass.data.question && quizPass.data.question.typeLabel));

const storeAfter = require(path.join(root, "utils/store.js"));
check("通关已记录", storeAfter.isLevelCleared("sweet-junior-upper-01"), JSON.stringify(storeAfter.clearedLevelIds()));
check("全对不进错题本", storeAfter.mistakeCount() === 0, storeAfter.mistakeCount());

/* ---------------- 通关后解锁下一关 ---------------- */
const clearedNow = storeAfter.getProfile().cleared;
check("通关后第二关解锁", unlockCheck.isUnlocked("sweet-junior-upper-02", clearedNow), "下一关没开");
check("通关后第三关仍锁着", !unlockCheck.isUnlocked("sweet-junior-upper-03", clearedNow), "跳关开了");
check("已通关的关卡随时可进", unlockCheck.isUnlocked("sweet-junior-upper-01", clearedNow), "回不去已通关关卡");
check("推荐换成第二关", unlockCheck.nextPlayable(clearedNow) && unlockCheck.nextPlayable(clearedNow).id === "sweet-junior-upper-02",
  unlockCheck.nextPlayable(clearedNow) && unlockCheck.nextPlayable(clearedNow).id);
const levelAfterPass = run("pages/level/level.js", { id: "sweet-junior-upper-01" });
check("过关后下一关按钮可点", levelAfterPass.data.next && levelAfterPass.data.next.locked === false,
  JSON.stringify(levelAfterPass.data.next));

/* ---------------- 练习：全错 → 错题本 ---------------- */
const quizFail = runQuiz({ mode: "level", levelId: "sweet-junior-upper-02", amount: "5" }, false);
check("全错结算", quizFail.data.summary && quizFail.data.summary.percent === 0, quizFail.data.summary && quizFail.data.summary.percent);
check("全错未通关", !storeAfter.isLevelCleared("sweet-junior-upper-02"), storeAfter.isLevelCleared("sweet-junior-upper-02"));
check("全错进错题本 5 道", storeAfter.mistakeCount() === 5, storeAfter.mistakeCount());

/* ---------------- 错题页 ---------------- */
const mistakes = run("pages/mistakes/mistakes.js");
check("错题页总数", mistakes.data.total === 5, mistakes.data.total);
check("错题页分组", mistakes.data.groups.length === 1, mistakes.data.groups.length);
check("错题难度=简单", mistakes.data.groups[0].key === "easy", mistakes.data.groups[0].key);
mistakes.onRetryOne({ currentTarget: { dataset: { id: mistakes.data.groups[0].items[0].id } } });
check("错题重做跳转", lastNav.indexOf("mode=mistake") > 0, lastNav);

/* ---------------- 错题做对 → 移出 ---------------- */
const mistakeIds = storeAfter.listMistakes().map((entry) => entry.id);
const quizMistake = runQuiz({ mode: "mistake", ids: mistakeIds.join(","), amount: String(mistakeIds.length) }, true);
check("错题重做全对", quizMistake.data.summary && quizMistake.data.summary.percent === 100, quizMistake.data.summary && quizMistake.data.summary.percent);
check("做对后清出错题本", storeAfter.mistakeCount() === 0, storeAfter.mistakeCount());

/* ---------------- 阶段挑战 ---------------- */
const quizPhase = runQuiz({ mode: "phase", phaseId: "junior-upper-phase-1", amount: "20" }, true);
check("阶段挑战 20 题", quizPhase.data.total === 20, quizPhase.data.total);
check("阶段挑战结算", quizPhase.data.summary && quizPhase.data.summary.percent === 100, quizPhase.data.summary && quizPhase.data.summary.percent);

/* ---------------- 成长页 ---------------- */
const growth = run("pages/growth/growth.js");
check("成长积分 > 0", growth.data.points > 0, growth.data.points);
check("成长六册进度", growth.data.stages.length === 6, growth.data.stages.length);
check("成长有徽章", growth.data.badges.length >= 2, growth.data.badges.map((b) => b.name).join(","));

/* ---------------- 同类题（错题本 5 道） ---------------- */
runQuiz({ mode: "level", levelId: "sweet-junior-upper-02", amount: "10" }, false);
const mistakeIds2 = storeAfter.listMistakes().map((entry) => entry.id);
check("重新攒出错题", mistakeIds2.length >= 3, mistakeIds2.length);

const datasetCheck = require(path.join(root, "utils/dataset.js"));
const baseQuestion = datasetCheck.getQuestion(mistakeIds2[0]);
check("错题有知识点归属", Boolean(baseQuestion && baseQuestion.primaryNode), baseQuestion && baseQuestion.primaryNode);

const similar = runQuiz({
  mode: "similar",
  nodeId: baseQuestion.primaryNode,
  levelId: baseQuestion.levelId,
  excludeId: baseQuestion.id
}, true);
check("同类题出 5 道", similar.data.total === 5, similar.data.total);
check("同类题避开原题", similar.items.every((item) => item.question.id !== baseQuestion.id), baseQuestion.id);
check("同类题同知识点或同关卡", similar.items.every((item) =>
  item.question.nodeIds.indexOf(baseQuestion.primaryNode) >= 0 || item.question.levelId === baseQuestion.levelId),
  "混进了别的关卡");
const mistakesAfterSimilar = storeAfter.mistakeCount();
check("同类题全对不新增错题", mistakesAfterSimilar <= mistakeIds2.length, mistakesAfterSimilar);

const firstMistake = storeAfter.listMistakes()[0];
const beforeRemove = storeAfter.mistakeCount();
storeAfter.recordAnswer({
  question: datasetCheck.getQuestion(firstMistake.id),
  correct: true,
  selectedText: "",
  source: "similar"
});
check("同类题做对会移出错题本", storeAfter.mistakeCount() === beforeRemove - 1,
  beforeRemove + " → " + storeAfter.mistakeCount());

const similarNav = run("pages/mistakes/mistakes.js");
check("错题卡有同类题入口", similarNav.data.groups.length > 0 &&
  similarNav.data.groups[0].items[0].similarText.length > 0,
  JSON.stringify(similarNav.data.groups[0] && similarNav.data.groups[0].items[0].similarText));
similarNav.onSimilar({
  currentTarget: {
    dataset: {
      id: similarNav.data.groups[0].items[0].id,
      node: similarNav.data.groups[0].items[0].nodeId,
      level: similarNav.data.groups[0].items[0].levelId
    }
  }
});
check("同类题跳转", lastNav.indexOf("mode=similar") > 0, lastNav);

/* ---------------- 一机一学员（账号） ---------------- */
const account = require(path.join(root, "utils/account.js"));
check("一机只有一位学员", Boolean(account.currentId()), account.currentId());
check("学员 id 稳定", account.currentId() === account.currentId(), account.currentId());
account.update({ name: "小语" });
check("昵称能存下来", account.current().name === "小语", account.current().name);
check("展示名兜底", account.displayName({ name: "" }) === "小学员", account.displayName({ name: "" }));
check("手机号打码", account.maskPhone("13800138000") === "138****8000", account.maskPhone("13800138000"));
check("不再提供多学员入口", typeof account.create === "undefined" && typeof account.switchTo === "undefined",
  "仍有 create/switchTo");

/* ---------------- 排行榜 ---------------- */
const rank = run("pages/rank/rank.js");
check("排行榜显示本人积分", rank.data.me.points >= 0, JSON.stringify(rank.data.me));
check("排行榜只有一个我", rank.data.me.name === "小语", rank.data.me.name);
check("未配置云开发时排行榜降级", rank.data.cloudState === "off", rank.data.cloudState);

/* 服务端排行榜纯逻辑：排序、脱敏、计分、分页 */
const board = require(path.join(root, "cloudfunctions/rank/board.js"));
const accounts = [
  { openid: "c", totalScore: 120, reachedAt: "2026-01-03T00:00:00Z", status: "active" },
  { openid: "a", totalScore: 100, reachedAt: "2026-01-02T00:00:00Z", status: "active", nickName: "小明同学", authorized: true },
  { openid: "b", totalScore: 100, reachedAt: "2026-01-01T00:00:00Z", status: "active" },
  { openid: "d", totalScore: 999, reachedAt: "2026-01-01T00:00:00Z", status: "banned" },
  { openid: "e", totalScore: 888, reachedAt: "2026-01-01T00:00:00Z", status: "test" },
  { openid: "f", totalScore: 777, reachedAt: "2026-01-01T00:00:00Z", status: "closed" },
  { openid: "g", totalScore: 666, reachedAt: "2026-01-01T00:00:00Z", status: "active", riskBlocked: true }
];
const snapshot = board.buildSnapshot(accounts);
check("榜单积分降序", snapshot[0].totalScore === 120 && snapshot[1].totalScore === 100, JSON.stringify(snapshot.map((r) => r.totalScore)));
check("同分先达到者在前", snapshot[1].openid === "b" && snapshot[2].openid === "a", JSON.stringify(snapshot.map((r) => r.openid)));
check("注销封禁测试风控不进榜", snapshot.length === 3, snapshot.length);
check("名次连续从 1 开始", snapshot.map((r) => r.rank).join(",") === "1,2,3", snapshot.map((r) => r.rank).join(","));
check("同分同时间按 ID 稳定", (function () {
  const rows = board.buildSnapshot([
    { openid: "z", totalScore: 10, reachedAt: "2026-01-01T00:00:00Z", status: "active" },
    { openid: "a", totalScore: 10, reachedAt: "2026-01-01T00:00:00Z", status: "active" }
  ]);
  return rows[0].openid === "a";
})(), "稳定排序未生效");
check("未授权昵称显示用户***", board.maskName("小明", false) === "用户***", board.maskName("小明", false));
check("授权昵称仍脱敏", board.maskName("小明同学", true) === "小***学", board.maskName("小明同学", true));
check("头像仅接受云端地址", board.safeAvatar("cloud://a.png", true) !== "" && board.safeAvatar("wxfile://tmp", true) === "", "本地路径被外泄");
check("分值由服务端查表", board.normalizeEvent({ type: "level_clear", eventId: "e1", points: 999999 }, "a").delta === 10, "前端积分值生效");
check("非法事件不计分", board.normalizeEvent({ type: "hack", eventId: "e2", points: 100 }, "a") === null, "非法事件未被拦截");
check("高频积分被限流", board.allowEvent(Array(41).fill(Date.now()), Date.now()) === false, "频控未生效");
check("默认每页 50 且上限 100", board.slice([], 1).pageSize === 50 && board.slice([], 1, 999).pageSize === 100, "分页参数异常");
check("分页有 hasMore", (function () {
  const page1 = board.slice(Array(120).fill({}), 1, 50);
  return page1.rows.length === 50 && page1.hasMore === true && board.slice(Array(120).fill({}), 3, 50).hasMore === false;
})(), "分页边界错误");
check("我的排名可定位", board.rankOf(snapshot, "a") === 3, board.rankOf(snapshot, "a"));
check("出参不暴露 openid", board.sanitize(snapshot, "a").every((r) => !("openid" in r)), "出参含 openid");
check("出参标记我", board.sanitize(snapshot, "a")[2].me === true, "me 标记缺失");

/* ---------------- 我的 ---------------- */
const profile = run("pages/profile/profile.js");
check("个人页没有学员列表", typeof profile.data.users === "undefined", JSON.stringify(profile.data.users));
check("个人页昵称回填", profile.data.user.name === "小语", profile.data.user.name);
check("个人页显示本机模式", profile.data.loggedIn === false && profile.data.accountText === "本机模式",
  profile.data.accountText);
check("个人页有积分", profile.data.card.points >= 0, JSON.stringify(profile.data.card));

/* ---------------- 讲义 ---------------- */
const handout = require(path.join(root, "utils/handout.js"));
let handoutLevels = 0;
let handoutPages = 0;
datasetCheck.LEVELS.forEach((item) => {
  const entry = handout.forLevel(item.id);
  if (entry && entry.pages > 0) {
    handoutLevels += 1;
    handoutPages += entry.pages;
  }
});
check("37 关都有讲义", handoutLevels === datasetCheck.LEVELS.length, handoutLevels);
check("讲义总页数 60", handoutPages === 60, handoutPages);
check("讲义路径指向分包", handout.viewerUrl("sweet-junior-upper-01").indexOf("/handouts/b1/viewer/viewer") === 0,
  handout.viewerUrl("sweet-junior-upper-01"));

/* ---------------- 登录态（微信静默登录） ---------------- */
const session = require(path.join(root, "utils/session.js"));
session.clear();
check("初始未登录", !session.isValid(), "竟然有登录态");
check("未登录需要建档", session.needsLogin(true) === true, "没有要求登录");
check("未配云开发不建档", session.needsLogin(false) === false, "没配云也去登录了");

const demoSession = session.save({ openid: "o-test", id: "u_1", nickName: "小语" });
check("登录态可保存", session.isValid() && session.current().openid === "o-test", JSON.stringify(demoSession));
check("缓存昵称不缓存手机号", session.current().nickName === "小语" && session.current().phone === undefined,
  JSON.stringify(session.current()));
check("登录态有 30 天", session.remainingDays() === 30, session.remainingDays());

storage[session.KEY].expireAt = Date.now() - 1000;
check("过期后判定失效", !session.isValid(), "过期了还能用");
session.clear();
check("清缓存后失效", !session.isValid(), "缓存没清掉");

/* ---------------- app 静默登录（无云开发时降级） ---------------- */
require(path.join(root, "app.js"));
const loginApp = registeredApp;
check("app 暴露静默登录", Boolean(loginApp && typeof loginApp.silentLogin === "function"), "缺 silentLogin");
check("app 暴露昵称同步", Boolean(loginApp && typeof loginApp.syncName === "function"), "缺 syncName");

/* ---------------- 重置 ---------------- */
growth.onReset();
check("重置清空进度", storeAfter.clearedLevelIds().length === 0, storeAfter.clearedLevelIds().length);

(async () => {
  const noCloudUser = await loginApp.silentLogin();
  check("没配云开发时降级为本机", noCloudUser === null, JSON.stringify(noCloudUser));

  const failed = results.filter((item) => !item.ok);
  console.log("\n" + (failed.length ? "FAILED " + failed.length : "ALL PASS") + " / " + results.length);
  process.exit(failed.length ? 1 : 0);
})();
