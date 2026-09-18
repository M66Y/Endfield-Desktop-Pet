# 开心(视频帧序列)动作管线 - 阶段1: 逐帧去底 + 包围盒统计 + 调试拼图
# 背景: 灰色渐变(低饱和, lum 176-235) -> 边界泛洪 + 亮度/饱和度判据
# 残留(水印碎片等)靠"只保留最大连通域"清除
import sys
from collections import deque

import numpy as np
from PIL import Image

SRC = 'tools/pets/jielpeita/tmp_happy'
LOW_SAT = 14      # 背景/阴影/水印都是低饱和灰
MIN_LUM = 168     # 背景亮度下限(渐变暗角 ~176)


def flood_bg(arr):
    """从边界泛洪: 低饱和且足够亮的像素视为背景 -> alpha"""
    H, W = arr.shape[:2]
    r, g, b = arr[:, :, 0].astype(np.int32), arr[:, :, 1].astype(np.int32), arr[:, :, 2].astype(np.int32)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    sat = arr.max(axis=2).astype(np.int32) - arr.min(axis=2).astype(np.int32)
    is_bg = (sat <= LOW_SAT) & (lum >= MIN_LUM)
    visited = np.zeros((H, W), dtype=bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if is_bg[y, x] and not visited[y, x]:
                visited[y, x] = True; dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if is_bg[y, x] and not visited[y, x]:
                visited[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not visited[ny, nx] and is_bg[ny, nx]:
                visited[ny, nx] = True; dq.append((ny, nx))
    alpha = np.where(visited, 0, 255).astype(np.uint8)
    # 与透明区相邻的近背景像素也清掉(边缘抗锯齿残留)
    for _ in range(3):
        trans = alpha == 0
        nb = np.zeros_like(trans)
        nb[1:, :] |= trans[:-1, :]; nb[:-1, :] |= trans[1:, :]
        nb[:, 1:] |= trans[:, :-1]; nb[:, :-1] |= trans[:, 1:]
        alpha[nb & is_bg] = 0
    return alpha


def largest_component(alpha, min_px=60):
    """只保留最大连通域(去掉水印碎片/浮点), 小于 min_px 的独立域也清掉"""
    H, W = alpha.shape
    m = alpha > 127
    labels = np.zeros((H, W), np.int32)
    cur = 0
    comps = []
    for y0 in range(H):
        for x0 in range(W):
            if m[y0, x0] and labels[y0, x0] == 0:
                cur += 1
                dq = deque([(y0, x0)])
                labels[y0, x0] = cur
                pts = []
                while dq:
                    y, x = dq.popleft()
                    pts.append((y, x))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and labels[ny, nx] == 0:
                            labels[ny, nx] = cur
                            dq.append((ny, nx))
                comps.append(pts)
    if not comps:
        return alpha
    comps.sort(key=len, reverse=True)
    keep = np.zeros((H, W), dtype=bool)
    for pts in comps[:1]:
        for y, x in pts:
            keep[y, x] = True
    for pts in comps[1:]:
        if len(pts) >= min_px:
            for y, x in pts:
                keep[y, x] = True
    return np.where(keep, alpha, 0)


def main():
    import glob
    files = sorted(glob.glob(f'{SRC}/f*.png'))
    boxes = []
    for f in files:
        arr = np.array(Image.open(f).convert('RGB'))
        alpha = largest_component(flood_bg(arr))
        ys, xs = np.where(alpha > 127)
        if len(ys) == 0:
            print(f'{f}: EMPTY!')
            continue
        boxes.append((f, xs.min(), ys.min(), xs.max(), ys.max()))
        Image.fromarray(np.dstack([arr, alpha])).save(f.replace('f', 'a', 1))
    ws = [b[3] - b[1] for b in boxes]
    ht = [b[4] - b[2] for b in boxes]
    cx = [(b[1] + b[3]) / 2 for b in boxes]
    by = [b[4] for b in boxes]
    ty = [b[2] for b in boxes]
    print(f'frames={len(boxes)}')
    print(f'width : min={min(ws)} max={max(ws)} (drift {max(ws) - min(ws)})')
    print(f'height: min={min(ht)} max={max(ht)} (drift {max(ht) - min(ht)})')
    print(f'centerX: {min(cx):.0f}-{max(cx):.0f} (drift {max(cx) - min(cx):.0f})')
    print(f'bottom : {min(by)}-{max(by)} (drift {max(by) - min(by)})')
    print(f'top    : {min(ty)}-{max(ty)} (drift {max(ty) - min(ty)})')


if __name__ == '__main__':
    main()
    sys.exit(0)
