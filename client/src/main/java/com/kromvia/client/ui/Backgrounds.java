package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;

public final class Backgrounds {
	private static final long SHOW_MS = 30_000;
	private static final long FADE_MS = 4_000;
	private static final int BLUR_W = 240;
	private static int cur = -1, nxt = -1;
	private static float mix;
	private static long drawnAt;
	private static int screenW, screenH;

	private record Image(Identifier id, int w, int h, int[] blur, int bw, int bh) {}

	private static List<String> names;
	private static File own;
	private static final Map<Integer, Image> loaded = new HashMap<>();
	private record Decoded(NativeImage image, int[] blur, int bw, int bh) {}
	private static final Map<Integer, java.util.concurrent.Future<Decoded>> pending = new HashMap<>();
	private static final java.util.concurrent.ExecutorService DECODER = java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "kromvia-backgrounds");
		t.setDaemon(true);
		return t;
	});

	private Backgrounds() {}

	private static List<String> names() {
		if (names != null) return names;
		names = new ArrayList<>();
		File dir = new File(Minecraft.getInstance().gameDirectory, "kromvia/menu");
		String[] files = dir.list((d, n) -> n.toLowerCase().endsWith(".png"));
		if (files != null && files.length > 0) {
			Arrays.sort(files);
			names.addAll(Arrays.asList(files));
			own = dir;
			return names;
		}
		String shared = System.getProperty("kromvia.backgrounds");
		File sharedDir = shared == null ? null : new File(shared);
		String[] bundled = sharedDir == null ? null : sharedDir.list((d, n) -> n.toLowerCase().endsWith(".png"));
		if (bundled != null && bundled.length > 0) {
			Arrays.sort(bundled);
			names.addAll(Arrays.asList(bundled));
			own = sharedDir;
			return names;
		}
		try (InputStream idx = Backgrounds.class.getResourceAsStream("/kromvia/backgrounds/index.txt")) {
			if (idx == null) return names;
			BufferedReader r = new BufferedReader(new InputStreamReader(idx, StandardCharsets.UTF_8));
			String line;
			while ((line = r.readLine()) != null) {
				if (!line.isBlank()) names.add(line.trim());
			}
		} catch (IOException ignored) {
		}
		return names;
	}

	private static Image get(int i) {
		Image img = loaded.get(i);
		if (img != null || loaded.containsKey(i)) return img;
		java.util.concurrent.Future<Decoded> f = pending.get(i);
		if (f == null) {
			pending.put(i, DECODER.submit(() -> decode(i)));
			return null;
		}
		if (!f.isDone()) return null;
		pending.remove(i);
		Decoded d;
		try {
			d = f.get();
		} catch (Exception e) {
			d = null;
		}
		if (d != null) {
			Identifier id = Identifier.fromNamespaceAndPath("kromvia", "background/" + i);
			Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(id::toString, d.image()));
			img = new Image(id, d.image().getWidth(), d.image().getHeight(), d.blur(), d.bw(), d.bh());
		}
		loaded.put(i, img);
		return img;
	}

	private static Decoded decode(int i) {
		try (InputStream in = open(i)) {
			if (in == null) return null;
			NativeImage ni = NativeImage.read(in);
			int[] dims = new int[2];
			int[] blur = blurOf(i, dims);
			return new Decoded(ni, blur, dims[0], dims[1]);
		} catch (IOException e) {
			return null;
		}
	}

	private static InputStream open(int i) throws IOException {
		return own != null ? new FileInputStream(new File(own, names.get(i))) : Backgrounds.class.getResourceAsStream("/kromvia/backgrounds/" + names.get(i));
	}

	private static int[] blurOf(int i, int[] dims) {
		try (InputStream in = open(i)) {
			java.awt.image.BufferedImage src = in == null ? null : javax.imageio.ImageIO.read(in);
			if (src == null) return null;
			int bw = BLUR_W, bh = Math.max(1, Math.round(BLUR_W * src.getHeight() / (float) src.getWidth()));
			int[] px = new int[bw * bh];
			for (int y = 0; y < bh; y++) {
				for (int x = 0; x < bw; x++) {
					int x0 = x * src.getWidth() / bw, x1 = Math.max(x0 + 1, (x + 1) * src.getWidth() / bw);
					int y0 = y * src.getHeight() / bh, y1 = Math.max(y0 + 1, (y + 1) * src.getHeight() / bh);
					long r = 0, g = 0, b = 0, n = 0;
					for (int yy = y0; yy < y1; yy += 2) {
						for (int xx = x0; xx < x1; xx += 2) {
							int c = src.getRGB(xx, yy);
							r += c >> 16 & 0xFF;
							g += c >> 8 & 0xFF;
							b += c & 0xFF;
							n++;
						}
					}
					px[y * bw + x] = (int) (r / n) << 16 | (int) (g / n) << 8 | (int) (b / n);
				}
			}
			for (int pass = 0; pass < 3; pass++) {
				px = box(px, bw, bh, 5, true);
				px = box(px, bw, bh, 5, false);
			}
			dims[0] = bw;
			dims[1] = bh;
			return px;
		} catch (Throwable e) {
			return null;
		}
	}

	private static int[] box(int[] in, int w, int h, int r, boolean horizontal) {
		int[] out = new int[in.length];
		int len = horizontal ? w : h, lines = horizontal ? h : w;
		for (int l = 0; l < lines; l++) {
			for (int i = 0; i < len; i++) {
				int sr = 0, sg = 0, sb = 0, n = 0;
				for (int k = -r; k <= r; k++) {
					int j = Math.min(len - 1, Math.max(0, i + k));
					int c = in[horizontal ? l * w + j : j * w + l];
					sr += c >> 16 & 0xFF;
					sg += c >> 8 & 0xFF;
					sb += c & 0xFF;
					n++;
				}
				out[horizontal ? l * w + i : i * w + l] = sr / n << 16 | sg / n << 8 | sb / n;
			}
		}
		return out;
	}

	public static boolean live() {
		return System.currentTimeMillis() - drawnAt < 250;
	}

	public static int frame(int which) {
		if (!live()) return which == 0 ? -2 : -1;
		return which == 0 ? cur : mix > 0 ? nxt : -1;
	}

	public static float mix() {
		return mix;
	}

	public static int sample(int which, float gx, float gy) {
		Image img = loaded.get(which == 0 ? cur : nxt);
		if (img == null || img.blur() == null || screenW == 0) return 0xFF141821;
		float scale = Math.max(screenW / (float) img.w(), screenH / (float) img.h());
		float ix = (img.w() - screenW / scale) / 2 + gx / scale, iy = (img.h() - screenH / scale) / 2 + gy / scale;
		float fx = ix * img.bw() / img.w() - 0.5F, fy = iy * img.bh() / img.h() - 0.5F;
		int x0 = (int) Math.floor(fx), y0 = (int) Math.floor(fy);
		float tx = fx - x0, ty = fy - y0;
		int a = at(img, x0, y0), b = at(img, x0 + 1, y0), c = at(img, x0, y0 + 1), d = at(img, x0 + 1, y0 + 1);
		int out = 0xFF000000;
		for (int sh = 0; sh <= 16; sh += 8) {
			float top = (a >> sh & 0xFF) * (1 - tx) + (b >> sh & 0xFF) * tx;
			float bot = (c >> sh & 0xFF) * (1 - tx) + (d >> sh & 0xFF) * tx;
			out |= Math.round(top * (1 - ty) + bot * ty) << sh;
		}
		return out;
	}

	private static int at(Image img, int x, int y) {
		x = Math.min(img.bw() - 1, Math.max(0, x));
		y = Math.min(img.bh() - 1, Math.max(0, y));
		return img.blur()[y * img.bw() + x];
	}

	private static void keepOnly(int a, int b) {
		loaded.entrySet().removeIf(e -> {
			if (e.getKey() == a || e.getKey() == b) return false;
			if (e.getValue() != null) Minecraft.getInstance().getTextureManager().release(e.getValue().id);
			return true;
		});
	}

	public static boolean render(Gfx g) {
		List<String> all = names();
		if (all.isEmpty()) return false;
		drawnAt = System.currentTimeMillis();
		screenW = g.guiWidth();
		screenH = g.guiHeight();
		long now = System.currentTimeMillis();
		int i = (int) (now / SHOW_MS % all.size());
		int next = (i + 1) % all.size();
		keepOnly(i, next);
		Image cur0 = get(i);
		get(next);
		if (cur0 == null) return false;
		cur = i;
		nxt = next;
		draw(g, cur0, 1);
		long into = now % SHOW_MS;
		mix = 0;
		if (into > SHOW_MS - FADE_MS && all.size() > 1) {
			Image n = get(next);
			float t = (into - (SHOW_MS - FADE_MS)) / (float) FADE_MS;
			if (n != null) {
				mix = t * t * t * (t * (t * 6 - 15) + 10);
				draw(g, n, mix);
			}
		}
		g.nextStratum();
		Meteors.draw(g);
		return true;
	}

	private static void draw(Gfx g, Image img, float alpha) {
		int sw = g.guiWidth(), sh = g.guiHeight();
		float scale = Math.max(sw / (float) img.w, sh / (float) img.h);
		int rw = Math.round(sw / scale), rh = Math.round(sh / scale);
		int u = (img.w - rw) / 2, v = (img.h - rh) / 2;
		g.blit(img.id, 0, 0, u, v, sw, sh, rw, rh, img.w, img.h, ARGB.white(alpha));
	}
}
