package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.Mc;
import com.mojang.blaze3d.platform.Window;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;

public final class Notes {
	private static final int W = 168, PAD = 6, GAP = 4, MAX = 4, LINE = 10, BTN_H = 14;
	private static final long LIFE = 6_000, LIFE_ACTION = 14_000, SLIDE = 220;
	private static final int BG = 0xF20B0A12, EDGE = 0xFF2A2340, VIOLET = 0xFF8B5CF6, VIOLET_HI = 0xFFA78BFA;
	private static final int TEXT = 0xFFE6E1F5, DIM = 0xFF8E86A8, BTN = 0xFF1C1830, BTN_HI = 0xFF2A2446;
	private static final String[] K = {"X..X", "X.X.", "XX..", "X.X.", "X..X"};

	public static final class Button {
		final String label;
		final Runnable run;
		final boolean main;
		int x, y, w;

		public Button(String label, boolean main, Runnable run) {
			this.label = label;
			this.main = main;
			this.run = run;
		}
	}

	public static final class Note {
		final String title, text;
		final Runnable open;
		final List<Button> buttons = new ArrayList<>();
		long shown, last, born = -1;
		boolean closing;
		long closedAt;
		int x, y, h;

		public Note(String title, String text, Runnable open) {
			this.title = title;
			this.text = text;
			this.open = open;
		}

		public Note button(String label, boolean main, Runnable run) {
			buttons.add(new Button(label, main, run));
			return this;
		}

		long life() {
			return buttons.isEmpty() && open == null ? LIFE : LIFE_ACTION;
		}
	}

	private static final List<Note> LIVE = new ArrayList<>();

	private Notes() {}

	public static void add(Note n) {
		LIVE.add(n);
		while (LIVE.size() > MAX) LIVE.remove(0);
	}

	public static void render(Gfx g) {
		if (LIVE.isEmpty()) return;
		Minecraft mc = Minecraft.getInstance();
		Font font = mc.font;
		long now = System.currentTimeMillis();
		double[] m = mouse(mc);
		g.nextStratum();
		int y = GAP;
		for (int i = 0; i < LIVE.size(); i++) {
			Note n = LIVE.get(i);
			if (n.born < 0) n.born = n.last = now;
			List<String> lines = wrap(font, n.text, W - PAD * 2 - 14);
			n.h = PAD + LINE + lines.size() * LINE + (n.buttons.isEmpty() ? 0 : BTN_H + 4) + PAD - 1;
			boolean hover = m != null && m[0] >= n.x && m[0] < n.x + W && m[1] >= n.y && m[1] < n.y + n.h;
			if (!hover && !n.closing) n.shown += now - n.last;
			n.last = now;
			if (!n.closing && n.shown >= n.life()) close(n, now);
			float in = Math.min(1, (now - n.born) / (float) SLIDE);
			float out = n.closing ? Math.min(1, (now - n.closedAt) / (float) SLIDE) : 0;
			if (out >= 1) {
				LIVE.remove(i--);
				continue;
			}
			float e = 1 - (1 - in) * (1 - in) * (1 - in);
			float o = out * out;
			n.x = g.guiWidth() - GAP - Math.round(W * e) + Math.round((W + GAP) * o);
			n.y = y;
			draw(g, font, n, lines, hover, m);
			y += Math.round((n.h + GAP) * (1 - o));
		}
	}

	private static void draw(Gfx g, Font font, Note n, List<String> lines, boolean hover, double[] m) {
		int x = n.x, y = n.y, h = n.h;
		g.fill(x, y, x + W, y + h, BG);
		g.fill(x, y, x + W, y + 1, EDGE);
		g.fill(x, y + h - 1, x + W, y + h, EDGE);
		g.fill(x + W - 1, y, x + W, y + h, EDGE);
		g.fill(x, y, x + 2, y + h, hover ? VIOLET_HI : VIOLET);
		for (int r = 0; r < K.length; r++) {
			for (int c = 0; c < K[r].length(); c++) {
				if (K[r].charAt(c) == 'X') g.fill(x + PAD + c * 2, y + PAD + 1 + r * 2, x + PAD + c * 2 + 2, y + PAD + 3 + r * 2, VIOLET);
			}
		}
		int tx = x + PAD + 14;
		g.drawString(font, n.title, tx, y + PAD, VIOLET_HI, false);
		int ty = y + PAD + LINE;
		for (String line : lines) {
			g.drawString(font, line, tx, ty, TEXT, false);
			ty += LINE;
		}
		if (!n.buttons.isEmpty()) {
			int bx = tx, by = ty + 3;
			for (Button b : n.buttons) {
				b.w = font.width(b.label) + 12;
				b.x = bx;
				b.y = by;
				boolean over = m != null && m[0] >= bx && m[0] < bx + b.w && m[1] >= by && m[1] < by + BTN_H;
				int fill = b.main ? (over ? VIOLET_HI : VIOLET) : (over ? BTN_HI : BTN);
				g.fill(bx, by, bx + b.w, by + BTN_H, fill);
				g.drawString(font, b.label, bx + 6, by + 3, b.main ? 0xFF0B0A12 : TEXT, false);
				bx += b.w + 4;
			}
		}
		long life = n.life();
		int bar = n.closing ? 0 : Math.round((W - 2) * (1 - Math.min(1, n.shown / (float) life)));
		g.fill(x + 2, y + h - 2, x + 2 + bar, y + h - 1, hover ? VIOLET_HI : 0xFF4C3A86);
	}

	public static boolean click(Minecraft mc) {
		if (LIVE.isEmpty()) return false;
		double[] m = mouse(mc);
		if (m == null) return false;
		long now = System.currentTimeMillis();
		for (int i = LIVE.size() - 1; i >= 0; i--) {
			Note n = LIVE.get(i);
			if (n.closing || n.born < 0 || m[0] < n.x || m[0] >= n.x + W || m[1] < n.y || m[1] >= n.y + n.h) continue;
			Runnable run = n.open;
			for (Button b : n.buttons) {
				if (m[0] >= b.x && m[0] < b.x + b.w && m[1] >= b.y && m[1] < b.y + BTN_H) run = b.run;
			}
			close(n, now);
			if (run != null) mc.execute(run);
			return true;
		}
		return false;
	}

	private static void close(Note n, long now) {
		n.closing = true;
		n.closedAt = now;
	}

	public static double[] mouse(Minecraft mc) {
		if (Mc.screen() == null || mc.mouseHandler.isMouseGrabbed()) return null;
		Window w = mc.getWindow();
		return new double[] {mc.mouseHandler.xpos() * w.getGuiScaledWidth() / w.getScreenWidth(), mc.mouseHandler.ypos() * w.getGuiScaledHeight() / w.getScreenHeight()};
	}

	private static List<String> wrap(Font font, String text, int width) {
		List<String> out = new ArrayList<>();
		StringBuilder line = new StringBuilder();
		for (String word : text.split(" ")) {
			String next = line.length() == 0 ? word : line + " " + word;
			if (font.width(next) <= width || line.length() == 0) {
				line.setLength(0);
				line.append(next);
			} else {
				out.add(line.toString());
				line.setLength(0);
				line.append(word);
			}
			if (out.size() == 3) break;
		}
		if (out.size() < 3 && line.length() > 0) out.add(line.toString());
		return out;
	}
}
