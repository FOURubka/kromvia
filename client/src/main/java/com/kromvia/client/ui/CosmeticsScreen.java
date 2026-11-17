package com.kromvia.client.ui;

import com.kromvia.client.compat.Mc;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import java.util.ArrayList;
import java.util.List;

import com.kromvia.client.Config;
import com.kromvia.client.cosmetic.Cosmetic;
import com.kromvia.client.cosmetic.Cosmetic.Slot;
import com.kromvia.client.cosmetic.Cosmetics;
import com.kromvia.client.cosmetic.Wardrobe;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class CosmeticsScreen extends KScreen {
	private static final int GAP = 4;
	private final Screen parent;
	private Slot slot = Slot.HEAD;
	private float spin = 200;
	private boolean dragging;
	private int split;
	private static long changed;
	private boolean animate = true;
	private int cols = 2;

	public CosmeticsScreen(Screen parent) {
		super(Component.literal("Wardrobe"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		split = Math.max(180, width * 2 / 5);
		int left = split + 16;
		int right = width - 16;
		int top = 36;

		List<Slot> filled = new ArrayList<>();
		for (Slot s : Slot.values()) {
			if (countIn(s) > 0) filled.add(s);
		}
		Slot[] slots = filled.toArray(new Slot[0]);
		int tab = (right - left - (slots.length - 1) * GAP) / slots.length;
		for (int i = 0; i < slots.length; i++) {
			Slot s = slots[i];
			addRenderableWidget(new KButton(left + i * (tab + GAP), top, tab, 20, Component.literal(pretty(s)), b -> {
				slot = s;
				animate = true;
				rebuildWidgets();
			}, () -> slot == s).appear(delay(0)));
		}

		List<Cosmetic> items = new ArrayList<>();
		if (slot == Slot.BACK) items.add(Cosmetics.cape());
		for (Cosmetic c : Cosmetics.all()) {
			if (c.slot() == slot) items.add(c);
		}
		cols = items.size() > 12 ? 3 : 2;
		int colW = (right - left - (cols - 1) * GAP) / cols;
		int y = top + 30;
		for (int i = 0; i < items.size(); i++) {
			Cosmetic c = items.get(i);
			int x = left + (i % cols) * (colW + GAP);
			int yy = y + (i / cols) * 24;
			addRenderableWidget(new KButton(x, yy, colW, 20, Component.literal(c.name()), b -> {
				Wardrobe.toggle(c);
				changed = System.currentTimeMillis();
				Config.save();
				Wardrobe.saveShared();
				rebuildWidgets();
			}, () -> c.id().equals(Wardrobe.EQUIPPED.get(c.slot()))).appear(delay(i * 18)));
		}

		Cosmetic worn = Wardrobe.equipped(slot);
		if (worn != null && Wardrobe.tintable(worn)) {
			int sy = y + ((items.size() + cols - 1) / cols) * 24 + 18;
			int sw = 18;
			for (int i = 0; i < Cosmetics.PALETTE.size(); i++) {
				Cosmetics.Colour col = Cosmetics.PALETTE.get(i);
				int sx = left + (i % 12) * (sw + GAP);
				addRenderableWidget(new Swatch(sx, sy, sw, col.argb(), () -> {
					Wardrobe.COLORS.put(worn.id(), col.argb());
					Config.save();
				Wardrobe.saveShared();
				}, () -> Wardrobe.picked(worn, col.argb())).appear(delay(items.size() * 18 + i * 12)));
			}
			int n = Cosmetics.PALETTE.size();
			addRenderableWidget(new Swatch(left + (n % 12) * (sw + GAP), sy + (n / 12) * (sw + GAP), sw, Wardrobe.RAINBOW, () -> {
				Wardrobe.COLORS.put(worn.id(), Wardrobe.RAINBOW);
				Config.save();
				Wardrobe.saveShared();
			}, () -> Wardrobe.picked(worn, Wardrobe.RAINBOW)).appear(delay(items.size() * 18 + n * 12)));
		}

		addRenderableWidget(new KButton(width - 116, height - 30, 100, 20, Component.literal("Done"), b -> onClose()).appear(delay(0)));
		animate = false;
	}

	private int delay(int ms) {
		return animate ? ms : -10_000;
	}

	private static String pretty(Slot s) {
		String n = s.name();
		return n.charAt(0) + n.substring(1).toLowerCase();
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		super.draw(g, mouseX, mouseY, delta);
		UiStyle.logo(g, 16, 10, 16);
		g.drawString(font, "WARDROBE", 38, 14, UiStyle.TEXT, false);
		Cosmetic worn = Wardrobe.equipped(slot);
		if (worn != null && Wardrobe.tintable(worn)) {
			int y = 36 + 30 + ((countIn(slot) + cols - 1) / cols) * 24 + 6;
			g.drawString(font, "Colour", split + 16, y, UiStyle.MUTED, false);
		}
		if (!dragging) spin += delta * 0.4F;
		float t = (System.currentTimeMillis() - changed) / 320F;
		int hop = t < 1 ? Math.round(net.minecraft.util.Mth.sin(t * (float) Math.PI) * 10) : 0;
		PlayerPreview.render(g, 16, 36 - hop, split - 16, height - 40 - hop, spin, (System.currentTimeMillis() % 1_000_000L) / 50F);
		g.drawCenteredString(font, "Drag to turn · the same wardrobe as in the launcher", split / 2, height - 30, UiStyle.MUTED);
	}

	private static int countIn(Slot s) {
		int n = s == Slot.BACK ? 1 : 0;
		for (Cosmetic c : Cosmetics.all()) {
			if (c.slot() == s) n++;
		}
		return n;
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		if (minecraft.level == null) drawPanorama(g, delta);
		UiStyle.dim(g, width, height, 1);
		UiStyle.panel(g, 8, 30, split - 16, height - 66);
	}

	@Override
	protected void mouseDown(double x, double y) {
		dragging = x < split;
	}

	@Override
	protected boolean mouseDrag(double dx, double dy) {
		if (dragging) spin -= (float) dx * 1.5F;
		return dragging;
	}

	@Override
	protected void mouseUp() {
		dragging = false;
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
