// 静态检查：JSON 可解析、页面文件齐全、WXML 标签与插值配对、JS 可加载、分包体积
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appJson = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
let errors = 0;

const MAIN_LIMIT = 2 * 1024 * 1024;
const SUB_LIMIT = 2 * 1024 * 1024;
const TOTAL_LIMIT = 20 * 1024 * 1024;

function fail(message) {
  console.log("FAIL " + message);
  errors += 1;
}

function dirSize(dir) {
  let total = 0;
  fs.readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) total += dirSize(full);
    else total += stat.size;
  });
  return total;
}

["app.json", "app.js", "app.wxss", "sitemap.json", "project.config.json"].forEach((file) => {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) fail("缺少根文件 " + file);
});

if (appJson.tabBar && appJson.tabBar.list) {
  appJson.tabBar.list.forEach((item) => {
    ["iconPath", "selectedIconPath"].forEach((key) => {
      const icon = path.join(root, item[key]);
      if (!fs.existsSync(icon)) fail("缺少图标 " + item[key]);
    });
    if (appJson.pages.indexOf(item.pagePath) < 0) fail("tabBar 页面未注册 " + item.pagePath);
  });
  if (appJson.tabBar.list.length > 5) fail("tabBar 超过 5 项");
}

const VOID_TAGS = new Set(["image", "input", "icon", "progress", "slider", "switch", "textarea", "canvas", "audio", "video", "import", "include"]);

function checkWxml(page) {
  const source = fs.readFileSync(path.join(root, page + ".wxml"), "utf8");
  const open = (source.match(/\{\{/g) || []).length;
  const close = (source.match(/\}\}/g) || []).length;
  if (open !== close) fail(page + ".wxml 插值括号不配对 " + open + "/" + close);

  const stack = [];
  const tagPattern = /<\/?([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let match;
  while ((match = tagPattern.exec(source)) !== null) {
    const raw = match[0];
    const name = match[1];
    const selfClosing = match[3] === "/" || VOID_TAGS.has(name);
    if (raw.startsWith("</")) {
      const last = stack.pop();
      if (last !== name) fail(page + ".wxml 标签不配对 </" + name + "> 对应 " + last);
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  if (stack.length) fail(page + ".wxml 有未闭合标签 " + stack.join(","));
}

function checkPage(page) {
  ["js", "wxml", "json", "wxss"].forEach((ext) => {
    const file = path.join(root, page + "." + ext);
    if (!fs.existsSync(file)) {
      fail("缺少页面文件 " + page + "." + ext);
      return;
    }
    if (ext === "json") {
      try {
        JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (error) {
        fail(page + ".json 解析失败: " + error.message);
      }
    }
    if (ext === "wxml") checkWxml(page);
  });

  if (fs.existsSync(path.join(root, page + ".js"))) {
    try {
      const code = fs.readFileSync(path.join(root, page + ".js"), "utf8");
      new Function("Page", "require", "module", "exports", code);
    } catch (error) {
      fail(page + ".js 语法错误: " + error.message);
    }
  }
}

appJson.pages.forEach(checkPage);

/* ---------- 全局组件 ---------- */
const components = appJson.usingComponents || {};
Object.keys(components).forEach((name) => {
  let target = String(components[name] || "");
  if (target.charAt(0) === "/") target = target.slice(1);

  ["js", "wxml", "json", "wxss"].forEach((ext) => {
    if (!fs.existsSync(path.join(root, target + "." + ext))) {
      fail("缺少组件文件 " + target + "." + ext);
    }
  });

  const metaPath = path.join(root, target + ".json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.component !== true) fail(target + ".json 缺少 component: true");
    } catch (error) {
      fail(target + ".json 解析失败: " + error.message);
    }
  }

  if (fs.existsSync(path.join(root, target + ".wxml"))) checkWxml(target);
  if (fs.existsSync(path.join(root, target + ".js"))) {
    try {
      const code = fs.readFileSync(path.join(root, target + ".js"), "utf8");
      new Function("Component", "require", "module", "exports", "wx", code);
    } catch (error) {
      fail(target + ".js 语法错误: " + error.message);
    }
  }
});

/* ---------- 分包（讲义） ---------- */
const subPackages = appJson.subPackages || [];
let subTotal = 0;
subPackages.forEach((pack) => {
  const packRoot = path.join(root, pack.root);
  if (!fs.existsSync(packRoot)) {
    fail("分包目录不存在 " + pack.root);
    return;
  }
  (pack.pages || []).forEach((page) => {
    checkPage(pack.root + "/" + page);
  });
  const size = dirSize(packRoot);
  subTotal += size;
  const flag = size > SUB_LIMIT ? "FAIL " : "  ";
  console.log("  " + flag + pack.root.padEnd(14) + (size / 1024 / 1024).toFixed(2) + " MB");
  if (size > SUB_LIMIT) fail(pack.root + " 超过 2 MB");
});

/* ---------- 讲义索引与图片 ---------- */
try {
  const handouts = require(path.join(root, "data/handouts.js"));
  const ids = Object.keys(handouts.levels || {});
  let missing = 0;
  ids.forEach((levelId) => {
    const entry = handouts.levels[levelId];
    for (let page = 1; page <= entry.pages; page += 1) {
      const file = path.join(root, "handouts", entry.book, "pages", levelId + "-" + page + ".jpg");
      if (!fs.existsSync(file)) {
        missing += 1;
        if (missing <= 3) fail("讲义图片缺失 " + file);
      }
    }
  });
  console.log("  讲义 " + ids.length + " 关 / " + ids.reduce((sum, id) => sum + handouts.levels[id].pages, 0) + " 页");
} catch (error) {
  fail("data/handouts.js 读取失败: " + error.message);
}

/* ---------- JS 语法 ---------- */
const utils = fs.readdirSync(path.join(root, "utils")).filter((name) => name.endsWith(".js"));
utils.forEach((name) => {
  try {
    const code = fs.readFileSync(path.join(root, "utils", name), "utf8");
    new Function("require", "module", "exports", code);
  } catch (error) {
    fail("utils/" + name + " 语法错误: " + error.message);
  }
});

/* ---------- 体积 ---------- */
const SKIP_DIRS = new Set(["scripts", "preview", "cloudfunctions", "handouts", "node_modules", ".git"]);
let size = 0;
fs.readdirSync(root).forEach((name) => {
  if (SKIP_DIRS.has(name)) return;
  const full = path.join(root, name);
  const stat = fs.statSync(full);
  size += stat.isDirectory() ? dirSize(full) : stat.size;
});

console.log("主包约 " + (size / 1024 / 1024).toFixed(2) + " MB / 2 MB");
console.log("分包合计 " + (subTotal / 1024 / 1024).toFixed(2) + " MB，总包 " +
  ((size + subTotal) / 1024 / 1024).toFixed(2) + " MB / 20 MB");
if (size > MAIN_LIMIT) fail("主包超过 2 MB");
if (size + subTotal > TOTAL_LIMIT) fail("总包超过 20 MB");

console.log(errors ? "存在 " + errors + " 个问题" : "静态检查全部通过");
process.exit(errors ? 1 : 0);
