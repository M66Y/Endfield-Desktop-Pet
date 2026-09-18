# 开心(视频帧序列)动作 - 阶段2: 去阴影 + 固定锚点配准 + 共享调色板打包
# 前置: ffmpeg 抽帧到 tools/tmp_happy/f*.png;  阶段1(tools/happy_frames.py)生成 a*.png 去底图
# 用法: python tools/happy_pack.py [目标高度, 默认600]
import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, 'tools')
from happy_frames import largest_component

ANCHOR = (266, 636)   # 脚底中心锚点(资产坐标), 与纸偶脚线一致
TARGET_H = float(sys.argv[1]) if len(sys.argv) > 1 else 600
SHADOW = dict(sat=20, lo=100, hi=215, band=0.13)  # 阴影判定: 低饱和灰 & 底部条带

files = sorted(glob.glob('tools/pets/jielpeita/tmp_happy/f*.png'))
assert files, 'no frames (run ffmpeg first)'

# ---- 1. 去底 + 去阴影 ----
frames = []
heights = []
for f in files:
    arr = np.array(Image.open(f).convert('RGB'))
    alpha = largest_component(np.array(Image.open(f.replace('f', 'a', 1)).convert('RGBA'))[:, :, 3], 500)
    m = alpha > 127
    ys, xs = np.where(m)
    y0, y1 = ys.min(), ys.max()
    band_top = int(y1 - (y1 - y0) * SHADOW['band'])
    r = arr.astype(np.int32)
    lum = (r[:, :, 0] * 299 + r[:, :, 1] * 587 + r[:, :, 2] * 114) // 1000
    sat = arr.max(axis=2).astype(np.int32) - arr.min(axis=2).astype(np.int32)
    shadow = (sat <= SHADOW['sat']) & (lum >= SHADOW['lo']) & (lum <= SHADOW['hi'])
    shadow[:band_top, :] = False
    alpha[shadow] = 0
    a2 = largest_component(alpha, 10 ** 9)  # 只留主连通域: 次级组件全是灰尘/碎屑
    ys, xs = np.where(a2 > 127)
    frames.append((arr, a2, xs.min(), ys.min(), xs.max(), ys.max()))
    heights.append(ys.max() - ys.min())

# ---- 2. 固定锚点配准(全帧同一偏移, 消除逐帧锚点跳动) ----
s = TARGET_H / float(np.median(heights))
bots, cxs = [], []
for (arr, a2, x0, y0, x1, y1) in frames:
    bots.append(y1)
    cxs.append((x0 + x1) / 2)
AX, AY = float(np.median(cxs)), float(np.median(bots))   # 视频原始坐标的锚点(帧中位)
ox = int(round(ANCHOR[0] - AX * s))
oy = int(round(ANCHOR[1] - AY * s))
print(f'fixed anchor: video({AX:.0f},{AY:.0f}) *{s:.4f} -> offset({ox},{oy})')

registered = []
for (arr, a2, x0, y0, x1, y1) in frames:
    im = Image.fromarray(np.dstack([arr, a2]))
    im_s = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
    canvas = Image.new('RGBA', (533, 640), (0, 0, 0, 0))
    canvas.alpha_composite(im_s, (ox, oy))
    registered.append(canvas)
# 视频自身的运动(迈步/起伏/向前)都在像素内容里, 全帧静态摆放不产生额外抖动

u_x0, u_y0, u_x1, u_y1 = 533, 640, 0, 0
for cv in registered:
    a = np.array(cv)[:, :, 3]
    ys, xs = np.where(a > 8)
    u_x0, u_y0 = min(u_x0, int(xs.min())), min(u_y0, int(ys.min()))
    u_x1, u_y1 = max(u_x1, int(xs.max())), max(u_y1, int(ys.max()))
print('union rect:', u_x0, u_y0, u_x1, u_y1)

# ---- 3. 颜色向纸偶配准(均值/方差匹配) + 锐化 + WebP ----
base_im = Image.open('assets/pets/jielpeita/base.png').convert('RGBA')
barr = np.array(base_im).astype(np.float32)
bmask = barr[:, :, 3] > 200
bpx = barr[:, :, :3][bmask]

pool = []
for cv in registered[::5]:
    a = np.array(cv)[:, :, 3]
    m = a > 200
    px = np.array(cv).astype(np.float32)[:, :, :3][m]
    pool.append(px[::7])
cpx = np.concatenate(pool)
gain = np.clip(bpx.std(axis=0) / np.maximum(cpx.std(axis=0), 1), 0.8, 1.25)
offset = bpx.mean(axis=0) - cpx.mean(axis=0) * gain
print('color transfer gain=', gain.round(3), 'offset=', offset.round(1))

total = 0
for i, cv in enumerate(registered):
    a = cv.getchannel('A').filter(ImageFilter.GaussianBlur(0.6))
    arr = np.array(cv).astype(np.float32)
    arr[:, :, :3] = np.clip(arr[:, :, :3] * gain + offset, 0, 255)
    out_im = Image.fromarray(arr.astype(np.uint8))
    out_im.putalpha(a)
    out_im = out_im.filter(ImageFilter.UnsharpMask(radius=2, percent=90, threshold=2))
    out = f'assets/pets/jielpeita/pets/jielpeita/happy_{i:02d}.webp'
    out_im.save(out, quality=93, method=6)
    total += os.path.getsize(out)
print(f'{len(registered)} frames, total {total / 1e6:.2f} MB')

man = json.load(open('assets/pets/jielpeita/manifest.json', encoding='utf8'))
man.setdefault('clips', {})['happy'] = {
    'count': len(registered), 'fps': 12, 'ext': 'webp',
    'ox': u_x0, 'oy': u_y0, 'w': u_x1 - u_x0 + 1, 'h': u_y1 - u_y0 + 1,
}
json.dump(man, open('assets/pets/jielpeita/manifest.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
with open('assets/pets/jielpeita/manifest.js', 'w', encoding='utf8') as f:
    f.write('window.PET_MANIFEST = ')
    json.dump(man, f, ensure_ascii=False)
    f.write(';\n')
print('manifest patched')
