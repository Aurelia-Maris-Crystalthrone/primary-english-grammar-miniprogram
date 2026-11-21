// 极简 WXML → HTML 渲染器（仅用于本地预览截图，不参与小程序运行）
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

const TAG_MAP = {
  view: "div",
  text: "span",
  block: null,
  "scroll-view": "div",
  button: "button",
  image: "img",
  navigator: "a",
  progress: "div"
};

function parse(source) {
  const rootNode = { tag: "#root", attrs: {}, children: [] };
  const stack = [rootNode];
  const pattern = /<!--[\s\S]*?-->|<\/([\w-]+)\s*>|<([\w-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let lastIndex = 0;
  let match;

  const pushText = (text) => {
    if (!text) return;
    stack[stack.length - 1].children.push({ tag: "#text", text: text });
  };

  while ((match = pattern.exec(source)) !== null) {
    pushText(source.slice(lastIndex, match.index));
    lastIndex = pattern.lastIndex;

    if (match[1]) {
      const tag = match[1];
      const last = stack.pop();
      if (!last || last.tag !== tag) throw new Error("标签不配对: </" + tag + "> 对应 " + (last && last.tag));
      continue;
    }
    if (!match[2]) continue;

    const tag = match[2];
    const attrSource = match[3] || "";
    const attrs = {};
    const attrPattern = /([\w:.-]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?/g;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(attrSource)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : "");
    }
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (match[4] !== "/") stack.push(node);
  }
  pushText(source.slice(lastIndex));
  if (stack.length !== 1) throw new Error("存在未闭合标签: " + stack.map((item) => item.tag).join(","));
  return rootNode;
}

function evaluate(expression, scope) {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("scope", "with (scope) { return (" + expression + "); }");
    const value = fn(scope);
    return value === undefined || value === null ? "" : value;
  } catch (error) {
    return "";
  }
}

function interpolate(text, scope) {
  return text.replace(/\{\{([\s\S]*?)\}\}/g, function (_, expression) {
    const value = evaluate(expression.trim(), scope);
    if (value === true) return "true";
    if (value === false) return "false";
    return String(value);
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderChildren(children, scope) {
  let out = "";
  let chain = null; // { matched: boolean }

  for (let i = 0; i < children.length; i += 1) {
    const node = children[i];

    if (node.tag === "#text") {
      out += escapeHtml(interpolate(node.text, scope));
      continue;
    }

    const attrs = node.attrs;

    if ("wx:if" in attrs) {
      const value = Boolean(evaluate(attrs["wx:if"].replace(/^\{\{|\}\}$/g, ""), scope));
      chain = { matched: value };
      if (!value) continue;
      out += renderNode(node, scope, true);
      continue;
    }
    if ("wx:elif" in attrs) {
      if (chain && !chain.matched) {
        const value = Boolean(evaluate(attrs["wx:elif"].replace(/^\{\{|\}\}$/g, ""), scope));
        if (value) {
          chain.matched = true;
          out += renderNode(node, scope, true);
        }
      }
      continue;
    }
    if ("wx:else" in attrs) {
      if (chain && !chain.matched) {
        chain.matched = true;
        out += renderNode(node, scope, true);
      }
      chain = null;
      continue;
    }

    chain = null;
    out += renderNode(node, scope, false);
  }
  return out;
}

function renderNode(node, scope, skipCondition) {
  const attrs = node.attrs;

  if ("wx:for" in attrs) {
    const listExpression = attrs["wx:for"].replace(/^\{\{|\}\}$/g, "");
    const list = evaluate(listExpression, scope) || [];
    const itemName = attrs["wx:for-item"] || "item";
    const indexName = attrs["wx:for-index"] || "index";
    let out = "";
    for (let i = 0; i < list.length; i += 1) {
      const childScope = Object.create(scope);
      childScope[itemName] = list[i];
      childScope[indexName] = i;
      out += renderShallow(node, childScope);
    }
    return out;
  }

  return renderShallow(node, scope);
}

function renderShallow(node, scope) {
  const attrs = node.attrs;
  const tag = node.tag;
  const htmlTag = TAG_MAP[tag] === undefined ? tag : TAG_MAP[tag];

  let inner = renderChildren(node.children, scope);
  if (htmlTag === null) return inner;

  const parts = [];
  Object.keys(attrs).forEach(function (name) {
    if (name.indexOf("wx:") === 0) return;
    if (name.indexOf("bind") === 0 || name.indexOf("catch") === 0) return;
    const raw = attrs[name];
    const value = interpolate(raw, scope);
    if (name === "class") parts.push('class="' + escapeHtml(value) + '"');
    else if (name === "style") parts.push('style="' + escapeHtml(value) + '"');
    else if (name === "disabled") {
      if (String(value) === "true") parts.push("disabled");
    } else if (name === "value") parts.push('value="' + escapeHtml(value) + '"');
    else if (name === "src") {
      // 小程序里的绝对路径（/handouts/...）要换成 file:// 才能被截图用
      const src = String(value).charAt(0) === "/"
        ? "file://" + path.join(ROOT, value).replace(/\\/g, "/")
        : value;
      parts.push('src="' + escapeHtml(src) + '"');
    } else if (name.indexOf("data-") === 0) parts.push(name + '="' + escapeHtml(value) + '"');
  });

  return "<" + htmlTag + (parts.length ? " " + parts.join(" ") : "") + ">" + inner + "</" + htmlTag + ">";
}

function convertWxss(css) {
  return css
    .replace(/(^|\n)\s*page\s*\{/g, "$1.page-body {")
    .replace(/([-\d.]+)rpx/g, function (_, value) {
      return parseFloat(value) * 0.5 + "px";
    })
    .replace(/env\(safe-area-inset-bottom\)/g, "0px");
}

const BASE_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: #E9E4DA; display: flex; justify-content: center; padding: 0; }
.phone {
  width: 390px; height: 844px; background: #FDFBF7; position: relative;
  display: flex; flex-direction: column; overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.phone__nav {
  height: 88px; padding-top: 44px; display: flex; align-items: center; justify-content: center;
  background: #FDFBF7; border-bottom: 1px solid rgba(0,0,0,0.02); position: relative; flex: none;
}
.phone__nav-title { font-size: 16px; font-weight: 600; color: #1a1a1a; }
.phone__nav-back { position: absolute; left: 14px; top: 48px; font-size: 15px; color: #333; }
.phone__scroll { flex: 1; overflow-y: auto; }
.phone__tabbar {
  height: 74px; border-top: 1px solid #F0EBE1; background: #fff; display: flex; flex: none;
  padding-bottom: 12px;
}
.phone__tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }
.phone__tab img { width: 24px; height: 24px; }
.phone__tab span { font-size: 10px; color: #9A958B; }
.phone__tab--active span { color: #8A6A46; }
`;

// 渲染一个页面
function renderPage(options) {
  const pagePath = options.page;
  const wxml = fs.readFileSync(path.join(ROOT, pagePath + ".wxml"), "utf8");
  const pageCss = fs.readFileSync(path.join(ROOT, pagePath + ".wxss"), "utf8");
  const appCss = fs.readFileSync(path.join(ROOT, "app.wxss"), "utf8");
  const tree = parse(wxml);
  const scope = Object.create(null);
  Object.keys(options.data || {}).forEach(function (key) { scope[key] = options.data[key]; });

  const content = renderChildren(tree.children, scope);

  const tabs = options.tabs || null;
  let tabbar = "";
  if (tabs) {
    tabbar = '<div class="phone__tabbar">' + tabs.map(function (tab, index) {
      const active = index === options.activeTab;
      return '<div class="phone__tab ' + (active ? "phone__tab--active" : "") + '">' +
        '<img src="file://' + path.join(ROOT, tab.icon).replace(/\\/g, "/") + '" />' +
        "<span>" + tab.text + "</span></div>";
    }).join("") + "</div>";
  }

  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\" />" +
    "<style>" + BASE_CSS + convertWxss(appCss) + convertWxss(pageCss) + "</style></head><body>" +
    '<div class="phone">' +
    '<div class="phone__nav">' + (options.back ? '<div class="phone__nav-back">‹</div>' : "") +
    '<div class="phone__nav-title">' + (options.title || "") + "</div></div>" +
    '<div class="phone__scroll"><div class="page-body">' + content + "</div></div>" +
    tabbar +
    "</div></body></html>";
}

module.exports = { renderPage: renderPage };
