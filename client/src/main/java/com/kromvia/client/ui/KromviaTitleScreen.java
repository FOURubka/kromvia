package com.kromvia.client.ui;

import com.kromvia.client.Accounts;
import com.kromvia.client.PlayTime;
import com.kromvia.client.Rooms;
import com.kromvia.client.Social;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import java.io.File;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.time.format.DateTimeFormatter;

import net.minecraft.SharedConstants;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.resources.language.I18n;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.network.chat.Component;

public class KromviaTitleScreen extends KScreen {
	private static final Logger LOGGER = LoggerFactory.getLogger("kromvia");
	private static final int BAR = 26;
	private static final int PANEL_W = 220;
	private static final int BUTTON_W = 180;
	private static final int SIDE_W = 170;
	private float spin = 160;
	private boolean dragging;
	private int serverCount;
	private String confirmRemove;
	private int worldCount;
	private List<AbstractWidget> modWide = new ArrayList<>();
	private List<AbstractWidget> modIcons = new ArrayList<>();
	private static final String[] VANILLA = {"menu.singleplayer", "menu.multiplayer", "menu.online", "menu.options", "menu.quit", "menu.playdemo", "menu.resetdemo",
			"narrator.button.language", "narrator.button.accessibility", "options.language", "options.accessibility", "title.credits"};

	public KromviaTitleScreen() {
		super(Component.literal("Kromvia"));
	}

	private int panelX() {
		return 0;
	}

	private int menuH() {
		return ((Social.available() ? 6 : 5) - (com.kromvia.client.Launcher.PRESENT ? 0 : 1)) * 26 + 30 + modsH();
	}

	private int modsH() {
		return modWide.size() * 24 + (modIcons.isEmpty() ? 0 : 24) + (modWide.isEmpty() && modIcons.isEmpty() ? 0 : 10);
	}

	private boolean compact() {
		return height < BAR + 84 + menuH() + 30;
	}

	private int menuTop() {
		if (compact()) return BAR + 12;
		return Math.min(Math.max(BAR + 90, height / 2 - 30), height - menuH() - 18);
	}

	private void collectModButtons() {
		modWide = new ArrayList<>();
		modIcons = new ArrayList<>();
		try {
			TitleScreen vanilla = new TitleScreen();
			Mc.initScreen(vanilla, width, height);
			for (GuiEventListener l : vanilla.children()) {
				if (!(l instanceof AbstractButton)) continue;
				AbstractWidget w = (AbstractWidget) l;
				if (isVanilla(Mc.label(w))) continue;
				if (w.getWidth() <= 24) modIcons.add(w);
				else modWide.add(w);
			}
		} catch (Throwable e) {
			LOGGER.warn("Could not read other mods' title screen buttons", e);
		}
	}

	private static boolean isVanilla(String label) {
		for (String key : VANILLA) {
			if (label.equals(I18n.get(key))) return true;
		}
		return label.isEmpty() || label.startsWith("Copyright Mojang");
	}

	@Override
	protected void init() {
		Rooms.hostNext(false);
		collectModButtons();
		int x = panelX() + (PANEL_W - BUTTON_W) / 2;
		int y = menuTop();
		addRenderableWidget(new KButton(x, y, BUTTON_W, 22, Component.literal("Singleplayer"),
				b -> Mc.setScreen(new SelectWorldScreen(this))).primary().appear(0));
		addRenderableWidget(new KButton(x, y + 26, BUTTON_W, 22, Component.literal("Multiplayer"),
				b -> Mc.setScreen(new JoinMultiplayerScreen(this))).appear(40));
		addRenderableWidget(new KButton(x, y + 52, BUTTON_W, 22, Component.literal(Rooms.relay() ? "Host World" : "Host World (LAN)"), b -> {
			Rooms.hostNext(true);
			Mc.setScreen(new SelectWorldScreen(this));
		}).appear(80));
		int row = 78;
		if (Social.available()) {
			addRenderableWidget(new KButton(x, y + row, BUTTON_W, 22, Component.literal("Social"),
					b -> Mc.setScreen(new SocialScreen(this))).appear(120));
			row += 26;
		}
		if (com.kromvia.client.Launcher.PRESENT) {
			addRenderableWidget(new KButton(x, y + row, BUTTON_W, 22, Component.literal("Wardrobe"),
					b -> Mc.setScreen(new CosmeticsScreen(this))).appear(160));
		} else row -= 26;
		addRenderableWidget(new KButton(x, y + row + 26, BUTTON_W, 22, Component.literal("Options"),
				b -> Mc.setScreen(new OptionsScreen(this, minecraft.options))).appear(200));
		addRenderableWidget(new KButton(x, y + row + 60, BUTTON_W, 22, Component.literal("Quit"), b -> minecraft.stop()).appear(240));
		int my = y + row + 94;
		for (AbstractWidget w : modWide) {
			Mc.place(w, x, my, BUTTON_W);
			addRenderableWidget(w);
			my += 24;
		}
		int mx = x;
		for (AbstractWidget w : modIcons) {
			Mc.place(w, mx, my, w.getWidth());
			addRenderableWidget(w);
			mx += w.getWidth() + 4;
		}

		ServerList list = new ServerList(minecraft);
		list.load();
		serverCount = Math.min(3, list.size());
		int sx = width - SIDE_W - 10;
		for (int i = 0; i < serverCount; i++) {
			ServerData data = list.get(i);
			addRenderableWidget(new KButton(sx, BAR + 26 + i * 24, SIDE_W - 24, 20, Component.literal("▶ " + data.name),
					b -> ConnectScreen.startConnecting(this, minecraft, ServerAddress.parseString(data.ip), data, false, null)));
			boolean asking = data.ip.equals(confirmRemove);
			addRenderableWidget(new KButton(sx + SIDE_W - 20, BAR + 26 + i * 24, 20, 20, Component.literal(asking ? "?" : "✕"), b -> {
				if (data.ip.equals(confirmRemove)) {
					list.remove(data);
					list.save();
					confirmRemove = null;
				} else {
					confirmRemove = data.ip;
				}
				clearWidgets();
				init();
			}, () -> data.ip.equals(confirmRemove)).flat());
		}

		List<String> worlds = recentWorlds(new File(minecraft.gameDirectory, "saves"), 3);
		worldCount = worlds.size();
		for (int i = 0; i < worldCount; i++) {
			String id = worlds.get(i);
			addRenderableWidget(new KButton(sx, worldsTop() + 14 + i * 24, SIDE_W, 20, Component.literal("▶ " + id), b -> openWorld(id)));
		}
	}

	private int worldsTop() {
		return BAR + 12 + (serverCount > 0 ? 14 + serverCount * 24 + 10 : 0);
	}

	private static List<String> recentWorlds(File saves, int max) {
		File[] dirs = saves.listFiles(f -> new File(f, "level.dat").isFile());
		List<String> out = new ArrayList<>();
		if (dirs == null) return out;
		Arrays.sort(dirs, (a, b) -> Long.compare(new File(b, "level.dat").lastModified(), new File(a, "level.dat").lastModified()));
		for (int i = 0; i < Math.min(max, dirs.length); i++) out.add(dirs[i].getName());
		return out;
	}

	private void openWorld(String id) {
		Runnable back = () -> Mc.setScreen(this);
		minecraft.createWorldOpenFlows().openWorld(id, back);
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		drawPanorama(g, delta);
		g.fillGradient(0, height * 2 / 3, width, height, 0x000B0D11, 0xB00B0D11);
		UiStyle.glass(g, 6, 4, width - 12, BAR - 4, (BAR - 4) / 2F, UiStyle.GLASS, UiStyle.GLASS_RIM);
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		super.draw(g, mouseX, mouseY, delta);

		UiStyle.logo(g, 14, 7, 12);
		g.drawString(font, "Kromvia", 30, 9, UiStyle.TEXT, false);
		String name = minecraft.getUser().getName();
		int nw = font.width(name);
		if (Accounts.available() && chipHit(mouseX, mouseY, nw)) UiStyle.round(g, width - nw - 40, 6, width - 8, BAR - 2, (BAR - 8) / 2F, 0x26FFFFFF);
		g.face(PlayerPreview.skin(), width - nw - 34, 7, 12);
		g.drawString(font, name, width - nw - 16, 9, UiStyle.TEXT, false);
		String time = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm"));
		g.drawCenteredString(font, time, width / 2, 9, UiStyle.MUTED);

		if (serverCount > 0) g.drawString(font, "QUICK JOIN", width - SIDE_W - 10, BAR + 12, UiStyle.FRONT, false);
		if (worldCount > 0) g.drawString(font, "RECENT WORLDS", width - SIDE_W - 10, worldsTop(), UiStyle.FRONT, false);

		if (!compact()) {
			int cx = panelX() + PANEL_W / 2;
			int top = menuTop() - 84 + Math.round(net.minecraft.util.Mth.sin(System.currentTimeMillis() / 700F) * 2);
			UiStyle.logo(g, cx - 32, top + 6, 64);
		}

		if (!dragging) spin += delta * 0.6F;
		int ph = Math.min(height / 2, 200);
		int pw = ph / 2;
		int px = PANEL_W + (width - PANEL_W) / 2;
		int py2 = height - 34;
		PlayerPreview.render(g, px - pw, py2 - ph, px + pw, py2, spin, (System.currentTimeMillis() % 1_000_000L) / 50F);
		g.fill(px - pw / 2, py2 + 2, px + pw / 2, py2 + 3, 0x668B5CF6);

		g.drawString(font, "Kromvia 0.1 · Minecraft " + SharedConstants.getCurrentVersion().name(), 8, height - 12, UiStyle.MUTED, false);
		String played = PlayTime.line();
		if (played != null) g.drawString(font, "Played " + played, 8, height - 24, UiStyle.MUTED, false);
		String legal = "Not an official Minecraft product";
		g.drawString(font, legal, width - font.width(legal) - 8, height - 12, 0xFF5B616B, false);
	}

	private boolean chipHit(double x, double y, int nameWidth) {
		return x >= width - nameWidth - 36 && x < width - 2 && y >= 2 && y < BAR - 2;
	}

	@Override
	protected void mouseDown(double x, double y) {
		if (Accounts.available() && chipHit(x, y, font.width(minecraft.getUser().getName()))) {
			Mc.setScreen(new AccountsScreen(this));
			return;
		}
		dragging = x > PANEL_W;
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
	public boolean shouldCloseOnEsc() {
		return false;
	}
}
