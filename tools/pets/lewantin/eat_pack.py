# 莱万汀"吃雪糕"整身姿势打包：参考图 -> 共享管线(pose_lib)统一规格
# -> assets/pets/lewantin/eat_icecream_00.webp（角色高632/帧高640/底心锚定，与待机同规格）
# 用法: 在仓库根目录运行  python tools/pets/lewantin/eat_pack.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # tools/ 目录（shared 共享库）
from shared.pose_lib import RefPose, pack_pose, pet_paths

P = pet_paths('lewantin')
pack = RefPose(P['refs'] / 'ref_eat.png').extract()
pack_pose(pack, 'eat_icecream', 'dbg_eat_pack.png', out_dir=P['assets'])
