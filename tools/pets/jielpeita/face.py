# 表情变体工具：从一张"同角色不同表情"的生成图上切下脸部，替换桌宠表情
# 用法:
#   python tools/face.py <变体图路径> <名称> [src_x0 src_y0 src_x1 src_y1] [dx dy]
#   - 不给坐标时，默认使用与参考图相同的脸部范围（生成图与参考图构图一致时可用）
#   - dx dy: 贴回底图的偏移修正（默认 0 0）
# 生成图建议用与参考图相同的提示词 + 表情改动，例如：
#   "同一位Q版棕发红瞳狐耳女孩，双马尾，红色连衣裙黑色外套，纯白背景，全身正面站立，
#    坏笑表情，眯眼嘴角上挑" （与原参考图同尺寸比例最佳）
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC_REF = r'C:\Users\29569\.zcode\cli\image-cache\sess_991e213d-0463-4dae-977e-f6a17e1737c0\image-2c4118a390afa01f5883dabbf889148d.png'
MANIFEST = 'assets/pets/jielpeita/manifest.json'


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    src_path, name = args[0], args[1]
    man = json.load(open(MANIFEST, encoding='utf8'))
    ref_rect = man.get('faceRect')  # 资产坐标下的脸部范围
    s = ref_rect and 1.0
    # 资产坐标 -> 原参考图坐标（用于默认切割框）
    bx0, by0 = 21, 38  # process.py 的裁剪偏移 (bx0-8, by0-8)
    sc = man['canvas']['h'] / 2132.0
    def a2o(v, o): return int(v / sc) + o
    rx0, ry0, rx1, ry1 = ref_rect
    def_rect = (a2o(rx0, bx0), a2o(ry0, by0), a2o(rx1, bx0), a2o(ry1, by0))
    rect = tuple(int(v) for v in args[2:6]) if len(args) >= 6 else def_rect
    dx, dy = (int(args[6]), int(args[7])) if len(args) >= 8 else (0, 0)

    src = Image.open(src_path).convert('RGB')
    face = src.crop(rect)
    w, h = face.size
    # 椭圆羽化蒙版：边缘 12% 渐隐
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([w * 0.02, h * 0.02, w * 0.98, h * 0.98], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(w * 0.05))
    out = Image.fromarray(np.dstack([np.array(face), np.array(m)]))
    out.save(f'assets/pets/jielpeita/pets/jielpeita/face_{name}.png')

    # 贴回位置 = 底图脸部范围左上角 + 偏移修正
    man.setdefault('faces', {})[name] = {'img': f'face_{name}.png', 'x': rx0 + dx, 'y': ry0 + dy}
    json.dump(man, open(MANIFEST, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    with open('assets/pets/jielpeita/manifest.js', 'w', encoding='utf8') as f:
        f.write('window.PET_MANIFEST = ')
        json.dump(man, f, ensure_ascii=False)
        f.write(';\n')
    print(f'face_{name}.png saved, placed at ({rx0 + dx}, {ry0 + dy})')
    print('preview it with: npm run preview  (click pose will use smug face if named "smug")')


if __name__ == '__main__':
    main()
