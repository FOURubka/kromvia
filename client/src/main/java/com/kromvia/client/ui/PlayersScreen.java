package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import com.kromvia.client.compat.Mc;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;

public class PlayersScreen extends KScreen {
	private static final int BW = 110, BH = 18, GAP = 4;
	private final List<String> names = new ArrayList<>();
	private int page, perPage, pages, px, py, pw, ph;

	public PlayersScreen() {
		super(Component.literal("Players"));
		Minecraft mc = Minecraft.getInstance();
		if (mc.getConnection() != null) {
			for (PlayerInfo info : mc.getConnection().getOnlinePlayers()) {
				String n = info.getProfile().name();
				if (mc.player == null || !n.equals(mc.player.getName().getString())) names.add(n);
			}
		}
		names.sort(String.CASE_INSENSITIVE_ORDER);
	}

	@Override
	protected void init() {
		pw = Math.min(width - 20, BW * 4 + GAP * 3 + 20);
		ph = Math.min(height - 20, 260);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		int cols = Math.max(1, (pw - 20 + GAP) / (BW + GAP));
		int rows = Math.max(1, (ph - 64 + GAP) / (BH + GAP));
		perPage = cols * rows;
		pages = Math.max(1, (names.size() + perPage - 1) / perPage);
		page = Math.min(page, pages - 1);
		int x0 = px + (pw - (cols * (BW + GAP) - GAP)) / 2;
		for (int i = 0; i < perPage && page * perPage + i < names.size(); i++) {
			String n = names.get(page * perPage + i);
			addRenderableWidget(new KButton(x0 + (i % cols) * (BW + GAP), py + 28 + (i / cols) * (BH + GAP), BW, BH, Component.literal(n), b -> Mc.setScreen(new CardScreen(this, n))).flat());
		}
		int by = py + ph - 26;
		addRenderableWidget(new KButton(px + 10, by, 60, 20, Component.literal("Close"), b -> onClose()));
		if (pages > 1) {
			addRenderableWidget(new KButton(px + pw - 54, by, 22, 20, Component.literal("<"), b -> turn(-1)));
			addRenderableWidget(new KButton(px + pw - 30, by, 22, 20, Component.literal(">"), b -> turn(1)));
		}
	}

	private void turn(int d) {
		page = (page + d + pages) % pages;
		clearWidgets();
		init();
	}

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		if (pages > 1) turn(scrollY < 0 ? 1 : -1);
		return true;
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		UiStyle.dim(g, width, height, 1);
		UiStyle.panel(g, px, py, pw, ph);
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		g.drawString(font, "PLAYERS · click for profile", px + 10, py + 10, UiStyle.FRONT, false);
		if (pages > 1) g.drawString(font, (page + 1) + " / " + pages, px + pw - 100, py + ph - 20, UiStyle.MUTED, false);
		if (names.isEmpty()) g.drawCenteredString(font, "Nobody else here.", width / 2, py + ph / 2 - 10, UiStyle.MUTED);
		super.draw(g, mouseX, mouseY, delta);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
