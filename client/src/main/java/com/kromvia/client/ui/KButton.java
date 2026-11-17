package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.DrawnButton;
import java.util.function.BooleanSupplier;

import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

public class KButton extends DrawnButton {
	private static final float SLIDE_MS = 260;
	private final BooleanSupplier selected;
	private final long born = System.currentTimeMillis();
	private int delay;
	private float hover;
	private float press;
	private boolean flat;
	private boolean toggle;
	private boolean primary;
	private boolean plain;
	private int clipTop = Integer.MIN_VALUE, clipBottom = Integer.MAX_VALUE;

	public KButton(int x, int y, int w, int h, Component label, OnPress onPress, BooleanSupplier selected) {
		super(x, y, w, h, label, onPress);
		this.selected = selected;
	}

	public KButton(int x, int y, int w, int h, Component label, OnPress onPress) {
		this(x, y, w, h, label, onPress, () -> false);
	}

	public KButton appear(int delayMs) {
		delay = delayMs;
		return this;
	}

	public KButton flat() {
		flat = true;
		return this;
	}

	public KButton primary() {
		primary = true;
		return this;
	}

	public KButton plain() {
		plain = true;
		return this;
	}

	public KButton toggle() {
		toggle = true;
		return this;
	}

	public void clip(int top, int bottom) {
		clipTop = top;
		clipBottom = bottom;
	}

	@Override
	public boolean isMouseOver(double x, double y) {
		return y >= clipTop && y < clipBottom && super.isMouseOver(x, y);
	}

	@Override
	protected void pressed() {
		press = 1;
	}

	protected float entrance() {
		float t = Mth.clamp((System.currentTimeMillis() - born - delay) / SLIDE_MS, 0, 1);
		return 1 - (1 - t) * (1 - t) * (1 - t);
	}

	@Override
	protected void drawContents(Gfx g, int mouseX, int mouseY, float delta) {
		float in = entrance();
		if (in <= 0) return;
		hover = Mth.lerp(0.35F, hover, isHoveredOrFocused() ? 1F : 0F);
		press = Mth.lerp(0.15F, press, 0);
		g.pose().pushMatrix();
		g.pose().translate((1 - in) * -24, 0);
		if (plain) {
			if (hover > 0.02F) UiStyle.plain(g, getX(), getY(), getWidth(), getHeight(), getHeight() / 2F, 0x20FFFFFF, 0x20FFFFFF, hover);
		} else if (flat) {
			if (hover > 0.02F) UiStyle.round(g, getX(), getY(), getX() + getWidth(), getY() + getHeight(), getHeight() / 2F, UiStyle.fade(0x22FFFFFF, hover));
		} else if (toggle) {
			boolean on = selected.getAsBoolean();
			UiStyle.button(g, getX(), getY(), getWidth(), getHeight(), active, false);
			if (hover > 0.02F) UiStyle.round(g, getX(), getY(), getX() + getWidth(), getY() + getHeight(), getHeight() / 2F, UiStyle.fade(0x14FFFFFF, hover));
			int sw = 14, sh = 8, bx = getX() + getWidth() - sw - 8, by = getY() + (getHeight() - sh) / 2;
			UiStyle.round(g, bx, by, bx + sw, by + sh, sh / 2F, on ? UiStyle.FRONT : 0x40FFFFFF);
			UiStyle.round(g, on ? bx + sw - sh + 1 : bx + 1, by + 1, on ? bx + sw - 1 : bx + sh - 1, by + sh - 1, (sh - 2) / 2F, on ? UiStyle.TEXT : UiStyle.MUTED);
		} else {
			UiStyle.button(g, getX(), getY(), getWidth(), getHeight(), active, primary || selected.getAsBoolean());
			if (hover > 0.02F && !primary) UiStyle.glass(g, getX(), getY(), getWidth(), getHeight(), getHeight() / 2F, UiStyle.GLASS_HOT, UiStyle.GLASS_RIM, hover);
		}
		if (press > 0.02F) UiStyle.glass(g, getX(), getY(), getWidth(), getHeight(), getHeight() / 2F, 0x55B49CFF, UiStyle.GLASS_RIM, press);
		label(g);
		g.pose().popMatrix();
	}

	private void label(Gfx g) {
		at(g, getX(), getY());
	}

	private void at(Gfx g, int bx, int by) {
		net.minecraft.client.gui.Font font = net.minecraft.client.Minecraft.getInstance().font;
		int color = !active ? UiStyle.MUTED : primary || selected.getAsBoolean() && !toggle && !flat ? UiStyle.INK : UiStyle.TEXT;
		g.drawString(font, getMessage(), bx + (getWidth() - font.width(getMessage())) / 2, by + (getHeight() - 8) / 2, color, false);
	}
}
