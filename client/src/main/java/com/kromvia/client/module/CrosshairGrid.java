package com.kromvia.client.module;

import com.kromvia.client.compat.Gfx;

public final class CrosshairGrid {
	public static final int N = 15;
	public static final String DEFAULT;

	static {
		StringBuilder b = new StringBuilder();
		for (int y = 0; y < N; y++) {
			for (int x = 0; x < N; x++) {
				boolean arm = (x == N / 2 && Math.abs(y - N / 2) >= 2 && Math.abs(y - N / 2) <= 5)
						|| (y == N / 2 && Math.abs(x - N / 2) >= 2 && Math.abs(x - N / 2) <= 5);
				b.append(arm || (x == N / 2 && y == N / 2) ? '1' : '0');
			}
		}
		DEFAULT = b.toString();
	}

	public interface Fill {
		void fill(int x1, int y1, int x2, int y2);
	}

	private CrosshairGrid() {}

	public static boolean on(String s, int x, int y) {
		int i = y * N + x;
		return i < s.length() && s.charAt(i) == '1';
	}

	public static String set(String s, int x, int y, boolean v) {
		StringBuilder b = new StringBuilder(s.length() >= N * N ? s.substring(0, N * N) : s);
		while (b.length() < N * N) b.append('0');
		b.setCharAt(y * N + x, v ? '1' : '0');
		return b.toString();
	}

	public static void draw(Gfx g, String s, int cx, int cy, int color, boolean outline, Fill invert) {
		int o = N / 2;
		if (invert == null && outline) {
			for (int y = 0; y < N; y++) {
				for (int x = 0; x < N; x++) {
					if (on(s, x, y)) g.fill(cx - o + x - 1, cy - o + y - 1, cx - o + x + 2, cy - o + y + 2, 0x60000000);
				}
			}
		}
		for (int y = 0; y < N; y++) {
			for (int x = 0; x < N; x++) {
				if (!on(s, x, y)) continue;
				int x1 = cx - o + x, y1 = cy - o + y;
				if (invert != null) invert.fill(x1, y1, x1 + 1, y1 + 1);
				else g.fill(x1, y1, x1 + 1, y1 + 1, color);
			}
		}
	}
}
