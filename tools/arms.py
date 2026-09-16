# 从参考图切割前臂+手套零件, 修改 base.png (挖孔+修补), 供害羞捂脸时"抬起自己的手"
# 用法: python tools/arms.py [--debug]   (--debug 只输出掩码叠加图, 不写 assets)
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC_REF = r'C:\Users\29569\.zcode\cli\image-cache\sess_991e213d-0463-4dae-977e-f6a17e1737c0\image-2c4118a390afa01f5883dabbf889148d.png'

# 与 process.py / shy_extract.py 完全一致的裁剪映射
PAD = 8
# bbox 在 __main__ 里重算

# 前臂切割多边形(参考图原始坐标) —— 沿袖口上方切一刀, 顺着手臂轮廓包到手套尖
POLY_L = [(533, 1346), (700, 1346), (712, 1408), (700, 1452), (648, 1478), (638, 1515),
          (622, 1580), (612, 1612), (560, 1652), (540, 1684), (490, 1686), (462, 1648),
          (452, 1570), (460, 1498), (505, 1430), (516, 1370)]
POLY_R = [(1062, 1346), (1250, 1346), (1295, 1440), (1320, 1482), (1338, 1522), (1382, 1572),
          (1372, 1622), (1330, 1668), (1285, 1662), (1225, 1610), (1205, 1560), (1198, 1512),
          (1150, 1486), (1112, 1430)]
# 肘部枢轴(切割线上沿, 资产坐标阶段换算)
PIVOT_L = (616, 1348)
PIVOT_R = (1156, 1348)


def poly_mask(points, bbox, arr_shape, s, cx0, cy0):
    H, W = arr_shape[:2]
    x0, y0, x1, y1 = bbox
    m = np.zeros((H, W), dtype=bool)
    sub = Image.new('1', (x1 - x0, y1 - y0), 0)
    d = ImageDraw.Draw(sub)
    pts = [((px - cx0) * s - x0, (py - cy0) * s - y0) for px, py in points]
    d.polygon(pts, fill=1)
    m[y0:y1, x0:x1] = np.array(sub, dtype=bool)
    return m


def main():
    debug = '--debug' in sys.argv
    ref = Image.open(SRC_REF).convert('RGB')
    ref_arr = np.array(ref)
    ref_arr[2090:, 1400:, :] = 255

    # 复现 process.py 的 bbox (与 shy_extract.py 相同的泛洪)
    from collections import deque
    H0, W0 = ref_arr.shape[:2]
    near_white = (ref_arr[:, :, 0] >= 238) & (ref_arr[:, :, 1] >= 238) & (ref_arr[:, :, 2] >= 238)
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
    mask_ref = alpha > 127
    ys, xs = np.where(mask_ref)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max(), ys.max()
    cx0, cy0 = bx0 - PAD, by0 - PAD
    s = 640 / (by1 + PAD - cy0)

    # 工作坐标里的手臂掩码 = 多边形 ∩ 角色掩码
    CW, CH = 533, 640
    base_im = Image.open('assets/base.png').convert('RGBA')
    base = np.array(base_im)
    char = base[:, :, 3] > 127

    def work_poly(pts):
        return [((px - cx0) * s, (py - cy0) * s) for px, py in pts]

    def mask_of(poly):
        img = Image.new('L', (CW, CH), 0)
        ImageDraw.Draw(img).polygon(work_poly(poly), fill=255)
        return np.array(img) > 127

    mL = mask_of(POLY_L) & char
    mR = mask_of(POLY_R) & char

    # 调试图: 掩码边缘叠在 base 上
    if debug:
        dbg = base_im.copy()
        for m, col in ((mL, (0, 255, 0)), (mR, (255, 0, 255))):
            edge = np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)))
            tint = np.zeros_like(np.array(dbg))
            tint[:, :, 0], tint[:, :, 1], tint[:, :, 2], tint[:, :, 3] = col[0], col[1], col[2], edge
            dbg.alpha_composite(Image.fromarray(tint))
        dbg.crop((100, 350, 460, 560)).resize((720, 420), Image.NEAREST).convert('RGB').save('tools/dbg_arms_mask.png')
        print('debug only')
        return

    # ---- 正式: 切 sprite -> base 挖孔(不透明, 用邻域插值修补) ----
    def erode(m, k):
        return np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(k * 2 + 1))) > 127

    def dilate(m, k):
        return np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(k * 2 + 1))) > 127

    man = json.load(open('assets/manifest.json', encoding='utf8'))
    for name, m, poly, piv in (('handL', mL, POLY_L, PIVOT_L), ('handR', mR, POLY_R, PIVOT_R)):
        md = dilate(m, 1)  # 外扩 1px 盖住切缝
        ys, xs = np.where(md)
        ox, oy = int(xs.min()), int(ys.min())
        w, h = int(xs.max()) - ox + 1, int(ys.max()) - oy + 1
        rgba = base.copy()
        rgba[:, :, 3] = np.where(md, base[:, :, 3], 0)
        sub = rgba[oy:oy + h, ox:ox + w]
        Image.fromarray(sub).save(f'assets/{name}.png')
        pv = ((piv[0] - cx0) * s - ox, (piv[1] - cy0) * s - oy)
        man.setdefault('sprites', {})[name] = {
            'img': f'{name}.png', 'ox': ox, 'oy': oy,
            'pivot': [round(pv[0]), round(pv[1])],
        }
        print(f'{name}: ox={ox} oy={oy} size={w}x{h} pivot=({pv[0]:.0f},{pv[1]:.0f})')

    # base 挖孔 + 修补: 孔内保留不透明, RGB 用左右最近非孔像素水平插值, 再局部模糊
    holeL = erode(mL, 3)
    holeR = erode(mR, 3)
    hole = holeL | holeR
    rgb = base[:, :, :3].astype(np.float32)
    hole_px = hole & (base[:, :, 3] > 127)
    for y in range(CH):
        row = hole_px[y]
        if not row.any():
            continue
        xs_h = np.where(row)[0]
        runs = np.split(xs_h, np.where(np.diff(xs_h) > 1)[0] + 1)
        for run in runs:
            a, b = run[0], run[-1]
            la = max(a - 2, 0)
            rb = min(b + 2, CW - 1)
            ca = rgb[y, la]
            cb = rgb[y, rb]
            t = np.linspace(0, 1, b - a + 1)[:, None]
            rgb[y, a:b + 1] = ca * (1 - t) + cb * t
    # 局部模糊: 对孔区域做一次 3px 高斯
    blur = np.array(Image.fromarray(rgb.astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32)
    grow = dilate(hole_px, 4)
    rgb[grow] = blur[grow]
    base[:, :, :3] = rgb.astype(np.uint8)
    Image.fromarray(base).save('assets/base.png')
    print('base.png 挖孔+修补完成')

    json.dump(man, open('assets/manifest.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    with open('assets/manifest.js', 'w', encoding='utf8') as f:
        f.write('window.PET_MANIFEST = ')
        json.dump(man, f, ensure_ascii=False)
        f.write(';\n')
    print('manifest patched')


if __name__ == '__main__':
    main()
