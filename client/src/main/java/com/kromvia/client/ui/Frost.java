package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import com.mojang.blaze3d.platform.NativeImage;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

public final class Frost {
	private static final int MAX = 64;
	private static final int MARGIN = 6;
	private static int serial;

	private static final class Baked {
		final Identifier id;
		final int w, h;

		Baked(Identifier id, int w, int h) {
			this.id = id;
			this.w = w;
			this.h = h;
		}
	}

	private static final Map<String, Baked> CACHE = new LinkedHashMap<String, Baked>(16, 0.75F, true) {
		@Override
		protected boolean removeEldestEntry(Map.Entry<String, Baked> e) {
			if (size() <= MAX) return false;
			Minecraft.getInstance().getTextureManager().release(e.getValue().id);
			return true;
		}
	};

	private Frost() {}

	private static int scale() {
		return Math.max(1, (int) Math.round((double) Minecraft.getInstance().getWindow().getGuiScale()));
	}

	public static void draw(Gfx g, int x, int y, int w, int h, float r, int tint, int rim, float alpha) {
		if (w <= 0 || h <= 0 || alpha <= 0.01F) return;
		int base = Backgrounds.frame(0);
		layer(g, base, x, y, w, h, r, tint, rim, alpha);
		int next = Backgrounds.frame(1);
		if (next >= 0) layer(g, next, x, y, w, h, r, tint, rim, alpha * Backgrounds.mix());
	}

	public static void plain(Gfx g, int x, int y, int w, int h, float r, int tint, int rim, float alpha) {
		if (w <= 0 || h <= 0 || alpha <= 0.01F) return;
		layer(g, -2, x, y, w, h, r, tint, rim, alpha);
	}

	private static void layer(Gfx g, int frame, int x, int y, int w, int h, float r, int tint, int rim, float alpha) {
		int s = scale();
		String key = frame == -2 ? "p|" + w + "," + h + "," + r + "|" + tint + "," + rim + "|" + s
				: frame + "|" + x + "," + y + "," + w + "," + h + "," + r + "|" + tint + "," + rim + "|" + s + "|" + g.guiWidth() + "x" + g.guiHeight();
		Baked b = CACHE.get(key);
		if (b == null) {
			b = bake(frame == -2 ? -1 : frame == Backgrounds.frame(0) ? 0 : 1, x, y, w, h, r, tint, rim, s);
			CACHE.put(key, b);
		}
		int a = Math.round(alpha * 255);
		g.blit(b.id, x - MARGIN, y - MARGIN, 0, 0, w + MARGIN * 2, h + MARGIN * 2, b.w, b.h, b.w, b.h, a << 24 | 0xFFFFFF);
	}

	private static float box(float px, float py, float hw, float hh, float r) {
		float qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
		float ox = Math.max(qx, 0), oy = Math.max(qy, 0);
		return (float) Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
	}

	private static float clamp(float v) {
		return v < 0 ? 0 : v > 1 ? 1 : v;
	}

	private static Baked bake(int which, int gx, int gy, int gw, int gh, float gr, int tint, int rim, int s) {
		int W = (gw + MARGIN * 2) * s, H = (gh + MARGIN * 2) * s;
		NativeImage img = new NativeImage(W, H, true);
		float hw = gw * s / 2F, hh = gh * s / 2F, r = Math.min(gr * s, Math.min(hw, hh));
		float cx = MARGIN * s + hw, cy = MARGIN * s + hh;
		float ta = (tint >>> 24) / 255F, ra = (rim >>> 24) / 255F;
		for (int y = 0; y < H; y++) {
			for (int x = 0; x < W; x++) {
				float px = x + 0.5F - cx, py = y + 0.5F - cy;
				float d = box(px, py, hw, hh, r);
				float inside = clamp(0.5F - d);
				int argb = 0;
				if (inside > 0) {
					int bg = which < 0 ? tint : Backgrounds.sample(which, (gx - MARGIN) + (x + 0.5F) / s, (gy - MARGIN) + (y + 0.5F) / s);
					float shine = (which < 0 ? 0.03F : 0.10F) * clamp(1 - (py + hh) / (hh * 1.2F));
					float ring = clamp(1 - Math.abs(d + 0.75F) / 0.9F) * ra;
					int[] c = new int[3];
					for (int k = 0; k < 3; k++) {
						int sh = 16 - k * 8;
						float v = (bg >> sh & 0xFF) * (1 - ta) + (tint >> sh & 0xFF) * ta;
						v = v + (255 - v) * shine;
						v = v * (1 - ring) + (rim >> sh & 0xFF) * ring;
						c[k] = Math.min(255, Math.round(v));
					}
					float body = which < 0 ? Math.max(ta, ring) : 1;
					float a = inside * body;
					argb = Math.round(a * 255) << 24 | c[0] << 16 | c[1] << 8 | c[2];
				}
				img.setPixel(x, y, argb);
			}
		}
		Identifier id = Identifier.fromNamespaceAndPath("kromvia", "frost/" + serial++);
		Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(id::toString, img));
		return new Baked(id, W, H);
	}
}
