package com.kromvia.client.fx;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.Binds;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.module.Module;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ColorSetting;
import com.mojang.blaze3d.platform.InputConstants;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.Items;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Media extends Module {
	private static final Logger PRESENCE = LoggerFactory.getLogger("kromvia-presence");
	private static final int ART = 32, W = 150, H = ART + 6;

	record Source(String id, String name, boolean playing) {}

	record Track(String title, String artist, boolean playing, long position, long length, String art, long at,
			String album, String player, String playerId, Boolean shuffle, String repeat, List<Source> players) {
		long now() {
			long pos = position + (playing ? System.currentTimeMillis() - at : 0);
			return length > 0 ? Math.min(length, pos) : pos;
		}

		Track with(boolean playing, long position, Boolean shuffle, String repeat) {
			return new Track(title, artist, playing, position, length, art, System.currentTimeMillis(), album, player, playerId, shuffle, repeat, players);
		}
	}

	private static final KeyMapping MENU = Binds.add("Music menu", InputConstants.KEY_M);
	private static final KeyMapping[] CONTROLS = {Binds.add("Previous track", InputConstants.KEY_NUMPAD4),
			Binds.add("Play / pause", InputConstants.KEY_NUMPAD5), Binds.add("Next track", InputConstants.KEY_NUMPAD6)};

	private final BoolSetting cover = add(new BoolSetting("cover", "Cover art", true));
	private final BoolSetting bar = add(new BoolSetting("bar", "Progress bar", true));
	private final BoolSetting keys = add(new BoolSetting("keys", "Numpad 4 / 5 / 6: previous, pause, next", true));
	private final ColorSetting accent = add(new ColorSetting("accent", "Bar colour", 0xFF8B5CF6));
	private boolean menuHeld;

	volatile Track track;
	final Cover art = new Cover();
	private final boolean[] held = new boolean[3];

	Media() {
		super("music", "Music", Category.HUD, Corner.TOP_RIGHT, false);
		icon(Items.MUSIC_DISC_CAT);
	}

	static final Media INSTANCE = new Media();

	static Track current() {
		return INSTANCE.enabled || Lyrics.INSTANCE.enabled ? INSTANCE.track : null;
	}

	private static String text(JsonObject m, String key) {
		JsonElement e = m.get(key);
		return e == null || e.isJsonNull() ? null : e.getAsString();
	}

	static void set(JsonObject m) {
		if (m == null) {
			INSTANCE.track = null;
			return;
		}
		List<Source> players = new ArrayList<>();
		if (m.has("players") && m.get("players").isJsonArray()) {
			for (JsonElement e : m.getAsJsonArray("players")) {
				JsonObject p = e.getAsJsonObject();
				players.add(new Source(text(p, "id"), text(p, "name"), p.has("playing") && p.get("playing").getAsBoolean()));
			}
		}
		JsonElement shuffle = m.get("shuffle");
		INSTANCE.track = new Track(
				m.get("title").getAsString(),
				m.get("artist").getAsString(),
				m.get("playing").getAsBoolean(),
				m.get("position").getAsLong(),
				m.get("length").getAsLong(),
				text(m, "art"),
				m.has("at") ? m.get("at").getAsLong() : System.currentTimeMillis(),
				text(m, "album"),
				text(m, "player"),
				text(m, "playerId"),
				shuffle == null || shuffle.isJsonNull() ? null : shuffle.getAsBoolean(),
				text(m, "repeat"),
				players);
	}

	static void send(String action, Object value) {
		JsonObject o = new JsonObject();
		o.addProperty("media", action);
		if (value instanceof Number n) o.addProperty("value", n);
		else if (value instanceof Boolean b) o.addProperty("value", b);
		else if (value != null) o.addProperty("value", value.toString());
		PRESENCE.info(o.toString());
	}

	static void local(Track t) {
		INSTANCE.track = t;
	}

	@Override
	public void tick(Minecraft mc) {
		boolean open = Mc.screen() == null && Binds.down(MENU);
		if (open && !menuHeld) Mc.setScreen(new MusicScreen());
		menuHeld = open;
		if (!keys.on() || Mc.screen() != null) return;
		String[] actions = {"previous", "play_pause", "next"};
		for (int i = 0; i < 3; i++) {
			boolean down = Binds.down(CONTROLS[i]);
			if (down && !held[i]) PRESENCE.info("{\"media\":\"" + actions[i] + "\"}");
			held[i] = down;
		}
	}

	@Override
	public boolean click(Minecraft mc, double x, double y) {
		Track t = track;
		if (t != null && cover.on() && x >= 3 && x < 3 + ART && y >= 3 && y < 3 + ART) {
			local(t.with(!t.playing, t.now(), t.shuffle, t.repeat));
			send("play_pause", null);
			return true;
		}
		if (t != null && bar.on() && t.length > 0 && y >= H - 11) {
			int bx = barX(mc, t);
			if (x >= bx) {
				long to = (long) (Math.min(1, (x - bx) / (W - 3 - bx)) * t.length);
				local(t.with(t.playing, to, t.shuffle, t.repeat));
				send("seek", to);
				return true;
			}
		}
		Mc.setScreen(new MusicScreen());
		return true;
	}

	private int barX(Minecraft mc, Track t) {
		int tx = 3 + (cover.on() ? ART + 4 : 0);
		return tx + mc.font.width(time(t.now())) + 3;
	}

	@Override
	public boolean visible(Minecraft mc) {
		return track != null;
	}

	@Override
	public int width(Minecraft mc) {
		return W;
	}

	@Override
	public int height(Minecraft mc) {
		return H;
	}

	private static String fit(Minecraft mc, String s, int w) {
		if (mc.font.width(s) <= w) return s;
		while (!s.isEmpty() && mc.font.width(s + "…") > w) s = s.substring(0, s.length() - 1);
		return s + "…";
	}

	private static String time(long ms) {
		long s = ms / 1000;
		return s / 60 + ":" + (s % 60 < 10 ? "0" : "") + s % 60;
	}

	@Override
	public void render(Gfx g, Minecraft mc, int x, int y) {
		Track t = track;
		if (t == null) return;
		g.fill(x, y, x + W, y + H, 0x90000000);
		int tx = x + 3;
		if (cover.on()) {
			int px = Cover.pixels(mc, ART);
			Identifier id = art.get(mc, t.art, px);
			if (id != null) g.blit(id, x + 3, y + 3, 0, 0, ART, ART, px, px, px, px);
			else g.fill(x + 3, y + 3, x + 3 + ART, y + 3 + ART, 0xFF1F1F23);
			if (Mc.screen() instanceof net.minecraft.client.gui.screens.ChatScreen) {
				g.fill(x + 3, y + 3, x + 3 + ART, y + 3 + ART, 0x70000000);
				com.kromvia.client.ui.Icons.draw(g, t.playing ? "pause" : "play", x + 3 + ART / 2 - 8, y + 3 + ART / 2 - 8, 16, 0xFFFFFFFF);
			}
			tx += ART + 4;
		}
		int tw = x + W - 3 - tx;
		g.drawString(mc.font, fit(mc, (t.playing ? "" : "|| ") + t.title, tw), tx, y + 4, 0xFFFFFFFF, true);
		g.drawString(mc.font, fit(mc, t.artist, tw), tx, y + 14, 0xFFAAAAAA, true);
		if (bar.on() && t.length > 0) {
			long pos = Math.min(t.length, t.position + (t.playing ? System.currentTimeMillis() - t.at : 0));
			String left = time(pos);
			g.drawString(mc.font, left, tx, y + H - 11, 0xFF888888, false);
			int bx = tx + mc.font.width(left) + 3, bw = x + W - 3 - bx, by = y + H - 7;
			g.fill(bx, by, bx + bw, by + 2, 0xFF2C2C31);
			g.fill(bx, by, bx + (int) (bw * pos / t.length), by + 2, accent.argb());
		}
	}
}
