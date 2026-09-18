# 莱万汀"雪糕掉了委屈"整身姿势打包：参考图 -> 共享管线(pose_lib)统一规格
# -> assets/pets/lewantin/drop_sad_00.webp（角色高632/帧高640/底心锚定，与待机同规格）
# 用法: 在仓库根目录运行  python tools/pets/lewantin/drop_sad_pack.py
from pose_lib import RefPose, pack_pose, ROOT

SRC = ROOT / 'tools/pets/lewantin/ref_drop_sad.png'
pack = RefPose(SRC).extract()
pack_pose(pack, 'drop_sad', 'dbg_drop_sad_pack.png')
