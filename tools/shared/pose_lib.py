# 莱万汀/各宠整身姿势共享管线库：泛洪去底 + 水印清除 + 大连通域过滤 + 去白边 + 统一规格打包
# 规格（跨宠统一）：角色高 632、帧高 640、底部锚定、水平居中于共享画布
# 用法（各宠 tools/pets/<id>/<动作>_pack.py）：
#   import sys
#   from pathlib import Path
#   sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # tools/ 目录
#   from shared.pose_lib import RefPose, pack_pose, pet_paths
#   P = pet_paths('lewantin')
#   pack = RefPose(P['refs'] / 'ref_eat.png').extract()          # 水印位置不同时 RefPose(src, wm_box=(x0,y0,x1,y1))
#   pack_pose(pack, 'eat_icecream', 'dbg_eat_pack.png', out_dir=P['assets'])
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

TOOLS = Path(__file__).resolve().parents[1]     # tools/
CHAR_H = 632                                    # 统一角色高度（帧 640 减上下 margin 4）
FRAME_H = 640
FRAME_W = 468         # 画布最小宽（不足自动扩，渲染端 F 按高度约束不受影响）
MARGIN = 4
WM_BOX_DEFAULT = (1600, 1920, 2048, 2048)  # 默认右下"豆包AI生成"水印区 (x0,y0,x1,y1)，可按参考图覆盖
NEAR_WHITE = 238      # 泛洪去底近白阈值


def pet_paths(pet_id):
    """返回某宠的资产/参考图/调试目录（仓库内标准位置）"""
    root = TOOLS.parent
    return {
        'assets': root / 'assets/pets' / pet_id,
        'refs': TOOLS / 'pets' / pet_id,
        'dbg': TOOLS / 'pets' / pet_id,
    }


def flood_alpha(arr, near_white_level=NEAR_WHITE, dark=False):
    """边界泛洪去底：亮底模式取"近白且连通到边界"（near>=level）；
    黑底模式取"近黑且连通到边界"（每通道<=level）。去底后边缘再吃 3 圈软过渡。"""
    H, W = arr.shape[:2]
    if dark:
        near = arr.max(axis=2) <= near_white_level
    else:
        near = (arr[:, :, 0] >= near_white_level) & (arr[:, :, 1] >= near_white_level) & (arr[:, :, 2] >= near_white_level)
    visited = np.zeros((H, W), dtype=bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if near[y, x] and not visited[y, x]:
                visited[y, x] = True; dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if near[y, x] and not visited[y, x]:
                visited[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not visited[ny, nx] and near[ny, nx]:
                visited[ny, nx] = True; dq.append((ny, nx))
    alpha = np.where(visited, 0, 255).astype(np.uint8)
    for _ in range(3):
        trans = alpha == 0
        nb = np.zeros_like(trans)
        nb[1:, :] |= trans[:-1, :]; nb[:-1, :] |= trans[1:, :]
        nb[:, 1:] |= trans[:, :-1]; nb[:, :-1] |= trans[:, 1:]
        alpha[nb & near] = 0
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
    """读参考图 -> 清水印 -> 泛洪去底(亮底/黑底) -> 连通域过滤 -> 角色bbox"""

    def __init__(self, src, wm_box=WM_BOX_DEFAULT, near_white_level=NEAR_WHITE, dark=False, clear_holes_boxes=()):
        self.src = Path(src)
        arr = np.array(Image.open(self.src).convert('RGB'))
        if wm_box:
            x0, y0, x1, y1 = wm_box
            fill = 0 if dark else 255
            arr[y0:y1, x0:x1, :] = fill
        self.arr = arr
        self.H, self.W = arr.shape[:2]
        self.near_white_level = near_white_level
        self.dark = dark
        self.clear_holes_boxes = list(clear_holes_boxes)

    def extract(self):
        alpha = flood_alpha(self.arr, self.near_white_level, dark=self.dark)
        if self.dark and self.clear_holes_boxes:
            alpha = self._clear_holes_by_boxes(alpha)
        self.top5 = keep_big_components(alpha)[1]
        self.alpha = alpha
        ys, xs = np.where(alpha > 0)
        self.bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
        return self

    def _clear_holes_by_boxes(self, alpha):
        """黑底专用：清除封闭在角色轮廓内的背景色黑洞（泛洪从边界到不了的区域）。
        clear_holes_boxes 为实测黑洞包围盒列表（宽松框）；清除与框相交的"近黑连通域"——
        连通域整体清除不会误切角色部件；黑袜/黑鞋等与黑洞之间有描边阻隔，是独立连通域，不受影响。"""
        arr = self.arr
        mx = arr.max(axis=2)
        near_black = mx <= self.near_white_level
        bg_like = (alpha > 0) & near_black
        if not bg_like.any():
            return alpha
        lab, n = ndimage.label(bg_like)
        removed = 0
        for i in range(1, n + 1):
            comp = lab == i
            ys, xs = np.where(comp)
            cb = (xs.min(), ys.min(), xs.max(), ys.max())
            if not any(not (cb[2] < b[0] or cb[0] > b[2] or cb[3] < b[1] or cb[1] > b[3])
                       for b in self.clear_holes_boxes):
                continue
            alpha[comp] = 0
            removed += int(comp.sum())
        if removed:
            print(f'  enclosed bg holes removed: {removed} px')
        return alpha


def _edge_finish(pa, bg):
    """帧边缘处理：white=反预乘白底去白边；black=alpha 收缩 1px+轻羽化去黑晕。pa 为 float32 RGBA。"""
    if bg == 'white':
        af = pa[:, :, 3:4] / 255.0
        semi = (af > 0) & (af < 1)
        rgb = np.clip((pa[:, :, :3] - (1 - af) * 255.0) / np.maximum(af, 1e-6), 0, 255)
        pa[:, :, :3] = np.where(semi, rgb, pa[:, :, :3])
    else:
        am = Image.fromarray(pa[:, :, 3].astype(np.uint8))
        eroded = am.filter(ImageFilter.MinFilter(3))
        feathered = eroded.filter(ImageFilter.GaussianBlur(0.8))
        pa[:, :, 3] = np.clip(np.minimum(pa[:, :, 3], np.array(feathered)), 0, 255)
    return pa


def pack_sequence(refs, clip_name, out_dir, ground_y, dbg_names=None, bg='black', frame_fps=1,
                  char_h=CHAR_H, frame_h=FRAME_H, frame_w_min=FRAME_W, margin=MARGIN):
    """多帧序列动作统一配准打包（用于带位移的动画，如蹦跳）：
    - 所有帧共用一个缩放比 S 与画布（联合包围盒决定窗口），角色/道具跨帧位置保真；
    - ground_y（原图系脚底线）映射到帧底 margin 处：接地帧贴地，腾空帧自然抬高（保留跳跃位移）；
    - S 以"联合包络恰好装满帧"计算，接地帧角色高≈char_h。
    refs: 已 extract() 的 RefPose 列表；返回 manifest 条目。"""
    if out_dir is None:
        raise ValueError('pack_sequence 需要显式 out_dir（用 pet_paths(id)["assets"]）')
    out_dir = Path(out_dir)
    l = min(p.bbox[0] for p in refs) - margin
    t = min(p.bbox[1] for p in refs) - margin
    r = max(p.bbox[2] for p in refs) + margin
    b = max(p.bbox[3] for p in refs) + margin
    win_w, win_h = r - l, b - t
    S = (frame_h - 2 * margin) / win_h
    frame_w = max(frame_w_min, round(win_w * S) + 2 * margin)
    ox = round(frame_w / 2 - win_w * S / 2)
    oy = round(frame_h - margin - (ground_y - t) * S)
    count = 0
    for i, p in enumerate(refs):
        crop = np.dstack([p.arr[t:b, l:r], p.alpha[t:b, l:r]])
        crop_im = Image.fromarray(crop).resize((round(win_w * S), round(win_h * S)), Image.LANCZOS)
        pa = _edge_finish(np.array(crop_im).astype(np.float32), bg)
        frame = np.zeros((frame_h, frame_w, 4), dtype=np.uint8)
        frame[oy:oy + round(win_h * S), ox:ox + round(win_w * S)] = pa.astype(np.uint8)
        out_dir.mkdir(parents=True, exist_ok=True)
        Image.fromarray(frame).save(out_dir / f'{clip_name}_{i:02d}.webp', quality=93)
        man_path = out_dir / 'manifest.json'
        man = json.load(open(man_path, encoding='utf8')) if man_path.exists() else {}
        man['canvas'] = man.get('canvas') or {'w': frame_w, 'h': frame_h}
        man['feetY'] = man.get('feetY', frame_h)
        if man['canvas']['w'] < frame_w:
            man['canvas']['w'] = frame_w
        prev = man.setdefault('clips', {}).get(clip_name, {})
        man['clips'][clip_name] = {'count': i + 1, 'fps': frame_fps, 'ext': 'webp',
                                   'ox': ox, 'oy': oy, 'w': frame_w, 'h': frame_h}
        json.dump(man, open(man_path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
        with open(out_dir / 'manifest.js', 'w', encoding='utf8') as f:
            f.write('window.PET_MANIFEST = ')
            json.dump(man, f, ensure_ascii=False)
            f.write(';\n')
        count = i + 1
    if dbg_names:
        for i, dn in enumerate(dbg_names):
            if not dn:
                continue
            fr = Image.open(out_dir / f'{clip_name}_{i:02d}.webp')
            dbg = Image.new('RGB', fr.size, (255, 255, 255))
            for yy in range(0, fr.size[1] - 15, 16):
                for xx in range(0, fr.size[0] - 15, 16):
                    if (xx // 16 + yy // 16) % 2:
                        dbg.paste(Image.new('RGB', (16, 16), (204, 204, 212)), (xx, yy))
            dbg.paste(fr, (0, 0), fr)
            dbg.save(refs[i].src.parent / dn)
    print(f'{clip_name}: {count} frames, canvas {frame_w}x{frame_h}, S={S:.4f}, ground oy={oy} (联合窗 {win_w}x{win_h})')
    return {'count': count, 'fps': frame_fps, 'frame_w': frame_w}


def pack_pose(pack, clip_name, dbg_name=None, out_dir=None,
              char_h=CHAR_H, frame_h=FRAME_H, frame_w_min=FRAME_W, margin=MARGIN, bg='white',
              frame_idx=0, frame_fps=1):
    """统一规格打包：角色高 char_h、帧高 frame_h、底心锚定 -> webp + manifest + 调试拼图
    多帧序列动作：重复调用并递增 frame_idx（文件名 <clip>_NN.webp），manifest count 自动取最大 idx+1，
    frame_fps 写入 manifest（渲染端按 fps 循环播放帧序列）。
    bg='white'（亮底参考图）：半透明边缘做反预乘白底去白边；
    bg='black'（黑底参考图）：黑边不能反预乘，改为 alpha 收缩 1px + 轻羽化去黑晕。"""
    if out_dir is None:
        raise ValueError('pack_pose 需要显式 out_dir（用 pet_paths(id)["assets"]）')
    out_dir = Path(out_dir)
    left, top, right, bottom = pack.bbox
    crop = np.dstack([pack.arr[top:bottom + 1, left:right + 1], pack.alpha[top:bottom + 1, left:right + 1]])
    S = char_h / crop.shape[0]
    w2 = round(crop.shape[1] * S)
    crop_im = Image.fromarray(crop).resize((w2, char_h), Image.LANCZOS)

    pa = _edge_finish(np.array(crop_im).astype(np.float32), bg)

    # 放上共享画布：底边对齐 frame_h-margin，水平居中；宽度不足扩画布
    frame_w = max(frame_w_min, w2 + 2 * margin)
    frame = np.zeros((frame_h, frame_w, 4), dtype=np.uint8)
    ox = round(frame_w / 2 - w2 / 2)
    oy = frame_h - margin - char_h
    frame[oy:oy + char_h, ox:ox + w2] = pa.astype(np.uint8)

    out_dir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(frame).save(out_dir / f'{clip_name}_{frame_idx:02d}.webp', quality=93)

    man_path = out_dir / 'manifest.json'
    man = json.load(open(man_path, encoding='utf8')) if man_path.exists() else {}
    man['canvas'] = man.get('canvas') or {'w': frame_w, 'h': frame_h}
    man['feetY'] = man.get('feetY', frame_h)
    if man['canvas']['w'] < frame_w:
        man['canvas']['w'] = frame_w
    prev = man.setdefault('clips', {}).get(clip_name, {})
    man['clips'][clip_name] = {
        'count': max(int(prev.get('count', 0)), frame_idx + 1),
        'fps': frame_fps, 'ext': 'webp', 'ox': ox, 'oy': oy, 'w': w2, 'h': char_h}
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
        dbg.save(pack.src.parent / dbg_name)

    print(f'{clip_name}_{frame_idx:02d}.webp: frame {frame_w}x{frame_h}, clip w={w2} ox={ox} oy={oy}')
    print(f'  ref bbox={pack.bbox} ({right - left + 1}x{bottom - top + 1}), comps top5={pack.top5}')
    return {'ox': ox, 'oy': oy, 'w': w2, 'h': char_h}
