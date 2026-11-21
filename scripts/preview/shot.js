// 用 Playwright(Edge) 给预览页截图，方便没有打开开发者工具时也能核对版式
const fs = require("fs");
const path = require("path");
const { chromium } = require("E:/primary-english-grammar-handoff-20261012/node_modules/playwright");
const { renderPage } = require("./render");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "preview");
const HTML_DIR = path.join(OUT, "html");
fs.mkdirSync(HTML_DIR, { recursive: true });

/* ---------- 小程序运行环境 stub ---------- */
const storage = {};
let lastNav = "";
let captured = null;

global.wx = {
  getStorageSync(key) { return storage[key] === undefined ? "" : storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  setNavigationBarTitle() {},
  navigateTo(options) { lastNav = options.url; },
  redirectTo(options) { lastNav = options.url; },
  switchTab(options) { lastNav = options.url; },
  navigateBack() {},
  showToast() {},
  showModal(options) { if (options.success) options.success({ confirm: false }); },
  pageScrollTo() {}
};

let currentConfig = null;
global.Page = function (config) { currentConfig = config; };

function loadPage(relative) {
  currentConfig = null;
  delete require.cache[require.resolve(path.join(ROOT, relative))];
  require(path.join(ROOT, relative));
  return currentConfig;
}

function instantiate(config) {
  const instance = Object.assign({}, config);
  instance.data = JSON.parse(JSON.stringify(config.data || {}));
  instance.setData = function (patch, callback) {
    Object.keys(patch).forEach(function (key) { instance.data[key] = patch[key]; });
    if (typeof callback === "function") callback();
  };
  return instance;
}

function openPage(relative, options) {
  const page = instantiate(loadPage(relative));
  if (page.onLoad) page.onLoad(options || {});
  if (page.onShow) page.onShow();
  return page;
}

/* ---------- 造一点学习记录，截图才有内容 ---------- */
const store = require(path.join(ROOT, "utils/store.js"));
const dataset = require(path.join(ROOT, "utils/dataset.js"));
store.resetAll();

/* 按线性顺序预置：b1 前四关通过 → 第 6 关可练 → 第 7 关锁着，后面各册都锁 */
const clearedLevels = [
  ["sweet-junior-upper-01", 100, 10, 10],
  ["sweet-junior-upper-02", 90, 10, 9],
  ["sweet-junior-upper-04", 80, 10, 8],
  ["sweet-junior-upper-05", 90, 10, 9]
];
clearedLevels.forEach(function (item) {
  store.markLevelCleared(item[0], {
    status: item[1] >= 80 ? "passed" : "review",
    percent: item[1], total: item[2], correct: item[3]
  });
});

const mistakePicks = [
  ["sweet-junior-upper-04", 0, 3],
  ["sweet-junior-lower-02", 2, 2],
  ["sweet-junior-upper-05", 4, 1],
  ["sweet-junior-lower-01", 6, 1],
  ["sweet-junior-upper-02", 8, 2]
];
mistakePicks.forEach(function (pick) {
  const pool = dataset.questionsForLevel(pick[0]);
  const question = pool[pick[1] % pool.length];
  for (let i = 0; i < pick[2]; i += 1) {
    store.addMistake(question, i % 2 ? "was" : "were", "practice");
  }
});

const attemptSeed = [
  ["sweet-junior-upper-01", 12, 10],
  ["sweet-junior-lower-01", 8, 6]
];
attemptSeed.forEach(function (seed) {
  const pool = dataset.questionsForLevel(seed[0]);
  for (let i = 0; i < seed[1]; i += 1) {
    const question = pool[i % pool.length];
    store.recordAnswer({ question: question, correct: i < seed[2], selectedText: "is", source: "practice" });
  }
});

for (let i = 0; i < 4; i += 1) store.recordSession();

/* 一机一学员：只给本人造学习记录（按线性顺序，b1 前两关通过、第三关可练、其余锁着） */
const account = require(path.join(ROOT, "utils/account.js"));
account.update({ name: "小语", emoji: "🦊" });
["sweet-junior-upper-01", "sweet-junior-upper-02"]
  .forEach(function (levelId) {
    store.markLevelCleared(levelId, { status: "passed", percent: 90, total: 10, correct: 9 });
  });
for (let i = 0; i < 3; i += 1) store.recordSession();

/* ---------- 各页面 ---------- */
const TABS = [
  { icon: "images/tab-home.png", text: "学习台" },
  { icon: "images/tab-map.png", text: "语法地图" },
  { icon: "images/tab-mistakes.png", text: "错题本" },
  { icon: "images/tab-growth.png", text: "成长" },
  { icon: "images/tab-me.png", text: "我的" }
];

const shots = [];

const indexPage = openPage("pages/index/index.js");
shots.push({
  name: "01-index",
  html: renderPage({ page: "pages/index/index", data: indexPage.data, title: "学习台", tabs: TABS, activeTab: 0 })
});

const mapPage = openPage("pages/map/map.js");
shots.push({
  name: "02-map",
  html: renderPage({ page: "pages/map/map", data: mapPage.data, title: "语法地图", tabs: TABS, activeTab: 1 })
});

const levelPage = openPage("pages/level/level.js", { id: "sweet-junior-upper-01" });
shots.push({
  name: "03-level",
  html: renderPage({ page: "pages/level/level", data: levelPage.data, title: "关卡", back: true })
});

/* 练习页：先截答题中，再截答错解析，最后截结果 */
function buildQuizInstance(options) {
  const page = instantiate(loadPage("pages/quiz/quiz.js"));
  page.onLoad(options);
  return page;
}

const quiz = buildQuizInstance({ mode: "level", levelId: "sweet-junior-upper-02", amount: "10" });
shots.push({
  name: "04-quiz",
  html: renderPage({ page: "pages/quiz/quiz", data: quiz.data, title: "随堂练习", back: true })
});

// 选一个错误答案
const firstItem = quiz.items[quiz.data.index];
const wrongOption = firstItem.choice.options.filter(function (option) {
  return option.key !== firstItem.choice.correctKey;
})[0];
quiz.onSelect({ currentTarget: { dataset: { key: wrongOption.key } } });
quiz.onSubmit();
shots.push({
  name: "05-quiz-feedback",
  html: renderPage({ page: "pages/quiz/quiz", data: quiz.data, title: "随堂练习", back: true })
});

// 剩下的题答完，进入结算
for (let i = quiz.data.index; i < quiz.items.length; i += 1) {
  const item = quiz.items[quiz.data.index];
  if (!quiz.data.answered) {
    quiz.onSelect({ currentTarget: { dataset: { key: item.choice.correctKey } } });
    quiz.onSubmit();
  }
  quiz.onNext();
}
shots.push({
  name: "06-quiz-result",
  html: renderPage({ page: "pages/quiz/quiz", data: quiz.data, title: "随堂练习", back: true })
});

const mistakesPage = openPage("pages/mistakes/mistakes.js");
shots.push({
  name: "07-mistakes",
  html: renderPage({ page: "pages/mistakes/mistakes", data: mistakesPage.data, title: "错题本", tabs: TABS, activeTab: 2 })
});

const growthPage = openPage("pages/growth/growth.js");
shots.push({
  name: "08-growth",
  html: renderPage({ page: "pages/growth/growth", data: growthPage.data, title: "成长", tabs: TABS, activeTab: 3 })
});

const profilePage = openPage("pages/profile/profile.js");
shots.push({
  name: "09-profile",
  html: renderPage({ page: "pages/profile/profile", data: profilePage.data, title: "我的", tabs: TABS, activeTab: 4 })
});

const rankPage = openPage("pages/rank/rank.js");
shots.push({
  name: "10-rank",
  html: renderPage({ page: "pages/rank/rank", data: rankPage.data, title: "排行榜", back: true })
});

const handoutPage = openPage("handouts/b1/viewer/viewer.js", { levelId: "sweet-junior-upper-01" });
shots.push({
  name: "11-handout",
  html: renderPage({ page: "handouts/b1/viewer/viewer", data: handoutPage.data, title: "be 动词三姐妹 · 讲义", back: true })
});

/* ---------- 写 HTML + 截图 ---------- */
(async function main() {
  const browser = await chromium.launch({ channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    const file = path.join(HTML_DIR, shot.name + ".html");
    fs.writeFileSync(file, shot.html, "utf8");
    await page.goto("file://" + file.replace(/\\/g, "/"));
    await page.waitForTimeout(120);
    if (shot.extraCss) await page.addStyleTag({ content: shot.extraCss });

    await page.locator(".phone").screenshot({ path: path.join(OUT, shot.name + "-screen.png") });

    await page.addStyleTag({ content: ".phone{min-height:0 !important;height:auto !important}.phone__scroll{overflow:visible !important}" });
    await page.waitForTimeout(80);
    await page.locator(".phone").screenshot({ path: path.join(OUT, shot.name + "-full.png") });
    console.log("shot " + shot.name);
  }

  await browser.close();
  console.log("预览已输出到 " + OUT);
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
