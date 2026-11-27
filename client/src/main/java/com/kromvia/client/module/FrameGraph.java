package com.kromvia.client.module;

import com.kromvia.client.compat.Gfx;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.Items;

public final class FrameGraph extends Module {
	private static final int N = 120, W = 120, H = 34;
	private final float[] ms = new float[N];
	private int at, count;
	private long last;

	public FrameGraph() {
		super("frame_graph", "Frame Time Graph", Module.Category.HUD, Module.Corner.TOP_LEFT, false);
		icon(Items.CLOCK);
	}

	@Override
	public int width(Minecraft mc) {
		return W + 4;
	}

	@Override
	public int height(Minecraft mc) {
		return H + 14;
	}

	@Override
	public String sample() {
		return "60 fps · 1% low 48";
	}

	@Override
	public void render(Gfx g, Minecraft mc, int x, int y) {
		long now = System.nanoTime();
		if (last != 0) {
			float dt = (now - last) / 1e6F;
			if (dt > 0 && dt < 1000) {
				ms[at] = dt;
				at = (at + 1) % N;
				count = Math.min(N, count + 1);
			}
		}
		last = now;
		g.fill(x, y, x + W + 4, y + H + 14, 0x88101014);
		float sum = 0, worst = 0;
		for (int i = 0; i < count; i++) {
			sum += ms[i];
			worst = Math.max(worst, ms[i]);
		}
		float avg = count == 0 ? 16.7F : sum / count;
		float scale = Math.max(33.4F, worst);
		for (int i = 0; i < count; i++) {
			float v = ms[(at - count + i + N * 2) % N];
			int h = Math.max(1, Math.round(v / scale * H));
			int color = v > 33.4F ? 0xFFE45C5C : v > 20F ? 0xFFFFD36E : 0xFF8B5CF6;
			g.fill(x + 2 + i * W / N, y + 2 + H - h, x + 2 + (i + 1) * W / N, y + 2 + H, color);
		}
		int target = y + 2 + H - Math.round(16.7F / scale * H);
		g.fill(x + 2, target, x + 2 + W, target + 1, 0x55FFFFFF);
		String text = Math.round(1000 / avg) + " fps · 1% low " + Math.round(1000 / Math.max(avg, low()));
		g.drawString(mc.font, text, x + 2, y + H + 4, 0xFFF4F5F7, false);
	}

	private float low() {
		if (count == 0) return 16.7F;
		float[] copy = java.util.Arrays.copyOf(ms, count);
		java.util.Arrays.sort(copy);
		return copy[Math.min(count - 1, (int) (count * 0.99))];
	}

	@Override
	public void disable(Minecraft mc) {
		count = 0;
		last = 0;
	}
}
