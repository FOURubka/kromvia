package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.DrawnButton;
import com.kromvia.client.module.Module;
import com.kromvia.client.module.ModuleInfo;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

public class ModuleCard extends DrawnButton {
	public static final int W = 104;
	public static final int H = 58;
	private final Module module;
	private float hover;
	private float knob;
	private float pulse;
	private long revealAt = System.currentTimeMillis();
	private int clipTop = Integer.MIN_VALUE, clipBottom = Integer.MAX_VALUE;

	public ModuleCard(int x, int y, Module module, OnPress onPress) {
		super(x, y, W, H, Component.literal(module.name), onPress);
		this.module = module;
		this.knob = module.enabled ? 1 : 0;
	}

	public void reveal(long at) {
		revealAt = at;
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
		pulse = 1;
	}

	@Override
	protected void drawContents(Gfx g, int mouseX, int mouseY, float delta) {
		float in = UiStyle.since(revealAt, 320);
		if (in <= 0) return;
		Minecraft mc = Minecraft.getInstance();
		boolean on = module.enabled;
		hover = Mth.lerp(0.25F, hover, isHovered() ? 1F : 0F);
		knob = Mth.lerp(0.3F, knob, on ? 1F : 0F);
		pulse = Mth.lerp(0.12F, pulse, 0);

		int x = getX(), w = getWidth(), h = getHeight();
		int y = getY() + Math.round((1 - in) * 14 - hover * 2);

		g.pose().pushMatrix();
		float s = 0.92F + 0.08F * in + pulse * 0.03F;
		g.pose().translate(x + w / 2F, y + h / 2F);
		g.pose().scale(s, s);
		g.pose().translate(-(x + w / 2F), -(y + h / 2F));

		UiStyle.plain(g, x, y, w, h, 8, 0x9A18181D, 0x16FFFFFF, in);
		UiStyle.plain(g, x, y, w, h, 8, 0x0A8B5CF6, 0xB08B5CF6, in * knob);
		UiStyle.plain(g, x, y, w, h, 8, 0x0CFFFFFF, 0x30FFFFFF, in * hover);
		UiStyle.plain(g, x, y, w, h, 8, 0x22FFFFFF, 0x40FFFFFF, pulse);

		if (in > 0.35F) {
			float bob = hover * Mth.sin((System.currentTimeMillis() % 1200) / 1200F * Mth.TWO_PI) * 1.2F;
			String icon = ModuleInfo.icon(module);
			if (Icons.has(icon)) {
				int tint = ARGB.srgbLerp(Math.max(knob, hover), UiStyle.MUTED, UiStyle.TEXT);
				g.pose().pushMatrix();
				g.pose().translate(0, bob);
				Icons.draw(g, icon, x + w / 2 - 10, y + 8, 20, UiStyle.fade(tint, in));
				g.pose().popMatrix();
			} else {
				float is = 1.5F + hover * 0.2F;
				g.pose().pushMatrix();
				g.pose().translate(x + w / 2F, y + 18 + bob);
				g.pose().scale(is, is);
				g.renderItem(module.icon(), -8, -8);
				g.pose().popMatrix();
			}
		}

		String name = module.name;
		int max = w - 8;
		while (mc.font.width(name) > max && name.length() > 3) name = name.substring(0, name.length() - 2) + "…";
		int text = ARGB.srgbLerp(Math.max(knob, hover), UiStyle.MUTED, UiStyle.TEXT);
		g.drawCenteredString(mc.font, name, x + w / 2, y + 35, UiStyle.fade(text, in));

		int sx = x + w / 2 - 10, sy = y + h - 13;
		UiStyle.round(g, sx, sy, sx + 20, sy + 10, 5, UiStyle.fade(ARGB.srgbLerp(knob, 0x40FFFFFF, UiStyle.FRONT), in));
		float kx = sx + 1 + knob * 10;
		UiStyle.round(g, kx, sy + 1, kx + 8, sy + 9, 4, UiStyle.fade(ARGB.srgbLerp(knob, UiStyle.MUTED, UiStyle.TEXT), in));
		g.pose().popMatrix();
	}
}
