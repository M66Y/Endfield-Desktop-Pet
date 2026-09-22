# 汤汤"开心蹦跳"四帧序列打包：离散帧参考图 -> 共享管线 pack_sequence 统一配准
# -> assets/pets/tangtang/hop_00..03.webp（联合包络定标，接地脚底线对齐——保留跳跃离地位移）
# 黑底图（同待机）：dark 泛洪阈值 8、水印框置黑；四帧同构图，黑洞清除框沿用
# 用法: 在仓库根目录运行  python tools/pets/tangtang/hop_pack.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # tools/ 目录（shared 共享库）
from shared.pose_lib import RefPose, pack_sequence, pet_paths

P = pet_paths('tangtang')
HOLES = [(530, 1240, 880, 1620), (960, 1490, 1160, 1720), (660, 1770, 820, 1905)]
refs = [RefPose(P['refs'] / f'ref_hop_{i}.png', wm_box=(1510, 1930, 1856, 2048),
                dark=True, near_white_level=8, clear_holes_boxes=HOLES).extract() for i in range(4)]
# ground_y = 接地帧(hop_0) 的脚底（bbox bottom）；蹦跳帧以同一地面线对齐
pack_sequence(refs, 'hop', P['assets'], ground_y=refs[0].bbox[3],
              dbg_names=[f'dbg_hop_{i}.png' for i in range(4)], bg='black', frame_fps=2)
