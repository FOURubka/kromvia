package com.kromvia.client.ui;

import net.minecraft.client.Minecraft;

public final class UiFont {
	private static final float MARKER = 1.75F;
	private static int loaded;
	private static boolean reloading;

	private UiFont() {}

	private static int scale() {
		Minecraft mc = Minecraft.getInstance();
		if (mc == null || mc.getWindow() == null) return 0;
		return (int) Math.round((double) mc.getWindow().getGuiScale());
	}

	public static float oversample(float asked) {
		if (asked != MARKER) return asked;
		int s = scale();
		loaded = s > 0 ? s : 4;
		return loaded;
	}

	public static void tick(Minecraft mc) {
		int s = scale();
		if (reloading || loaded == 0 || s <= 0 || s == loaded) return;
		loaded = s;
		reloading = true;
		mc.reloadResourcePacks().whenComplete((v, e) -> reloading = false);
	}
}
