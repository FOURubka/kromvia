package com.kromvia.client.ui;

import com.kromvia.client.Config;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.module.setting.ColorSetting;
import java.util.Locale;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

public class ColorPicker extends KScreen {
	private static final int W = 196, SQUARE_W = 150, SQUARE_H = 90, BAR = 14, SWATCH = 14, MAX_SAVED = 20;
	private final Screen parent;
	private final ColorSetting setting;
	private final int original;
	private float hue, sat, val;
	private int px, py, ph;
	private EditBox hex;
	private boolean syncing;
	private int drag;
	private double cursorX, cursorY;

	public ColorPicker(Screen parent, ColorSetting setting) {
		super(Component.literal(setting.name));
		this.parent = parent;
		this.setting = setting;
		this.original = setting.argb();
		read(original);
	}

	private void read(int argb) {
		float r = (argb >> 16 & 255) / 255F, g = (argb >> 8 & 255) / 255F, b = (argb & 255) / 255F;
		float max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b)), d = max - min;
		val = max;
		sat = max == 0 ? 0 : d / max;
		if (d == 0) return;
		float h = max == r ? (g - b) / d % 6 : max == g ? (b - r) / d + 2 : (r - g) / d + 4;
		hue = (h / 6 + 1) % 1;
	}

	private int rgb() {
		return Mth.hsvToRgb(Math.min(hue, 0.9999F), sat, val) & 0xFFFFFF;
	}

	private int argb() {
		int alpha = original >>> 24 == 0 ? 0xFF : original >>> 24;
		return alpha << 24 | rgb();
	}

	private String hexText() {
		return String.format(Locale.ROOT, "#%06X", rgb());
	}

	private void apply(boolean updateBox) {
		setting.set(argb());
		Config.save();
		if (updateBox && hex != null) {
			syncing = true;
			hex.setValue(hexText());
			syncing = false;
		}
	}

	private void pick(int argb) {
		read(argb);
		apply(true);
	}

	private int rows(int count) {
		int per = (W - 20 + 3) / (SWATCH + 3);
		return (count + per - 1) / per;
	}

	private int swatchRow(int x, int y, java.util.List<Integer> colors) {
		int per = (W - 20 + 3) / (SWATCH + 3);
		for (int i = 0; i < colors.size(); i++) {
			int c = colors.get(i);
			addRenderableWidget(new Swatch(x + (i % per) * (SWATCH + 3), y + (i / per) * (SWATCH + 3), SWATCH, c, () -> pick(c), () -> (argb() & 0xFFFFFF) == (c & 0xFFFFFF)));
		}
		return y + rows(colors.size()) * (SWATCH + 3);
	}

	private int savedY() {
		return py + 26 + SQUARE_H + 30;
	}

	@Override
	protected void init() {
		ph = 26 + SQUARE_H + 30 + 11 + Math.max(1, rows(Config.SWATCHES.size())) * (SWATCH + 3) + 4 + 11 + rows(ColorSetting.PALETTE.size()) * (SWATCH + 3) + 30;
		px = (width - W) / 2;
		py = Math.max(4, (height - ph) / 2);

		hex = new EditBox(font, px + 32, py + 26 + SQUARE_H + 8, 60, 16, Component.literal("Hex"));
		hex.setMaxLength(7);
		hex.setValue(hexText());
		hex.setResponder(v -> {
			if (syncing) return;
			String t = v.startsWith("#") ? v.substring(1) : v;
			if (!t.matches("[0-9a-fA-F]{6}")) return;
			read(Integer.parseInt(t, 16));
			apply(false);
		});
		addRenderableWidget(hex);
		addRenderableWidget(new KButton(px + W - 10 - 84, py + 26 + SQUARE_H + 6, 84, 20, Component.literal(saved() ? "Remove favourite" : "Add favourite"), b -> {
			Integer c = argb() | 0xFF000000;
			if (!Config.SWATCHES.remove(c)) {
				Config.SWATCHES.add(0, c);
				while (Config.SWATCHES.size() > MAX_SAVED) Config.SWATCHES.remove(Config.SWATCHES.size() - 1);
			}
			Config.save();
			rebuildWidgets();
		}));

		int y = swatchRow(px + 10, savedY() + 11, Config.SWATCHES);
		if (Config.SWATCHES.isEmpty()) y += SWATCH + 3;
		swatchRow(px + 10, y + 4 + 11, ColorSetting.PALETTE);

		addRenderableWidget(new KButton(px + 10, py + ph - 26, 84, 20, Component.literal("Cancel"), b -> {
			setting.set(original);
			Config.save();
			onClose();
		}));
		addRenderableWidget(new KButton(px + W - 94, py + ph - 26, 84, 20, Component.literal("Done"), b -> onClose()));
	}

	private boolean saved() {
		return Config.SWATCHES.contains(argb() | 0xFF000000);
	}

	private int squareX() {
		return px + 10;
	}

	private int squareY() {
		return py + 26;
	}

	private int barX() {
		return px + W - 10 - BAR;
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		if (minecraft.options.getMenuBackgroundBlurriness() >= 1) g.blurBeforeThisStratum();
		UiStyle.dim(g, width, height, 1);
		UiStyle.panel(g, px, py, W, ph);
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		g.drawString(font, font.plainSubstrByWidth(setting.name, W - 20), px + 10, py + 10, UiStyle.TEXT, false);
		int x = squareX(), y = squareY();
		g.fill(x - 1, y - 1, x + SQUARE_W + 1, y + SQUARE_H + 1, UiStyle.LINE);
		float h = Math.min(hue, 0.9999F);
		for (int i = 0; i < SQUARE_W; i += 2) {
			g.fillGradient(x + i, y, x + i + 2, y + SQUARE_H, 0xFF000000 | Mth.hsvToRgb(h, i / (float) (SQUARE_W - 2), 1), 0xFF000000);
		}
		int cx = x + Math.round(sat * (SQUARE_W - 1)), cy = y + Math.round((1 - val) * (SQUARE_H - 1));
		g.fill(cx - 3, cy - 3, cx + 4, cy + 4, 0xFF000000);
		g.fill(cx - 2, cy - 2, cx + 3, cy + 3, 0xFFFFFFFF);
		g.fill(cx - 1, cy - 1, cx + 2, cy + 2, 0xFF000000 | rgb());

		int bx = barX();
		g.fill(bx - 1, y - 1, bx + BAR + 1, y + SQUARE_H + 1, UiStyle.LINE);
		for (int k = 0; k < 6; k++) {
			g.fillGradient(bx, y + k * SQUARE_H / 6, bx + BAR, y + (k + 1) * SQUARE_H / 6,
					0xFF000000 | Mth.hsvToRgb(k / 6F, 1, 1), 0xFF000000 | Mth.hsvToRgb(Math.min((k + 1) / 6F, 0.9999F), 1, 1));
		}
		int hy = y + Math.round(hue * (SQUARE_H - 1));
		g.fill(bx - 2, hy - 1, bx + BAR + 2, hy + 2, 0xFF000000);
		g.fill(bx - 1, hy, bx + BAR + 1, hy + 1, 0xFFFFFFFF);

		int sy = y + SQUARE_H + 7;
		g.fill(x, sy, x + 18, sy + 18, UiStyle.LINE);
		g.fill(x + 1, sy + 1, x + 17, sy + 17, 0xFF000000 | rgb());

		g.drawString(font, "Favourites", x, savedY(), UiStyle.MUTED, false);
		int savedRows = Math.max(1, rows(Config.SWATCHES.size()));
		if (Config.SWATCHES.isEmpty()) g.drawString(font, "None yet", x, savedY() + 14, 0xFF5A616D, false);
		g.drawString(font, "Presets", x, savedY() + 11 + savedRows * (SWATCH + 3) + 4, UiStyle.MUTED, false);
		super.draw(g, mouseX, mouseY, delta);
	}

	private void drag() {
		if (drag == 1) {
			sat = (float) Mth.clamp((cursorX - squareX()) / (SQUARE_W - 1), 0, 1);
			val = 1 - (float) Mth.clamp((cursorY - squareY()) / (SQUARE_H - 1), 0, 1);
		} else if (drag == 2) {
			hue = (float) Mth.clamp((cursorY - squareY()) / (SQUARE_H - 1), 0, 1);
		} else {
			return;
		}
		apply(true);
	}

	@Override
	protected void mouseDown(double x, double y) {
		cursorX = x;
		cursorY = y;
		boolean inRows = y >= squareY() && y < squareY() + SQUARE_H;
		drag = inRows && x >= squareX() && x < squareX() + SQUARE_W ? 1 : inRows && x >= barX() - 2 && x < barX() + BAR + 2 ? 2 : 0;
		drag();
	}

	@Override
	protected boolean mouseDrag(double dx, double dy) {
		if (drag == 0) return false;
		cursorX += dx;
		cursorY += dy;
		drag();
		return true;
	}

	@Override
	protected void mouseUp() {
		if (drag != 0) rebuildWidgets();
		drag = 0;
	}

	@Override
	public void onClose() {
		Mc.setScreen(parent);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
