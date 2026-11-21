# -*- coding: utf-8 -*-
"""
把网页版讲义 PDF 渲染成图片，按册拆进小程序分包。

产物：
  handouts/b1…b6/pages/<levelId>-<n>.jpg   讲义页面（1000 宽，jpg，约 110KB/页）
  handouts/b1…b6/viewer/viewer.*           每个分包必须有的页面（统一走 utils/handout-viewer）
  data/handouts.js                         关卡 → 册 / 页数 的索引

用法：python scripts/build-handouts.py
"""
import json
import os
import re
import shutil
import sys

import pymupdf
from PIL import Image

PDF_ROOT = r"E:\primary-english-grammar-handoff-20261012\public\小升初讲义"
PROJECT = r"E:\primary-english-grammar-miniprogram"
DATA = os.path.join(PROJECT, "data")
TEMPLATES = os.path.join(PROJECT, "scripts", "handout-templates")

# 用 jpg 而不是 webp：微信 image 组件读本地 webp 在部分机型（尤其 iOS）会整页空白，
# jpg 是所有机型都稳的格式，代价是体积翻倍，仍在分包额度内。
TARGET_WIDTH = 1000
QUALITY = 78
EXT = "jpg"
MAX_BOOK_BYTES = 2 * 1024 * 1024

# 少数册的讲义编号和课程关卡编号对不上，按内容手工对齐（已逐条核对过标题）
OVERRIDES = {
    6: {1: 5, 5: 4},
}


def load_levels():
    """从 data/curriculum.js 里读关卡（它就是一个 module.exports = {...} 的 JSON）。"""
    with open(os.path.join(DATA, "curriculum.js"), "r", encoding="utf-8") as fp:
        text = fp.read().strip()
    payload = text[len("module.exports"):].strip().lstrip("=").strip().rstrip(";")
    curriculum = json.loads(payload)
    book_of_stage = {stage["id"]: stage["bookNumber"] for stage in curriculum["stages"]}
    stage_name = {stage["id"]: stage["name"] for stage in curriculum["stages"]}

    levels = []
    for level in curriculum["levels"]:
        book = book_of_stage[level["stageId"]]
        levels.append({
            "id": level["id"],
            "name": level["name"],
            "number": level["number"],
            "book": book,
            "stageName": stage_name[level["stageId"]],
        })
    return levels


def scan_pdfs():
    """bookNumber → {关卡编号: pdf 路径}"""
    books = {}
    for folder in sorted(os.listdir(PDF_ROOT)):
        full = os.path.join(PDF_ROOT, folder)
        if not os.path.isdir(full):
            continue
        match = re.match(r"^(\d+)-", folder)
        if not match:
            continue
        book = int(match.group(1))
        items = {}
        for filename in os.listdir(full):
            if not filename.lower().endswith(".pdf") or "合订" in filename:
                continue
            hit = re.match(r"^第(\d{1,2})关", filename)
            if not hit:
                continue
            items[int(hit.group(1))] = os.path.join(full, filename)
        books[book] = items
    return books


def trim_white(image, threshold=250, pad=16):
    """裁掉纯白页边，手机上少滚几下，体积也更小。"""
    mask = image.convert("L").point(lambda value: 0 if value > threshold else 255)
    box = mask.getbbox()
    if not box:
        return image
    left, top, right, bottom = box
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(image.width, right + pad)
    bottom = min(image.height, bottom + pad)
    if right - left < image.width * 0.5 or bottom - top < image.height * 0.4:
        return image
    return image.crop((left, top, right, bottom))


def render_pdf(pdf_path, target_dir, level_id):
    doc = pymupdf.open(pdf_path)
    os.makedirs(target_dir, exist_ok=True)
    count = 0
    for index, page in enumerate(doc, start=1):
        scale = TARGET_WIDTH / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), colorspace=pymupdf.csRGB)
        image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        image = trim_white(image)
        out = os.path.join(target_dir, "%s-%d.%s" % (level_id, index, EXT))
        image.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        count += 1
    doc.close()
    return count


def write_viewer(book):
    viewer_dir = os.path.join(PROJECT, "handouts", "b%d" % book, "viewer")
    os.makedirs(viewer_dir, exist_ok=True)
    with open(os.path.join(viewer_dir, "viewer.js"), "w", encoding="utf-8") as fp:
        fp.write(
            '// 分包页面：逻辑统一放在主包 utils/handout-viewer.js\n'
            'const viewer = require("../../../utils/handout-viewer");\n'
            'Page(viewer.createPage("b%d"));\n' % book
        )
    for suffix in ("wxml", "wxss"):
        shutil.copyfile(
            os.path.join(TEMPLATES, "viewer." + suffix),
            os.path.join(viewer_dir, "viewer." + suffix),
        )
    with open(os.path.join(viewer_dir, "viewer.json"), "w", encoding="utf-8") as fp:
        json.dump({"navigationBarTitleText": "讲义", "usingComponents": {}}, fp,
                  ensure_ascii=False, indent=2)
        fp.write("\n")


def dir_size(path):
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            total += os.path.getsize(os.path.join(root, name))
    return total


def main():
    levels = load_levels()
    pdfs = scan_pdfs()

    handouts = {"books": {}, "levels": {}}
    per_book = {}
    missing = []
    problems = []

    for level in levels:
        book = level["book"]
        mapping = OVERRIDES.get(book, {})
        pdf_number = mapping.get(level["number"], level["number"])
        pdf_path = pdfs.get(book, {}).get(pdf_number)
        if not pdf_path:
            missing.append("%s (第%d关 %s)" % (level["id"], level["number"], level["name"]))
            continue

        pages = render_pdf(
            pdf_path,
            os.path.join(PROJECT, "handouts", "b%d" % book, "pages"),
            level["id"],
        )
        handouts["levels"][level["id"]] = {"book": "b%d" % book, "pages": pages}
        per_book.setdefault(book, {"levels": 0, "pages": 0})
        per_book[book]["levels"] += 1
        per_book[book]["pages"] += pages

        if pdf_number != level["number"]:
            problems.append("b%d 第%d关《%s》← 讲义第%d关" % (
                book, level["number"], level["name"], pdf_number))

    for book, info in sorted(per_book.items()):
        handouts["books"]["b%d" % book] = {
            "name": [lv["stageName"] for lv in levels if lv["book"] == book][0],
            "bookNumber": book,
            "dir": "/handouts/b%d" % book,
        }
        write_viewer(book)

    with open(os.path.join(DATA, "handouts.js"), "w", encoding="utf-8") as fp:
        fp.write("module.exports = ")
        json.dump(handouts, fp, ensure_ascii=False, separators=(",", ":"))
        fp.write(";\n")

    print("关卡讲义：%d 关 / %d 页" % (len(handouts["levels"]),
                                    sum(v["pages"] for v in handouts["levels"].values())))
    total = 0
    for book, info in sorted(per_book.items()):
        size = dir_size(os.path.join(PROJECT, "handouts", "b%d" % book))
        total += size
        flag = "OK " if size <= MAX_BOOK_BYTES else "OVER"
        print("  %s b%d %-4s %2d 关 %2d 页  %5.2f MB" % (
            flag, book, handouts["books"]["b%d" % book]["name"],
            info["levels"], info["pages"], size / 1048576))
    print("合计 %.2f MB" % (total / 1048576))

    if problems:
        print("按标题对齐的关卡：")
        for item in problems:
            print("  " + item)
    if missing:
        print("没有找到讲义：")
        for item in missing:
            print("  " + item)

    over = [b for b in per_book
            if dir_size(os.path.join(PROJECT, "handouts", "b%d" % b)) > MAX_BOOK_BYTES]
    return 1 if over else 0


if __name__ == "__main__":
    sys.exit(main())
