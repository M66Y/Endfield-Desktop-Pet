# 害羞图对齐: 用刘海区域做带掩码的多尺度模板匹配, 求新图->参考图的相似变换
# 输出: tools/shy_transform.json {scale, tx, ty}  (新图坐标 * scale + t = 参考图坐标)
import json

import numpy as np
from PIL import Image
from scipy.signal import fftconvolve

SRC_REF = r'C:\Users\29569\.zcode\cli\image-cache\sess_991e213d-0463-4dae-977e-f6a17e1737c0\image-2c4118a390afa01f5883dabbf889148d.png'
SRC_SHY = r'D:\下载\捂脸1.png'

def load_gray_rgba(path):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    gray = (0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]).astype(np.float32)
    alpha = (a[:, :, 3] > 127)
    return gray, alpha

# 新图先粗去底(只为了模板掩码; 精确抠图在提取阶段做)
g_new, _ = load_gray_rgba(SRC_SHY)
arr = np.array(Image.open(SRC_SHY).convert('RGB'))
H0, W0 = arr.shape[:2]
near_white = (arr[:, :, 0] >= 238) & (arr[:, :, 1] >= 238) & (arr[:, :, 2] >= 238)
# 模板掩码 = 非白像素 (刘海区域内基本都是角色)
mask_new = ~near_white

g_ref, _ = load_gray_rgba(SRC_REF)
mask_ref = ~near_white  # 未用的占位

# 模板: 新图刘海区 (避手、避侧发帘)
TX0, TY0, TX1, TY1 = 560, 690, 1300, 945
T = g_new[TY0:TY1, TX0:TX1]
M = mask_new[TY0:TY1, TX0:TX1].astype(np.float32)

# 搜索目标区: 参考图头部区域
RX0, RY0, RX1, RY1 = 300, 400, 1600, 1250
I = g_ref[RY0:RY1, RX0:RX1]


def masked_ncc(I, T, M):
    """I: 目标灰度(H,W), T: 模板(h,w), M: 模板掩码(h,w) -> 零均值 NCC 响应图"""
    Mf = M[::-1, ::-1]
    Tf = (T * M)[::-1, ::-1]
    n = float(M.sum())
    SI = fftconvolve(I, Mf, mode='valid')
    SIT = fftconvolve(I, Tf, mode='valid')
    SI2 = fftconvolve(I * I, Mf, mode='valid')
    ST = float((M * T).sum())
    STT = float((M * T * T).sum())
    numer = SIT - SI * (ST / n)
    dI = np.sqrt(np.maximum(SI2 - SI * SI / n, 1e-6))
    dT = np.sqrt(max(STT - ST * ST / n, 1e-6))
    return numer / (dI * dT), n


def search(scale_range, ds=1):
    I_ds = I[::ds, ::ds]
    best = None
    for s in scale_range:
        tw, th = round(T.shape[1] * s / ds), round(T.shape[0] * s / ds)
        Ts = np.array(Image.fromarray(T).resize((tw, th), Image.LANCZOS), dtype=np.float32)
        Ms = np.array(Image.fromarray((M * 255).astype(np.uint8)).resize((tw, th), Image.LANCZOS), dtype=np.float32) / 255.0
        Ms = (Ms > 0.6).astype(np.float32)
        r, n = masked_ncc(I_ds, Ts, Ms)
        idx = np.unravel_index(np.argmax(r), r.shape)
        v = r[idx]
        if best is None or v > best[0]:
            # 匹配位置(原图坐标): 模板左上角落在 I 的 (y,x) 处
            px = RX0 + idx[1] * ds
            py = RY0 + idx[0] * ds
            # 变换: 新图模板左上角(TX0,TY0) * s + t = (px,py)
            best = (v, s, px - TX0 * s, py - TY0 * s, idx)
    return best


coarse = search(np.arange(0.92, 1.14, 0.02), ds=2)
print(f'coarse: ncc={coarse[0]:.4f} scale={coarse[1]:.3f} t=({coarse[2]:.1f},{coarse[3]:.1f})')
fine_range = np.arange(coarse[1] - 0.03, coarse[1] + 0.031, 0.0025)
fine = search(fine_range, ds=1)
print(f'fine:   ncc={fine[0]:.4f} scale={fine[1]:.3f} t=({fine[2]:.1f},{fine[3]:.1f})')

out = {'scale': round(float(fine[1]), 4), 'tx': round(float(fine[2]), 2), 'ty': round(float(fine[3]), 2)}
with open('tools/shy_transform.json', 'w') as f:
    json.dump(out, f, indent=1)
print('saved tools/shy_transform.json', out)

# 调试合成: 把新图按变换贴到参考图上, 半透明, 看对齐效果
shy = Image.open(SRC_SHY).convert('RGBA')
s = out['scale']
nw, nh = round(W0 * s), round(H0 * s)
shy_s = shy.resize((nw, nh), Image.LANCZOS)
canvas = Image.open(SRC_REF).convert('RGBA')
layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
layer.paste(shy_s, (round(out['tx']), round(out['ty'])), shy_s)
# 参考图 60% + 新图 40%
blend = Image.blend(canvas, layer, 0.45)
blend.convert('RGB').save('tools/dbg_align.png')
print('saved tools/dbg_align.png')
