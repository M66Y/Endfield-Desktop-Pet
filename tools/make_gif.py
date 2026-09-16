# 把 preview/gif_*.png 帧组装成动画 GIF
import glob

from PIL import Image

frames = sorted(glob.glob('preview/gif_*.png'))
assert frames, 'no frames found (run npm run preview first)'
imgs = []
for f in frames:
    im = Image.open(f).convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 0))
    bg.alpha_composite(im)
    rgb = Image.new('P', im.size)  # 用白色底（透明背景在查看器里可能显示为黑）
    bg2 = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg2.alpha_composite(bg)
    rgb = bg2.convert('RGB').convert('P', palette=Image.ADAPTIVE, colors=128)
    rgb.thumbnail((256, 256))
    imgs.append(rgb)
imgs[0].save('preview/animation.gif', save_all=True, append_images=imgs[1:], duration=83, loop=0, disposal=2)
print('saved preview/animation.gif,', len(imgs), 'frames')
