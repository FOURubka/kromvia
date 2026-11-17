package com.kromvia.client.ui;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.Accounts;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import com.kromvia.client.compat.Mc;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class ModsScreen extends KScreen {
	private static final int W = 340;
	private static final int ROW = 34;
	private static final int ROWS = 6;
	private static final long DEBOUNCE_MS = 450;

	private static final class Hit {
		final String id, title, description, author;
		final long downloads;

		Hit(String id, String title, String description, String author, long downloads) {
			this.id = id;
			this.title = title;
			this.description = description;
			this.author = author;
			this.downloads = downloads;
		}
	}

	private static volatile List<Hit> hits = Collections.emptyList();
	private static volatile String answeredFor;
	private static volatile String error;
	private static volatile int version;
	private static final Map<String, String> STATE = new HashMap<>();
	private static volatile boolean installedAny;

	private final Screen parent;
	private EditBox search;
	private String query = "";
	private String asked;
	private long typedAt;
	private int shown = -1;

	private static final int LIST_ROW = 16;
	private static final int LIST_ROWS = 12;
	private boolean installedTab;
	private int page;
	private List<String[]> mods;

	public ModsScreen(Screen parent) {
		this(parent, false);
	}

	public ModsScreen(Screen parent, boolean installedTab) {
		super(Component.literal("Mods"));
		this.parent = parent;
		this.installedTab = installedTab;
	}

	private static List<String[]> installed() {
		List<String[]> out = new ArrayList<>();
		try {
			for (net.fabricmc.loader.api.ModContainer m : net.fabricmc.loader.api.FabricLoader.getInstance().getAllMods()) {
				net.fabricmc.loader.api.metadata.ModMetadata meta = m.getMetadata();
				String id = meta.getId();
				if (id.equals("minecraft") || id.equals("java") || id.equals("fabricloader") || "builtin".equals(meta.getType())) continue;
				try {
					if (m.getContainingMod().isPresent()) continue;
				} catch (Throwable ignored) {
				}
				out.add(new String[] {meta.getName(), meta.getVersion().getFriendlyString()});
			}
		} catch (Throwable ignored) {
		}
		out.sort((a, b) -> a[0].compareToIgnoreCase(b[0]));
		return out;
	}

	public static void answer(JsonObject o) {
		if (o.has("installed")) {
			String id = o.get("installed").getAsString();
			synchronized (STATE) {
				STATE.put(id, o.has("error") ? "error:" + o.get("error").getAsString() : "done");
			}
			if (!o.has("error")) installedAny = true;
		} else {
			List<Hit> list = new ArrayList<>();
			if (o.has("hits") && o.get("hits").isJsonArray()) {
				for (JsonElement e : o.getAsJsonArray("hits")) {
					JsonObject h = e.getAsJsonObject();
					list.add(new Hit(str(h, "id"), str(h, "title"), str(h, "description"), str(h, "author"), h.has("downloads") ? h.get("downloads").getAsLong() : 0));
				}
			}
			hits = Collections.unmodifiableList(list);
			error = o.has("error") ? o.get("error").getAsString() : null;
			answeredFor = o.has("q") ? o.get("q").getAsString() : "";
		}
		version++;
	}

	private static String str(JsonObject o, String key) {
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
	}

	private static void send(String key, Object value) {
		Consumer<String> out = Accounts.sender;
		if (out == null) return;
		JsonObject m = new JsonObject();
		if (value instanceof String) m.addProperty(key, (String) value);
		else if (value instanceof Boolean) m.addProperty(key, (Boolean) value);
		JsonObject msg = new JsonObject();
		msg.add("mods", m);
		out.accept(msg.toString());
	}

	private int left() {
		return (width - W) / 2;
	}

	private int top() {
		return Math.max(10, height / 2 - (ROWS * ROW + 76) / 2);
	}

	@Override
	protected void init() {
		int x = left(), y = top();
		if (mods == null) mods = installed();
		search = new EditBox(font, x + 12, y + 30, W - 24, 16, Component.literal("Search"));
		search.setMaxLength(80);
		search.setValue(query);
		search.setResponder(q -> {
			query = q;
			typedAt = System.currentTimeMillis();
		});
		if (!installedTab) {
			addRenderableWidget(search);
			setInitialFocus(search);
		}
		if (!installedTab && asked == null) {
			asked = query;
			send("q", query);
		}
		rows();
	}

	private void tabs() {
		int x = left(), y = top();
		addRenderableWidget(new KButton(x + W - 176, y + 5, 80, 18, Component.literal("Installed"), b -> {
			installedTab = true;
			clearWidgets();
			init();
		}, () -> installedTab).flat());
		addRenderableWidget(new KButton(x + W - 92, y + 5, 80, 18, Component.literal("Get more"), b -> {
			installedTab = false;
			clearWidgets();
			init();
		}, () -> !installedTab).flat());
	}

	private void rows() {
		clearWidgets();
		tabs();
		if (installedTab) {
			int pages = Math.max(1, (mods.size() + LIST_ROWS - 1) / LIST_ROWS);
			page = Math.min(page, pages - 1);
			int by = top() + 54 + ROWS * ROW + 6;
			if (pages > 1) {
				addRenderableWidget(new KButton(left(), by, 30, 20, Component.literal("‹"), b -> {
					page = Math.max(0, page - 1);
					rows();
				}).flat());
				addRenderableWidget(new KButton(left() + 34, by, 30, 20, Component.literal("›"), b -> {
					page = Math.min(pages - 1, page + 1);
					rows();
				}).flat());
			}
			addRenderableWidget(new KButton(left() + (pages > 1 ? 70 : 0), by, W - (pages > 1 ? 70 : 0), 20, Component.literal("Back"), b -> onClose()));
			shown = version;
			return;
		}
		addRenderableWidget(search);
		int x = left(), y = top() + 54;
		List<Hit> list = hits;
		for (int i = 0; i < Math.min(ROWS, list.size()); i++) {
			Hit h = list.get(i);
			String state;
			synchronized (STATE) {
				state = STATE.get(h.id);
			}
			String label = state == null ? "Install" : "done".equals(state) ? "Added ✓" : state.startsWith("error:") ? "Retry" : "…";
			KButton b = new KButton(x + W - 74, y + i * ROW + 7, 62, 18, Component.literal(label), btn -> install(h));
			if (state == null || state.startsWith("error:")) b.primary();
			else b.active = false;
			addRenderableWidget(b.appear(i * 30));
		}
		int by = top() + 54 + ROWS * ROW + 6;
		boolean restart = installedAny && launcherHere();
		if (restart) {
			addRenderableWidget(new KButton(x, by, W - 86, 20, Component.literal(where()), b -> restart(minecraft)).primary());
			addRenderableWidget(new KButton(x + W - 80, by, 80, 20, Component.literal("Later"), b -> onClose()));
		} else {
			addRenderableWidget(new KButton(x, by, W, 20, Component.literal("Back"), b -> onClose()));
		}
		shown = version;
	}

	private static boolean launcherHere() {
		return com.kromvia.client.Launcher.PRESENT && Accounts.sender != null;
	}

	private String where() {
		if (minecraft.level == null) return "Restart the game";
		return minecraft.isLocalServer() ? "Restart and reopen this world" : "Restart and rejoin this server";
	}

	private void install(Hit h) {
		synchronized (STATE) {
			STATE.put(h.id, "busy");
		}
		send("install", h.id);
		rows();
	}

	public static void restart(Minecraft mc) {
		restart(mc, null);
	}

	public static void room(JsonObject o) {
		Minecraft mc = Minecraft.getInstance();
		String join = o.has("join") ? o.get("join").getAsString() : null;
		if (join == null) return;
		boolean restart = o.has("restart") && o.get("restart").getAsBoolean();
		mc.execute(() -> {
			if (o.has("error")) Notes.add(new Notes.Note("Could not copy the host's mods", o.get("error").getAsString(), null));
			if (restart) {
				Notes.add(new Notes.Note("Host's mods added", "Restarting into the room…", null));
				restart(mc, join);
			} else {
				if (mc.level != null) Mc.leaveWorld(null);
				SocialScreen.connect(Mc.screen(), join);
			}
		});
	}

	private static void restart(Minecraft mc, String to) {
		Consumer<String> out = Accounts.sender;
		if (out == null) return;
		JsonObject r = new JsonObject();
		String join = to != null ? to : mc.level == null || mc.isLocalServer() || mc.getCurrentServer() == null ? null : mc.getCurrentServer().ip.trim();
		if (join != null) r.addProperty("join", join);
		else if (mc.level != null && mc.isLocalServer()) r.addProperty("world", true);
		JsonObject msg = new JsonObject();
		msg.add("restart", r);
		out.accept(msg.toString());
		if (mc.level != null) Mc.leaveWorld(null);
		mc.stop();
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		UiStyle.dim(g, width, height, 1);
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		if (shown != version) rows();
		if (!installedTab && !query.equals(asked) && System.currentTimeMillis() - typedAt > DEBOUNCE_MS) {
			asked = query;
			send("q", query);
		}
		int x = left(), y = top();
		UiStyle.panel(g, x - 4, y - 4, W + 8, ROWS * ROW + 90);
		g.drawString(font, "Mods", x + 12, y + 10, UiStyle.TEXT, false);
		if (installedTab) {
			g.drawString(font, mods.size() + " in this build", x + 12 + font.width("Mods") + 8, y + 10, UiStyle.MUTED, false);
			int ry = y + 34;
			if (mods.isEmpty()) g.drawString(font, "No mods besides Kromvia. Open Get more to add some.", x + 12, ry + 4, UiStyle.MUTED, false);
			for (int i = page * LIST_ROWS; i < Math.min(mods.size(), (page + 1) * LIST_ROWS); i++) {
				String[] m = mods.get(i);
				int top = ry + (i - page * LIST_ROWS) * LIST_ROW;
				String v = cut(m[1], 90);
				g.drawString(font, cut(m[0], W - 40 - font.width(v)), x + 12, top + 4, UiStyle.TEXT, false);
				g.drawString(font, v, x + W - 12 - font.width(v), top + 4, UiStyle.MUTED, false);
			}
			super.draw(g, mouseX, mouseY, delta);
			return;
		}
		List<Hit> list = hits;
		int ry = y + 54;
		if (!launcherHere()) {
			g.drawString(font, "Start the game from the Kromvia launcher to add mods here.", x + 12, ry + 6, UiStyle.MUTED, false);
		} else if (error != null) {
			g.drawString(font, cut(error, W - 24), x + 12, ry + 6, 0xFFE8A0A0, false);
		} else if (answeredFor == null || !answeredFor.equals(asked)) {
			g.drawString(font, "Searching…", x + 12, ry + 6, UiStyle.MUTED, false);
		} else if (list.isEmpty()) {
			g.drawString(font, "Nothing found for this version.", x + 12, ry + 6, UiStyle.MUTED, false);
		}
		for (int i = 0; i < Math.min(ROWS, list.size()); i++) {
			Hit h = list.get(i);
			int top = ry + i * ROW;
			if (i > 0) g.fill(x + 12, top, x + W - 12, top + 1, 0x14FFFFFF);
			String meta = h.author + " · " + downloads(h.downloads);
			g.drawString(font, cut(h.title, W - 110 - font.width(meta)), x + 12, top + 6, UiStyle.TEXT, false);
			g.drawString(font, meta, x + W - 86 - font.width(meta), top + 6, UiStyle.MUTED, false);
			String state;
			synchronized (STATE) {
				state = STATE.get(h.id);
			}
			String line = state != null && state.startsWith("error:") ? state.substring(6) : h.description;
			g.drawString(font, cut(line, W - 100), x + 12, top + 19, state != null && state.startsWith("error:") ? 0xFFE8A0A0 : UiStyle.MUTED, false);
		}
		super.draw(g, mouseX, mouseY, delta);
		if (installedAny) g.drawCenteredString(font, "New mods load after a restart.", width / 2, Math.min(height - 12, y + ROWS * ROW + 90), UiStyle.MUTED);
	}

	private static String downloads(long n) {
		if (n >= 1_000_000) return String.format(Locale.ROOT, "%.1fM", n / 1e6);
		if (n >= 1_000) return String.format(Locale.ROOT, "%.0fK", n / 1e3);
		return String.valueOf(n);
	}

	private String cut(String s, int w) {
		if (font.width(s) <= w) return s;
		int end = s.length();
		while (end > 0 && font.width(s.substring(0, end) + "…") > w) end--;
		return s.substring(0, end) + "…";
	}

	@Override
	public void onClose() {
		Mc.setScreen(parent);
	}
}
