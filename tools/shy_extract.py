# 害羞捂脸 overlay 提取
# 1) 复现 process.py 的参考图裁剪流程, 得到 资产坐标系 的精确映射
# 2) 把捂脸图按 tools/shy_transform.json 变换到资产坐标系
# 3) 颜色+区域掩码抠出 闭眼/脸红/手套/袖口 -> assets/shy.png + manifest 补丁
import json
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC_REF = r'C:\Users\29569\.zcode\cli\image-cache\sess_991e213d-0463-4dae-977e-f6a17e1737c0\image-2c4118a390afa01f5883dabbf889148d.png'
SRC_SHY = r'D:\下载\捂脸1.png'
OUT = 'assets'


def flood_alpha(arr):
    """复现 process.py: 涂水印(可选) + 泛洪去白底 -> alpha"""
    H0, W0 = arr.shape[:2]
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
    for _ in range(3):
        trans = alpha == 0
        nb = np.zeros_like(trans)
        nb[1:, :] |= trans[:-1, :]; nb[:-1, :] |= trans[1:, :]
        nb[:, 1:] |= trans[:, :-1]; nb[:, :-1] |= trans[:, 1:]
        alpha[nb & near_white] = 0
    return alpha


# ---------- 1. 参考图裁剪流程 ----------
ref = Image.open(SRC_REF).convert('RGB')
ref_arr = np.array(ref)
ref_arr[2090:, 1400:, :] = 255  # 与 process.py 相同的水印涂白, 保证 bbox/裁剪完全一致
alpha_ref = flood_alpha(ref_arr)
mask_ref = alpha_ref > 127
ys, xs = np.where(mask_ref)
bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max(), ys.max()
pad = 8
cx0, cy0, cx1, cy1 = bx0 - pad, by0 - pad, bx1 + pad, by1 + pad
CROP_H = cy1 - cy0
s = 640 / CROP_H
CW, CH = round((cx1 - cx0) * s), 640
print(f'ref bbox=({bx0},{by0},{bx1},{by1}) crop_h={CROP_H} s={s:.6f} work={CW}x{CH}')


def ref2work(vx, vy):
    return (vx - cx0) * s, (vy - cy0) * s


# ---------- 2. 捂脸图 -> 资产坐标系 ----------
tr = json.load(open('tools/shy_transform.json'))
shy = Image.open(SRC_SHY).convert('RGB')
shy_arr = np.array(shy)
shy_arr[2140:, 1400:, :] = 255  # 水印
alpha_shy = flood_alpha(shy_arr)
shy_rgba = np.dstack([shy_arr, alpha_shy])
shy_im = Image.fromarray(shy_rgba)

sc = tr['scale']
nw, nh = round(shy.width * sc), round(shy.height * sc)
shy_s = shy_im.resize((nw, nh), Image.LANCZOS)
frame = Image.new('RGBA', ref.size, (0, 0, 0, 0))
frame.paste(shy_s, (round(tr['tx']), round(tr['ty'])), shy_s)
frame = frame.crop((cx0, cy0, cx1, cy1))
shy_work = frame.resize((CW, CH), Image.LANCZOS)
shy_work.save('tools/dbg_shy_work.png')

base = Image.open(f'{OUT}/base.png')
dbg = base.convert('RGBA')
layer = shy_work.copy()
a = layer.getchannel('A').point(lambda v: int(v * 0.65))
layer.putalpha(a)
dbg.alpha_composite(layer)
d = ImageDraw.Draw(dbg)
for gx in range(0, CW, 20):
    d.line([(gx, 0), (gx, CH)], fill=(0, 160, 255, 120))
    if gx % 100 == 0:
        d.text((gx + 2, 2), str(gx), fill=(0, 90, 200, 255))
for gy in range(0, CH, 20):
    d.line([(0, gy), (CW, gy)], fill=(0, 160, 255, 120))
    if gy % 100 == 0:
        d.text((2, gy + 2), str(gy), fill=(0, 90, 200, 255))
dbg.convert('RGB').save('tools/dbg_shy_inwork.png')
print('saved tools/dbg_shy_inwork.png')

# ---------- 3. 特征提取 ----------
rgb = np.array(shy_work.convert('RGB')).astype(np.int32)  # int32! 亮度公式会溢出 int16
alpha_w = np.array(shy_work.getchannel('A'))
H, W = alpha_w.shape
Y, X = np.mgrid[0:H, 0:W]
lum = (rgb[:, :, 0] * 299 + rgb[:, :, 1] * 587 + rgb[:, :, 2] * 114) // 1000
R, G, B = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]


def box(x0, y0, x1, y1):
    m = np.zeros((H, W), dtype=bool)
    m[max(0, y0):min(H, y1), max(0, x0):min(W, x1)] = True
    return m


dark = lum < 105                      # 手套/袖口/眼线/轮廓
red = (R > 130) & (R - G > 60) & (R - B > 50)   # 红袖子
blush = (R > 170) & (R - B > 30) & (R - G > 18) & (G > 120)  # 脸红(比皮肤粉)
skin = (R > 195) & (G > 165) & (B > 145)        # 脸部皮肤(排除棕色发丝)

# 区域边界 (资产坐标, 依据 dbg_shy_inwork.png 网格目测调整)
# 上脸带(186-232): 整片取害羞图内容(头发+皮肤+眉) —— 盖掉底图自己的眉毛/睫毛上缘,
# 否则底图眉毛露在贴片上方, 与害羞贴片的眉毛形成"两套眉毛"的割裂感
face_box = box(172, 186, 370, 232)     # 上脸带: 整片收(盖掉底图眉眼)
arm_band = box(140, 232, 400, 320)     # 手臂带: 视频已抬起的手臂+手套+袖口, 到视频衣领环上方
lum_i = (rgb[:, :, 0] * 299 + rgb[:, :, 1] * 587 + rgb[:, :, 2] * 114) // 1000
sat_i = rgb.max(axis=2) - rgb.min(axis=2)
white = (lum_i > 215) & (sat_i <= 25)  # 袖口高光

feat = np.zeros((H, W), dtype=bool)
feat |= face_box & (alpha_w > 127)                                   # 上脸: 全收
feat |= arm_band & (red | dark | skin | blush | white) & (alpha_w > 127)

# ---------- 3.5 颜色校正: 让害羞图皮肤与底图皮肤同调, 消除接缝 ----------
# 用额头皮肤间隙配对采样(头发/眉毛/眼线都被亮度滤波排除), 取中位数色差
def region_med(a, y0, y1, x0, x1, alpha=None):
    p = a[y0:y1, x0:x1, :3].reshape(-1, 3).astype(np.int32)
    if alpha is not None:
        m = alpha[y0:y1, x0:x1].reshape(-1) > 200
        p = p[m]
    lum = (p[:, 0] * 299 + p[:, 1] * 587 + p[:, 2] * 114) // 1000  # int32, 防 int16 溢出
    p = p[lum > 170]  # 只留亮部(排除深色线条/发丝)
    return np.median(p, axis=0)

b_med = region_med(np.array(base).astype(np.int16), 194, 212, 185, 355)
s_med = region_med(rgb.astype(np.int16), 194, 212, 185, 355, alpha=alpha_w)
delta = np.round(b_med - s_med).astype(np.int16)
print('skin color delta (shy -> base):', delta)
shift = np.zeros_like(rgb)
shift[:, :, 0] = delta[0]; shift[:, :, 1] = delta[1]; shift[:, :, 2] = delta[2]
face_zone = (face_box | arm_band) & (alpha_w > 127)  # 全贴片统一微调(色差幅度很小)
rgb = np.where(face_zone[:, :, None], np.clip(rgb + shift, 0, 255), rgb).astype(np.int32)

# 膨胀 + 羽化
m_im = Image.fromarray((feat * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
a_im = m_im.filter(ImageFilter.GaussianBlur(2.2))
alpha_out = np.clip(np.array(a_im).astype(np.float32) * 1.9, 0, 255).astype(np.uint8)
alpha_out &= alpha_w  # 不超出角色

out = np.dstack([rgb.astype(np.uint8), alpha_out])
ys2, xs2 = np.where(alpha_out > 8)
ox, oy = int(xs2.min()), int(ys2.min())
w2, h2 = int(xs2.max()) - ox + 1, int(ys2.max()) - oy + 1
sub = out[oy:oy + h2, ox:ox + w2]
Image.fromarray(sub).save(f'{OUT}/shy.png')
print(f'assets/shy.png saved, ox={ox} oy={oy} size={w2}x{h2}')

# ---------- 4. manifest 补丁 ----------
man = json.load(open(f'{OUT}/manifest.json', encoding='utf8'))
man.setdefault('sprites', {})['shy'] = {'img': 'shy.png', 'ox': ox, 'oy': oy, 'pivot': [round(w2 / 2), round(h2 * 0.62)]}
json.dump(man, open(f'{OUT}/manifest.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
with open(f'{OUT}/manifest.js', 'w', encoding='utf8') as f:
    f.write('window.PET_MANIFEST = ')
    json.dump(man, f, ensure_ascii=False)
    f.write(';\n')
print('manifest patched')

# ---------- 5. 合成预览 ----------
prev = base.convert('RGBA')
ov = Image.fromarray(sub)
prev.alpha_composite(ov, (ox, oy))
prev.convert('RGB').save('tools/dbg_shy_composite.png')
print('saved tools/dbg_shy_composite.png')
