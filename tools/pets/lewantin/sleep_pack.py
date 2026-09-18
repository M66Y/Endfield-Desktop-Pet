# 莱万汀"打瞌睡/睡觉待机"整身姿势打包：参考图 -> 共享管线(pose_lib)统一规格
# -> assets/pets/lewantin/sleep_idle_00.webp（角色高632/帧高640/底心锚定，与待机同规格）
# 用法: 在仓库根目录运行  python tools/pets/lewantin/sleep_pack.py
from pose_lib import RefPose, pack_pose, ROOT

SRC = ROOT / 'tools/pets/lewantin/ref_sleep.png'
pack = RefPose(SRC).extract()
pack_pose(pack, 'sleep_idle', 'dbg_sleep_pack.png')
