# 去白边(defringe): 抠图管线在白底上泛洪取 alpha, 抗锯齿边缘像素 = 角色色与白底的混合,
# 贴到深色/花哨桌面上会显出一圈白色杂边。对半透明像素按 C_obs = a*C_real + (1-a)*255
# 逆向解出 C_real, 只改颜色不改 alpha 几何(轮廓不变细)。用法: python tools/defringe.py
# 注: happy_*.webp 的底色是渐变灰, 单底色反解不精确, 不处理(灰边在桌面上读作抗锯齿)。
import numpy as np
from PIL import Image

FILES = ['base', 'earL', 'earR', 'tailL', 'tailR', 'legL', 'legR', 'handL', 'handR', 'shy_face']

for name in FILES:
    p = f'assets/pets/jielpeita/pets/jielpeita/{name}.png'
    im = Image.open(p).convert('RGBA')
    a = np.array(im).astype(np.float32)
    alpha = a[:, :, 3:4] / 255.0
    semi = (alpha > 0) & (alpha < 1)  # 只处理抗锯齿边缘环
    rgb = np.clip((a[:, :, :3] - (1 - alpha) * 255.0) / np.maximum(alpha, 1e-6), 0, 255)
    a[:, :, :3] = np.where(semi, rgb, a[:, :, :3])
    Image.fromarray(a.astype(np.uint8)).save(p)
    print(f'{p}: defringed {int(semi.sum())} edge px')
