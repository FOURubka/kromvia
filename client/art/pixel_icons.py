#!/usr/bin/env python3
import io
import math
import pathlib
import subprocess
import sys
import tempfile

from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from icons import ICONS, OUT, svg  # noqa: E402

CELL = 20
ART = 17
TOP = (0xC9, 0xB5, 0xFF, 255)
FRONT = (0x8B, 0x5C, 0xF6, 255)
SIDE = (0x2F, 0x55, 0xC8, 255)
UI_ONLY = {"play", "pause", "next", "previous", "shuffle", "repeat", "repeat_one", "speaker", "close"}

HAND = {
    "keystrokes": ["...##...", "...##...", "........", "##.##.##", "##.##.##", "........", "########"],
    "target_hud": ["##....##", "#..##..#", "...##...", "..####..", "#.####.#", "##....##"],
    "cps": ["#.....#", "..###..", ".#.#.#.", ".#####.", ".#...#.", ".#...#.", "..###.."],
    "time_changer": ["#.#.....", ".#......", "#.#..##.", "....##..", "....##..", ".....##."],
    "irl_weather": ["...##...", "..#..##.", ".#.....#", "#......#", ".######."],
    "hit_bubbles": [".....##.", "....#..#", ".##..##.", "#..#....", "#..#....", ".##....."],
    "behind_you": ["...##...", "...##...", "..####..", "...##...", "..#..#..", "........", ".#......", "########", ".#......"],
    "no_fog": ["#.......", ".#.##...", "..#..##.", ".#.#...#", "#...#..#", ".#####.#", "......#.", ".......#"],
    "motion_blur": [".....##.", "##..####", "...#####", "##.#####", "....####", "##...##."],
    "player_count": [".##..##.", ".##..##.", "####.###", ".##..##.", ".#.#.#.#"],
    "kromvia_players": ["##..##", "##.##.", "####..", "##.##.", "##..##"],
    "free_slots": ["##.##.##", "##.##.##", "........", "##.##.#.", "##.##..."],
    "trails": ["......##", "....#.##", "..#.....", "#......."],
    "jump_circles": ["...##...", "...##...", "..####..", "...##...", "..#..#..", "........", ".######.", "#......#", ".######."],
    "elytra": ["##....##", "###..###", "#.#..#.#", "#.#..#.#", "#..##..#", ".#....#."],
    "nearby": ["..####..", ".#....#.", "#.....##", "#..##.##", "#..##..#", "#......#", ".#....#.", "..####.."],
    "timer": ["..###...", "...#..#.", ".#####..", "#..#..#.", "#..##.#.", "#.....#.", ".#####.."],
    "item_tips": ["########", "#......#", "#.####.#", "#......#", "#.##...#", "########"],
    "custom_sky": ["...###.#", "..##....", ".##.....", ".##...#.", ".##.....", "..##....", "...###.."],
    "smooth_hotbar": ["..####..", "..#..#..", "#.#..#.#", "..####..", "........", "##.##.##"],
    "totem_pop": ["#..##..#", "..####..", ".#.##.#.", "..####..", "#..##..#", "...##..."],
    "kromvia_font": ["..##....", ".#..#...", ".####.##", ".#..##.#", ".#..#.##"],
    "colour_filter": ["...#....", "..###...", ".#.###..", "#..####.", "#..####.", ".#.###..", "..###..."],
    "party_pings": ["..####..", ".#....#.", "#..##..#", "#..##..#", ".#....#.", "..#..#..", "...##...", "........"],
    "frame_report": ["#.......", "#.....#.", "#....#.#", "#.#.#...", "#..#....", "#.......", "########"],
    "ghosts": ["..####..", ".######.", "##.##.##", "########", "########", "########", "#.#..#.#"],
}


def mask_from_svg(body: str, tmp: pathlib.Path) -> list[list[bool]]:
    big = ART * 8
    src = tmp / "i.svg"
    out = tmp / "i.png"
    src.write_text(svg(body).replace('stroke-width="2"', 'stroke-width="2.6"'))
    subprocess.run(["resvg", "-w", str(big), "-h", str(big), str(src), str(out)], check=True)
    img = Image.open(io.BytesIO(out.read_bytes())).convert("RGBA")
    alpha = img.getchannel("A")
    grid = []
    for y in range(ART):
        row = []
        for x in range(ART):
            box = alpha.crop((x * 8, y * 8, x * 8 + 8, y * 8 + 8))
            row.append(sum(box.tobytes()) / (64 * 255) >= 0.4)
        grid.append(row)
    return grid


def mask_from_text(rows: list[str]) -> list[list[bool]]:
    grid = [[False] * ART for _ in range(ART)]
    h, w = len(rows) * 2, max(len(r) for r in rows) * 2
    oy, ox = (ART - h) // 2, (ART - w) // 2
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == "#":
                for dy in (0, 1):
                    for dx in (0, 1):
                        grid[oy + y * 2 + dy][ox + x * 2 + dx] = True
    return grid


def paint(grid: list[list[bool]]) -> Image.Image:
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    px = cell.load()
    on = lambda x, y: 0 <= x < ART and 0 <= y < ART and grid[y][x]
    for y in range(ART):
        for x in range(ART):
            if on(x, y):
                px[x + 2, y + 2] = SIDE
    for y in range(ART):
        for x in range(ART):
            if on(x, y):
                px[x + 1, y + 1] = TOP if not on(x, y - 1) else FRONT
    return cell


def main() -> None:
    names = [n for n in ICONS if n not in UI_ONLY] + [n for n in HAND if n not in ICONS]
    cols = math.ceil(math.sqrt(len(names)))
    rows = math.ceil(len(names) / cols)
    atlas = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
    with tempfile.TemporaryDirectory() as t:
        tmp = pathlib.Path(t)
        for i, name in enumerate(names):
            grid = mask_from_text(HAND[name]) if name in HAND else mask_from_svg(ICONS[name], tmp)
            atlas.paste(paint(grid), ((i % cols) * CELL, (i // cols) * CELL))
    atlas.save(OUT / "pixel.png", optimize=True)
    (OUT / "pixel.txt").write_text(f"{cols}\n" + "\n".join(names) + "\n")
    print(f"{len(names)} pixel icons, {cols}x{rows}")


if __name__ == "__main__":
    main()
