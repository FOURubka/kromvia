package com.kromvia.client.ui;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.KromviaClient;
import com.kromvia.client.Social;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.module.Module;
import com.kromvia.client.module.ModuleInfo;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class CardScreen extends KScreen {
	private static final int BANNER = 46;
	private static final int HEAD = 34;
	private final Screen parent;
	private final String name;
	private final long asked = System.currentTimeMillis();
	private JsonObject card;
	private int px, py, pw, ph;
	private boolean confirmSetup;

	public CardScreen(Screen parent, String name) {
		super(Component.literal(name));
		this.parent = parent;
		this.name = name;
		Social.askCard(name);
		Social.clearSetupStatus();
	}

	private JsonObject fresh() {
		JsonObject c = Social.card();
		if (c == null || !name.equalsIgnoreCase(str(c, "name"))) return null;
		return c.has("at") && c.get("at").getAsLong() >= asked - 2000 ? c : null;
	}

	@Override
	protected void init() {
		card = fresh();
		pw = Math.min(width - 20, 320);
		ph = Math.min(height - 20, 300);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		int y = py + ph - 28, x = px + 10;
		x = button(x, y, "Back", b -> onClose());
		if (card == null) return;
		String id = str(card, "id");
		if (id != null && !bool(card, "me")) {
			boolean liked = bool(card, "liked");
			x = button(x, y, (liked ? "♥ " : "♡ ") + (card.has("likes") ? card.get("likes").getAsInt() : 0), b -> Social.like(id, name, !liked));
			if (bool(card, "friend")) x = button(x, y, "Message", b -> {
				Social.open(id);
				Mc.setScreen(new SocialScreen(parent));
			});
			else if (bool(card, "requested")) x = button(x, y, "Request sent", b -> {});
			else x = button(x, y, "Add friend", b -> Social.addFriend(name));
		}
		if (bool(card, "hasSetup") && !bool(card, "me")) x = button(x, y, confirmSetup ? "Replace mine?" : "Copy setup", b -> {
			if (!confirmSetup) {
				confirmSetup = true;
				b.setMessage(Component.literal("Replace mine?"));
				return;
			}
			confirmSetup = false;
			b.setMessage(Component.literal("Copy setup"));
			Social.askSetup(name);
		});
		String host = str(card, "playing") != null ? str(card, "playing") : str(card, "server");
		int room = px + pw - 10 - x;
		if (host != null && room >= 40) {
			String label = fit("Join " + host, room - 16);
			addRenderableWidget(new KButton(px + pw - 10 - font.width(label) - 16, y, font.width(label) + 16, 20, Component.literal(label), b -> SocialScreen.joinServer(host)));
		}
	}

	private int button(int x, int y, String label, net.minecraft.client.gui.components.Button.OnPress press) {
		int w = font.width(label) + 16;
		addRenderableWidget(new KButton(x, y, w, 20, Component.literal(label), press));
		return x + w + 4;
	}

	@Override
	public void tick() {
		super.tick();
		JsonObject now = fresh();
		if (now != null && now != card) {
			clearWidgets();
			init();
		}
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		UiStyle.dim(g, width, height, 1);
		UiStyle.panel(g, px, py, pw, ph);
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		if (card == null) {
			JsonObject c = Social.card();
			String error = c != null && name.equalsIgnoreCase(str(c, "name")) && c.has("at") && c.get("at").getAsLong() >= asked - 2000 ? str(c, "error") : null;
			String text = !com.kromvia.client.Launcher.PRESENT ? "Start the game from the Kromvia launcher to see profiles." : error != null ? name + " has no Kromvia profile." : "Loading " + name + "…";
			g.drawCenteredString(font, text, width / 2, py + ph / 2 - 10, UiStyle.MUTED);
			super.draw(g, mouseX, mouseY, delta);
			return;
		}
		int top = color(str(card, "banner"), 0xFF2A1F4D), bottom = color(str(card, "banner2"), top);
		g.enableScissor(px + 1, py + 1, px + pw - 1, py + BANNER);
		g.fillGradient(px, py, px + pw, py + BANNER, top, bottom);
		g.disableScissor();
		int hx = px + 12, hy = py + BANNER - HEAD / 2;
		g.fill(hx - 2, hy - 2, hx + HEAD + 2, hy + HEAD + 2, 0xFF0B0C10);
		Heads.draw(g, "card:" + name, str(card, "head"), hx, hy, HEAD);

		int x = hx + HEAD + 8, y = py + BANNER + 4;
		x = nameText(g, str(card, "name"), x, y);
		if (bool(card, "verified")) x = tag(g, "✔", x + 4, y, UiStyle.FRONT);
		if (bool(card, "dev")) x = tag(g, "DEV", x + 4, y, 0xFFFFD36E);
		String clan = str(card, "clan");
		if (clan != null) tag(g, "[" + clan + "]", x + 4, y, 0xFF7EE0B0);
		String tagline = str(card, "tagline");
		if (tagline != null) g.drawString(font, fit(tagline, px + pw - 12 - (hx + HEAD + 8)), hx + HEAD + 8, y + 11, UiStyle.MUTED, false);
		String status = str(card, "status");
		if (status != null) g.drawString(font, fit(status, pw - 140), px + 12 + HEAD + 8, py + BANNER - 12, 0xFFFFFFFF, true);

		int ly = py + BANNER + HEAD / 2 + 10, lx = px + 12, lw = pw - 24, limit = py + ph - 46;
		g.enableScissor(px, ly - 2, px + pw, limit);
		String playing = str(card, "playing");
		if (playing != null) ly = section(g, "PLAYING NOW", java.util.Collections.singletonList(playing), lx, ly, lw);
		List<String> stats = new ArrayList<>();
		if (card.has("hours") && !card.get("hours").isJsonNull()) stats.add(trim(card.get("hours").getAsDouble()) + " h played");
		if (card.has("launches") && !card.get("launches").isJsonNull()) stats.add(card.get("launches").getAsInt() + " launches");
		stats.add("♥ " + (card.has("likes") ? card.get("likes").getAsInt() : 0));
		if (str(card, "since") != null) stats.add("since " + str(card, "since"));
		ly = section(g, "STATS", java.util.Collections.singletonList(String.join("  ·  ", stats)), lx, ly, lw);
		JsonObject game = card.has("game") && card.get("game").isJsonObject() ? card.getAsJsonObject("game") : null;
		if (game != null) {
			List<String> pvp = new ArrayList<>();
			int kills = num(game, "kills"), deaths = num(game, "deaths");
			pvp.add(kills + " kills");
			pvp.add(deaths + " deaths");
			if (deaths > 0) pvp.add("K/D " + trim(Math.round(kills * 100.0 / deaths) / 100.0));
			if (num(game, "cps") > 0) pvp.add("best " + num(game, "cps") + " CPS");
			List<String> more = new ArrayList<>();
			if (game.has("elytra") && game.get("elytra").getAsDouble() > 0) more.add(trim(game.get("elytra").getAsDouble()) + " km on elytra");
			if (num(game, "totems") > 0) more.add(num(game, "totems") + " totems popped");
			List<String> lines = new ArrayList<>();
			lines.add(String.join("  ·  ", pvp));
			if (!more.isEmpty()) lines.add(String.join("  ·  ", more));
			ly = section(g, "IN GAME", lines, lx, ly, lw);
		}
		String bio = str(card, "bio");
		if (bio != null) {
			List<String> lines = new ArrayList<>();
			for (String part : bio.split("\n")) lines.addAll(UiStyle.wrap(font, part, lw));
			ly = section(g, "ABOUT", lines.subList(0, Math.min(lines.size(), 5)), lx, ly, lw);
		}
		String music = str(card, "music");
		if (music != null) ly = section(g, "MUSIC", java.util.Collections.singletonList("♪ " + music), lx, ly, lw);
		ly = modules(g, lx, ly, lw, mouseX, mouseY);
		ly = chips(g, "BADGES", list(card, "badges"), lx, ly, lw, 0xFFFFD36E);
		ly = chips(g, "WEARING", list(card, "wearing"), lx, ly, lw, UiStyle.TOP);
		List<String> favs = new ArrayList<>();
		for (JsonElement e : arr(card, "favs")) {
			JsonArray p = e.getAsJsonArray();
			favs.add(p.get(0).getAsString() + ": " + p.get(1).getAsString());
		}
		ly = chips(g, "FAVOURITES", favs, lx, ly, lw, UiStyle.TEXT);
		ly = chips(g, "LOOKING FOR", list(card, "chips"), lx, ly, lw, UiStyle.TEXT);
		String server = str(card, "server");
		if (server != null) section(g, "SERVER", java.util.Collections.singletonList(server), lx, ly, lw);
		g.disableScissor();
		String note = Social.setupStatus() != null ? Social.setupStatus() : str(card, "notice");
		if (note != null) g.drawCenteredString(font, fit(note, pw - 20), px + pw / 2, py + ph - 40, UiStyle.MUTED);
		super.draw(g, mouseX, mouseY, delta);
	}

	private int nameText(Gfx g, String text, int x, int y) {
		int a = color(str(card, "nameColor"), UiStyle.TEXT), b = color(str(card, "nameColor2"), a);
		int n = Math.max(1, text.length() - 1);
		for (int i = 0; i < text.length(); i++) {
			String ch = String.valueOf(text.charAt(i));
			g.drawString(font, ch, x, y, lerp(a, b, i / (float) n), false);
			x += font.width(ch);
		}
		return x;
	}

	private int tag(Gfx g, String text, int x, int y, int color) {
		g.drawString(font, text, x, y, color, false);
		return x + font.width(text);
	}

	private int section(Gfx g, String title, List<String> lines, int x, int y, int w) {
		g.drawString(font, title, x, y, UiStyle.FRONT, false);
		y += 11;
		for (String l : lines) {
			g.drawString(font, fit(l, w), x, y, UiStyle.TEXT, false);
			y += 10;
		}
		return y + 6;
	}

	private int chips(Gfx g, String title, List<String> items, int x, int y, int w, int color) {
		if (items.isEmpty()) return y;
		g.drawString(font, title, x, y, UiStyle.FRONT, false);
		y += 11;
		int cx = x;
		for (String item : items) {
			String t = fit(item, w - 10);
			int cw = font.width(t) + 10;
			if (cx + cw > x + w && cx > x) {
				cx = x;
				y += 15;
			}
			UiStyle.round(g, cx, y, cx + cw, y + 13, 6.5F, 0x1EFFFFFF);
			g.drawString(font, t, cx + 5, y + 3, color, false);
			cx += cw + 4;
		}
		return y + 13 + 8;
	}

	private int modules(Gfx g, int x, int y, int w, int mouseX, int mouseY) {
		List<Module> found = new ArrayList<>();
		for (String id : list(card, "modules")) {
			for (Module m : KromviaClient.MODULES) if (m.id.equals(id)) found.add(m);
		}
		if (found.isEmpty()) return y;
		g.drawString(font, "FAVOURITE MODULES", x, y, UiStyle.FRONT, false);
		y += 11;
		int cx = x;
		for (Module m : found) {
			int cw = 16 + 4 + font.width(m.name) + 8;
			if (cx + cw > x + w && cx > x) {
				cx = x;
				y += 19;
			}
			UiStyle.round(g, cx, y, cx + cw, y + 17, 8.5F, 0x1EFFFFFF);
			String icon = ModuleInfo.icon(m);
			if (Icons.has(icon)) Icons.draw(g, icon, cx + 3, y + 1, 15, UiStyle.TEXT);
			g.drawString(font, m.name, cx + 21, y + 5, UiStyle.TEXT, false);
			cx += cw + 4;
		}
		return y + 17 + 8;
	}

	private String fit(String s, int w) {
		if (font.width(s) <= w) return s;
		while (s.length() > 1 && font.width(s + "…") > w) s = s.substring(0, s.length() - 1);
		return s + "…";
	}

	private static String trim(double v) {
		return v == Math.floor(v) ? String.valueOf((long) v) : String.valueOf(Math.round(v * 10) / 10.0);
	}

	private static int lerp(int a, int b, float t) {
		int r = Math.round((a >> 16 & 0xFF) + ((b >> 16 & 0xFF) - (a >> 16 & 0xFF)) * t);
		int gr = Math.round((a >> 8 & 0xFF) + ((b >> 8 & 0xFF) - (a >> 8 & 0xFF)) * t);
		int bl = Math.round((a & 0xFF) + ((b & 0xFF) - (a & 0xFF)) * t);
		return 0xFF000000 | r << 16 | gr << 8 | bl;
	}

	private static int color(String hex, int fallback) {
		if (hex == null || !hex.matches("#[0-9a-fA-F]{6}")) return fallback;
		return 0xFF000000 | Integer.parseInt(hex.substring(1), 16);
	}

	private static String str(JsonObject o, String key) {
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : null;
	}

	private static int num(JsonObject o, String key) {
		return o.has(key) && o.get(key).isJsonPrimitive() ? o.get(key).getAsInt() : 0;
	}

	private static boolean bool(JsonObject o, String key) {
		return o.has(key) && o.get(key).isJsonPrimitive() && o.get(key).getAsBoolean();
	}

	private static JsonArray arr(JsonObject o, String key) {
		return o.has(key) && o.get(key).isJsonArray() ? o.getAsJsonArray(key) : new JsonArray();
	}

	private static List<String> list(JsonObject o, String key) {
		List<String> out = new ArrayList<>();
		for (JsonElement e : arr(o, key)) if (e.isJsonPrimitive()) out.add(e.getAsString());
		return out;
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
