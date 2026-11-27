package com.kromvia.client.fx;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.cosmetic.Cosmetics;
import com.kromvia.client.cosmetic.CosmeticsLayer;
import com.kromvia.client.module.Module;
import com.kromvia.client.module.setting.BoolSetting;
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

	private record Seen(List<String> models, String cape, boolean dev, String clanId, String clanTag, int[] colors, String font, long at) {}

	final BoolSetting mark = add(new BoolSetting("mark", "Kromvia mark", true));
	final BoolSetting clan = add(new BoolSetting("clan", "Clan tag", true));
	final BoolSetting mates = add(new BoolSetting("mates", "Clanmates in green", true));
	final BoolSetting colors = add(new BoolSetting("colors", "Profile name colours", true));
	final BoolSetting fonts = add(new BoolSetting("fonts", "Profile name fonts", true));
	final BoolSetting tab = add(new BoolSetting("tab", "Also in the tab list", true));
	final BoolSetting stats = add(new BoolSetting("share_stats", "Share game stats (kills, CPS, elytra)", false));
	final BoolSetting share = add(new BoolSetting("share_setup", "Let others copy my setup", true));

	private final Map<String, Seen> seen = new ConcurrentHashMap<>();
	private String reported;
	private String host;
	private List<String> asked;
	private long askedAt;
	private int ticks, shareTicks;

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
		com.kromvia.client.GameStats.share = stats.on();
		if (++shareTicks % 1200 == 20) com.kromvia.client.Social.shareSetup(share.on() ? com.kromvia.client.Config.exportSetup() : null);
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
			JsonObject cl = worn != null && worn.isJsonObject() && worn.getAsJsonObject().get("clan") instanceof JsonObject o ? o : null;
			String clanId = cl != null && cl.get("id") != null && cl.get("id").isJsonPrimitive() ? cl.get("id").getAsString() : null;
			String clanTag = cl != null && cl.get("tag") != null && cl.get("tag").isJsonPrimitive() ? cl.get("tag").getAsString() : null;
			JsonObject nm = worn != null && worn.isJsonObject() && worn.getAsJsonObject().get("name") instanceof JsonObject o ? o : null;
			int[] colors = nm == null || text(nm, "a") == null && text(nm, "b") == null ? null : new int[] {com.kromvia.client.Social.rgb(text(nm, "a")), com.kromvia.client.Social.rgb(text(nm, "b"))};
			String font = nm == null ? null : fontId(text(nm, "font"));
			self.seen.put(name, new Seen(worn == null ? null : models(worn), cape, dev, clanId, clanTag, colors, font, at));
		}
	}

	private static String text(JsonObject o, String key) {
		return o.get(key) != null && o.get(key).isJsonPrimitive() ? o.get(key).getAsString() : null;
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
		return decorate(nick, name, false);
	}

	public static Component badgedTab(String nick, Component name) {
		return decorate(nick, name, true);
	}

	private static final java.util.Set<String> FONTS = new java.util.HashSet<>(java.util.Arrays.asList("display", "mono", "pixel", "arcade", "comic", "script", "tech", "retro", "spooky", "slab", "heavy", "round", "hand"));

	static String fontId(String id) {
		return id != null && FONTS.contains(id) ? id : null;
	}

	private static Component painted(String nick, int[] c) {
		int a = c[0] >= 0 ? c[0] : c[1], b = c[1] >= 0 ? c[1] : a;
		MutableComponent out = Component.literal("");
		int n = Math.max(1, nick.length() - 1);
		for (int i = 0; i < nick.length(); i++) {
			float t = i / (float) n;
			int rgb = Math.round((a >> 16 & 0xFF) + ((b >> 16 & 0xFF) - (a >> 16 & 0xFF)) * t) << 16 | Math.round((a >> 8 & 0xFF) + ((b >> 8 & 0xFF) - (a >> 8 & 0xFF)) * t) << 8 | Math.round((a & 0xFF) + ((b & 0xFF) - (a & 0xFF)) * t);
			out.append(Component.literal(String.valueOf(nick.charAt(i))).withStyle(st -> st.withColor(net.minecraft.network.chat.TextColor.fromRgb(rgb))));
		}
		return out;
	}

	private static Component decorate(String nick, Component name, boolean inTab) {
		Players p = Fx.PLAYERS;
		if (name == null || !p.enabled || inTab && !p.tab.on()) return name;
		boolean self = nick.equalsIgnoreCase(Minecraft.getInstance().getUser().getName());
		Seen s = p.seen.get(nick.toLowerCase(Locale.ROOT));
		if (!self && (s == null || s.models == null)) return name;
		String clanId = self ? com.kromvia.client.Social.clanId() : s.clanId;
		String clanTag = self ? com.kromvia.client.Social.clanTag() : s.clanTag;
		MutableComponent out = Component.literal("");
		if (p.mark.on()) out.append(Badge.glyph(Badge.KROMVIA)).append(" ");
		if (p.clan.on() && clanTag != null) {
			boolean mate = !self && clanId != null && clanId.equals(com.kromvia.client.Social.clanId());
			int colour = p.mates.on() && mate ? 0x7EE0B0 : 0xC9B5FF;
			out.append(Component.literal("[" + clanTag + "]").withStyle(st -> st.withColor(net.minecraft.network.chat.TextColor.fromRgb(colour)))).append(" ");
		}
		int[] colors = self ? com.kromvia.client.Social.nameColors() : s.colors;
		String font = self ? fontId(com.kromvia.client.Social.nameFont()) : s.font;
		boolean plain = name.getString().equals(nick);
		Component nickPart = p.colors.on() && colors != null && plain ? painted(nick, colors) : name;
		if (p.fonts.on() && font != null && plain) nickPart = nickPart.copy().withStyle(Badge.nameFont(font));
		out.append(nickPart);
		boolean dev = self ? Cosmetics.devSelf() : s.dev;
		if (dev) out.append(" ").append(Badge.glyph(Badge.CHECK)).append(" ").append(Badge.glyph(Badge.DEV));
		return out;
	}
}
