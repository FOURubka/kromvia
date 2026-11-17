package com.kromvia.client.ui;

import com.kromvia.client.Config;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import com.kromvia.client.compat.Mc;
import java.util.List;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class ProfilesScreen extends KScreen {
	private static final int W = 240;
	private static final int ROW = 22;
	private static final int MAX_ROWS = 7;
	private final Screen parent;
	private EditBox name;
	private String draft = "";
	private String status = "";
	private List<String> all;

	public ProfilesScreen(Screen parent) {
		super(Component.literal("Profiles"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		int x = (width - W) / 2;
		int y = height / 2 - (MAX_ROWS * ROW + 60) / 2;
		name = new EditBox(font, x, y + 18, W - 64, 20, Component.literal("Name"));
		name.setMaxLength(32);
		name.setValue(draft);
		name.setResponder(v -> draft = v);
		addRenderableWidget(name);
		addRenderableWidget(new KButton(x + W - 60, y + 18, 60, 20, Component.literal("Save"), b -> {
			String n = draft.trim();
			if (!Config.validProfile(n)) {
				status = "Letters, digits, spaces, _ and -, up to 32";
				return;
			}
			Config.saveProfile(n);
			status = "Saved " + n;
			draft = "";
			rebuild();
		}));

		all = Config.profiles();
		String server = Config.currentServer(minecraft);
		java.util.Map<String, String> bound = Config.serverProfiles();
		int ry = y + 48;
		for (int i = 0; i < Math.min(MAX_ROWS, all.size()); i++) {
			String p = all.get(i);
			int nameW = server == null ? W - 26 : W - 72;
			addRenderableWidget(new KButton(x, ry, nameW, ROW - 2, Component.literal(p), b -> load(p)).appear(i * 30));
			if (server != null) {
				boolean here = p.equals(bound.get(server));
				addRenderableWidget(new KButton(x + nameW + 2, ry, 42, ROW - 2, Component.literal(here ? "Here ✓" : "Here"), b -> {
					Config.bindServer(server, here ? null : p);
					status = here ? "No profile for " + server : p + " loads on " + server;
					rebuild();
				}).flat());
			}
			addRenderableWidget(new KButton(x + W - 22, ry, 22, ROW - 2, Component.literal("✕"), b -> {
				Config.deleteProfile(p);
				status = "Deleted " + p;
				rebuild();
			}).flat());
			ry += ROW;
		}
		addRenderableWidget(new KButton(x, y + 48 + MAX_ROWS * ROW + 8, W, 20, Component.literal("Back"), b -> onClose()));
	}

	private void load(String p) {
		Config.apply(minecraft, p);
		status = "Loaded " + p;
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
		super.draw(g, mouseX, mouseY, delta);
		int x = (width - W) / 2;
		int y = height / 2 - (MAX_ROWS * ROW + 60) / 2;
		g.drawString(font, "PROFILES", x, y + 4, UiStyle.TEXT, false);
		if (all.isEmpty()) g.drawString(font, "No profiles yet. Name the current setup and save it.", x, y + 54, UiStyle.MUTED, false);
		g.drawCenteredString(font, status.isEmpty() ? "Profiles are shared by all your builds." : status, width / 2, height - 14, UiStyle.MUTED);
	}

	@Override
	public void onClose() {
		Mc.setScreen(parent);
	}
}
