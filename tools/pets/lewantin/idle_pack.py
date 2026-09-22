# 莱万汀待机底图打包：参考图 -> 共享管线(pose_lib)统一规格 -> assets/pets/lewantin/idle_00.webp
# 用法: 在仓库根目录运行  python tools/pets/lewantin/idle_pack.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # tools/ 目录（shared 共享库）
from shared.pose_lib import RefPose, pack_pose, pet_paths

P = pet_paths('lewantin')
pack = RefPose(P['refs'] / 'ref_idle.png').extract()
pack_pose(pack, 'idle', 'dbg_idle_pack.png', out_dir=P['assets'])
