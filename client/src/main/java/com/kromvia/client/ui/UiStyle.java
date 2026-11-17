package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import java.io.IOException;
import java.io.InputStream;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

public final class UiStyle {
	public static final int BG = 0xFF07080B;
	public static final int PANEL = 0xF6090B0E;
	public static final int CARD = 0xFF0F1216;
	public static final int LINE = 0xFF1A1E25;
	public static final int TOP = 0xFFB49CFF;
	public static final int FRONT = 0xFF8B5CF6;
	public static final int SIDE = 0xFF5B3FD6;
	public static final int TEXT = 0xFFF4F5F7;
	public static final int MUTED = 0xFF9AA1AD;

	private static final Identifier LOGO = Identifier.fromNamespaceAndPath("kromvia", "logo");
	private static boolean logoReady;

	private UiStyle() {}

	public static final int GLASS = 0x7A1A1922, GLASS_RIM = 0x26FFFFFF, GLASS_HOT = 0x24FFFFFF, INK = 0xFF0E1016;

	public static void button(Gfx g, int x, int y, int w, int h, boolean active, boolean lit) {
		if (lit) glass(g, x, y, w, h, h / 2F, 0xF0FFFFFF, 0xFFFFFFFF);
		else glass(g, x, y, w, h, h / 2F, active ? GLASS : 0x5A16151C, active ? GLASS_RIM : 0x12FFFFFF);
	}

	public static void glass(Gfx g, float x, float y, float w, float h, float r, int face, int rim) {
		glass(g, x, y, w, h, r, face, rim, 1);
	}

	public static void glass(Gfx g, float x, float y, float w, float h, float r, int face, int rim, float alpha) {
		Frost.draw(g, Math.round(x), Math.round(y), Math.round(w), Math.round(h), r, face, rim, alpha);
	}

	public static void plain(Gfx g, float x, float y, float w, float h, float r, int face, int rim, float alpha) {
		Frost.plain(g, Math.round(x), Math.round(y), Math.round(w), Math.round(h), r, face, rim, alpha);
	}

	public static void panel(Gfx g, int x, int y, int w, int h) {
		glass(g, x, y, w, h, 12, 0xE0101014, 0x1EFFFFFF);
	}

	private static float scale() {
		return (float) (double) Minecraft.getInstance().getWindow().getGuiScale();
	}

	public static void round(Gfx g, float x1, float y1, float x2, float y2, float r, int color) {
		float s = scale();
		int X1 = Math.round(x1 * s), Y1 = Math.round(y1 * s), X2 = Math.round(x2 * s), Y2 = Math.round(y2 * s);
		if (X2 <= X1 || Y2 <= Y1) return;
		float R = Math.max(0, Math.min(r * s, Math.min(X2 - X1, Y2 - Y1) / 2F));
		int alpha = color >>> 24, rgb = color & 0xFFFFFF;
		g.pose().pushMatrix();
		g.pose().scale(1 / s, 1 / s);
		int top = Y1 + (int) Math.ceil(R), bottom = Y2 - (int) Math.ceil(R);
		if (bottom > top) g.fill(X1, top, X2, bottom, color);
		else top = bottom = (Y1 + Y2) / 2;
		for (int y = Y1; y < top; y++) row(g, X1, X2, y, Y1 + R - (y + 0.5F), R, alpha, rgb, color);
		for (int y = bottom; y < Y2; y++) row(g, X1, X2, y, y + 0.5F - (Y2 - R), R, alpha, rgb, color);
		g.pose().popMatrix();
	}

	private static void row(Gfx g, int X1, int X2, int y, float dy, float R, int alpha, int rgb, int color) {
		if (dy >= R) return;
		float inset = dy <= 0 ? 0 : R - (float) Math.sqrt(R * R - dy * dy);
		int whole = (int) inset;
		float cover = 1 - (inset - whole);
		if (X2 - whole - 1 > X1 + whole + 1) g.fill(X1 + whole + 1, y, X2 - whole - 1, y + 1, color);
		int edge = Math.round(alpha * cover) << 24 | rgb;
		g.fill(X1 + whole, y, X1 + whole + 1, y + 1, edge);
		g.fill(X2 - whole - 1, y, X2 - whole, y + 1, edge);
	}


	public static void dim(Gfx g, int w, int h, float t) {
		g.fill(0, 0, w, h, ARGB.color(Math.round(0xB0 * t), BG));
		int edge = Math.round(0x90 * t);
		g.fillGradient(0, 0, w, h / 3, ARGB.color(edge, 0), 0);
		g.fillGradient(0, h - h / 3, w, h, 0, ARGB.color(edge, 0));
	}

	public static float ease(float t) {
		t = Mth.clamp(t, 0, 1);
		return 1 - (1 - t) * (1 - t) * (1 - t);
	}

	public static float since(long since, float ms) {
		return ease((System.currentTimeMillis() - since) / ms);
	}

	public static int fade(int argb, float a) {
		return ARGB.color(Math.round(ARGB.alpha(argb) * Mth.clamp(a, 0, 1)), argb);
	}

	public static void logo(Gfx g, int x, int y, int size) {
		if (!logoReady) {
			try (InputStream in = UiStyle.class.getResourceAsStream("/kromvia/logo.png")) {
				if (in != null) Minecraft.getInstance().getTextureManager().register(LOGO, new DynamicTexture(LOGO::toString, NativeImage.read(in)));
			} catch (IOException ignored) {
			}
			logoReady = true;
		}
		g.blit(LOGO, x, y, 0, 0, size, size, 128, 128, 128, 128);
	}

	public static java.util.List<String> wrap(net.minecraft.client.gui.Font font, String text, int width) {
		java.util.List<String> lines = new java.util.ArrayList<>();
		if (text.isEmpty()) return lines;
		String line = "";
		for (String word : text.split(" ")) {
			String next = line.isEmpty() ? word : line + " " + word;
			if (font.width(next) > width && !line.isEmpty()) {
				lines.add(line);
				line = word;
			} else {
				line = next;
			}
		}
		lines.add(line);
		return lines;
	}
}
