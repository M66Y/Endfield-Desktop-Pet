# 汤汤"打哈欠"三帧序列打包：离散帧参考图 -> 共享管线(pose_lib)统一规格
# -> assets/pets/tangtang/yawn_00/01/02.webp（角色高632/帧高640/底心锚定，manifest count=3）
# 黑底图（同待机）：dark 泛洪阈值 8、水印框置黑；三帧同构图（1856x2048），逐帧检测黑洞框
# 用法: 在仓库根目录运行  python tools/pets/tangtang/yawn_pack.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # tools/ 目录（shared 共享库）
from shared.pose_lib import RefPose, pack_pose, pet_paths

P = pet_paths('tangtang')
# 黑洞清除框：三帧同一构图，沿用待机实测框（手臂-茶壶缝 / 腿桌缝 / 桌凳缝），逐帧命中各自黑洞
HOLES = [(530, 1240, 880, 1620), (960, 1490, 1160, 1720), (660, 1770, 820, 1905)]
for i in range(3):
    pack = RefPose(P['refs'] / f'ref_yawn_{i}.png', wm_box=(1510, 1930, 1856, 2048),
                   dark=True, near_white_level=8, clear_holes_boxes=HOLES).extract()
    pack_pose(pack, 'yawn', f'dbg_yawn_{i}.png', out_dir=P['assets'], bg='black',
              frame_idx=i, frame_fps=1.2)
