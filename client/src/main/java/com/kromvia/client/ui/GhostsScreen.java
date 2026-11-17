package com.kromvia.client.ui;

import com.kromvia.client.Ghosts;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import com.kromvia.client.compat.Mc;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class GhostsScreen extends KScreen {
	private static final int W = 320;
	private static final int ROW = 22;
	private static final int ROWS = 7;
	private final Screen parent;
	private EditBox code;
	private String draft = "";
	private List<Ghosts.Run> runs;

	public GhostsScreen(Screen parent) {
		super(Component.literal("Ghosts"));
		this.parent = parent;
	}

	private int top() {
		return Math.max(10, height / 2 - (ROWS * ROW + 90) / 2);
	}

	@Override
	protected void init() {
		int x = (width - W) / 2, y = top();
		code = new EditBox(font, x + 12, y + 30, W - 90, 18, Component.literal("Code"));
		code.setMaxLength(16);
		code.setValue(draft);
		code.setResponder(v -> draft = v);
		addRenderableWidget(code);
		addRenderableWidget(new KButton(x + W - 72, y + 29, 60, 20, Component.literal("Load"), b -> {
			if (!draft.trim().isEmpty()) Ghosts.load(draft);
		}).primary());
		runs = Ghosts.list();
		int ry = y + 58;
		for (int i = 0; i < Math.min(ROWS, runs.size()); i++) {
			Ghosts.Run r = runs.get(i);
			boolean pinned = Ghosts.pinned() == r;
			addRenderableWidget(new KButton(x + W - 166, ry + i * ROW, 50, ROW - 2, Component.literal(pinned ? "Racing" : "Race"), b -> {
				Ghosts.pin(pinned ? null : r);
				rebuild();
			}).flat());
			addRenderableWidget(new KButton(x + W - 112, ry + i * ROW, 50, ROW - 2, Component.literal("Share"), b -> Ghosts.share(r)).flat());
			addRenderableWidget(new KButton(x + W - 58, ry + i * ROW, 46, ROW - 2, Component.literal("Delete"), b -> {
				Ghosts.delete(r);
				rebuild();
			}).flat());
		}
		addRenderableWidget(new KButton(x + 12, y + 58 + ROWS * ROW + 6, W - 24, 20, Component.literal("Back"), b -> onClose()));
	}

	private void rebuild() {
		clearWidgets();
		init();
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		UiStyle.dim(g, width, height, 1);
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		int x = (width - W) / 2, y = top();
		UiStyle.panel(g, x - 4, y - 4, W + 8, ROWS * ROW + 98);
		g.drawString(font, "Ghosts", x + 12, y + 10, UiStyle.TEXT, false);
		g.drawString(font, "your best runs, and friends' by code", x + 12 + font.width("Ghosts") + 8, y + 10, UiStyle.MUTED, false);
		int ry = y + 58;
		if (runs.isEmpty()) g.drawString(font, "No runs yet. Turn on Ghost Race and press K to record one.", x + 12, ry + 6, UiStyle.MUTED, false);
		for (int i = 0; i < Math.min(ROWS, runs.size()); i++) {
			Ghosts.Run r = runs.get(i);
			String time = String.format(Locale.ROOT, "%.2f s", r.ms / 1000.0);
			g.drawString(font, time, x + 12, ry + i * ROW + 6, UiStyle.TEXT, false);
			String where = r.place.equals("local") ? "singleplayer" : r.place;
			String about = r.name + " · " + where;
			int max = W - 178 - 60;
			while (font.width(about) > max && about.length() > 2) about = about.substring(0, about.length() - 2);
			g.drawString(font, about, x + 64, ry + i * ROW + 6, UiStyle.MUTED, false);
		}
		super.draw(g, mouseX, mouseY, delta);
		String status = Ghosts.status();
		Ghosts.Run pinned = Ghosts.pinned();
		String bottom = !status.isEmpty() ? status : pinned != null ? "Racing " + pinned.name + "'s ghost. Its start is marked in the world." : "Start where a run began to race it.";
		g.drawCenteredString(font, bottom, width / 2, Math.min(height - 12, y + ROWS * ROW + 100), UiStyle.MUTED);
	}

	@Override
	public void onClose() {
		Mc.setScreen(parent);
	}
}
