# 哭泣整身姿势打包: 把参考图(D:\下载\哭泣1.png)整只角色抠出 -> 对齐到资产坐标系
# -> 按脚底锚点缩放配准(与害羞/开心同规格: 高622, 脚底线640, 居中266.5) -> assets/cry_00.webp
# 哭泣动作播放该单帧姿势(淡入淡出+啜泣节奏), 100% 还原参考图的攥拳+大哭表情。
# 流程与 shy_pose_pack.py 一致(两图同为豆包同规格生成, 实测构图仅差1~2px, 参数直接复用):
# 泛洪去底 + 刘海NCC对齐 + 眉眼暗结构精化 + 肤色配准 + 去白边。
import json
from collections import deque

import numpy as np
from PIL import Image
from scipy.signal import fftconvolve

SRC_CRY = r'D:\下载\哭泣1.png'
OUT = 'assets'

# 额头皮肤中位数配对做整图微调, 消除与纸偶的色调差(配准带在 base 坐标系, 与害羞共用)
COLOR_PAIR_BAND = (194, 212, 185, 355)


def flood_alpha(arr):
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


def masked_ncc(I, T, M):
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


def gray_white(im):
    a = np.array(im.convert('RGBA'))
    gray = (0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]).astype(np.float32)
    mask = ~((a[:, :, 0] >= 238) & (a[:, :, 1] >= 238) & (a[:, :, 2] >= 238))
    return gray, mask


# ---------- 1. 去底(水印"豆包AI生成"实测在 (1533,2139)-(1826,2204), 清除区不含角色像素) ----------
cry = Image.open(SRC_CRY).convert('RGB')
cry_arr = np.array(cry)
cry_arr[2135:, 1450:, :] = 255  # 水印
alpha_cry = flood_alpha(cry_arr)
cry_rgba = Image.fromarray(np.dstack([cry_arr, alpha_cry]))

# ---------- 2. 刘海NCC 对齐到 base(资产坐标系) ----------
TX0, TY0, TX1, TY1 = 500, 580, 1200, 800
g_new, mask_new = gray_white(cry_rgba)
T = g_new[TY0:TY1, TX0:TX1]
M = mask_new[TY0:TY1, TX0:TX1].astype(np.float32)

base = Image.open(f'{OUT}/base.png').convert('RGBA')
base_arr = np.array(base).astype(np.int32)
g_base, _ = gray_white(base)
RX0, RY0, RX1, RY1 = 80, 10, 460, 280
I = g_base[RY0:RY1, RX0:RX1]


def search(scale_range, ds):
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
            best = (v, s, RX0 + idx[1] * ds - TX0 * s, RY0 + idx[0] * ds - TY0 * s)
    return best


coarse = search(np.arange(0.24, 0.40, 0.01), ds=2)
fine = search(np.arange(coarse[1] - 0.012, coarse[1] + 0.0125, 0.002), ds=1)
sc, tx, ty = fine[1], fine[2], fine[3]
print(f'ncc: scale={sc:.4f} t=({tx:.2f},{ty:.2f})')

# 扩边画布: 哭泣图 NCC 最优解下角色内容(~641px)略超 640 基准画布, 直接贴会切耳尖/马尾尖
PAD = 64


def build_aligned(tx, ty):
    nw, nh = round(cry_rgba.width * sc), round(cry_rgba.height * sc)
    s = cry_rgba.resize((nw, nh), Image.LANCZOS)
    big = Image.new('RGBA', (base.size[0] + PAD * 2, base.size[1] + PAD * 2), (0, 0, 0, 0))
    big.paste(s, (round(tx) + PAD, round(ty) + PAD), s)
    return big


al = build_aligned(tx, ty)
# base 坐标系窗口(配色准/暗结构精化用); 完整角色留在扩边画布上, 包围盒不会被基准画布裁短
aligned = np.array(al)[PAD:PAD + 640, PAD:PAD + 533].astype(np.int32)

# ---------- 3. 眉眼暗结构精化(哭泣为闭眼哭脸, 暗结构=八字眉+闭眼线, 分布与害羞不同, 权重仅供参考) ----------
base_l = (0.299 * base_arr[:, :, 0] + 0.587 * base_arr[:, :, 1] + 0.114 * base_arr[:, :, 2])
BX0, BY0, BX1, BY1 = 172, 195, 362, 258
bd = base_l < 105
best = None
for ddy in range(-12, 13):
    for ddx in range(-8, 9):
        shifted = np.zeros_like(aligned)
        ys0, ys1 = max(0, BY0 + ddy), min(640, BY1 + ddy)
        xs0, xs1 = max(0, BX0 + ddx), min(533, BX1 + ddx)
        shifted[ys0:ys1, xs0:xs1] = aligned[ys0 - ddy:ys1 - ddy, xs0 - ddx:xs1 - ddx]
        lum_s = 0.299 * shifted[:, :, 0] + 0.587 * shifted[:, :, 1] + 0.114 * shifted[:, :, 2]
        pd = (lum_s < 105) & (shifted[:, :, 3] > 127)
        inter = (pd[BY0:BY1, BX0:BX1] & bd[BY0:BY1, BX0:BX1]).sum()
        v = inter / max(1, pd[BY0:BY1, BX0:BX1].sum())
        if best is None or v > best[0]:
            best = (v, ddx, ddy)
_, ddx, ddy = best
tx += ddx; ty += ddy
print(f'dark snap: dx={ddx} dy={ddy}')
al = build_aligned(tx, ty)
aligned = np.array(al)[PAD:PAD + 640, PAD:PAD + 533].astype(np.int32)

# ---------- 4. 角色包围盒(扩边画布上取, 耳尖/马尾尖完整) + 脚底锚点配准(高622, 脚底线640, 等比不变形) ----------
alpha_w = np.array(al)[:, :, 3]
ys2, xs2 = np.where(alpha_w > 127)
top, bottom = int(ys2.min()), int(ys2.max())
left, right = int(xs2.min()), int(xs2.max())
S = 622.0 / (bottom - top + 1)
crop = al.crop((left, top, right + 1, bottom + 1))
w2 = round(crop.width * S)
pose_im = crop.resize((w2, 622), Image.LANCZOS)
print(f'char bbox big=({left},{top})-({right},{bottom}) scale={S:.4f} -> {w2}x622')
rows_top = (np.array(pose_im)[:, :, 3] > 127).sum(axis=1)[:6].tolist()
print(f'pose top-6 row widths: {rows_top} (应从窄到宽自然收拢, 不出现宽切面)')

# ---------- 5. 肤色调和微调 + 去白边 ----------
band = (COLOR_PAIR_BAND[0], COLOR_PAIR_BAND[1], COLOR_PAIR_BAND[2], COLOR_PAIR_BAND[3])


def region_med(arr, y0, y1, x0, x1):
    p = arr[y0:y1, x0:x1, :3].reshape(-1, 3).astype(np.int32)
    lum = (p[:, 0] * 299 + p[:, 1] * 587 + p[:, 2] * 114) // 1000
    p = p[lum > 170]
    return np.median(p, axis=0)


delta = np.round(region_med(base_arr, *band[:2], band[2], band[3]) -
                 region_med(aligned, *band[:2], band[2], band[3])).astype(np.int32)
print('skin color delta:', delta)
pa = np.array(pose_im).astype(np.int32)
pa[:, :, :3] = np.clip(pa[:, :, :3] + delta[None, None, :], 0, 255)

af = pa[:, :, 3:4].astype(np.float32) / 255.0
semi = (af > 0) & (af < 1)
rgb = np.clip((pa[:, :, :3] - (1 - af) * 255.0) / np.maximum(af, 1e-6), 0, 255)
pa[:, :, :3] = np.where(semi, rgb, pa[:, :, :3]).astype(np.int32)
print(f'defringed {int(semi.sum())} edge px')

out = pa.astype(np.uint8)
Image.fromarray(out).save(f'{OUT}/cry_00.webp', quality=93)
ox = round(266.5 - w2 / 2)
oy = 640 - 622  # 脚底线 640, 与害羞/开心帧一致

man = json.load(open(f'{OUT}/manifest.json', encoding='utf8'))
man.setdefault('clips', {})['cry'] = {'count': 1, 'fps': 1, 'ext': 'webp', 'ox': ox, 'oy': oy, 'w': w2, 'h': 622}
json.dump(man, open(f'{OUT}/manifest.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
with open(f'{OUT}/manifest.js', 'w', encoding='utf8') as f:
    f.write('window.PET_MANIFEST = ')
    json.dump(man, f, ensure_ascii=False)
    f.write(';\n')
print(f'assets/cry_00.webp saved, clips.cry ox={ox} oy={oy} w={w2} h=622')

# ---------- 6. 调试合成: 白底 + 纸偶base + 哭泣姿势(检查脚底对位/身高/居中) ----------
prev = Image.new('RGBA', base.size, (255, 255, 255, 255))
prev.alpha_composite(base)
prev.alpha_composite(Image.fromarray(out), (ox, oy))
prev.convert('RGB').save('tools/dbg_cry_pose.png')
print('saved tools/dbg_cry_pose.png')
