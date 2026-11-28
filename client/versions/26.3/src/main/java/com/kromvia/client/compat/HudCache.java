package com.kromvia.client.compat;

import com.kromvia.client.module.Perf;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.state.gui.GuiRenderState;

public final class HudCache {
	private static final List<Consumer<GuiRenderState>> OPS = new ArrayList<>();
	private static boolean recording, valid;
	private static long last;
	private static int w, h;

	private HudCache() {}

	public static boolean replay(Minecraft mc, GuiRenderState state, boolean level, boolean bare) {
		int gw = mc.getWindow().getGuiScaledWidth(), gh = mc.getWindow().getGuiScaledHeight();
		long now = System.nanoTime();
		boolean can = bare && level && Perf.INSTANCE.hudCache();
		if (!can || !valid || gw != w || gh != h || now - last >= 1e9 / Perf.INSTANCE.hudRate.value()) {
			valid = false;
			recording = can;
			if (can) {
				last = now;
				w = gw;
				h = gh;
			}
			return false;
		}
		state.reset();
		for (Consumer<GuiRenderState> op : OPS) op.accept(state);
		return true;
	}

	public static void record(Consumer<GuiRenderState> op) {
		if (recording) OPS.add(op);
	}

	public static void reset() {
		if (recording) OPS.clear();
	}

	public static void end() {
		if (recording) valid = true;
		recording = false;
	}
}
