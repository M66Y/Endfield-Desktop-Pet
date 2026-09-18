# 开心帧比例适配: 与害羞姿势同规格 —— 角色内容等比缩放到高 622px,
# 脚底对齐 640 地面线, 水平居中 266.5 (与纸偶/害羞一致)。
# 原始帧备份在 tools/tmp_happy_orig/, 幂等: 每次从备份读取后写入 assets/。
# 用法: python tools/happy_fit.py
import glob
import json
import os

import numpy as np
from PIL import Image

ORIG_DIR = 'tools/pets/jielpeita/tmp_happy_orig'
TARGET_H = 622   # 与害羞姿势相同的角色内容高
FEET_Y = 640     # 地面线
CENTER_X = 266.5 # 身体水平中心(与纸偶一致)
CW, CH = 533, 640

# 全局统一系数: 取「高度达标」与「宽度不超画布」的较小值, 避免帧间跳动与裁边
hs, ws = [], []
for src in sorted(glob.glob(f'{ORIG_DIR}/happy_*.webp')):
    a = np.array(Image.open(src).convert('RGBA'))
    ys = np.where((a[:, :, 3] > 127).any(axis=1))[0]
    xs = np.where((a[:, :, 3] > 127).any(axis=0))[0]
    hs.append(ys.max() - ys.min() + 1)
    ws.append(xs.max() - xs.min() + 1)
S = min(TARGET_H / float(np.median(hs)), (CW - 4) / float(max(ws)))
print(f'scale = {S:.4f} (median h={np.median(hs):.0f} max w={max(ws)} -> 高{np.median(hs) * S:.0f} 宽{max(ws) * S:.0f})')

for src in sorted(glob.glob(f'{ORIG_DIR}/happy_*.webp')):
    im = Image.open(src).convert('RGBA')
    nw, nh = round(im.width * S), round(im.height * S)
    scaled = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, (round(CENTER_X - nw / 2), FEET_Y - nh))
    canvas.save(src.replace(ORIG_DIR, 'assets/pets/jielpeita'), quality=93)

man = json.load(open('assets/pets/jielpeita/manifest.json', encoding='utf8'))
man['clips']['happy'].update({'ox': 0, 'oy': 0, 'w': CW, 'h': CH})
json.dump(man, open('assets/pets/jielpeita/manifest.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
with open('assets/pets/jielpeita/manifest.js', 'w', encoding='utf8') as f:
    f.write('window.PET_MANIFEST = ')
    json.dump(man, f, ensure_ascii=False)
    f.write(';\n')
print(f'assets/pets/jielpeita/pets/jielpeita/happy_*.webp updated, clips.happy ox=0 oy=0 w={CW} h={CH}')
