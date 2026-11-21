# -*- coding: utf-8 -*-
"""生成小程序 tabBar 图标（81x81 PNG，普通态 + 选中态）。"""
from PIL import Image, ImageDraw
import os

OUT = r"E:\primary-english-grammar-miniprogram\images"
os.makedirs(OUT, exist_ok=True)
S = 4  # 超采样
BASE = 81

NORMAL = (154, 149, 139, 255)   # #9A958B
ACTIVE = (138, 106, 70, 255)    # #8A6A46


def canvas():
    return Image.new("RGBA", (BASE * S, BASE * S), (0, 0, 0, 0))


def save(img, name):
    img = img.resize((BASE, BASE), Image.LANCZOS)
    img.save(os.path.join(OUT, name))


def draw_home(color, name):
    img = canvas()
    d = ImageDraw.Draw(img)
    w = 6 * S
    # 屋顶
    d.line([(14 * S, 38 * S), (40.5 * S, 15 * S), (67 * S, 38 * S)], fill=color, width=w, joint="curve")
    # 墙体
    d.line([(20 * S, 36 * S), (20 * S, 65 * S)], fill=color, width=w)
    d.line([(61 * S, 36 * S), (61 * S, 65 * S)], fill=color, width=w)
    d.line([(20 * S, 65 * S), (61 * S, 65 * S)], fill=color, width=w)
    # 门
    d.rounded_rectangle([34 * S, 48 * S, 47 * S, 65 * S], radius=4 * S, outline=color, width=w)
    save(img, name)


def draw_map(color, name):
    img = canvas()
    d = ImageDraw.Draw(img)
    w = 6 * S
    # 三块折页地图
    pts_top = [(14 * S, 26 * S), (31 * S, 20 * S), (50 * S, 26 * S), (67 * S, 20 * S)]
    pts_bottom = [(14 * S, 26 * S), (14 * S, 58 * S), (31 * S, 64 * S), (50 * S, 58 * S), (67 * S, 64 * S), (67 * S, 20 * S)]
    d.line(pts_top, fill=color, width=w, joint="curve")
    d.line(pts_bottom, fill=color, width=w, joint="curve")
    d.line([(31 * S, 20 * S), (31 * S, 64 * S)], fill=color, width=w)
    d.line([(50 * S, 26 * S), (50 * S, 58 * S)], fill=color, width=w)
    save(img, name)


def draw_book(color, name):
    img = canvas()
    d = ImageDraw.Draw(img)
    w = 6 * S
    # 书脊
    d.line([(40.5 * S, 24 * S), (40.5 * S, 63 * S)], fill=color, width=w)
    # 左页
    d.line([(40.5 * S, 24 * S), (24 * S, 19 * S)], fill=color, width=w)
    d.line([(24 * S, 19 * S), (14 * S, 23 * S)], fill=color, width=w)
    d.line([(14 * S, 23 * S), (14 * S, 60 * S)], fill=color, width=w)
    d.line([(14 * S, 60 * S), (24 * S, 56 * S)], fill=color, width=w)
    d.line([(24 * S, 56 * S), (40.5 * S, 63 * S)], fill=color, width=w)
    # 右页
    d.line([(40.5 * S, 24 * S), (57 * S, 19 * S)], fill=color, width=w)
    d.line([(57 * S, 19 * S), (67 * S, 23 * S)], fill=color, width=w)
    d.line([(67 * S, 23 * S), (67 * S, 60 * S)], fill=color, width=w)
    d.line([(67 * S, 60 * S), (57 * S, 56 * S)], fill=color, width=w)
    d.line([(57 * S, 56 * S), (40.5 * S, 63 * S)], fill=color, width=w)
    save(img, name)


def draw_growth(color, name):
    img = canvas()
    d = ImageDraw.Draw(img)
    w = 6 * S
    # 柱状成长
    d.line([(13 * S, 64 * S), (69 * S, 64 * S)], fill=color, width=w)
    d.line([(21 * S, 64 * S), (21 * S, 47 * S)], fill=color, width=w)
    d.line([(40 * S, 64 * S), (40 * S, 34 * S)], fill=color, width=w)
    d.line([(59 * S, 64 * S), (59 * S, 21 * S)], fill=color, width=w)
    # 顶点小圆点
    for x, y in ((21, 47), (40, 34), (59, 21)):
        d.ellipse([(x - 4) * S, (y - 4) * S, (x + 4) * S, (y + 4) * S], fill=color)
    save(img, name)


def draw_me(color, name):
    img = canvas()
    d = ImageDraw.Draw(img)
    w = 6 * S
    # 头
    d.ellipse([(28 * S, 14 * S), (53 * S, 39 * S)], outline=color, width=w)
    # 肩膀
    d.arc([(15 * S, 42 * S), (66 * S, 86 * S)], start=200, end=340, fill=color, width=w)
    save(img, name)


draw_home(NORMAL, "tab-home.png")
draw_home(ACTIVE, "tab-home-active.png")
draw_map(NORMAL, "tab-map.png")
draw_map(ACTIVE, "tab-map-active.png")
draw_book(NORMAL, "tab-mistakes.png")
draw_book(ACTIVE, "tab-mistakes-active.png")
draw_growth(NORMAL, "tab-growth.png")
draw_growth(ACTIVE, "tab-growth-active.png")
draw_me(NORMAL, "tab-me.png")
draw_me(ACTIVE, "tab-me-active.png")
print("icons done:", os.listdir(OUT))
