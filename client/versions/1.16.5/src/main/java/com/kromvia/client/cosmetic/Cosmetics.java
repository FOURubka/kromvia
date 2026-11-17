package com.kromvia.client.cosmetic;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.cosmetic.Cosmetic.Anchor;
import com.kromvia.client.cosmetic.Cosmetic.Animator;
import com.kromvia.client.cosmetic.Cosmetic.Piece;
import com.kromvia.client.cosmetic.Cosmetic.Slot;
import com.mojang.blaze3d.platform.NativeImage;
import com.kromvia.client.compat.PartPose;
import net.minecraft.util.Mth;
import org.apache.logging.log4j.Logger;
import org.apache.logging.log4j.LogManager;

public final class Cosmetics {
	private static final Logger LOG = LogManager.getLogger("kromvia");
	public static final int GOLD = 0xFFFFC83D;
	public static final String KROMVIA_CAPE = "kromvia_cape";
	public static final String[] CAPE_STYLES = {"kromvia", "ember", "frost"};

	public static final class Colour {
		private final String name;
		private final int argb;

		public Colour(String name, int argb) {
			this.name = name;
			this.argb = argb;
		}

		public String name() {
			return name;
		}

		public int argb() {
			return argb;
		}
	}

	public static final List<Colour> PALETTE = java.util.Arrays.asList(
			new Colour("White", 0xFFF2F2F2), new Colour("Black", 0xFF262626), new Colour("Red", 0xFFD93A3A),
			new Colour("Orange", 0xFFF08A24), new Colour("Gold", GOLD), new Colour("Lime", 0xFF7BD93A),
			new Colour("Green", 0xFF2E8B3E), new Colour("Cyan", 0xFF4FE3E8), new Colour("Blue", 0xFF3A6FD9),
			new Colour("Purple", 0xFF8E44D9), new Colour("Pink", 0xFFFF9EC4), new Colour("Brown", 0xFF7A4E2D));

	private static List<Cosmetic> all;
	private static Cosmetic cape;
	private static String style = "kromvia";
	private static final Cosmetic[] STYLED = new Cosmetic[CAPE_STYLES.length];

	private Cosmetics() {}

	public static List<Cosmetic> all() {
		if (all == null) all = load();
		return all;
	}

	public static Cosmetic byId(String id) {
		if (KROMVIA_CAPE.equals(id)) return cape();
		for (Cosmetic c : all()) {
			if (c.id().equals(id)) return c;
		}
		return null;
	}

	public static final String DEV_STYLE = "dev";

	public static boolean devSelf() {
		return Wardrobe.dev() || com.kromvia.client.Accounts.licensed() && "_4rubka_".equalsIgnoreCase(net.minecraft.client.Minecraft.getInstance().getUser().getName());
	}

	public static void prewarm() {}

	public static Cosmetic cape() {
		if (cape == null) cape = styled(style);
		return cape;
	}

	public static String customStyle(String style, String art) {
		return style;
	}

	public static void useCape(String style) {
		Cosmetics.style = style == null ? "kromvia" : style;
		cape = null;
	}

	public static Cosmetic styled(String style) {
		for (int i = 0; i < CAPE_STYLES.length; i++) {
			if (!CAPE_STYLES[i].equals(style)) continue;
			if (STYLED[i] == null) {
				try (InputStream in = Cosmetics.class.getResourceAsStream("/assets/kromvia/capes/" + style + ".png")) {
					STYLED[i] = capeOf(KROMVIA_CAPE + "_" + style, NativeImage.read(in));
				} catch (IOException | NullPointerException e) {
					LOG.warn("Cape style {} missing", style, e);
				}
			}
			return STYLED[i];
		}
		return style == null ? null : styled("kromvia");
	}

	private static Cosmetic capeOf(String id, NativeImage image) {
		Piece p = new Piece(id + "_" + System.nanoTime(), Shapes.cape(image), Anchor.BODY, 0xFFFFFFFF, false, capeSwing());
		return new Cosmetic(KROMVIA_CAPE, "Kromvia Cape", Slot.BACK, 0xFFFFFFFF, java.util.Collections.singletonList(p));
	}

	private static List<Cosmetic> load() {
		List<Cosmetic> list = new ArrayList<>();
		load("/kromvia/cosmetics.json", list);
		load("/kromvia/voxels.json", list);
		return list;
	}

	private static void load(String file, List<Cosmetic> list) {
		try (InputStream in = Cosmetics.class.getResourceAsStream(file)) {
			JsonArray items = new Gson().fromJson(new InputStreamReader(in, StandardCharsets.UTF_8), JsonArray.class);
			for (JsonElement e : items) {
				JsonObject o = e.getAsJsonObject();
				Slot slot;
				try {
					slot = Slot.valueOf(o.get("slot").getAsString().toUpperCase(Locale.ROOT));
				} catch (IllegalArgumentException unknown) {
					continue;
				}
				String id = o.get("id").getAsString();
				List<Piece> pieces = new ArrayList<>();
				JsonArray ps = o.has("pieces") ? o.getAsJsonArray("pieces") : new JsonArray();
				for (JsonElement pe : ps) pieces.add(piece(id + "_" + pieces.size(), pe.getAsJsonObject()));
				list.add(new Cosmetic(id, o.get("name").getAsString(), slot, (int) o.get("color").getAsLong(), java.util.Collections.unmodifiableList(pieces)));
			}
		} catch (IOException | RuntimeException e) {
			LOG.error("Could not read the cosmetics catalog " + file, e);
		}
	}

	private static Piece piece(String name, JsonObject o) {
		Anchor anchor = Anchor.valueOf(o.get("anchor").getAsString().toUpperCase(Locale.ROOT));
		Pattern pattern = Pattern.valueOf(o.get("pattern").getAsString().toUpperCase(Locale.ROOT));
		int color = o.has("color") ? (int) o.get("color").getAsLong() : 0;
		boolean glow = o.has("glow") && o.get("glow").getAsBoolean();
		float[] pose = floats(o.getAsJsonArray("pose"));
		PartPose partPose = pose.length == 6 ? PartPose.offsetAndRotation(pose[0], pose[1], pose[2], pose[3], pose[4], pose[5]) : PartPose.ZERO;
		Animator anim = o.has("anim") ? animator(o.getAsJsonObject("anim")) : null;
		return new Piece(name, Shapes.build(pattern, partPose, floats(o.getAsJsonArray("boxes"))), anchor, color, glow, anim);
	}

	private static float[] floats(JsonArray a) {
		if (a == null) return new float[0];
		float[] out = new float[a.size()];
		for (int i = 0; i < out.length; i++) out[i] = a.get(i).getAsFloat();
		return out;
	}

	private static float f(JsonObject o, String key) {
		return o.has(key) ? o.get(key).getAsFloat() : 0;
	}

	private static Animator animator(JsonObject a) {
		float base = f(a, "base"), speed = f(a, "speed"), amount = f(a, "amount");
		switch (a.get("type").getAsString()) {
			case "bob": return (p, s) -> p.y = base + Mth.sin(s.ageInTicks * speed) * amount;
			case "swing": return (p, s) -> p.xRot = base + Mth.sin(s.ageInTicks * speed) * amount;
						case "hop": return (p, s) -> p.y = base - Math.abs(Mth.sin(s.ageInTicks * speed)) * amount;
			case "wag": return (p, s) -> p.yRot = Mth.sin(s.ageInTicks * speed) * amount;
			case "cape": return capeSwing();
			case "flap": return flap((int) f(a, "side"), speed, f(a, "sweep"));
			default: return null;
		}
	}

	private static Animator capeSwing() {
		return (p, s) -> p.xRot = (6 + s.capeLean / 2 + s.capeFlap) * 0.017453292F + 0.1f;
	}

	private static Animator flap(int side, float speed, float sweep) {
		return (part, state) -> {
			boolean airborne = state.isFallFlying;
			float f = Mth.sin(state.ageInTicks * (airborne ? speed * 4 : speed)) * (airborne ? 0.5f : 0.14f);
			part.yRot = -side * (sweep + f);
			part.zRot = -side * 0.2f;
		};
	}
}
