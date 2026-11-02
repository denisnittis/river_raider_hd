"""Prepares raw images (e.g. from Nano Banana) for the Remaster mode.

Put the generated images in assets/remaster/raw/ with these names
(.png, .jpg or .webp):

  sprites (background removed automatically: magenta, any flat colour, or a
  photo background when the object is whole and stands out):
    player        your jet, top view, nose up
    player_left   your jet banking left, top view
    heli          helicopter, side view, nose RIGHT
    ship          tanker ship, side view, bow RIGHT
    jet           enemy jet, side view, nose RIGHT
    house         small house, front view
    tree          jungle tree, front view
    bridge        bridge seen from above, road running left-right
    fuel          fuel depot with the word FUEL, seen from above/front
  textures (seamless, square, seen from above):
    water, rock, jungle
  panel (optional): panel   thin, very wide instrument panel strip on magenta

Then run:  python tools/prepare_art.py
Missing files are simply skipped; the game keeps its built-in art for them.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'assets' / 'remaster' / 'raw'
OUT = ROOT / 'assets' / 'remaster'
UP = 4  # output resolution multiplier over the sprite box

# sprite boxes in HD pixels (8 px per Atari pixel, 4 px per scanline)
BOX = {
    'player': (64, 52), 'player_left': (64, 56), 'player_right': (64, 56),
    'heli_r1': (64, 40), 'heli_r2': (64, 40), 'heli_l1': (64, 40), 'heli_l2': (64, 40),
    'ship_r': (128, 32), 'ship_l': (128, 32), 'jet_l': (64, 24), 'jet_r': (64, 24),
    'house_a': (128, 76), 'house_b': (128, 76), 'bridge': (256, 92), 'fuel': (64, 96),
}


def find_raw(name):
    for ext in ('.png', '.jpg', '.jpeg', '.webp'):
        p = RAW / (name + ext)
        if p.exists():
            return p
    return None


def chroma_key(img, tol=110):
    """Removes a flat magenta background and the magenta fringe around the object."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = np.abs(255 - r) + g + np.abs(255 - b)          # distance from pure magenta
    k = np.clip((d - tol) / tol, 0, 1)
    edge = (k > 0) & (k < 1)
    a[..., 0] = np.where(edge & (r > g), g + (r - g) * k, r)   # pull magenta spill towards g
    a[..., 2] = np.where(edge & (b > g), g + (b - g) * k, b)
    a[..., 3] *= k
    return Image.fromarray(a.astype(np.uint8))


def flat_key(img, color, tol=40, holes=False):
    """Removes a flat background of any colour that touches the image border.
    holes=True also clears background seen through the object (gaps between
    leaves, open doors) - not used where the object has that colour itself."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    near = np.abs(a - color).sum(axis=2) < tol
    if holes:
        bg = np.abs(a - color).sum(axis=2) < tol * 1.5
    else:
        lab, _ = ndimage.label(near)
        border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
        bg = np.isin(lab, border[border > 0])
    rgb = a
    if holes:   # pull the light fringe of leaves towards their neighbours
        edge = ndimage.binary_dilation(bg, iterations=1) & ~bg
        rgb = a.copy()
        rgb[edge] = rgb[edge] * 0.75
    return with_alpha(rgb, ~bg, keep_parts=holes)


def photo_cut(img):
    """Separates the object from a photographic background (GrabCut)."""
    a = np.asarray(img.convert('RGB'))
    h, w = a.shape[:2]
    m = 0.02
    rect = (int(w * m), int(h * m), int(w * (1 - 2 * m)), int(h * (1 - 2 * m)))
    mask = np.zeros((h, w), np.uint8)
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    bgr = np.ascontiguousarray(a[..., ::-1])
    cv2.grabCut(bgr, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    fg = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    # second pass: learn the background colours from the image border and
    # mark everything that looks like them (sky, sea, water) as background
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    bw = max(4, int(min(h, w) * 0.04))
    ring = np.zeros((h, w), bool)
    ring[:bw] = ring[-bw:] = True
    ring[:, :bw] = ring[:, -bw:] = True
    samples = lab[ring.reshape(-1)]
    samples = samples[np.random.default_rng(1).choice(len(samples), min(len(samples), 20000), replace=False)]
    _, _, centers = cv2.kmeans(samples, 12, None, (cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0), 2, cv2.KMEANS_PP_CENTERS)
    dist = np.min(np.linalg.norm(lab[:, None, :] - centers[None, :, :], axis=2), axis=1).reshape(h, w)
    bglike = dist < 14
    core = ndimage.binary_erosion(fg, iterations=max(3, int(min(h, w) * 0.01))) & (dist > 30)
    mask[:] = np.where(fg, cv2.GC_PR_FGD, cv2.GC_BGD)
    mask[fg & bglike] = cv2.GC_PR_BGD
    mask[ring] = cv2.GC_BGD
    mask[core] = cv2.GC_FGD
    cv2.grabCut(bgr, mask, None, bgd, fgd, 4, cv2.GC_INIT_WITH_MASK)
    fg = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    fg = ndimage.binary_fill_holes(ndimage.binary_closing(fg, iterations=2))
    return with_alpha(a.astype(np.float32), fg, cut=max(3, int(min(h, w) * 0.008)))


def with_alpha(rgb, fg, cut=2, keep_parts=False):
    """Keeps the main object: thin links (ropes, wires) are cut so leftover
    background attached through them falls away, then fine detail is restored."""
    opened = ndimage.binary_opening(fg, iterations=cut)
    lab, n = ndimage.label(opened)
    if n and not keep_parts:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        main = np.isin(lab, 1 + np.nonzero(sizes > 0.15 * sizes.max())[0])
        fg = fg & ndimage.binary_dilation(main, iterations=cut + 1)
    alpha = ndimage.gaussian_filter(fg.astype(np.float32), 1.0) * 255
    return Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8))


def remove_background(img, holes=False):
    """Picks the right method: existing transparency, magenta, flat colour or photo."""
    if img.mode == 'RGBA' and np.asarray(img)[..., 3].min() < 250:
        return img
    if max(img.size) > 1100:                     # plenty for a sprite, much faster
        img = img.copy(); img.thumbnail((1100, 1100), Image.LANCZOS)
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    med = np.median(border, axis=0)
    magenta = ((border[:, 0] + border[:, 2]) / 2 - border[:, 1] > 90).mean()
    if magenta > 0.5:
        return chroma_key(img)
    near = np.abs(border - med).sum(axis=1) < 40
    # flat = most of the border is one uniform colour (white studio, black...),
    # not merely dark textured water
    if near.mean() > 0.5 and border[near].std(axis=0).max() < 6:
        return flat_key(img, med, holes=holes)
    return photo_cut(img)


def make_seamless(img):
    """Blends the texture with a half-shifted copy so its edges tile without seams."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w = a.shape[:2]
    rolled = np.roll(a, (h // 2, w // 2), axis=(0, 1))
    wy = 1 - np.abs(np.linspace(-1, 1, h))[:, None]
    wx = 1 - np.abs(np.linspace(-1, 1, w))[None, :]
    k = np.clip(np.minimum(wx, wy) * 3, 0, 1)[..., None]
    k = k * k * (3 - 2 * k)
    return Image.fromarray((a * k + rolled * (1 - k)).astype(np.uint8))


def crop_to_content(img):
    bbox = img.getchannel('A').getbbox()
    return img.crop(bbox) if bbox else img


def fit(img, w, h, align='center', stretch=1.35):
    """Scales img to fit inside w x h. Proportions may be stretched up to
    `stretch` so the art fills the box the game uses for collisions."""
    ri, rb = img.width / img.height, w / h
    if ri < rb:
        img = img.resize((round(img.width * min(stretch, rb / ri)), img.height), Image.LANCZOS)
    elif ri > rb:
        img = img.resize((img.width, round(img.height * min(stretch, ri / rb))), Image.LANCZOS)
    s = min(w / img.width, h / img.height)
    im = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x = (w - im.width) // 2
    y = (h - im.height) // 2 if align == 'center' else h - im.height
    canvas.alpha_composite(im, (x, y))
    return canvas


def sprite_from(raw_name, holes=False):
    p = find_raw(raw_name)
    if not p:
        return None
    # cut-outs are slow: reuse the last one unless the image or this script changed
    cache = RAW / '.cache' / f'{raw_name}.png'
    if cache.exists() and cache.stat().st_mtime > max(p.stat().st_mtime, Path(__file__).stat().st_mtime):
        return Image.open(cache)
    im = crop_to_content(remove_background(Image.open(p), holes))
    cache.parent.mkdir(exist_ok=True)
    im.save(cache)
    return im


def main():
    if not RAW.exists():
        RAW.mkdir(parents=True)
        print(f'Created {RAW} - put the generated images there and run again.')
        return
    (OUT / 'sprites').mkdir(parents=True, exist_ok=True)
    (OUT / 'textures').mkdir(parents=True, exist_ok=True)
    (OUT / 'hud').mkdir(parents=True, exist_ok=True)
    made = {}

    def save(name, img):
        w, h = BOX[name]
        img.save(OUT / 'sprites' / f'{name}.png')
        made[name] = True
        print(f'  sprite {name:13s} {img.width}x{img.height} (box {w}x{h})')

    def boxed(name, img, align='center'):
        w, h = BOX[name]
        return fit(img, w * UP, h * UP, align)

    player = sprite_from('player')
    if player:
        save('player', boxed('player', player))
    im = sprite_from('player_left')
    if not im and player:
        # no banking image: fake the bank by narrowing the plane, more on the
        # lowered (left) wing, like a perspective view of a turn
        w, h = player.size
        half = w // 2
        left = player.crop((0, 0, half, h)).resize((round(half * 0.62), h), Image.LANCZOS)
        right = player.crop((half, 0, w, h)).resize((round((w - half) * 0.9), h), Image.LANCZOS)
        im = Image.new('RGBA', (left.width + right.width, h), (0, 0, 0, 0))
        im.alpha_composite(left, (0, 0))
        im.alpha_composite(right, (left.width, 0))
    if im:
        save('player_left', boxed('player_left', im))
        save('player_right', boxed('player_right', ImageOps.mirror(im)))
    im = sprite_from('heli')
    if im:
        r = boxed('heli_r1', im)
        for n in ('heli_r1', 'heli_r2'):
            save(n, r)
        for n in ('heli_l1', 'heli_l2'):
            save(n, ImageOps.mirror(r))
    im = sprite_from('ship', holes=True)   # background shows between the deck rails
    if im:
        r = boxed('ship_r', im, 'bottom')
        save('ship_r', r)
        save('ship_l', ImageOps.mirror(r))
    im = sprite_from('jet')
    if im:
        r = boxed('jet_r', im)
        save('jet_r', r)
        save('jet_l', ImageOps.mirror(r))
    house, tree = sprite_from('house', holes=True), sprite_from('tree', holes=True)
    if house or tree:
        w, h = BOX['house_a']
        u, r = w * UP / 8, h * UP / 19          # one Atari column / one row
        comp = Image.new('RGBA', (w * UP, h * UP), (0, 0, 0, 0))
        if house:   # rows 0..6, columns 0..6
            comp.alpha_composite(fit(house, round(7 * u), round(7 * r), 'bottom'), (0, 0))
        if tree:    # rows 9..18, columns 3..7
            comp.alpha_composite(fit(tree, round(5 * u), round(10 * r), 'bottom'), (round(3 * u), round(9 * r)))
        save('house_a', comp)
        save('house_b', ImageOps.mirror(comp))
    im = sprite_from('bridge')
    if im:
        save('bridge', fit(im.resize((BOX['bridge'][0] * UP, BOX['bridge'][1] * UP), Image.LANCZOS), *[v * UP for v in BOX['bridge']]))
    im = sprite_from('fuel')
    if im:
        w, h = BOX['fuel']
        comp = Image.new('RGBA', (w * UP, h * UP), (0, 0, 0, 0))
        comp.alpha_composite(fit(im, round(w * UP * 7 / 8), h * UP, stretch=1.7), (0, 0))   # depot uses columns 0..6
        save('fuel', comp)

    textures = []
    for t in ('water', 'rock', 'jungle'):
        p = find_raw(t)
        if p:
            make_seamless(Image.open(p).convert('RGB').resize((1024, 1024), Image.LANCZOS)).save(OUT / 'textures' / f'{t}.png')
            textures.append(t)
            print(f'  texture {t}')
    panel = False
    p = find_raw('panel')
    if p:
        # generated as a thin strip on magenta (Nano Banana has no 9:1 format)
        im = crop_to_content(remove_background(Image.open(p)))
        im.convert('RGB').resize((1280, 148), Image.LANCZOS).save(OUT / 'hud' / 'panel.png')
        panel = True
        print('  panel')

    man = {'sprites': sorted(made), 'textures': textures, 'panel': panel}
    (OUT / 'manifest.json').write_text(json.dumps(man, indent=1))
    print(f'manifest: {len(made)} sprites, {len(textures)} textures, panel={panel}')


if __name__ == '__main__':
    sys.exit(main())
