package com.kromvia.client;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.module.setting.Setting;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import com.kromvia.client.cosmetic.Cosmetic;
import com.kromvia.client.cosmetic.Wardrobe;
import com.kromvia.client.module.Module;
import net.minecraft.network.chat.Component;
import net.fabricmc.loader.api.FabricLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Config {
	private static final Logger LOG = LoggerFactory.getLogger("kromvia");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("kromvia.json");

	private static final class Data {
		Map<String, Boolean> modules = new TreeMap<>();
		Map<String, Integer> keys = new TreeMap<>();
		Map<String, JsonObject> settings = new TreeMap<>();
		Map<Cosmetic.Slot, String> cosmetics = new TreeMap<>();
		Map<String, Integer> colors = new TreeMap<>();
		Map<String, float[]> hud = new TreeMap<>();
		java.util.Set<String> starred = new java.util.TreeSet<>();
		java.util.List<Integer> swatches = new java.util.ArrayList<>();
	}

	private static final long SAVE_DELAY_MS = 800;
	private static final Map<String, String> LEGACY_IDS = new TreeMap<>();
	private static volatile long dirtyAt;
	private static boolean hooked;

	static {
		LEGACY_IDS.put("screen_colours", "saturation");
	}

	public static final java.util.Set<String> STARRED = new java.util.TreeSet<>();
	public static final java.util.List<Integer> SWATCHES = new java.util.ArrayList<>();

	private Config() {}

	public static void load() {
		if (!Files.isRegularFile(FILE)) return;
		try {
			Data data = GSON.fromJson(new String(Files.readAllBytes(FILE), StandardCharsets.UTF_8), Data.class);
			if (data == null) return;
			for (Module m : KromviaClient.MODULES) {
				String id = stored(data, m);
				if (id == null) continue;
				Boolean on = data.modules == null ? null : data.modules.get(id);
				if (on != null) m.enabled = on;
				Integer key = data.keys == null ? null : data.keys.get(id);
				m.key = key == null ? -1 : key;
				float[] pos = data.hud == null ? null : data.hud.get(id);
				if (pos != null && pos.length == 2) {
					m.hudX = pos[0];
					m.hudY = pos[1];
				}
				JsonObject values = data.settings == null ? null : data.settings.get(id);
				if (values == null) continue;
				for (Setting<?> st : m.settings) {
					JsonElement v = values.get(st.id);
					if (v != null) st.load(v);
				}
			}
			STARRED.clear();
			if (data.starred != null) STARRED.addAll(data.starred);
			SWATCHES.clear();
			if (data.swatches != null) SWATCHES.addAll(data.swatches);
			if (data.cosmetics != null) Wardrobe.EQUIPPED.putAll(data.cosmetics);
			if (data.colors != null) Wardrobe.COLORS.putAll(data.colors);
		} catch (IOException | JsonParseException e) {
			LOG.warn("Could not read {}, using defaults", FILE, e);
		}
	}

	/** The config key `m` reads from, or `null` when its key still holds a renamed module's old entry. */
	private static String stored(Data data, Module m) {
		boolean fresh = data.modules != null && data.modules.containsKey(m.id);
		for (Module other : KromviaClient.MODULES) {
			if (other != m && m.id.equals(LEGACY_IDS.get(other.id)) && !(data.modules != null && data.modules.containsKey(other.id))) return null;
		}
		String old = LEGACY_IDS.get(m.id);
		return old == null || fresh ? m.id : old;
	}

	public static void save() {
		dirtyAt = System.currentTimeMillis();
		if (!hooked) {
			hooked = true;
			Runtime.getRuntime().addShutdownHook(new Thread(Config::flush, "kromvia-config"));
		}
	}

	public static void tick() {
		if (dirtyAt != 0 && System.currentTimeMillis() - dirtyAt >= SAVE_DELAY_MS) flush();
	}

	public static synchronized void flush() {
		if (dirtyAt == 0) return;
		dirtyAt = 0;
		Data data = new Data();
		for (Module m : KromviaClient.MODULES) {
			data.modules.put(m.id, m.enabled);
			if (m.key >= 0) data.keys.put(m.id, m.key);
			if (m.hudX >= 0) data.hud.put(m.id, new float[] {m.hudX, m.hudY});
			if (m.settings.isEmpty()) continue;
			JsonObject values = new JsonObject();
			for (Setting<?> st : m.settings) values.add(st.id, st.save());
			data.settings.put(m.id, values);
		}
		data.starred.addAll(STARRED);
		data.swatches.addAll(SWATCHES);
		data.cosmetics.putAll(Wardrobe.EQUIPPED);
		data.colors.putAll(Wardrobe.COLORS);
		try {
			Files.createDirectories(FILE.getParent());
			Path tmp = FILE.resolveSibling(FILE.getFileName() + ".tmp");
			Files.write(tmp, GSON.toJson(data).getBytes(StandardCharsets.UTF_8));
			Files.move(tmp, FILE, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
		} catch (IOException e) {
			LOG.warn("Could not write {}", FILE, e);
		}
	}

	private static final Path PROFILES = System.getenv("KROMVIA_PROFILES") != null
			? java.nio.file.Paths.get(System.getenv("KROMVIA_PROFILES"))
			: FabricLoader.getInstance().getConfigDir().resolve("kromvia-profiles");

	public static boolean validProfile(String name) {
		return name.matches("[A-Za-z0-9 _-]{1,32}");
	}

	public static String currentServer(net.minecraft.client.Minecraft mc) {
		net.minecraft.client.multiplayer.ServerData s = mc.level == null || mc.isLocalServer() ? null : mc.getCurrentServer();
		return s == null ? null : s.ip.trim().toLowerCase(java.util.Locale.ROOT);
	}

	public static java.util.List<String> profiles() {
		java.util.List<String> out = new java.util.ArrayList<>();
		try (java.util.stream.Stream<Path> files = Files.list(PROFILES)) {
			files.forEach(p -> {
				String n = p.getFileName().toString();
				if (n.endsWith(".json") && !n.startsWith(BEFORE)) out.add(n.substring(0, n.length() - 5));
			});
		} catch (IOException ignored) {
		}
		java.util.Collections.sort(out, String.CASE_INSENSITIVE_ORDER);
		return out;
	}

	public static void saveProfile(String name) {
		if (!validProfile(name)) return;
		save();
		flush();
		try {
			Files.createDirectories(PROFILES);
			Files.copy(FILE, PROFILES.resolve(name + ".json"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
		} catch (IOException e) {
			LOG.warn("Could not save profile {}", name, e);
		}
	}

	public static void loadProfile(String name) {
		if (!validProfile(name)) return;
		dirtyAt = 0;
		try {
			Files.createDirectories(FILE.getParent());
			Files.copy(PROFILES.resolve(name + ".json"), FILE, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
		} catch (IOException e) {
			LOG.warn("Could not load profile {}", name, e);
			return;
		}
		load();
	}

	/** Profile name -> server address it loads on. Not a `.json`, so it is not listed as a profile. */
	private static final Path SERVER_PROFILES = PROFILES.resolve("servers.map");
	/** The setup from before a server's profile was loaded, put back when the player leaves. */
	private static final String BEFORE = "_before-server";
	private static String activeServer;

	public static Map<String, String> serverProfiles() {
		Map<String, String> out = new TreeMap<>();
		try {
			for (String line : Files.readAllLines(SERVER_PROFILES, StandardCharsets.UTF_8)) {
				int tab = line.indexOf('\t');
				if (tab > 0 && validProfile(line.substring(tab + 1))) out.put(line.substring(0, tab), line.substring(tab + 1));
			}
		} catch (IOException ignored) {
		}
		return out;
	}

	/** Loads `profile` whenever the player joins `server`; `null` stops that. */
	public static void bindServer(String server, String profile) {
		Map<String, String> all = serverProfiles();
		if (profile == null) all.remove(server);
		else all.put(server, profile);
		StringBuilder b = new StringBuilder();
		all.forEach((s, p) -> b.append(s).append('\t').append(p).append('\n'));
		try {
			Files.createDirectories(PROFILES);
			Files.write(SERVER_PROFILES, b.toString().getBytes(StandardCharsets.UTF_8));
		} catch (IOException e) {
			LOG.warn("Could not save server profiles", e);
		}
	}

	/** Called every tick with the server the player is on, or `null`. Swaps in that server's profile and back. */
	public static void serverChanged(net.minecraft.client.Minecraft mc, String server) {
		if (java.util.Objects.equals(server, activeServer)) return;
		Map<String, String> bound = serverProfiles();
		if (activeServer != null) {
			String mine = bound.get(activeServer);
			if (mine != null) saveProfile(mine);
			apply(mc, BEFORE);
			deleteProfile(BEFORE);
			activeServer = null;
		}
		String profile = server == null ? null : bound.get(server);
		if (profile == null || !profiles().contains(profile)) return;
		saveProfile(BEFORE);
		apply(mc, profile);
		activeServer = server;
		com.kromvia.client.compat.Mc.actionbar(Component.literal("Profile: " + profile));
	}

	/** Loads a profile and switches off what it turns off, the way the menu does. */
	public static void apply(net.minecraft.client.Minecraft mc, String name) {
		java.util.Set<Module> wasOn = new java.util.HashSet<>();
		for (Module m : KromviaClient.MODULES) if (m.enabled) wasOn.add(m);
		loadProfile(name);
		for (Module m : wasOn) if (!m.enabled) m.disable(mc);
	}

	public static void deleteProfile(String name) {
		if (!validProfile(name)) return;
		try {
			Files.deleteIfExists(PROFILES.resolve(name + ".json"));
		} catch (IOException e) {
			LOG.warn("Could not delete profile {}", name, e);
		}
	}
}
