// 讲义（原网页版 PDF）入口
let data = null;

try {
  data = require("../data/handouts.js");
} catch (error) {
  data = null;
}

function ready() {
  return Boolean(data && data.levels);
}

function forLevel(levelId) {
  if (!ready()) return null;
  return data.levels[levelId] || null;
}

function bookOf(bookKey) {
  if (!ready()) return null;
  return data.books[bookKey] || null;
}

function viewerUrl(levelId) {
  const entry = forLevel(levelId);
  if (!entry) return "";
  return "/handouts/" + entry.book + "/viewer/viewer?levelId=" + encodeURIComponent(levelId);
}

function pagesOf(levelId) {
  const entry = forLevel(levelId);
  if (!entry) return [];
  const book = bookOf(entry.book);
  const dir = book ? book.dir : "/handouts/" + entry.book;
  const pages = [];
  for (let i = 1; i <= entry.pages; i += 1) {
    pages.push(dir + "/pages/" + levelId + "-" + i + ".jpg");
  }
  return pages;
}

module.exports = {
  ready: ready,
  forLevel: forLevel,
  bookOf: bookOf,
  viewerUrl: viewerUrl,
  pagesOf: pagesOf
};
