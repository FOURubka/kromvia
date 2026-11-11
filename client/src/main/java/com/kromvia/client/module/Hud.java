package com.kromvia.client.module;

import com.kromvia.client.compat.Mc;
import com.kromvia.client.compat.Gfx;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import com.kromvia.client.KromviaClient;
import com.kromvia.client.ui.HudEditor;
import com.mojang.blaze3d.platform.Window;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.network.chat.Component;

public final class Hud {
	private static final int MARGIN = 4;
	private static final int GAP = 2;
	private static final int TOP_RIGHT_START = 54;

	public static final class Box {
		public final Module module;
		public final boolean live;
		public final int w, h;
		public int x, y;

		Box(Module module, boolean live, int w, int h) {
			this.module = module;
			this.live = live;
			this.w = w;
			this.h = h;
		}
	}

	private Hud() {}

	public static void render(Gfx g) {
		Minecraft mc = Minecraft.getInstance();
		if (Mc.hudHidden() || mc.player == null || mc.getDebugOverlay().showDebugScreen() || Mc.screen() instanceof HudEditor) return;
		for (Module m : KromviaClient.MODULES) {
			if (m.enabled) m.overlay(g, mc);
		}
		for (Box b : layout(mc, g.guiWidth(), g.guiHeight(), false)) drawScaled(g, mc, b.module, b.x, b.y);
	}

	public static List<Box> layout(Minecraft mc, int w, int h, boolean all) {
		List<Box> boxes = new ArrayList<>();
		Map<Module.Corner, Integer> next = new EnumMap<>(Module.Corner.class);
		next.put(Module.Corner.TOP_LEFT, MARGIN);
		next.put(Module.Corner.TOP_RIGHT, TOP_RIGHT_START);
		next.put(Module.Corner.BOTTOM_RIGHT, h - MARGIN);
		for (Module m : KromviaClient.MODULES) {
			if (!m.enabled || !m.hud()) continue;
			boolean live = mc.player != null && m.visible(mc);
			if (!live && !all) continue;
			float s = m.scale();
			int bw = live ? m.width(mc) : mc.font.width(m.sample()) + 6;
			int bh = live ? m.height(mc) : mc.font.lineHeight + 4;
			Box b = new Box(m, live, Math.round(bw * s), Math.round(bh * s));
			if (m.hudX >= 0) {
				b.x = Math.max(0, Math.round(m.hudX * (w - b.w)));
				b.y = Math.max(0, Math.round(m.hudY * (h - b.h)));
			} else {
				int at = next.get(m.corner);
				b.x = m.corner == Module.Corner.TOP_LEFT ? MARGIN : w - MARGIN - b.w;
				b.y = m.corner == Module.Corner.BOTTOM_RIGHT ? at - b.h : at;
				next.put(m.corner, m.corner == Module.Corner.BOTTOM_RIGHT ? at - b.h - GAP : at + b.h + GAP);
			}
			boxes.add(b);
		}
		return boxes;
	}

	public static boolean click(Minecraft mc) {
		if (mc.player == null || !(Mc.screen() instanceof ChatScreen)) return false;
		Window w = mc.getWindow();
		double mx = mc.mouseHandler.xpos() * w.getGuiScaledWidth() / w.getScreenWidth();
		double my = mc.mouseHandler.ypos() * w.getGuiScaledHeight() / w.getScreenHeight();
		for (Box b : layout(mc, w.getGuiScaledWidth(), w.getGuiScaledHeight(), false)) {
			if (mx >= b.x && mx < b.x + b.w && my >= b.y && my < b.y + b.h && b.module.click(mc)) return true;
		}
		return false;
	}

	public static void drawScaled(Gfx g, Minecraft mc, Module m, int x, int y) {
		g.pose().pushMatrix();
		g.pose().translate(x, y);
		g.pose().scale(m.scale(), m.scale());
		m.render(g, mc, 0, 0);
		g.pose().popMatrix();
	}

	public static void tick(Minecraft mc) {
		com.kromvia.client.Config.tick();
		boolean free = mc.player != null && Mc.screen() == null;
		for (Module m : KromviaClient.MODULES) {
			if (m.key < 0) continue;
			boolean down = free && Mc.keyDown(m.key);
			if (down && !m.keyHeld) {
				m.enabled = !m.enabled;
				if (!m.enabled) m.disable(mc);
				com.kromvia.client.Config.save();
				Mc.actionbar(Component.literal(m.name + ": " + (m.enabled ? "§aOn" : "§cOff")));
			}
			m.keyHeld = down;
		}
		for (Module m : KromviaClient.MODULES) {
			if (m.enabled) m.tick(mc);
		}
	}
}
