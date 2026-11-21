const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function pad(value) {
  return value < 10 ? "0" + value : "" + value;
}

function dateLabel(date) {
  const target = date || new Date();
  return (target.getMonth() + 1) + "月" + target.getDate() + "日 · " + WEEKDAYS[target.getDay()];
}

function dateTimeLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return (date.getMonth() + 1) + "/" + date.getDate() + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function plainPrompt(prompt, maxLength) {
  const text = String(prompt || "").replace(/\s+/g, " ").trim();
  const limit = maxLength || 120;
  return text.length > limit ? text.slice(0, limit) + "…" : text;
}

module.exports = {
  dateLabel: dateLabel,
  dateTimeLabel: dateTimeLabel,
  percent: percent,
  plainPrompt: plainPrompt
};
