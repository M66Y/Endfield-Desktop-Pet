# 洁尔佩塔桌宠 - 参考图分层切割管线
# 输入: 参考图 PNG -> 输出: assets/*.png 零件 + manifest.json
import json
import math
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = r'C:\Users\29569\.zcode\cli\image-cache\sess_991e213d-0463-4dae-977e-f6a17e1737c0\image-2c4118a390afa01f5883dabbf889148d.png'
OUT = 'assets'
TARGET_H = 640  # 角色像素高度（缩放后）

# ---------- 1. 载入 + 去水印 ----------
im = Image.open(SRC).convert('RGB')
W0, H0 = im.size
arr = np.array(im)
arr[2090:, 1400:, :] = 255  # 水印区域直接涂白（角色脚底 y<2170，x<1200，无重叠）

# ---------- 2. 泛洪去白底（从边缘扩散，只清连成片的白，保留眼内高光） ----------
near_white = (arr[:, :, 0] >= 238) & (arr[:, :, 1] >= 238) & (arr[:, :, 2] >= 238)
visited = np.zeros((H0, W0), dtype=bool)
dq = deque()
for x in range(W0):
    for y in (0, H0 - 1):
        if near_white[y, x] and not visited[y, x]:
            visited[y, x] = True; dq.append((y, x))
for y in range(H0):
    for x in (0, W0 - 1):
        if near_white[y, x] and not visited[y, x]:
            visited[y, x] = True; dq.append((y, x))
while dq:
    y, x = dq.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H0 and 0 <= nx < W0 and not visited[ny, nx] and near_white[ny, nx]:
            visited[ny, nx] = True; dq.append((ny, nx))
alpha = np.where(visited, 0, 255).astype(np.uint8)

# 清理：与透明区相邻的近白像素也清掉（边缘残留）
for _ in range(3):
    trans = alpha == 0
    nb = np.zeros_like(trans)
    nb[1:, :] |= trans[:-1, :]; nb[:-1, :] |= trans[1:, :]
    nb[:, 1:] |= trans[:, :-1]; nb[:, :-1] |= trans[:, 1:]
    kill = nb & near_white
    alpha[kill] = 0

mask_full = alpha > 127
ys, xs = np.where(mask_full)
bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
print('char bbox', bx0, by0, bx1, by1, 'size', bx1 - bx0, by1 - by0)

# ---------- 3. 裁剪 + 缩放到工作尺寸 ----------
pad = 8
crop = im.crop((bx0 - pad, by0 - pad, bx1 + pad, by0 + pad + 0))
crop = im.crop((max(0, bx0 - pad), max(0, by0 - pad), min(W0, bx1 + pad), min(H0, by1 + pad)))
a_crop = Image.fromarray(alpha).crop(crop.size and (max(0, bx0 - pad), max(0, by0 - pad), min(W0, bx1 + pad), min(H0, by1 + pad)))
s = TARGET_H / a_crop.height
new_w, new_h = round(a_crop.width * s), round(a_crop.height * s)
rgb_s = crop.resize((new_w, new_h), Image.LANCZOS)
a_s = a_crop.resize((new_w, new_h), Image.LANCZOS)
M = np.array(a_s) > 127  # 角色掩码（工作坐标）
CW, CH = new_w, new_h


def S(v):  # 原图坐标 -> 工作坐标
    return v * s


# ---------- 4. 部件定义（原图坐标） ----------
def poly_mask(points, bbox, side):
    """取折线某一侧与 bbox 交集的掩码; side: above/below/left/right"""
    x0, y0, x1, y1 = [int(round(S(v))) for v in bbox]
    m = np.zeros((CH, CW), dtype=bool)
    x0c, y0c = max(0, x0), max(0, y0)
    x1c, y1c = min(CW, x1), min(CH, y1)
    if x1c <= x0c or y1c <= y0c:
        return m
    pts = [(S(px), S(py)) for px, py in points]
    if side == 'above':
        closed = [(x0c, y0c), (x1c, y0c)] + pts[::-1]
    elif side == 'below':
        closed = [(x0c, y1c), (x1c, y1c)] + pts[::-1]
    elif side == 'left':
        closed = pts + [(x0c, pts[-1][1]), (x0c, pts[0][1])]
    else:  # right
        closed = pts + [(x1c, pts[-1][1]), (x1c, pts[0][1])]
    sub = Image.new('1', (x1c - x0c, y1c - y0c), 0)
    d = ImageDraw.Draw(sub)
    d.polygon([(px - x0c, py - y0c) for px, py in closed], fill=1)
    m[y0c:y1c, x0c:x1c] = np.array(sub, dtype=bool)
    return m


def box_mask(bbox, extra_cut=None):
    x0, y0, x1, y1 = [int(round(S(v))) for v in bbox]
    m = np.zeros((CH, CW), dtype=bool)
    x0c, y0c, x1c, y1c = max(0, x0), max(0, y0), min(CW, x1), min(CH, y1)
    m[y0c:y1c, x0c:x1c] = True
    if extra_cut is not None:  # extra_cut: (xmin,ymin,xmax,ymax) 原图坐标, 减去该区域
        ex0, ey0, ex1, ey1 = [int(round(S(v))) for v in extra_cut]
        ex0c, ey0c, ex1c, ey1c = max(0, ex0), max(0, ey0), min(CW, ex1), min(CH, ey1)
        m[ey0c:ey1c, ex0c:ex1c] = False
    return m


def below_mask(cut_y, bbox):
    x0, _, x1, _ = [int(round(S(v))) for v in bbox]
    yc = int(round(S(cut_y)))
    m = np.zeros((CH, CW), dtype=bool)
    x0c, x1c = max(0, x0), min(CW, x1)
    yc = max(0, min(CH, yc))
    m[yc:, x0c:x1c] = True
    return m


def erode(m, k):
    im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(k * 2 + 1))
    return np.array(im) > 127


def dilate(m, k):
    im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(k * 2 + 1))
    return np.array(im) > 127


# 狐耳（沿发际线切，耳朵画在底图上层）
earL_line = [(388, 452), (500, 400), (620, 345), (720, 300), (795, 280)]
earR_line = [(1075, 292), (1180, 272), (1300, 300), (1420, 380), (1450, 455)]
earL_bbox = (380, 25, 800, 465)
earR_bbox = (1065, 20, 1460, 470)
earL_m = poly_mask(earL_line, earL_bbox, 'above') & M
earR_m = poly_mask(earR_line, earR_bbox, 'above') & M
# 减发夹区域，避免发夹跟着耳朵动
earL_m &= ~box_mask((380, 350, 472, 475))
earR_m &= ~box_mask((1382, 355, 1470, 480))

# 双马尾（画在底图下层；沿内侧边界切）
tailL_line = [(355, 500), (420, 570), (465, 690), (488, 840), (484, 990), (470, 1130), (453, 1290), (438, 1450), (430, 1620), (427, 1760), (428, 1845)]
tailR_line = [(1450, 500), (1418, 590), (1372, 700), (1352, 820), (1350, 950), (1358, 1100), (1372, 1250), (1385, 1420), (1392, 1580), (1394, 1740), (1389, 1840)]
tailL_m = poly_mask(tailL_line, (80, 425, 500, 1860), 'left') & M
tailR_m = poly_mask(tailR_line, (1345, 425, 1770, 1885), 'right') & M
# 排除发夹，避免发夹跟着马尾晃
tailL_m &= ~box_mask((280, 465, 445, 585))
tailR_m &= ~box_mask((1375, 350, 1475, 505))

# 腿（从裙摆下方切，沿靴子轮廓甩开大衣红内衬； sprite 上沿多留 6px 皮肤盖住接缝）
LEG_CUT = 1735
legL_line = [(715, 1729), (706, 1792), (698, 1860), (692, 1935), (668, 2000), (642, 2052), (617, 2100), (613, 2168)]
legR_line = [(1035, 1729), (1043, 1795), (1035, 1890), (1010, 1975), (1005, 2005), (1055, 2045), (1082, 2110), (1086, 2168)]
legL_m = poly_mask(legL_line, (600, LEG_CUT - 40, 848, 2168), 'right') & below_mask(LEG_CUT - 6, (600, 0, 848, 2168)) & M
legR_m = poly_mask(legR_line, (852, LEG_CUT - 40, 1100, 2168), 'left') & below_mask(LEG_CUT - 6, (852, 0, 1100, 2168)) & M

parts = {
    'earL': (earL_m, (585, 365)),
    'earR': (earR_m, (1262, 373)),
    'tailL': (tailL_m, (400, 540)),
    'tailR': (tailR_m, (1420, 540)),
    'legL': (legL_m, (750, 1745)),
    'legR': (legR_m, (950, 1745)),
}

# ---------- 5. 底图挖孔（孔洞收缩保留原图边缘环，旋转零件时位移被环遮住） ----------
hole = np.zeros((CH, CW), dtype=bool)
hole |= erode(earL_m, 4) | erode(earR_m, 4)
hole |= erode(tailL_m, 4) | erode(tailR_m, 4)
hole |= erode(legL_m, 2) | erode(legR_m, 2)
base_alpha = np.where(hole, 0, np.array(a_s)).astype(np.uint8)

os.makedirs(OUT, exist_ok=True)


def save_part(name, m):
    rgb_arr = np.array(rgb_s)
    m = dilate(m, 1)  # 外扩 1px：与底图重叠，盖住切割线的抗锯齿缝隙
    a = np.where(m, np.array(a_s), 0).astype(np.uint8)
    ys, xs = np.where(m)
    ox, oy = int(xs.min()), int(ys.min())
    w, h = int(xs.max()) - ox + 1, int(ys.max()) - oy + 1
    sub = a[oy:oy + h, ox:ox + w]
    sub_rgb = rgb_arr[oy:oy + h, ox:ox + w]
    Image.fromarray(np.dstack([sub_rgb, sub])).save(f'{OUT}/{name}.png')
    return ox, oy


manifest = {'canvas': {'w': CW, 'h': CH}, 'sprites': {}, 'feetY': int(S(2168)), 'eyes': {}, 'mouth': {}, 'colors': {},
            'faces': {},  # 表情变体: {名字: {img, x, y}}，由 --face 子命令填充
            'faceRect': [round(S(v)) for v in (560, 700, 1300, 1160)]}  # 原图脸部范围（供换脸裁切参考）
manifest['sprites']['base'] = {'img': 'base.png', 'ox': 0, 'oy': 0}
Image.fromarray(np.dstack([np.array(rgb_s), base_alpha])).save(f'{OUT}/base.png')
for name, (m, pivot) in parts.items():
    ox, oy = save_part(name, m)
    manifest['sprites'][name] = {
        'img': f'{name}.png', 'ox': ox, 'oy': oy,
        'pivot': [round(S(pivot[0])) - ox, round(S(pivot[1])) - oy],  # 相对 sprite 左上角
    }

# ---------- 6. 眼睛/嘴巴区域与颜色采样 ----------
manifest['eyes']['L'] = {'rect': [round(S(v)) for v in (575, 768, 822, 978)]}
manifest['eyes']['R'] = {'rect': [round(S(v)) for v in (933, 762, 1197, 975)]}
manifest['mouth']['rect'] = [round(S(v)) for v in (830, 970, 930, 1090)]

rgb = np.array(rgb_s)


def region_med(x0, y0, x1, y1, keep_bright=None):
    reg = rgb[y0:y1, x0:x1].reshape(-1, 3)
    a = np.array(a_s)[y0:y1, x0:x1].reshape(-1) > 127
    reg = reg[a]
    if keep_bright is not None:  # 只保留较亮像素（排除深色线条）
        reg = reg[reg.mean(axis=1) >= keep_bright]
    return [int(v) for v in np.median(reg, axis=0)]


# 眼周皮肤：眼睛外一圈
for side, (ex0, ey0, ex1, ey1) in (('L', (575, 768, 822, 978)), ('R', (933, 762, 1197, 975))):
    sx0, sy0, sx1, sy1 = [round(S(v)) for v in (ex0, ey0, ex1, ey1)]
    ring = 8
    patches = [
        rgb[max(0, sy0 - ring):sy0, sx0:sx1].reshape(-1, 3),
        rgb[sy1:sy1 + ring, sx0:sx1].reshape(-1, 3),
        rgb[sy0:sy1, max(0, sx0 - ring):sx0].reshape(-1, 3),
        rgb[sy0:sy1, sx1:sx1 + ring].reshape(-1, 3),
    ]
    reg = np.concatenate(patches)
    a = np.concatenate([
        (np.array(a_s)[max(0, sy0 - ring):sy0, sx0:sx1] > 127).reshape(-1),
        (np.array(a_s)[sy1:sy1 + ring, sx0:sx1] > 127).reshape(-1),
        (np.array(a_s)[sy0:sy1, max(0, sx0 - ring):sx0] > 127).reshape(-1),
        (np.array(a_s)[sy0:sy1, sx1:sx1 + ring] > 127).reshape(-1),
    ])
    reg = reg[a & (reg.mean(axis=1) > 120)]
    manifest['colors'][f'skin{side}'] = [int(v) for v in np.median(reg, axis=0)]

# 嘴周皮肤 + 嘴线颜色
mx0, my0, mx1, my1 = manifest['mouth']['rect']
reg = rgb[my0 - 6:my0, mx0:mx1].reshape(-1, 3)
manifest['colors']['skinM'] = [int(v) for v in np.median(reg, axis=0)]
mreg = rgb[my0:my1, mx0:mx1].reshape(-1, 3)
mreg = mreg[mreg.mean(axis=1) < 150]
manifest['colors']['mouthLine'] = [int(v) for v in np.median(mreg, axis=0)] if len(mreg) else [180, 90, 90]
# 睫毛线颜色（眼睛顶部深色条）
sx0, sy0, sx1, sy1 = manifest['eyes']['L']['rect']
lreg = rgb[sy0:sy0 + 14, sx0:sx1].reshape(-1, 3)
lreg = lreg[lreg.mean(axis=1) < 90]
manifest['colors']['lash'] = [int(v) for v in np.median(lreg, axis=0)] if len(lreg) else [45, 30, 25]

with open(f'{OUT}/manifest.json', 'w', encoding='utf8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=1)
with open(f'{OUT}/manifest.js', 'w', encoding='utf8') as f:
    f.write('window.PET_MANIFEST = ')
    json.dump(manifest, f, ensure_ascii=False)
    f.write(';\n')
print('manifest saved; colors:', manifest['colors'])

# ---------- 7. 调试合成图：棋盘格 + 各零件描边 ----------
dbg = Image.new('RGB', (CW, CH), (235, 235, 235))
dd = ImageDraw.Draw(dbg)
for gy in range(0, CH, 24):
    for gx in range(0, CW, 24):
        if (gx // 24 + gy // 24) % 2:
            dd.rectangle([gx, gy, gx + 23, gy + 23], fill=(215, 215, 215))
base_img = Image.open(f'{OUT}/base.png')
dbg.paste(base_img, (0, 0), base_img)
for name in ('tailL', 'tailR', 'legL', 'legR', 'earL', 'earR'):
    p = Image.open(f'{OUT}/{name}.png')
    sp = manifest['sprites'][name]
    tint = Image.new('RGB', p.size, (255, 0, 255))
    edge = np.array(p)[:, :, 3]
    edge_im = Image.fromarray(((edge > 0) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    dbg.paste(tint, (sp['ox'], sp['oy']), edge_im.point(lambda v: 60 if v > 127 else 0))
    dd.line([ (sp['ox'] + sp['pivot'][0] - 8, sp['oy'] + sp['pivot'][1]),
              (sp['ox'] + sp['pivot'][0] + 8, sp['oy'] + sp['pivot'][1])], fill=(0, 160, 255), width=2)
    dd.line([ (sp['ox'] + sp['pivot'][0], sp['oy'] + sp['pivot'][1] - 8),
              (sp['ox'] + sp['pivot'][0], sp['oy'] + sp['pivot'][1] + 8)], fill=(0, 160, 255), width=2)
dbg.thumbnail((560, 900))
dbg.save('tools/dbg_composite.png')
print('debug composite saved')
