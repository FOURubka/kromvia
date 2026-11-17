package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import com.kromvia.client.compat.Mc;
import com.mojang.blaze3d.platform.NativeImage;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;

public class ScreenshotsScreen extends KScreen {
	private static final int TW = 160, TH = 90, GAP = 8, TOP = 44;
	private static int serial;

	private final Screen parent;
	private final File dir;
	private final List<File> files = new ArrayList<>();
	private final Map<File, Identifier> textures = new HashMap<>();
	private final Map<File, int[]> ready = new ConcurrentHashMap<>();
	private final ExecutorService loader = Executors.newSingleThreadExecutor(r -> {
		Thread t = new Thread(r, "kromvia-thumbs");
		t.setDaemon(true);
		return t;
	});
	private int cols, left;
	private float scroll;
	private int scrollTarget;

	public ScreenshotsScreen(Screen parent) {
		super(Component.literal("Screenshots"));
		this.parent = parent;
		this.dir = new File(net.minecraft.client.Minecraft.getInstance().gameDirectory, "screenshots");
		File[] list = dir.listFiles((d, n) -> n.toLowerCase(Locale.ROOT).endsWith(".png"));
		if (list != null) {
			Arrays.sort(list, Comparator.comparingLong(File::lastModified).reversed());
			files.addAll(Arrays.asList(list));
		}
		for (File f : files) loader.submit(() -> load(f));
	}

	private void load(File f) {
		try {
			BufferedImage src = javax.imageio.ImageIO.read(f);
			if (src == null) return;
			BufferedImage out = new BufferedImage(TW * 2, TH * 2, BufferedImage.TYPE_INT_ARGB);
			Graphics2D g = out.createGraphics();
			g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
			float scale = Math.max(out.getWidth() / (float) src.getWidth(), out.getHeight() / (float) src.getHeight());
			int w = Math.round(src.getWidth() * scale), h = Math.round(src.getHeight() * scale);
			g.drawImage(src, (out.getWidth() - w) / 2, (out.getHeight() - h) / 2, w, h, null);
			g.dispose();
			ready.put(f, out.getRGB(0, 0, out.getWidth(), out.getHeight(), null, 0, out.getWidth()));
		} catch (Throwable ignored) {
		}
	}

	private Identifier texture(File f) {
		Identifier id = textures.get(f);
		if (id != null) return id;
		int[] px = ready.remove(f);
		if (px == null) return null;
		NativeImage img = new NativeImage(TW * 2, TH * 2, true);
		for (int y = 0; y < TH * 2; y++) {
			for (int x = 0; x < TW * 2; x++) {
				int argb = px[y * TW * 2 + x] | 0xFF000000;
				img.setPixel(x, y, argb);
			}
		}
		textures.put(f, register(img));
		return textures.get(f);
	}

	private Identifier register(NativeImage img) {
		Identifier id = Identifier.fromNamespaceAndPath("kromvia", "thumb/" + serial++);
		minecraft.getTextureManager().register(id, new DynamicTexture(id::toString, img));
		return id;
	}

	@Override
	protected void init() {
		cols = Math.max(1, Math.min(5, (width - 40 + GAP) / (TW + GAP)));
		left = (width - (cols * (TW + GAP) - GAP)) / 2;
		addRenderableWidget(new KButton(width - left - 80, 14, 80, 20, Component.literal("Folder"), b -> open(dir)));
		addRenderableWidget(new KButton(width / 2 - 50, height - 28, 100, 20, Component.literal("Back"), b -> onClose()));
	}

	private int bottom() {
		return height - 36;
	}

	private int maxScroll() {
		int rows = (files.size() + cols - 1) / cols;
		return Math.max(0, rows * (TH + GAP) - GAP - (bottom() - TOP));
	}

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		scrollTarget = Mth.clamp(scrollTarget - (int) (scrollY * (TH + GAP) / 2), 0, maxScroll());
		return true;
	}

	private File at(double mx, double my) {
		if (my < TOP || my >= bottom()) return null;
		for (int i = 0; i < files.size(); i++) {
			int x = left + (i % cols) * (TW + GAP), y = TOP + (i / cols) * (TH + GAP) - Math.round(scroll);
			if (mx >= x && mx < x + TW && my >= y && my < y + TH) return files.get(i);
		}
		return null;
	}

	@Override
	protected void mouseDown(double x, double y) {
		File f = at(x, y);
		if (f != null) open(f);
	}

	private static void open(File f) {
		String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
		String path = f.getAbsolutePath();
		String[] cmd = os.contains("win") ? new String[] {"explorer", path} : os.contains("mac") ? new String[] {"open", path} : new String[] {"xdg-open", path};
		try {
			new ProcessBuilder(cmd).start();
		} catch (Exception ignored) {
		}
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		UiStyle.dim(g, width, height, 1);
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		scroll = Mth.lerp(0.35F, scroll, scrollTarget);
		if (Math.abs(scroll - scrollTarget) < 0.5F) scroll = scrollTarget;
		super.draw(g, mouseX, mouseY, delta);
		g.drawString(font, "SCREENSHOTS", left, 20, UiStyle.TEXT, false);
		g.drawString(font, files.size() + "", left + font.width("SCREENSHOTS") + 8, 20, UiStyle.MUTED, false);
		if (files.isEmpty()) {
			String t = "No screenshots yet. Press F2 in game.";
			g.drawString(font, t, (width - font.width(t)) / 2, height / 2 - 4, UiStyle.MUTED, false);
			return;
		}
		File hovered = at(mouseX, mouseY);
		g.enableScissor(0, TOP, width, bottom());
		for (int i = 0; i < files.size(); i++) {
			int x = left + (i % cols) * (TW + GAP), y = TOP + (i / cols) * (TH + GAP) - Math.round(scroll);
			if (y + TH < TOP || y > bottom()) continue;
			File f = files.get(i);
			UiStyle.plain(g, x - 1, y - 1, TW + 2, TH + 2, 6, 0x9A18181D, f == hovered ? 0xB08B5CF6 : 0x16FFFFFF, 1);
			Identifier id = texture(f);
			if (id != null) g.blit(id, x, y, 0, 0, TW, TH, TW * 2, TH * 2, TW * 2, TH * 2);
		}
		g.disableScissor();
		if (hovered != null) {
			String name = hovered.getName();
			g.drawString(font, name, (width - font.width(name)) / 2, bottom() + 1, UiStyle.MUTED, false);
		}
	}

	@Override
	public void onClose() {
		loader.shutdownNow();
		for (Identifier id : textures.values()) minecraft.getTextureManager().release(id);
		textures.clear();
		Mc.setScreen(parent);
	}
}
