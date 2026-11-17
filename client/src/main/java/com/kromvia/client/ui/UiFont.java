package com.kromvia.client.ui;

import com.kromvia.client.module.Module;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.Items;

public final class UiFont {
	private static final float MARKER = 1.75F;
	private static final ThreadLocal<Boolean> BUILDING = new ThreadLocal<Boolean>();
	private static int loaded;
	private static boolean loadedOn = true;
	private static boolean reloading;

	public static final Module FONT = new Module("kromvia_font", "Kromvia Font", Module.Category.UTILITY, Module.Corner.TOP_LEFT, true) {
		@Override
		public boolean hud() {
			return false;
		}
	}.icon(Items.NAME_TAG);

	private UiFont() {}

	private static int scale() {
		Minecraft mc = Minecraft.getInstance();
		if (mc == null || mc.getWindow() == null) return 0;
		return (int) Math.round((double) mc.getWindow().getGuiScale());
	}

	public static float oversample(float asked) {
		if (asked != MARKER) return asked;
		BUILDING.set(Boolean.TRUE);
		loadedOn = FONT.enabled;
		int s = scale();
		loaded = s > 0 ? s : 4;
		return loaded;
	}

	public static boolean built() {
		boolean ours = BUILDING.get() != null;
		BUILDING.remove();
		return ours;
	}

	public static boolean off() {
		return !FONT.enabled;
	}

	public static void tick(Minecraft mc) {
		int s = scale();
		if (reloading || loaded == 0 || s <= 0) return;
		if (s == loaded && FONT.enabled == loadedOn) return;
		loaded = s;
		loadedOn = FONT.enabled;
		reloading = true;
		mc.reloadResourcePacks().whenComplete((v, e) -> reloading = false);
	}
}
