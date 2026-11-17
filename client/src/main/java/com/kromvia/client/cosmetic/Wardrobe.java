package com.kromvia.client.cosmetic;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.cosmetic.Cosmetic.Slot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Wardrobe {
	private static final Logger LOG = LoggerFactory.getLogger("kromvia");
	private static final Logger PRESENCE = LoggerFactory.getLogger("kromvia-presence");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = path("KROMVIA_WARDROBE");

	public static final Map<Slot, String> EQUIPPED = new EnumMap<>(Slot.class);
	public static final Map<String, Integer> COLORS = new HashMap<>();
	private static boolean dev;
	public static final Map<String, String> MODELS = new LinkedHashMap<>();
	public static final int RAINBOW = 0x00FFFFFF;

	private Wardrobe() {}

	private static Path path(String env) {
		String v = System.getenv(env);
		return v == null || v.isEmpty() ? null : Paths.get(v);
	}

	public static Cosmetic equipped(Slot slot) {
		String id = EQUIPPED.get(slot);
		return id == null ? null : Cosmetics.byId(id);
	}

	public static void toggle(Cosmetic c) {
		if (c.id().equals(EQUIPPED.get(c.slot()))) EQUIPPED.remove(c.slot());
		else {
			EQUIPPED.put(c.slot(), c.id());
			MODELS.remove(key(c.slot()));
		}
	}

	public static List<String> models() {
		return new ArrayList<>(MODELS.values());
	}

	public static boolean tintable(Cosmetic c) {
		for (Cosmetic.Piece p : c.pieces()) {
			if (p.color == 0) return true;
		}
		return false;
	}

	public static int color(Cosmetic c) {
		int stored = COLORS.getOrDefault(c.id(), c.defaultColor());
		return stored == RAINBOW ? rainbow() : stored;
	}

	public static boolean picked(Cosmetic c, int color) {
		return COLORS.getOrDefault(c.id(), c.defaultColor()) == color;
	}

	public static int rainbow() {
		return 0xFF000000 | net.minecraft.util.Mth.hsvToRgb((System.currentTimeMillis() % 6000) / 6000F, 0.7F, 1F);
	}

	private static String key(Slot s) {
		return s.name().toLowerCase(Locale.ROOT);
	}

	private static JsonObject read() {
		try {
			JsonObject o = GSON.fromJson(new String(Files.readAllBytes(FILE), StandardCharsets.UTF_8), JsonObject.class);
			return o == null ? new JsonObject() : o;
		} catch (IOException | RuntimeException e) {
			return new JsonObject();
		}
	}

	private static String str(JsonObject o, String key) {
		JsonElement e = o.get(key);
		return e != null && e.isJsonPrimitive() ? e.getAsString() : null;
	}

	public static boolean dev() {
		return dev;
	}

	public static boolean loadShared() {
		if (FILE == null || !Files.isRegularFile(FILE)) return false;
		JsonObject o = read();
		EQUIPPED.clear();
		MODELS.clear();
		COLORS.clear();
		JsonObject equipped = o.has("equipped") && o.get("equipped").isJsonObject() ? o.getAsJsonObject("equipped") : new JsonObject();
		for (Map.Entry<String, JsonElement> e : equipped.entrySet()) {
			if (!e.getValue().isJsonPrimitive()) continue;
			String id = e.getValue().getAsString();
			Cosmetic c = Cosmetics.byId(id);
			if (c != null) EQUIPPED.put(c.slot(), id);
			else MODELS.put(e.getKey(), id);
		}
		if (o.has("colors") && o.get("colors").isJsonObject()) {
			for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("colors").entrySet()) {
				if (e.getValue().isJsonPrimitive()) COLORS.put(e.getKey(), (int) e.getValue().getAsLong());
			}
		}
		Cosmetics.useCape(Cosmetics.customStyle(str(o, "style"), str(o, "art")));
		dev = o.has("dev") && o.get("dev").isJsonPrimitive() && o.get("dev").getAsBoolean();
		if ("cape".equals(str(o, "back")) && !EQUIPPED.containsKey(Slot.BACK) && !MODELS.containsKey("back")) {
			EQUIPPED.put(Slot.BACK, Cosmetics.KROMVIA_CAPE);
		}
		return true;
	}

	public static void saveShared() {
		if (FILE == null) return;
		JsonObject o = read();
		JsonObject equipped = new JsonObject();
		for (Map.Entry<String, String> e : MODELS.entrySet()) equipped.addProperty(e.getKey(), e.getValue());
		boolean cape = false;
		for (Map.Entry<Slot, String> e : EQUIPPED.entrySet()) {
			if (Cosmetics.KROMVIA_CAPE.equals(e.getValue())) cape = true;
			else equipped.addProperty(key(e.getKey()), e.getValue());
		}
		o.add("equipped", equipped);
		JsonObject colors = new JsonObject();
		for (Map.Entry<String, Integer> e : COLORS.entrySet()) colors.addProperty(e.getKey(), e.getValue() & 0xFFFFFFFFL);
		o.add("colors", colors);
		String back = str(o, "back");
		if (cape) o.addProperty("back", "cape");
		else if ("cape".equals(back) && !equipped.has("back")) o.addProperty("back", "none");
		try {
			Path tmp = FILE.resolveSibling(FILE.getFileName() + ".tmp");
			Files.write(tmp, GSON.toJson(o).getBytes(StandardCharsets.UTF_8));
			Files.move(tmp, FILE, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
			PRESENCE.info("{\"wardrobe\":true}");
		} catch (IOException e) {
			LOG.warn("Could not write {}", FILE, e);
		}
	}
}
