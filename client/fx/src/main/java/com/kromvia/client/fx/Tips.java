package com.kromvia.client.fx;

import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.compat.Stacks;
import com.kromvia.client.fx.mixin.QolSlotAccessor;
import com.kromvia.client.module.Info;
import com.kromvia.client.ui.Notes;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public final class Tips {
	private static final int BG = 0xF0100E19, EDGE = 0xFF4C3A86, PAPER = 0xFFD8C9A3;
	private static final int MAP = 64;

	private Tips() {}

	public static void render(Gfx g) {
		if (!Info.ITEM_TIPS.enabled) return;
		Minecraft mc = Minecraft.getInstance();
		Screen screen = Mc.screen();
		if (!(screen instanceof AbstractContainerScreen) || mc.level == null) return;
		Slot slot = ((QolSlotAccessor) screen).kromvia$hoveredSlot();
		if (slot == null || !slot.hasItem()) return;
		double[] m = Notes.mouse(mc);
		if (m == null) return;
		ItemStack stack = slot.getItem();
		if (stack.getItem() == Items.FILLED_MAP) {
			if (Info.TIP_MAPS.on()) map(g, Stacks.map(stack, mc.level), (int) m[0], (int) m[1]);
		} else if (Info.TIP_CONTAINERS.on()) {
			grid(g, Stacks.contents(stack), (int) m[0], (int) m[1]);
		}
	}

	private static int[] place(Gfx g, int w, int h, int mx, int my) {
		int x = Math.min(mx + 12, g.guiWidth() - w - 4);
		int y = my - 16 - h;
		if (y < 4) {
			y = Math.max(4, Math.min(my - h / 2, g.guiHeight() - h - 4));
			x = Math.max(4, mx - 16 - w);
		}
		return new int[] {x, y};
	}

	private static void frame(Gfx g, int x, int y, int w, int h) {
		g.nextStratum();
		g.fill(x, y, x + w, y + h, BG);
		g.fill(x, y, x + w, y + 1, EDGE);
		g.fill(x, y + h - 1, x + w, y + h, EDGE);
		g.fill(x, y, x + 1, y + h, EDGE);
		g.fill(x + w - 1, y, x + w, y + h, EDGE);
	}

	private static void grid(Gfx g, List<ItemStack> items, int mx, int my) {
		boolean any = false;
		for (ItemStack s : items) any |= !s.isEmpty();
		if (!any) return;
		int rows = (items.size() + 8) / 9, w = 9 * 18 + 6, h = rows * 18 + 6;
		int[] p = place(g, w, h, mx, my);
		frame(g, p[0], p[1], w, h);
		for (int i = 0; i < items.size(); i++) {
			ItemStack s = items.get(i);
			if (s.isEmpty()) continue;
			int x = p[0] + 4 + i % 9 * 18, y = p[1] + 4 + i / 9 * 18;
			g.renderItem(s, x, y);
			g.itemDecorations(s, x, y);
		}
	}

	private static void map(Gfx g, int[] px, int mx, int my) {
		if (px == null) return;
		int size = MAP * 2 + 6;
		int[] p = place(g, size, size, mx, my);
		frame(g, p[0], p[1], size, size);
		int x0 = p[0] + 3, y0 = p[1] + 3;
		g.fill(x0, y0, x0 + MAP * 2, y0 + MAP * 2, PAPER);
		for (int y = 0; y < MAP; y++) {
			for (int x = 0; x < MAP; x++) {
				int c = px[y * 2 * 128 + x * 2];
				if (c != 0) g.fill(x0 + x * 2, y0 + y * 2, x0 + x * 2 + 2, y0 + y * 2 + 2, c | 0xFF000000);
			}
		}
	}
}
