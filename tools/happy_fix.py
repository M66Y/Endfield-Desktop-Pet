# 开心帧序列修复:
# 1) 灰白杂边: 视频灰底抽取的边缘环混入灰底色 -> alpha 收缩1px(MaxFilter反操作) + 轻微模糊,
#    配合对半透明像素的灰底 un-blend(底色取渐变灰中值), 把灰圈从轮廓上切掉
# 2) 色彩配准: 以 base.png(纸偶) 不透明像素的逐通道均值/方差为目标,
#    对所有帧施加同一线性变换(方差比限制在 0.9-1.1 防过冲), 与待机/害羞色调统一
# 用法: python tools/happy_fix.py
import glob

import numpy as np
from PIL import Image, ImageFilter

BG = np.array([210.0, 210.0, 210.0])  # 原视频灰底渐变 176-235 的中值

# 目标统计: 纸偶
base = np.array(Image.open('assets/base.png').convert('RGBA')).astype(np.float32)
bc = base[:, :, 3] > 200
m_b = base[:, :, :3][bc].mean(axis=0)
s_b = base[:, :, :3][bc].std(axis=0)

# 源统计: 用第一帧(所有帧同一变换, 避免帧间闪烁)
f0 = np.array(Image.open('assets/happy_00.webp').convert('RGBA')).astype(np.float32)
fc0 = f0[:, :, 3] > 200
m_h = f0[:, :, :3][fc0].mean(axis=0)
s_h = f0[:, :, :3][fc0].std(axis=0)
ratio = np.clip(s_b / s_h, 0.9, 1.1)
print('target mean', m_b.astype(int), 'src mean', m_h.astype(int), 'std ratio', ratio.round(3))

for p in sorted(glob.glob('assets/happy_*.webp')):
    im = Image.open(p).convert('RGBA')
    a = np.array(im).astype(np.float32)
    alpha = a[:, :, 3:4] / 255.0
    # 灰底 un-blend(半透明环)
    semi = (alpha > 0) & (alpha < 1)
    rgb = np.clip((a[:, :, :3] - (1 - alpha) * BG[None, None, :]) / np.maximum(alpha, 1e-6), 0, 255)
    a[:, :, :3] = np.where(semi, rgb, a[:, :, :3])
    # 色彩配准(所有像素同变换)
    a[:, :, :3] = np.clip((a[:, :, :3] - m_h[None, None, :]) * ratio[None, None, :] + m_b[None, None, :], 0, 255)
    out = Image.fromarray(a.astype(np.uint8))
    # alpha 收缩 1px 切掉残余灰环, 再轻微羽化
    al = out.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    out.putalpha(al)
    out.save(p, quality=93)
print(f'{len(glob.glob("assets/happy_*.webp"))} frames fixed')
