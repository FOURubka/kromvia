package com.kromvia.client.module;

import com.kromvia.client.compat.Gfx;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.Items;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ColorSetting;
import com.kromvia.client.module.setting.SliderSetting;

public class KeystrokesModule extends Module {
	private static final int KEY = 22;
	private static final int GAP = 2;

	public KeystrokesModule() {
		super("keystrokes", "Keystrokes", Category.PVP, Corner.BOTTOM_RIGHT, false);
		icon(Items.NOTE_BLOCK);
	}

	final ColorSetting pressed = add(new ColorSetting("pressed", "Pressed colour", 0xFF8B5CF6));
	final SliderSetting opacity = add(new SliderSetting("opacity", "Background opacity", 55, 0, 100, 5, "%"));
	final BoolSetting mouse = add(new BoolSetting("mouse", "Mouse buttons", true));
	final BoolSetting space = add(new BoolSetting("space", "Space bar", true));
	final SliderSetting size = add(new SliderSetting("scale", "Size", 100, 50, 200, 10, "%"));

	@Override
	public float scale() {
		return size.value() / 100F;
	}

	@Override
	public int width(Minecraft mc) {
		return KEY * 3 + GAP * 2;
	}

	@Override
	public int height(Minecraft mc) {
		return (KEY + GAP) * (mouse.on() ? 3 : 2) + (space.on() ? 10 : -GAP);
	}

	@Override
	public void render(Gfx g, Minecraft mc, int x, int y) {
		var o = mc.options;
		int row = KEY + GAP;
		int wide = KEY * 3 + GAP * 2;
		int half = (wide - GAP) / 2;
		key(g, mc, x + row, y, KEY, KEY, o.keyUp, label(o.keyUp));
		key(g, mc, x, y + row, KEY, KEY, o.keyLeft, label(o.keyLeft));
		key(g, mc, x + row, y + row, KEY, KEY, o.keyDown, label(o.keyDown));
		key(g, mc, x + row * 2, y + row, KEY, KEY, o.keyRight, label(o.keyRight));
		int ry = y + row * 2;
		if (mouse.on()) {
			key(g, mc, x, ry, half, KEY, o.keyAttack, "LMB " + Clicks.left());
			key(g, mc, x + half + GAP, ry, half, KEY, o.keyUse, "RMB " + Clicks.right());
			ry += row;
		}
		if (space.on()) key(g, mc, x, ry, wide, 10, o.keyJump, "");
	}

	private static String label(KeyMapping k) {
		return k.getTranslatedKeyMessage().getString().toUpperCase();
	}

	private void key(Gfx g, Minecraft mc, int x, int y, int w, int h, KeyMapping k, String text) {
		boolean down = k.isDown();
		g.fill(x, y, x + w, y + h, down ? pressed.argb() : net.minecraft.util.ARGB.color(Math.round(opacity.value() * 2.55F), 0, 0, 0));
		if (text.isEmpty()) {
			g.fill(x + w / 4, y + h / 2, x + w * 3 / 4, y + h / 2 + 1, down ? 0xFF000000 : 0xFFFFFFFF);
			return;
		}
		int tw = mc.font.width(text);
		g.drawString(mc.font, text, x + (w - tw) / 2, y + (h - mc.font.lineHeight) / 2 + 1, down ? 0xFF000000 : 0xFFFFFFFF, false);
	}
}
