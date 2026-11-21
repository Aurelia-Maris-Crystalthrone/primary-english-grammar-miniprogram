// 阶段守卫：让各页面的内容跟着首页选中的学段走
const stages = require("./stages");

function title(view) {
  return "伴随英语 · " + (view || stages.viewModel()).stageLabel;
}

// 页面 onShow / onLoad 开头调用：同步状态与标题，返回当前学段是否有内容
function apply(page) {
  const view = stages.viewModel();
  if (page && typeof page.setData === "function") {
    page.setData({ stageAvailable: view.available, stageLabel: view.stageLabel });
  }
  syncTitle(view);
  return view.available;
}

function syncTitle(view) {
  if (typeof wx !== "undefined" && wx.setNavigationBarTitle) {
    wx.setNavigationBarTitle({ title: title(view) });
  }
}

function backToPrimary(page) {
  stages.select("primary");
  if (page && typeof page.onShow === "function") page.onShow();
}

module.exports = {
  apply: apply,
  syncTitle: syncTitle,
  backToPrimary: backToPrimary
};
