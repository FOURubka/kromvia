#!/usr/bin/env python3
import io
import math
import pathlib
import subprocess
import tempfile

from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent.parent / "src/main/resources/assets/kromvia/textures/gui/icons"
SIZES = [16, 20, 24, 32, 40, 48, 60, 64, 72, 96, 120, 144]

BUBBLE = '<path d="M4 5h16v11H10l-5 4v-4H4z"/>'
HEART = '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>'
POTION = '<path d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3"/>'
CHEST = '<path d="M8 3L4 5v6l3 1v9h10v-9l3-1V5l-4-2c0 2-2 3-4 3S8 5 8 3z"/>'
SHIELD = '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>'
CAMERA = '<path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.5"/>'
CUBE = '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'
SLASH = '<path d="M3 3l18 18"/>'
REPEAT = '<path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/>'
SUN_RAYS = '<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
F = 'fill="#fff" stroke="none"'

ICONS = {
    "fps": f'<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1.6" {F}/>',
    "cps": '<rect x="8" y="8" width="8" height="13" rx="4"/><path d="M12 8v4M5 5l2 2M12 2.5v2.5M19 5l-2 2"/>',
    "ping": '<path d="M5 20v-3M10 20v-6M15 20v-9M20 20V7"/>',
    "coords": f'<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.6" {F}/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "speed": '<path d="M3 8h6M2 12h8M3 16h6M13 6l6 6-6 6"/>',
    "biome": '<path d="M2 19l6-9 4 6 3-4 7 7z"/><circle cx="17" cy="6" r="2"/>',
    "day": f'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><rect x="11" y="13" width="3" height="3" rx=".5" {F}/>',
    "server": '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01M12 7.5h4M12 16.5h4"/>',
    "memory": '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    "session": '<path d="M7 3h10M7 21h10M8 3v3l4 6-4 6v3M16 3v3l-4 6 4 6v3"/>',
    "pack_display": '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5M3 16.5l9 5 9-5"/>',
    "light_level": '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c1 1 1 2 1 2.5h6c0-.5 0-1.5 1-2.5A6 6 0 0 0 12 3z"/>',
    "tps": '<path d="M2 12h4l3-7 4 14 3-7h6"/>',
    "food": '<path d="M12 7c-2-2-7-1-7 5 0 5 3 9 5 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-4 5-9 0-6-5-7-7-5z"/><path d="M12 7c0-2 1-4 3-4"/>',
    "compass": f'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z" {F}/>',
    "effects": POTION + '<path d="M7 15h10"/>',
    "effect_timers": POTION + '<path d="M7.5 15h9"/><path d="M20 2v3M18.5 3.5h3"/>',
    "effect_bars": f'<rect x="3" y="5" width="18" height="5" rx="2.5"/><rect x="3" y="14" width="18" height="5" rx="2.5"/><rect x="5" y="7" width="9" height="1" rx=".5" {F}/><rect x="5" y="16" width="5" height="1" rx=".5" {F}/>',
    "armor": CHEST,
    "armor_bar": SHIELD + '<path d="M8 12h8"/>',
    "armor_alert": CHEST + '<path d="M13 6l-2 4 3 2-2 5"/>',
    "keystrokes": '<rect x="9" y="3" width="6" height="6" rx="1.5"/><rect x="2" y="11" width="6" height="6" rx="1.5"/><rect x="9" y="11" width="6" height="6" rx="1.5"/><rect x="16" y="11" width="6" height="6" rx="1.5"/><path d="M5 21h14"/>',
    "target_hud": '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="10" r="2.5"/><path d="M8 17c.5-2 2-3 4-3s3.5 1 4 3"/>',
    "reach": '<path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3M12 9v6"/>',
    "combo": '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    "item_counter": '<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/>',
    "durability": '<path d="M4 10c3-5 10-7 16-4"/><path d="M14 6.5L6 21"/><path d="M17 15h4M19 13v4"/>',
    "bow_charge": '<path d="M5 3c8 1 15 8 16 16"/><path d="M5 3l16 16"/><path d="M15 9L4 20M4 16v4h4"/>',
    "low_health": HEART + '<path d="M12 8.5v4M12 15.5h.01"/>',
    "hit_sound": '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
    "totem_pops": '<rect x="7" y="3" width="10" height="9" rx="2"/><path d="M10 7h.01M14 7h.01M7 12l-3 3M17 12l3 3M9 12v8h6v-8"/>',
    "death_coords": '<path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><path d="M10 7l4 4M14 7l-4 4"/>',
    "tab_ping": '<path d="M3 6h9M3 12h9M3 18h9M16 18v-2M19 18v-5M22 18v-8"/>',
    "crosshair": f'<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><circle cx="12" cy="12" r="1.2" {F}/>',
    "no_hurt_cam": CAMERA + SLASH,
    "low_fire": '<path d="M12 2c1 4 6 6 6 10a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 2 4 4 0-3-1-5 0-7z"/><path d="M4 22h16"/>',
    "no_pumpkin": '<path d="M12 7c-5 0-8 3-8 7s3 6 8 6 8-2 8-6-3-7-8-7z"/><path d="M12 7c0-2 1-3 2-4"/>' + SLASH,
    "hide_scoreboard": '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8"/>' + SLASH,
    "scoreboard": '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h5M8 12h5M8 16h5M16 8h.01M16 12h.01M16 16h.01"/>',
    "chat_time": BUBBLE + '<path d="M12 7.5v3l2 1"/>',
    "clear_weather": '<circle cx="12" cy="12" r="4"/>' + SUN_RAYS,
    "weather": '<path d="M7 16a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 16z"/><path d="M8 19l-1 2.5M12 19l-1 2.5M16 19l-1 2.5"/>',
    "irl_weather": '<circle cx="8" cy="8" r="3"/><path d="M8 2v1M2 8h1M3.8 3.8l.7.7M12.2 3.8l-.7.7"/><path d="M9 21a4 4 0 0 1 0-8 5 5 0 0 1 9.5 1.5A3.3 3.3 0 0 1 18 21z"/>',
    "time_changer": '<path d="M12 3v2M5.6 6.6L7 8M3 13h2M19 13h2M17 8l1.4-1.4"/><path d="M7 13a5 5 0 0 1 10 0"/><path d="M3 17h18M7 21h10"/>',
    "toggle_sneak": f'<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3" {F}/>',
    "auto_sprint": '<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>',
    "freelook": '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    "snaplook": '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/><circle cx="12" cy="12" r="2"/>',
    "behind_you": '<circle cx="14" cy="6" r="3"/><path d="M8 21v-3a6 6 0 0 1 12 0v3M2 13h5M2 13l2-2M2 13l2 2"/>',
    "freecam": '<rect x="3" y="8" width="13" height="10" rx="2"/><path d="M16 12l5-3v8l-5-3"/><path d="M6 4l3-2 3 2M9 2v4"/>',
    "easy_place": '<path d="M4 4h16v6H4z"/><path d="M12 13v8M8.5 17.5L12 21l3.5-3.5"/>',
    "zoom": '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6"/>',
    "fullbright": f'<circle cx="12" cy="12" r="4.5" {F}/>' + SUN_RAYS,
    "crash_patch": SHIELD + '<path d="M8.5 12l2.5 2.5 4.5-5"/>',
    "no_fog": '<path d="M3 8h13M6 12h15M3 16h11"/><path d="M4 3l16 18"/>',
    "block_outline": CUBE,
    "hit_color": '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5"/>',
    "hit_particles": '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    "particle_color": '<path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><circle cx="19" cy="19" r="2"/>',
    "particles": '<path d="M9 3l1.5 4.5L15 9l-4.5 1.5L9 15l-1.5-4.5L3 9l4.5-1.5z"/><path d="M18 13l.8 2.2 2.2.8-2.2.8L18 19l-.8-2.2L15 16l2.2-.8z"/>',
    "target_marker": f'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.2" {F}/>',
    "hit_bubbles": '<circle cx="9" cy="14" r="5"/><circle cx="17" cy="7" r="3"/><circle cx="18.5" cy="17" r="1.5"/>',
    "hitboxes": '<rect x="5" y="3" width="14" height="18" rx="1" stroke-dasharray="3 2.6"/><path d="M5 8h14"/>',
    "visible_damage": HEART + '<path d="M12 6.2l-1.5 4 3 2-1.5 4"/>',
    "damage_tint": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 8s-3 3.5-3 5.5a3 3 0 0 0 6 0c0-2-3-5.5-3-5.5z"/>',
    "attack_indicator": '<path d="M20 3L9 14M20 3h-4M20 3v4M7 12l5 5M5 19l3-3"/><path d="M3 22h9"/>',
    "old_animations": '<path d="M11 6l-7 6 7 6zM20 6l-7 6 7 6z"/>',
    "hand_sway": '<path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><path d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity=".5"/>',
    "hand_position": '<path d="M12 3v18M3 12h18M9.5 5.5L12 3l2.5 2.5M9.5 18.5L12 21l2.5-2.5M5.5 9.5L3 12l2.5 2.5M18.5 9.5L21 12l-2.5 2.5"/>',
    "trails": f'<path d="M3 19c5 0 7-12 17-12"/><path d="M3 14c2 0 3-2 4.5-4" opacity=".5"/><circle cx="20" cy="7" r="1.8" {F}/>',
    "jump_circles": '<ellipse cx="12" cy="17" rx="9" ry="3"/><ellipse cx="12" cy="17" rx="4" ry="1.2"/><path d="M12 13V4M9 7l3-3 3 3"/>',
    "china_hat": '<path d="M2 16c3-1 6-6 10-10 4 4 7 9 10 10-6 2-14 2-20 0z"/><path d="M12 6v-3"/>',
    "motion_blur": '<circle cx="15" cy="12" r="5"/><path d="M2 9h6M3 12h5M2 15h6"/>',
    "screen_colours": f'<path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2" {F}/><circle cx="10" cy="7" r="1.2" {F}/><circle cx="15" cy="7.5" r="1.2" {F}/>',
    "ambience": '<path d="M19 15A8 8 0 0 1 9 5a8 8 0 1 0 10 10z"/><path d="M17 3v4M15 5h4"/>',
    "chat_history": BUBBLE + '<path d="M8 9h8M8 12h5"/>',
    "better_chat": BUBBLE + '<path d="M12 7l.9 2.1L15 10l-2.1.9L12 13l-.9-2.1L9 10l2.1-.9z"/>',
    "chat_filter": '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
    "chat_tools": BUBBLE + '<path d="M12 7.5v5M9.5 10h5"/>',
    "chat_macros": '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    "confirm_disconnect": '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
    "bobbing": '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
    "custom_fov": '<path d="M12 20L4 6M12 20l8-14"/><path d="M5.5 8.5a10 10 0 0 1 13 0"/>',
    "dimension_gamma": '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 8a4 4 0 1 0 4 4"/>',
    "inventory": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    "inventory_scale": '<rect x="3" y="9" width="12" height="12" rx="2"/><path d="M14 4h6v6M20 4l-7 7"/>',
    "glint": '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 21L8 9l4-6 4 6z"/>',
    "nametags": '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.5"/>',
    "overlays": '<rect x="3" y="3" width="13" height="13" rx="2"/><rect x="8" y="8" width="13" height="13" rx="2"/>',
    "camera": CAMERA,
    "stretched": '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h12M6 12l2-2M6 12l2 2M18 12l-2-2M18 12l-2 2"/>',
    "sounds": f'<path d="M6 4v16M12 4v16M18 4v16"/><circle cx="6" cy="14" r="2.2" {F}/><circle cx="12" cy="8" r="2.2" {F}/><circle cx="18" cy="16" r="2.2" {F}/>',
    "vanilla_hud": '<rect x="2" y="15" width="20" height="5" rx="1"/><path d="M7 15v5M12 15v5M17 15v5"/><path d="M4 10h6M14 10h6"/>',
    "lyrics": '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    "music": '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    "kromvia_players": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    "welcome_guide": '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    "play": f'<path d="M7 4.5l12.5 7.5L7 19.5z" {F}/>',
    "pause": f'<rect x="6" y="4" width="4.5" height="16" rx="1.2" {F}/><rect x="13.5" y="4" width="4.5" height="16" rx="1.2" {F}/>',
    "next": f'<path d="M4.5 4.5L15 12 4.5 19.5z" {F}/><rect x="16.5" y="4.5" width="3" height="15" rx="1" {F}/>',
    "previous": f'<path d="M19.5 4.5L9 12l10.5 7.5z" {F}/><rect x="4.5" y="4.5" width="3" height="15" rx="1" {F}/>',
    "shuffle": '<path d="M3 7h3c4 0 6 10 10 10h5M3 17h3c1.5 0 2.7-1.4 3.7-3M14.3 10c1-1.6 2.2-3 3.7-3h3M18 4l3 3-3 3M18 14l3 3-3 3"/>',
    "health": HEART + '<path d="M7 11h3l1.5-3 2 6 1.5-3h2"/>',
    "xp": f'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" {F}/><path d="M12 2v2M12 20v2"/>',
    "held_count": CUBE + '<path d="M17 2v4M15 4h4"/>',
    "nether_coords": '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M10 8c2 1 2 3 0 4s-2 3 0 4M14 8c-2 1-2 3 0 4"/>',
    "world_time": '<path d="M3 18h18M6 18a6 6 0 0 1 12 0"/><path d="M12 6V4M5.5 9.5L4 8M18.5 9.5L20 8"/>',
    "rotation": '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/><path d="M12 9v3l2 2"/>',
    "player_count": '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.5-6 6-6s6 2.5 6 6"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.5c2 .8 3 2.800 3 5.500"/>',
    "free_slots": '<rect x="3" y="3" width="7.5" height="7.5" rx="1.500"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.500"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.500"/><path d="M17.200 14.500v5.500M14.500 17.200h5.500"/>',
    "looking_at": '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    "move_status": '<circle cx="14" cy="4.500" r="2"/><path d="M8 21l3-6-2-3 2-5 4 2 3 1M11 7L7 9l-1 3M13 14l3 3 1 4"/>',
    "auto_respawn": HEART + '<path d="M9 12l2 2 4-4"/>',
    "auto_gg": BUBBLE + '<path d="M11 8.500H8.500v4H11V11M15.500 8.500H13v4h2.500V11"/>',
    "repeat": REPEAT,
    "repeat_one": REPEAT + '<path d="M11 10.5l1.5-1v5.5"/>',
    "speaker": '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M12 6h.01"/>',
    "close": '<path d="M6 6l12 12M18 6L6 18"/>',
}


def svg(body: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" '
        f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{body}</svg>'
    )


def render(body: str, size: int, tmp: pathlib.Path) -> Image.Image:
    src = tmp / "icon.svg"
    out = tmp / "icon.png"
    src.write_text(svg(body))
    subprocess.run(["resvg", "-w", str(size), "-h", str(size), str(src), str(out)], check=True)
    return Image.open(io.BytesIO(out.read_bytes())).convert("RGBA")


def main() -> None:
    names = list(ICONS)
    cols = math.ceil(math.sqrt(len(names)))
    rows = math.ceil(len(names) / cols)
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as t:
        tmp = pathlib.Path(t)
        for size in SIZES:
            atlas = Image.new("RGBA", (cols * size, rows * size), (255, 255, 255, 0))
            for i, name in enumerate(names):
                atlas.paste(render(ICONS[name], size, tmp), ((i % cols) * size, (i // cols) * size))
            atlas.save(OUT / f"{size}.png", optimize=True)
    (OUT / "index.txt").write_text(f"{cols}\n" + "\n".join(names) + "\n")
    print(f"{len(names)} icons, {cols}x{rows}, sizes {SIZES}")


if __name__ == "__main__":
    main()
