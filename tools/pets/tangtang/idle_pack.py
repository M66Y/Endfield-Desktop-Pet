# 汤汤"待机"整身姿势打包：参考图(黑底 1856x2048) -> 共享管线(pose_lib)统一规格
# -> assets/pets/tangtang/idle_00.webp（角色高632/帧高640/底心锚定，跨宠统一规格）
# 黑底图：dark=True 近黑泛洪去底；亮色水印实测 x1534-1824/y1948-2010（右下），按此覆盖 WM_BOX（置黑）
# 用法: 在仓库根目录运行  python tools/pets/tangtang/idle_pack.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # tools/ 目录（shared 共享库）
from shared.pose_lib import RefPose, pack_pose, pet_paths

P = pet_paths('tangtang')
# 背景 lum≈0-5，角色描边高光 >30，阈值 8 严格区分（宽阈值会把头发暗部/描边一起吃掉）
# 黑洞清除框：角色轮廓内封闭的背景缝隙实测框（手臂-茶壶间三角区 / 腿桌缝 / 桌凳缝）
HOLES = [(530, 1240, 880, 1620), (960, 1490, 1160, 1720), (660, 1770, 820, 1905)]
pack = RefPose(P['refs'] / 'ref_idle.png', wm_box=(1510, 1930, 1856, 2048),
               dark=True, near_white_level=8, clear_holes_boxes=HOLES).extract()
pack_pose(pack, 'idle', 'dbg_idle_pack.png', out_dir=P['assets'], bg='black')
