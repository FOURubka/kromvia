package com.kromvia.client.module;

import java.util.HashMap;
import java.util.Map;

public final class ModuleInfo {
	private static final Map<String, String[]> INFO = new HashMap<>();

	private static void put(String id, String icon, String description) {
		INFO.put(id, new String[] {icon, description});
	}

	static {
		put("fps", "fps", "Shows your frames per second.");
		put("cps", "cps", "Shows how many times you click per second, left and right.");
		put("ping", "ping", "Shows your latency to the server.");
		put("coords", "coords", "Shows your X, Y and Z position and the way you are facing.");
		put("clock", "clock", "Shows the real time on your computer.");
		put("speed", "speed", "Shows how fast you are moving in blocks per second.");
		put("biome", "biome", "Shows the biome you are standing in.");
		put("day", "day", "Shows which in-game day the world is on.");
		put("server", "server", "Shows the address of the server you are playing on.");
		put("memory", "memory", "Shows how much RAM the game is using.");
		put("session", "session", "Shows how long you have been playing this session.");
		put("pack_display", "pack_display", "Shows which resource packs are on.");
		put("light_level", "light_level", "Shows the block light level where you stand, handy for mob-proofing.");
		put("tps", "tps", "Estimates the server's ticks per second, so you can tell server lag from your own.");
		put("saturation", "food", "Shows your hunger and hidden saturation.");
		put("compass", "compass", "A compass strip at the top of the screen.");
		put("effects", "effects", "Lists your active potion effects with time left.");
		put("effect_timers", "effect_timers", "Puts the time left on the vanilla effect icons.");
		put("effect_bars", "effect_bars", "Draws a draining bar under each vanilla effect icon.");
		put("armor", "armor", "Shows your armour and held item with durability.");
		put("armor_bar", "armor_bar", "A clearer armour bar, with the exact number if you want it.");
		put("armor_alert", "armor_alert", "Warns you when a piece of armour is about to break.");
		put("keystrokes", "keystrokes", "Shows WASD, jump and mouse buttons as you press them.");
		put("target_hud", "target_hud", "Shows the health and armour of whoever you are fighting.");
		put("reach", "reach", "Shows the distance of your last hit.");
		put("combo", "combo", "Counts hits in a row without getting hit back.");
		put("item_counter", "item_counter", "Counts items in your inventory, like pearls, gapples or arrows.");
		put("durability", "durability", "Warns you when your held tool or weapon is low on durability.");
		put("bow_charge", "bow_charge", "Shows how far your bow or crossbow is drawn.");
		put("low_health", "low_health", "Tints the screen red when your health gets low.");
		put("hit_sound", "hit_sound", "Plays a sound when you hit someone.");
		put("totem_pops", "totem_pops", "Tells you when someone pops a Totem of Undying, and how many times.");
		put("death_coords", "death_coords", "Posts where you died in chat so you can find your things.");
		put("tab_ping", "tab_ping", "Shows ping as a number in the player list.");
		put("crosshair", "crosshair", "Your own crosshair: style, size, gap and colour.");
		put("no_hurt_cam", "no_hurt_cam", "Stops the screen shaking when you take damage.");
		put("low_fire", "low_fire", "Makes the fire overlay smaller so you can see.");
		put("no_pumpkin", "no_pumpkin", "Removes the pumpkin overlay when you wear one.");
		put("hide_scoreboard", "hide_scoreboard", "Hides the sidebar scoreboard.");
		put("scoreboard", "scoreboard", "Restyles the sidebar scoreboard: size, position, background.");
		put("chat_time", "chat_time", "Adds the time to every chat message.");
		put("clear_weather", "clear_weather", "Hides rain and snow on your screen. The server still has weather.");
		put("weather", "weather", "Controls rain, snow, lightning and the fishing line.");
		put("irl_weather", "irl_weather", "Matches the in-game weather to the weather where you live.");
		put("time_changer", "time_changer", "Sets the time of day for you only.");
		put("toggle_sneak", "toggle_sneak", "Press sneak once to stay sneaking.");
		put("auto_sprint", "auto_sprint", "Sprints for you when you walk forward.");
		put("freelook", "freelook", "Hold Alt to look around without turning your player.");
		put("snaplook", "snaplook", "Hold V to look at yourself from the front.");
		put("behind_you", "behind_you", "Hold V to look behind you, B for the front view.");
		put("freecam", "freecam", "Fly the camera away from your player, great for screenshots. Off on servers unless you allow it.");
		put("easy_place", "easy_place", "Place blocks on doors, trapdoors, chests and other usable blocks without sneaking.");
		put("zoom", "zoom", "Hold C to zoom in. Scroll while zooming to change it.");
		put("fullbright", "fullbright", "Makes everything bright, even caves at night.");
		put("crash_patch", "crash_patch", "If the game crashes in a world, it takes you to a menu instead of closing.");
		put("no_fog", "no_fog", "Removes distance fog.");
		put("block_outline", "block_outline", "Changes the colour and thickness of the block outline.");
		put("hit_color", "hit_color", "Changes the red flash on mobs and players you hit.");
		put("hit_particles", "hit_particles", "Adds more particles when you hit.");
		put("particle_color", "particle_color", "Recolours crit and sharpness particles.");
		put("particles", "particles", "Fewer particles, and hides block breaking or explosions if you want.");
		put("target_marker", "target_marker", "Draws a marker over the player you are fighting.");
		put("hit_bubbles", "hit_bubbles", "Pops coloured bubbles where your hit lands.");
		put("hitboxes", "hitboxes", "Shows entity hitboxes, by type of entity.");
		put("visible_damage", "visible_damage", "Shows the damage of each hit as a number.");
		put("damage_tint", "damage_tint", "Tints the hurt flash by what hurt you: fire, fall, poison and so on.");
		put("attack_indicator", "attack_indicator", "A clearer attack cooldown indicator, per weapon.");
		put("old_animations", "old_animations", "Brings back the 1.7 swing, block and eat animations.");
		put("hand_sway", "hand_sway", "Changes how much your hand sways when you turn.");
		put("hand_position", "hand_position", "Moves and resizes your hand in first person.");
		put("trails", "trails", "Leaves a coloured trail behind you.");
		put("jump_circles", "jump_circles", "Draws a ring on the ground when you jump.");
		put("china_hat", "china_hat", "A see-through cone hat over your head.");
		put("motion_blur", "motion_blur", "Blurs the screen when you move the camera.");
		put("ambience", "ambience", "Tints the sky and fog.");
		put("chat_history", "chat_history", "Keeps your sent messages after you restart the game.");
		put("better_chat", "better_chat", "Stacks repeated messages, keeps chat between worlds, slide-in and a nicer background.");
		put("chat_filter", "chat_filter", "Hides or highlights messages with the words you pick.");
		put("chat_tools", "chat_tools", "Copy or delete messages, preview images and safer clickable commands.");
		put("chat_macros", "chat_macros", "Send a message or command with F6 to F9.");
		put("confirm_disconnect", "confirm_disconnect", "Asks before you leave a server.");
		put("bobbing", "bobbing", "Turns screen and hand bobbing on or off one by one.");
		put("custom_fov", "custom_fov", "Sets your field of view past the vanilla limit.");
		put("dimension_gamma", "dimension_gamma", "A brightness level for each dimension.");
		put("inventory", "inventory", "Inventory tweaks: blur behind it, click outside to close, keep the cursor.");
		put("inventory_scale", "inventory_scale", "A separate GUI scale for chests and other containers.");
		put("glint", "glint", "Changes the colour of the enchantment glint.");
		put("nametags", "nametags", "Restyles nametags, shows your own and can hide your nick.");
		put("overlays", "overlays", "Fire, shield, water, portal and spyglass overlays: lower, see-through or hidden.");
		put("camera", "camera", "Third person distance and FOV changes for sprint, flying and bows.");
		put("stretched", "stretched", "Stretches the game to a 4:3 look.");
		put("sounds", "sounds", "A volume slider for each kind of sound.");
		put("vanilla_hud", "vanilla_hud", "Resizes or hides titles, the action bar and boss bars.");
		put("lyrics", "lyrics", "Shows synced lyrics for the song you are playing.");
		put("music", "music", "Shows the song you are playing. Press M for the music menu.");
		put("kromvia_players", "kromvia_players", "Shows the capes and cosmetics of other Kromvia players.");
		put("welcome_guide", "welcome_guide", "Opens the first-launch guide again.");
	}

	private ModuleInfo() {}

	private static String[] of(Module m) {
		if (m.id.equals("saturation") && m.category == Module.Category.UTILITY) {
			return new String[] {"screen_colours", "Saturation, brightness, contrast and hue for the whole screen."};
		}
		return INFO.get(m.id);
	}

	public static String icon(Module m) {
		String[] i = of(m);
		return i == null ? null : i[0];
	}

	public static String description(Module m) {
		String[] i = of(m);
		return i == null ? "" : i[1];
	}
}
