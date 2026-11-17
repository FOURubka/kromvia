package com.kromvia.client.ui;

import java.util.function.Consumer;

import com.kromvia.client.Rooms;
import com.kromvia.client.Social;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.Mc;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public final class PauseExtras {
	private static final int MENU_HALF = 102, BUTTON_W = 100, MIN_SIDE = 120;

	private PauseExtras() {}

	private static int side(int width) {
		return width / 2 - MENU_HALF;
	}

	private static int previewH(int height) {
		return Math.min(height / 2, 160);
	}

	public static void init(Screen screen, int width, int height, Consumer<AbstractWidget> add) {
		if (side(width) < MIN_SIDE) return;
		int lx = side(width) / 2;
		int rx = width - lx;
		int mid = height / 2;
		if (com.kromvia.client.Launcher.PRESENT) {
			add.accept(new KButton(lx - BUTTON_W / 2, mid + previewH(height) / 2 - 4, BUTTON_W, 20, Component.literal("Wardrobe"),
					b -> Mc.setScreen(new CosmeticsScreen(screen))));
		}
		java.util.Map<String, Button.OnPress> right = new java.util.LinkedHashMap<>();
		net.minecraft.client.server.IntegratedServer server = Minecraft.getInstance().getSingleplayerServer();
		if (server != null && !server.isPublished()) {
			right.put("Host World", b -> {
				Rooms.hostNow();
				screen.onClose();
			});
		}
		right.put("Friends", b -> Mc.setScreen(new SocialScreen(screen)));
		right.put("Screenshots", b -> Mc.setScreen(new ScreenshotsScreen(screen)));
		right.put("Mods", b -> Mc.setScreen(new ModsScreen(screen, true)));
		right.put("Edit HUD", b -> Mc.setScreen(new HudEditor(screen)));
		right.put("Profiles", b -> Mc.setScreen(new ProfilesScreen(screen)));
		if (com.kromvia.client.module.Info.GHOSTS.enabled) right.put("Ghosts", b -> Mc.setScreen(new GhostsScreen(screen)));
		int y = mid - right.size() * 24 / 2;
		for (java.util.Map.Entry<String, Button.OnPress> e : right.entrySet()) {
			add.accept(new KButton(rx - BUTTON_W / 2, y, BUTTON_W, 20, Component.literal(e.getKey()), e.getValue()));
			y += 24;
		}
	}

	public static void render(Gfx g, int width, int height) {
		if (side(width) < MIN_SIDE) return;
		int lx = side(width) / 2;
		int ph = previewH(height);
		int pw = ph / 2;
		int bottom = height / 2 + ph / 2 - 10;
		float age = (System.currentTimeMillis() % 1_000_000L) / 50F;
		PlayerPreview.render(g, lx - pw, bottom - ph, lx + pw, bottom, age * 0.6F, age);
	}
}
