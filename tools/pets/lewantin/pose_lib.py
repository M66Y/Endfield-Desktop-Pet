# 莱万汀整身姿势共享管线库：泛洪去底 + 水印清除 + 大连通域过滤 + 去白边 + 统一规格打包
# 规格（与待机底图一致）：角色高 632、帧高 640、底部锚定、水平居中于共享画布
# 用法（同目录的 *_pack.py）：
#   from pose_lib import RefPose, pack_pose, FRAME_W, FRAME_H, CHAR_H
#   pack = RefPose(SRC).extract()                      # 抠图 + 角色bbox
#   pack_pose(pack, 'eat_icecream', 'dbg_eat.png')     # 缩放锚定 + webp + manifest + 调试图
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets/pets/lewantin'
CHAR_H = 632          # 统一角色高度（帧 640 减上下 margin 4）
FRAME_H = 640
FRAME_W = 468         # 画布最小宽（不足自动扩，渲染端 F 按高度约束不受影响）
MARGIN = 4
WM_BOX = (1600, 1920, 2048, 2048)  # 右下"豆包AI生成"水印区 (x0,y0,x1,y1)


def flood_alpha(arr):
    """边界泛洪去底：近白(>=238)且连通到边界的区域置透明，边缘再吃 3 圈软过渡"""
    H, W = arr.shape[:2]
    near_white = (arr[:, :, 0] >= 238) & (arr[:, :, 1] >= 238) & (arr[:, :, 2] >= 238)
    visited = np.zeros((H, W), dtype=bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if near_white[y, x] and not visited[y, x]:
                visited[y, x] = True; dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if near_white[y, x] and not visited[y, x]:
                visited[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not visited[ny, nx] and near_white[ny, nx]:
                visited[ny, nx] = True; dq.append((ny, nx))
    alpha = np.where(visited, 0, 255).astype(np.uint8)
    for _ in range(3):
        trans = alpha == 0
        nb = np.zeros_like(trans)
        nb[1:, :] |= trans[:-1, :]; nb[:-1, :] |= trans[1:, :]
        nb[:, 1:] |= trans[:, :-1]; nb[:, :-1] |= trans[:, 1:]
        alpha[nb & near_white] = 0
    return alpha


def keep_big_components(alpha, min_abs=3000, min_rel=0.002):
    """只保留大连通域（角色主体 + 相连发卷），去散点噪点/装饰残留；返回 top5 尺寸供日志"""
    lab, n = ndimage.label(alpha > 0)
    if n == 0:
        return alpha, []
    sizes = ndimage.sum(alpha > 0, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1]
    thr = max(min_abs, sizes[order[0]] * min_rel)
    keep_ids = [i + 1 for i in order if sizes[i] >= thr]
    alpha[~np.isin(lab, keep_ids)] = 0
    return alpha, [int(sizes[i]) for i in order[:5]]


class RefPose:
    """读参考图 -> 清水印 -> 泛洪去底 -> 连通域过滤 -> 角色bbox"""

    def __init__(self, src):
        self.src = Path(src)
        arr = np.array(Image.open(self.src).convert('RGB'))
        arr[WM_BOX[1]:WM_BOX[3], WM_BOX[0]:WM_BOX[2], :] = 255
        self.arr = arr
        self.H, self.W = arr.shape[:2]

    def extract(self):
        alpha = flood_alpha(self.arr)
        self.top5 = keep_big_components(alpha)[1]
        self.alpha = alpha
        ys, xs = np.where(alpha > 0)
        self.bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
        return self


def pack_pose(pack, clip_name, dbg_name=None, out_dir=None):
    """统一规格打包：角色高 CHAR_H、帧高 FRAME_H、底心锚定 -> webp + manifest + 调试拼图"""
    out_dir = Path(out_dir) if out_dir else OUT
    dbg_dir = pack.src.parent
    left, top, right, bottom = pack.bbox
    crop = np.dstack([pack.arr[top:bottom + 1, left:right + 1], pack.alpha[top:bottom + 1, left:right + 1]])
    S = CHAR_H / crop.shape[0]
    w2 = round(crop.shape[1] * S)
    crop_im = Image.fromarray(crop).resize((w2, CHAR_H), Image.LANCZOS)

    # 去白边：半透明像素反预乘白底
    pa = np.array(crop_im).astype(np.float32)
    af = pa[:, :, 3:4] / 255.0
    semi = (af > 0) & (af < 1)
    rgb = np.clip((pa[:, :, :3] - (1 - af) * 255.0) / np.maximum(af, 1e-6), 0, 255)
    pa[:, :, :3] = np.where(semi, rgb, pa[:, :, :3])

    # 放上共享画布：底边对齐 FRAME_H-MARGIN，水平居中；宽度不足扩画布
    frame_w = max(FRAME_W, w2 + 2 * MARGIN)
    frame = np.zeros((FRAME_H, frame_w, 4), dtype=np.uint8)
    ox = round(frame_w / 2 - w2 / 2)
    oy = FRAME_H - MARGIN - CHAR_H
    frame[oy:oy + CHAR_H, ox:ox + w2] = pa.astype(np.uint8)

    out_dir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(frame).save(out_dir / f'{clip_name}_00.webp', quality=93)

    man_path = out_dir / 'manifest.json'
    man = json.load(open(man_path, encoding='utf8')) if man_path.exists() else {}
    man['canvas'] = man.get('canvas') or {'w': frame_w, 'h': FRAME_H}
    man['feetY'] = man.get('feetY', FRAME_H)
    if man['canvas']['w'] < frame_w:
        man['canvas']['w'] = frame_w
    man.setdefault('clips', {})[clip_name] = {
        'count': 1, 'fps': 1, 'ext': 'webp', 'ox': ox, 'oy': oy, 'w': w2, 'h': CHAR_H}
    json.dump(man, open(man_path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    with open(out_dir / 'manifest.js', 'w', encoding='utf8') as f:
        f.write('window.PET_MANIFEST = ')
        json.dump(man, f, ensure_ascii=False)
        f.write(';\n')

    if dbg_name:
        hh, ww = frame.shape[:2]
        dbg = Image.new('RGB', (ww, hh), (255, 255, 255))
        for yy in range(0, hh - 15, 16):
            for xx in range(0, ww - 15, 16):
                if (xx // 16 + yy // 16) % 2:
                    dbg.paste(Image.new('RGB', (16, 16), (204, 204, 212)), (xx, yy))
        fr = Image.fromarray(frame)
        dbg.paste(fr, (0, 0), fr)
        dbg.save(dbg_dir / dbg_name)

    print(f'{clip_name}_00.webp: frame {frame_w}x{FRAME_H}, clip w={w2} ox={ox} oy={oy}')
    print(f'  ref bbox={pack.bbox} ({right - left + 1}x{bottom - top + 1}), comps top5={pack.top5}')
    return {'ox': ox, 'oy': oy, 'w': w2, 'h': CHAR_H}
