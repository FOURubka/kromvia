package com.kromvia.client.fx;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.cosmetic.Cosmetics;
import com.kromvia.client.cosmetic.CosmeticsLayer;
import com.kromvia.client.module.Module;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Items;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Players extends Module {
	private static final Logger PRESENCE = LoggerFactory.getLogger("kromvia-presence");
		private static final int LOOKUP_TICKS = 40;
	private static final long RECHECK_MS = 60_000;
	private static final int BATCH = 100;
	private static final long ANSWER_MS = 10_000;

	private record Seen(List<String> models, String cape, boolean dev, long at) {}

	private final Map<String, Seen> seen = new ConcurrentHashMap<>();
	private String reported;
	private String host;
	private List<String> asked;
	private long askedAt;
	private int ticks;

	Players() {
		super("kromvia_players", "Kromvia Players", Category.UTILITY, Corner.TOP_LEFT, com.kromvia.client.Launcher.PRESENT);
		icon(Items.AMETHYST_SHARD);
		CosmeticsLayer.othersBack = id -> {
			Minecraft mc = Minecraft.getInstance();
			return mc.level != null && mc.level.getEntity(id) instanceof Player p ? Cosmetics.styled(cape(p.getGameProfile().name())) : null;
		};
	}

	@Override
	public boolean hud() {
		return false;
	}

	static String normHost(String raw) {
		return raw.trim().toLowerCase(Locale.ROOT).replaceFirst(":25565$", "").replaceFirst("\\.$", "");
	}

	@Override
	public void tick(Minecraft mc) {
		ServerData server = mc.level != null && !mc.isLocalServer() ? mc.getCurrentServer() : null;
		String nick = mc.getUser().getName();
		String now = server == null ? null : normHost(server.ip) + " " + nick;
		if (!Objects.equals(now, reported)) {
			report(server == null ? null : normHost(server.ip), nick);
			reported = now;
			host = server == null ? null : normHost(server.ip);
			seen.clear();
			asked = null;
		}
		if (host != null && mc.getConnection() != null && ++ticks % LOOKUP_TICKS == 0) lookup(mc, nick);
	}

	@Override
	public void disable(Minecraft mc) {
		if (reported != null) report(null, null);
		reported = null;
		host = null;
		seen.clear();
	}

	private static void report(String host, String nick) {
		JsonObject o = new JsonObject();
		if (host != null) {
			o.addProperty("host", host);
			o.addProperty("nick", nick);
		}
		PRESENCE.info(o.toString());
	}

	private void lookup(Minecraft mc, String self) {
		long now = System.currentTimeMillis();
		if (asked != null && now - askedAt < ANSWER_MS) return;
		List<String> names = new ArrayList<>();
		for (PlayerInfo info : mc.getConnection().getOnlinePlayers()) {
			String name = info.getProfile().name().toLowerCase(Locale.ROOT);
			Seen s = seen.get(name);
			if (name.equals(self.toLowerCase(Locale.ROOT)) || s != null && now - s.at < RECHECK_MS) continue;
			names.add(name);
			if (names.size() == BATCH) break;
		}
		if (names.isEmpty()) return;
		asked = names;
		askedAt = now;
		JsonObject o = new JsonObject();
		JsonArray a = new JsonArray();
		names.forEach(a::add);
		o.add("lookup", a);
		PRESENCE.info(o.toString());
	}

	static void answer(String host, JsonObject found) {
		Players self = Fx.PLAYERS;
		List<String> names = self.asked;
		self.asked = null;
		if (names == null || host == null || !host.equals(self.host)) return;
		long at = System.currentTimeMillis();
		for (String name : names) {
			JsonElement worn = found.get(name);
			JsonElement c = worn != null && worn.isJsonObject() ? worn.getAsJsonObject().get("cape") : null;
			JsonElement st = worn != null && worn.isJsonObject() ? worn.getAsJsonObject().get("style") : null;
			JsonElement d = worn != null && worn.isJsonObject() ? worn.getAsJsonObject().get("dev") : null;
			boolean dev = d != null && d.isJsonPrimitive() && d.getAsBoolean();
			JsonElement art = worn != null && worn.isJsonObject() ? worn.getAsJsonObject().get("art") : null;
			String style = st != null && st.isJsonPrimitive() ? Cosmetics.customStyle(st.getAsString(), art != null && art.isJsonPrimitive() ? art.getAsString() : null) : "kromvia";
			String cape = c != null && c.isJsonPrimitive() && c.getAsBoolean() ? dev ? Cosmetics.DEV_STYLE : style : null;
			if (dev) Cosmetics.styled(Cosmetics.DEV_STYLE);
			self.seen.put(name, new Seen(worn == null ? null : models(worn), cape, dev, at));
		}
	}

	private static List<String> models(JsonElement worn) {
		List<String> out = new ArrayList<>();
		if (worn.isJsonObject() && worn.getAsJsonObject().get("models") instanceof JsonArray a) {
			for (JsonElement m : a) {
				if (m.isJsonPrimitive()) out.add(m.getAsString());
			}
		}
		return out;
	}

	static List<String> worn(String nick) {
		if (!Fx.PLAYERS.enabled) return null;
		Seen s = Fx.PLAYERS.seen.get(nick.toLowerCase(Locale.ROOT));
		return s == null ? null : s.models;
	}

	static String cape(String nick) {
		if (!Fx.PLAYERS.enabled) return null;
		Seen s = Fx.PLAYERS.seen.get(nick.toLowerCase(Locale.ROOT));
		return s == null ? null : s.cape;
	}

	public static Component badged(String nick, Component name) {
		boolean self = Fx.PLAYERS.enabled && nick.equalsIgnoreCase(Minecraft.getInstance().getUser().getName());
		if (name == null || !self && worn(nick) == null) return name;
		MutableComponent out = Component.literal("").append(Badge.glyph(Badge.KROMVIA)).append(" ").append(name);
		Seen s = Fx.PLAYERS.seen.get(nick.toLowerCase(Locale.ROOT));
		if (self ? Cosmetics.devSelf() : s != null && s.dev) out.append(" ").append(Badge.glyph(Badge.CHECK)).append(" ").append(Badge.glyph(Badge.DEV));
		return out;
	}
}
