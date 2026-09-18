# 莱万汀待机底图打包：参考图 -> 共享管线(pose_lib)统一规格 -> assets/pets/lewantin/idle_00.webp
# 用法: 在仓库根目录运行  python tools/pets/lewantin/idle_pack.py
from pathlib import Path

from pose_lib import RefPose, pack_pose, ROOT

SRC = ROOT / 'tools/pets/lewantin/ref_idle.png'
pack = RefPose(SRC).extract()
pack_pose(pack, 'idle', 'dbg_idle_pack.png')
