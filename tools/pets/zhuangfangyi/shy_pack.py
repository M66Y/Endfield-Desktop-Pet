# 庄方宜"害羞"整身姿势打包：参考图 -> 共享管线(pose_lib)统一规格
# -> assets/pets/zhuangfangyi/shy_00.webp（角色高632/帧高640/底心锚定，跨宠统一规格）
# 参考图为 1472x2656 竖版，水印实测 x1216-1447/y2576-2627（右下，与待机图同位），按此覆盖 WM_BOX
# 用法: 在仓库根目录运行  python tools/pets/zhuangfangyi/shy_pack.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # tools/ 目录（shared 共享库）
from shared.pose_lib import RefPose, pack_pose, pet_paths

P = pet_paths('zhuangfangyi')
pack = RefPose(P['refs'] / 'ref_shy.png', wm_box=(1180, 2550, 1472, 2656)).extract()
pack_pose(pack, 'shy', 'dbg_shy_pack.png', out_dir=P['assets'])
