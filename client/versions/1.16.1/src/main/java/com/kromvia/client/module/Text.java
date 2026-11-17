package com.kromvia.client.module;

import com.kromvia.client.compat.Mc;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.core.BlockPos;
import net.minecraft.world.item.Items;

public final class Text {
	private Text() {}

	public static Module fps() {
		return new TextModule("fps", "FPS", Module.Category.HUD, true) {
			final ChoiceSetting format = add(new ChoiceSetting("format", "Format", 0, "120 FPS", "FPS: 120", "120"));

			@Override
			protected String text(Minecraft mc) {
				int f = com.kromvia.client.mixin.MinecraftFpsAccessor.kromvia$fps();
				switch (format.index()) {
					case 1: return "FPS: " + f;
					case 2: return String.valueOf(f);
					default: return f + " FPS";
				}
			}

			@Override
			public String sample() {
				return "144 FPS";
			}
		}.icon(Items.CLOCK);
	}

	public static Module cps() {
		return new TextModule("cps", "CPS", Module.Category.PVP, false) {
			final ChoiceSetting buttons = add(new ChoiceSetting("buttons", "Buttons", 0, "Left | Right", "Left only"));

			@Override
			protected String text(Minecraft mc) {
				return buttons.index() == 1 ? Clicks.left() + " CPS" : Clicks.left() + " | " + Clicks.right() + " CPS";
			}

			@Override
			public String sample() {
				return "12 | 4 CPS";
			}
		}.icon(Items.STONE_BUTTON);
	}

	public static Module ping() {
		return new TextModule("ping", "Ping", Module.Category.HUD, false) {
			final ChoiceSetting format = add(new ChoiceSetting("format", "Format", 0, "42 ms", "Ping: 42"));

			@Override
			protected String text(Minecraft mc) {
				if (mc.player == null || mc.getConnection() == null) return "";
				PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
				if (info == null) return "";
				return format.index() == 1 ? "Ping: " + info.getLatency() : info.getLatency() + " ms";
			}

			@Override
			public String sample() {
				return "42 ms";
			}
		}.icon(Items.ENDER_PEARL);
	}

	public static Module coords() {
		return new TextModule("coords", "Coordinates", Module.Category.HUD, true) {
			final BoolSetting direction = add(new BoolSetting("direction", "Show direction", true));
			final ChoiceSetting layout = add(new ChoiceSetting("layout", "Layout", 0, "X Y Z", "XYZ: x, y, z"));

			@Override
			protected String text(Minecraft mc) {
				if (mc.player == null) return "";
				net.minecraft.client.player.LocalPlayer p = mc.player;
				String xyz = layout.index() == 1
						? String.format("XYZ: %d, %d, %d", p.blockPosition().getX(), p.blockPosition().getY(), p.blockPosition().getZ())
						: String.format("%d %d %d", p.blockPosition().getX(), p.blockPosition().getY(), p.blockPosition().getZ());
				if (!direction.on()) return xyz;
				String f = p.getDirection().getName();
				return xyz + "  " + Character.toUpperCase(f.charAt(0)) + f.substring(1);
			}

			@Override
			public String sample() {
				return "128 64 -256  North";
			}
		}.icon(Items.FILLED_MAP);
	}

	public static Module clock() {
		return new TextModule("clock", "Clock", Module.Category.HUD, false) {
			final ChoiceSetting format = add(new ChoiceSetting("format", "Format", 0, "24-hour", "12-hour"));
			final BoolSetting seconds = add(new BoolSetting("seconds", "Seconds", false));

			@Override
			protected String text(Minecraft mc) {
				String p = (format.index() == 1 ? "h:mm" : "HH:mm") + (seconds.on() ? ":ss" : "") + (format.index() == 1 ? " a" : "");
				return LocalTime.now().format(DateTimeFormatter.ofPattern(p));
			}
		}.icon(Items.COMPASS);
	}

	private static double lastX, lastZ, speed;

	public static Module speed() {
		return new TextModule("speed", "Speed", Module.Category.HUD, false) {
			final ChoiceSetting unit = add(new ChoiceSetting("unit", "Unit", 0, "blocks/s", "km/h"));

			@Override
			public void tick(Minecraft mc) {
				if (mc.player == null) return;
				double dx = mc.player.getX() - lastX, dz = mc.player.getZ() - lastZ;
				lastX = mc.player.getX();
				lastZ = mc.player.getZ();
				speed = speed * 0.7 + Math.sqrt(dx * dx + dz * dz) * 20 * 0.3;
			}

			@Override
			protected String text(Minecraft mc) {
				return unit.index() == 1 ? String.format("%.1f km/h", speed * 3.6) : String.format("%.1f b/s", speed);
			}
		}.icon(Items.FEATHER);
	}

	public static Module biome() {
		return new TextModule("biome", "Biome", Module.Category.HUD, false) {
			@Override
			protected String text(Minecraft mc) {
				if (mc.player == null || mc.level == null) return "";
				BlockPos pos = mc.player.blockPosition();
				return java.util.Optional.ofNullable(net.minecraft.core.Registry.BIOME.getKey(mc.level.getBiome(pos))).map(k -> pretty(k.getPath())).orElse("");
			}

			@Override
			public String sample() {
				return "Cherry Grove";
			}
		}.icon(Items.GRASS_BLOCK);
	}

	public static Module day() {
		return new TextModule("day", "Day Counter", Module.Category.HUD, false) {
			@Override
			protected String text(Minecraft mc) {
				return mc.level == null ? "" : "Day " + (Mc.dayTime(mc.level) / 24000L + 1);
			}

			@Override
			public String sample() {
				return "Day 42";
			}
		}.icon(Items.SUNFLOWER);
	}

	public static Module server() {
		return new TextModule("server", "Server Address", Module.Category.HUD, false) {
			@Override
			protected String text(Minecraft mc) {
				ServerData s = mc.getCurrentServer();
				return s == null ? "" : s.ip;
			}

			@Override
			public String sample() {
				return "play.example.net";
			}
		}.icon(Items.NAME_TAG);
	}

	public static Module memory() {
		return new TextModule("memory", "Memory", Module.Category.HUD, false) {
			@Override
			protected String text(Minecraft mc) {
				Runtime r = Runtime.getRuntime();
				long used = (r.totalMemory() - r.freeMemory()) >> 20, max = r.maxMemory() >> 20;
				return String.format("Mem %d%%  %d/%d MB", used * 100 / max, used, max);
			}
		}.icon(Items.REDSTONE);
	}

	private static String pretty(String id) {
		StringBuilder b = new StringBuilder();
		for (String w : id.split("_")) {
			if (!w.isEmpty()) b.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1)).append(' ');
		}
		return b.toString().trim();
	}
}
