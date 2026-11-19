package com.kromvia.client.module;

import com.kromvia.client.Binds;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.KromviaClient;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.ColorSetting;
import com.kromvia.client.module.setting.SliderSetting;
import com.kromvia.client.module.setting.TextSetting;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public final class Features {
	private Features() {}

	private static class Flag extends Module {
		Flag(String id, String name, Category cat, boolean on) {
			super(id, name, cat, Corner.TOP_LEFT, on);
		}

		@Override
		public boolean hud() {
			return false;
		}
	}

	public static final Module NO_HURT_CAM = new Flag("no_hurt_cam", "No Hurt Cam", Module.Category.UTILITY, false).icon(Items.SHIELD);
	public static final Module LOW_FIRE = new Flag("low_fire", "Low Fire", Module.Category.UTILITY, true).icon(Items.FIRE_CHARGE);
	public static final Module NO_PUMPKIN = new Flag("no_pumpkin", "No Pumpkin Blur", Module.Category.UTILITY, true).icon(Items.CARVED_PUMPKIN);
	public static final Module HIDE_SCOREBOARD = new Flag("hide_scoreboard", "Hide Scoreboard", Module.Category.UTILITY, false).icon(Items.WRITABLE_BOOK);
	public static final Module CHAT_TIME = new Flag("chat_time", "Chat Timestamps", Module.Category.UTILITY, false).icon(Items.OAK_SIGN);
	public static final Module CLEAR_WEATHER = new Flag("clear_weather", "Clear Weather", Module.Category.UTILITY, false).icon(Items.WATER_BUCKET);

	public static final class TimeChanger extends Flag {
		public final ChoiceSetting time = add(new ChoiceSetting("time", "Time of day", 0, "Day", "Sunset", "Night", "Sunrise", "Real time"));

		TimeChanger() {
			super("time_changer", "Time Changer", Module.Category.UTILITY, false);
			icon(Items.DAYLIGHT_DETECTOR);
		}
	}

	public static final TimeChanger TIME = new TimeChanger();

	public static long fixedTime() {
		return switch (TIME.time.index()) {
			case 1 -> 12_500;
			case 2 -> 18_000;
			case 3 -> 23_200;
			case 4 -> {
				java.time.LocalTime t = java.time.LocalTime.now();
				yield (t.toSecondOfDay() * 1000L / 3600 + 18_000) % 24_000;
			}
			default -> 6_000;
		};
	}

	public static final class Crosshair extends Flag {
		final ChoiceSetting style = add(new ChoiceSetting("style", "Style", 0, "Cross", "Dot", "Plus gap", "Box", "Circle", "Pixel"));
		public final TextSetting pixels = add(new TextSetting("pixels", "Pixels", CrosshairGrid.DEFAULT, CrosshairGrid.N * CrosshairGrid.N));
		final ColorSetting color = add(new ColorSetting("color", "Colour", 0xFF8B5CF6));
		final SliderSetting size = add(new SliderSetting("size", "Size", 5, 2, 12, 1, "px"));
		final SliderSetting gap = add(new SliderSetting("gap", "Gap", 2, 0, 6, 1, "px"));
		final SliderSetting thickness = add(new SliderSetting("thickness", "Thickness", 2, 1, 4, 1, "px"));
		final BoolSetting outline = add(new BoolSetting("outline", "Outline", true));
		public final BoolSetting invert = add(new BoolSetting("invert", "Blend with background (invert)", false));
		private Fill inverted;

		Crosshair() {
			super("crosshair", "Crosshair", Module.Category.PVP, false);
			icon(Items.TARGET);
			invert.shown = false;
			pixels.shown = false;
		}

		public interface Fill {
			void fill(int x1, int y1, int x2, int y2);
		}

		private void bar(Gfx g, int x1, int y1, int x2, int y2) {
			if (inverted != null) {
				inverted.fill(x1, y1, x2, y2);
				return;
			}
			if (outline.on()) g.fill(x1 - 1, y1 - 1, x2 + 1, y2 + 1, 0xC0000000);
			g.fill(x1, y1, x2, y2, color.argb());
		}

		public void draw(Gfx g, int cx, int cy, Fill invert) {
			inverted = this.invert.shown && this.invert.on() ? invert : null;
			draw(g, cx, cy);
			inverted = null;
		}

		public boolean pixel() {
			return style.index() == 5;
		}

		public int argb() {
			return color.argb();
		}

		public void draw(Gfx g, int cx, int cy) {
			if (pixel()) {
				CrosshairGrid.draw(g, pixels.get(), cx, cy, color.argb(), outline.on(), inverted == null ? null : inverted::fill);
				return;
			}
			int s = Math.round(size.value()), gp = Math.round(gap.value()), t = Math.round(thickness.value());
			int h = t / 2, h2 = t - h;
			switch (style.index()) {
				case 1 -> bar(g, cx - h, cy - h, cx + h2, cy + h2);
				case 2 -> {
					bar(g, cx - gp - s, cy - h, cx - gp, cy + h2);
					bar(g, cx + gp, cy - h, cx + gp + s, cy + h2);
					bar(g, cx - h, cy - gp - s, cx + h2, cy - gp);
					bar(g, cx - h, cy + gp, cx + h2, cy + gp + s);
				}
				case 3 -> {
					bar(g, cx - s, cy - s, cx + s, cy - s + t);
					bar(g, cx - s, cy + s - t, cx + s, cy + s);
					bar(g, cx - s, cy - s + t, cx - s + t, cy + s - t);
					bar(g, cx + s - t, cy - s + t, cx + s, cy + s - t);
				}
				case 4 -> {
					for (int a = 0; a < 360; a += 15) {
						int px = cx + Math.round(Mth.cos(a * Mth.DEG_TO_RAD) * s), py = cy + Math.round(Mth.sin(a * Mth.DEG_TO_RAD) * s);
						bar(g, px - h, py - h, px + h2, py + h2);
					}
				}
				default -> {
					bar(g, cx - s, cy - h, cx + s, cy + h2);
					bar(g, cx - h, cy - s, cx + h2, cy + s);
				}
			}
		}

		@Override
		public boolean hud() {
			return false;
		}
	}

	public static final Crosshair CROSSHAIR = new Crosshair();

	public static final Module TOGGLE_SNEAK = new Flag("toggle_sneak", "Toggle Sneak", Module.Category.UTILITY, false) {
		{
			icon(Items.LEATHER_BOOTS);
		}

		private boolean on;

		@Override
		public void tick(Minecraft mc) {
			if (mc.player == null) return;
			while (mc.options.keyShift.consumeClick()) on = !on;
			if (on) mc.options.keyShift.setDown(true);
		}

		@Override
		public void disable(Minecraft mc) {
			on = false;
			mc.options.keyShift.setDown(false);
		}
	};

	public static final class Freelook extends Flag {
		public static float yaw, pitch;
		private static boolean holding;
		private CameraType saved;

		Freelook() {
			super("freelook", "Freelook (hold Alt)", Module.Category.PVP, true);
			icon(Items.ENDER_EYE);
		}

		public static boolean looking() {
			return holding;
		}

		@Override
		public void tick(Minecraft mc) {
			if (mc.player == null) return;
			boolean down = Mc.screen() == null && Binds.down(Binds.FREELOOK);
			if (down && !holding) {
				saved = mc.options.getCameraType();
				mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
				yaw = mc.player.getYRot();
				pitch = mc.player.getXRot();
			} else if (!down && holding && saved != null) {
				mc.options.setCameraType(saved);
			}
			holding = down;
		}

		public static void turn(double dx, double dy) {
			yaw += (float) dx * 0.15F;
			pitch = Mth.clamp(pitch + (float) dy * 0.15F, -90, 90);
		}

		@Override
		public void disable(Minecraft mc) {
			if (holding && saved != null) mc.options.setCameraType(saved);
			holding = false;
		}
	}

	public static final Freelook FREELOOK = new Freelook();

	public static final Module CRASH_PATCH = new Flag("crash_patch", "Crash Patch", Module.Category.UTILITY, true) {
		{
			icon(Items.TOTEM_OF_UNDYING);
		}
	};

	private static long lastCrash;

	public static boolean survive(Throwable error) {
		long now = System.currentTimeMillis();
		if (!CRASH_PATCH.enabled || now - lastCrash < 10_000) return false;
		lastCrash = now;
		org.slf4j.LoggerFactory.getLogger("kromvia").error("Crash Patch kept the game open after this crash", error);
		try {
			Mc.leaveWorld(new com.kromvia.client.ui.CrashScreen(error));
		} catch (RuntimeException | Error again) {
			return false;
		}
		return true;
	}

	public static final Module SNAPLOOK = new Flag("snaplook", "Snaplook (hold V)", Module.Category.PVP, false) {
		{
			icon(Items.SPYGLASS);
		}

		private CameraType saved;

		@Override
		public void tick(Minecraft mc) {
			if (mc.player == null) return;
			boolean down = Mc.screen() == null && Binds.down(Binds.SNAPLOOK);
			if (down && saved == null) {
				saved = mc.options.getCameraType();
				mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
			} else if (!down && saved != null) {
				mc.options.setCameraType(saved);
				saved = null;
			}
		}

		@Override
		public void disable(Minecraft mc) {
			if (saved != null) mc.options.setCameraType(saved);
			saved = null;
		}
	};

	private static float lastReach;
	private static long lastHit;
	private static int combo;

	public static void onAttack(Minecraft mc, Entity target) {
		if (mc.player == null) return;
		var eye = mc.player.getEyePosition();
		var box = target.getBoundingBox();
		double x = Mth.clamp(eye.x, box.minX, box.maxX), y = Mth.clamp(eye.y, box.minY, box.maxY), z = Mth.clamp(eye.z, box.minZ, box.maxZ);
		lastReach = (float) eye.distanceTo(new net.minecraft.world.phys.Vec3(x, y, z));
		lastHit = System.currentTimeMillis();
		combo++;
	}

	public static final Module REACH = new TextModule("reach", "Reach Display", Module.Category.PVP, false) {
		@Override
		protected String text(Minecraft mc) {
			return System.currentTimeMillis() - lastHit > 3000 ? "" : String.format("%.2f blocks", lastReach);
		}

		@Override
		public String sample() {
			return "2.94 blocks";
		}
	}.icon(Items.IRON_SWORD);

	public static final Module COMBO = new TextModule("combo", "Combo Counter", Module.Category.PVP, false) {
		@Override
		public void tick(Minecraft mc) {
			if (mc.player != null && mc.player.hurtTime == 9 || System.currentTimeMillis() - lastHit > 2500) combo = 0;
		}

		@Override
		protected String text(Minecraft mc) {
			return combo < 2 ? "" : combo + " combo";
		}

		@Override
		public String sample() {
			return "5 combo";
		}
	}.icon(Items.BLAZE_POWDER);

	public static final Module SATURATION = new TextModule("saturation", "Food & Saturation", Module.Category.HUD, false) {
		@Override
		protected String text(Minecraft mc) {
			if (mc.player == null) return "";
			var f = mc.player.getFoodData();
			return String.format("Food %d  Sat %.1f", f.getFoodLevel(), f.getSaturationLevel());
		}

		@Override
		public String sample() {
			return "Food 18  Sat 4.6";
		}
	}.icon(Items.COOKED_BEEF);

	public static final Module ITEMS = new TextModule("item_counter", "Item Counter", Module.Category.PVP, false) {
		private int count(Minecraft mc, Item item) {
			int n = 0;
			var inv = mc.player.getInventory();
			for (int i = 0; i < inv.getContainerSize(); i++) {
				ItemStack s = inv.getItem(i);
				if (s.is(item)) n += s.getCount();
			}
			return n;
		}

		@Override
		protected String text(Minecraft mc) {
			if (mc.player == null) return "";
			StringBuilder b = new StringBuilder();
			Object[][] items = {{Items.TOTEM_OF_UNDYING, "Totem"}, {Items.GOLDEN_APPLE, "Gap"}, {Items.ENDER_PEARL, "Pearl"}, {Items.ARROW, "Arrow"}, {Items.SPLASH_POTION, "Splash"}, {Items.POTION, "Potion"}};
			for (Object[] it : items) {
				int n = count(mc, (Item) it[0]);
				if (n > 0) b.append(it[1]).append(' ').append(n).append("  ");
			}
			return b.toString().trim();
		}

		@Override
		public String sample() {
			return "Totem 2  Gap 12  Pearl 16";
		}
	}.icon(Items.TOTEM_OF_UNDYING);

	public static final Module COMPASS = new Module("compass", "Compass", Module.Category.HUD, Module.Corner.TOP_LEFT, false) {
		private static final String[] MARKS = {"S", "SW", "W", "NW", "N", "NE", "E", "SE"};

		@Override
		public boolean visible(Minecraft mc) {
			return mc.player != null;
		}

		@Override
		public int width(Minecraft mc) {
			return 120;
		}

		@Override
		public int height(Minecraft mc) {
			return 14;
		}

		@Override
		public void render(Gfx g, Minecraft mc, int x, int y) {
			g.fill(x, y, x + 120, y + 14, TextModule.PLATE);
			float yaw = mc.player == null ? 20 : Mth.wrapDegrees(mc.player.getYRot());
			for (int i = 0; i < 8; i++) {
				float d = Mth.wrapDegrees(i * 45 - yaw);
				if (Math.abs(d) > 70) continue;
				int px = x + 60 + Math.round(d * 0.8F);
				String m = MARKS[i];
				g.drawString(mc.font, m, px - mc.font.width(m) / 2, y + 3, m.length() == 1 ? 0xFFFFFFFF : 0xFFAAAAAA, false);
			}
			g.fill(x + 59, y, x + 61, y + 2, 0xFF8B5CF6);
		}
	}.icon(Items.COMPASS);
}
