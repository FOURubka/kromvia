package com.kromvia.client.cosmetic;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.Accounts;
import com.kromvia.client.cosmetic.Cosmetic.Anchor;
import com.kromvia.client.cosmetic.Cosmetic.Animator;
import com.kromvia.client.cosmetic.Cosmetic.Piece;
import com.kromvia.client.cosmetic.Cosmetic.Slot;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.util.Mth;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Cosmetics {
	private static final Logger LOG = LoggerFactory.getLogger("kromvia");
	public static final int GOLD = 0xFFFFC83D;
	public static final String KROMVIA_CAPE = "kromvia_cape";
	public static final String[] CAPE_STYLES = {"kromvia", "ember", "frost"};
	public static final String DEV_STYLE = "dev";
	private static final String DEV_NICK = "_4rubka_";

	public record Colour(String name, int argb) {}

	public static final List<Colour> PALETTE = List.of(
			new Colour("White", 0xFFF2F2F2), new Colour("Black", 0xFF262626), new Colour("Red", 0xFFD93A3A),
			new Colour("Orange", 0xFFF08A24), new Colour("Gold", GOLD), new Colour("Lime", 0xFF7BD93A),
			new Colour("Green", 0xFF2E8B3E), new Colour("Cyan", 0xFF4FE3E8), new Colour("Blue", 0xFF3A6FD9),
			new Colour("Purple", 0xFF8E44D9), new Colour("Pink", 0xFFFF9EC4), new Colour("Brown", 0xFF7A4E2D));

	private static List<Cosmetic> all;
	private static Cosmetic cape;
	private static String style = "kromvia";
	private static final Cosmetic[] STYLED = new Cosmetic[CAPE_STYLES.length];
	private static Cosmetic dev;

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

	public static boolean devSelf() {
		return Wardrobe.dev() || Accounts.licensed() && DEV_NICK.equalsIgnoreCase(Minecraft.getInstance().getUser().getName());
	}

	public static Cosmetic cape() {
		if (devSelf()) return dev();
		if (cape == null) cape = styled(style);
		return cape;
	}

	public static void useCape(String style) {
		Cosmetics.style = style == null || DEV_STYLE.equals(style) ? "kromvia" : style;
		cape = null;
	}

	public static final String CUSTOM = "custom:";
	private static final int MAX_CUSTOM = 64;
	private static final Map<String, Cosmetic> CUSTOMS = new java.util.LinkedHashMap<>(16, 0.75F, true) {
		@Override
		protected boolean removeEldestEntry(Map.Entry<String, Cosmetic> e) {
			return size() > MAX_CUSTOM;
		}
	};

	public static String customStyle(String style, String art) {
		return "custom".equals(style) && CapeArt.decode(art) != null ? CUSTOM + art : style;
	}

	public static Cosmetic styled(String style) {
		if (DEV_STYLE.equals(style)) return dev();
		if (style != null && style.startsWith(CUSTOM)) {
			String art = style.substring(CUSTOM.length());
			synchronized (CUSTOMS) {
				Cosmetic c = CUSTOMS.get(art);
				if (c == null) {
					Piece p = new Piece(KROMVIA_CAPE + "_custom_" + Integer.toHexString(art.hashCode()), Shapes.cape(CapeArt.FRAMES, () -> CapeArt.custom(art)), Anchor.BODY, 0xFFFFFFFF, false, capeSwing());
					c = new Cosmetic(KROMVIA_CAPE, "Own Cape", Slot.BACK, 0xFFFFFFFF, List.of(p));
					CUSTOMS.put(art, c);
				}
				return c;
			}
		}
		for (int i = 0; i < CAPE_STYLES.length; i++) {
			if (!CAPE_STYLES[i].equals(style)) continue;
			if (STYLED[i] == null) STYLED[i] = capeOf(KROMVIA_CAPE + "_" + style, style);
			return STYLED[i];
		}
		return style == null ? null : styled("kromvia");
	}

	private static Cosmetic capeOf(String id, String style) {
		Piece p = new Piece(id, Shapes.cape(CapeArt.FRAMES, () -> CapeArt.frames(style)), Anchor.BODY, 0xFFFFFFFF, false, capeSwing());
		return new Cosmetic(KROMVIA_CAPE, "Kromvia Cape", Slot.BACK, 0xFFFFFFFF, List.of(p));
	}

	public static void prewarm() {
		if (devSelf()) dev();
	}

	private static synchronized Cosmetic dev() {
		if (dev == null) {
			CompletableFuture<NativeImage[]> art = CompletableFuture.supplyAsync(DevCape::frames);
			Piece p = new Piece(KROMVIA_CAPE + "_dev", Shapes.cape(DevCape.FRAMES, art::join), Anchor.BODY, 0xFFFFFFFF, false, capeSwing());
			dev = new Cosmetic(KROMVIA_CAPE, "Developer Cape", Slot.BACK, 0xFFFFFFFF, List.of(p));
		}
		return dev;
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
				if (slot == Slot.EFFECT && pieces.isEmpty()) pieces.addAll(Effects.pieces(id));
				list.add(new Cosmetic(id, o.get("name").getAsString(), slot, (int) o.get("color").getAsLong(), List.copyOf(pieces)));
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
			case "flicker": return (p, s) -> p.yScale = base + Mth.sin(s.ageInTicks * speed) * amount;
			case "hop": return (p, s) -> p.y = base - Math.abs(Mth.sin(s.ageInTicks * speed)) * amount;
			case "wag": return (p, s) -> p.yRot = Mth.sin(s.ageInTicks * speed) * amount;
			case "cape": return capeSwing();
			case "flap": return flap((int) f(a, "side"), speed, f(a, "sweep"));
			default: return null;
		}
	}

	private static Animator capeSwing() {
		return (p, s) -> p.xRot = (6 + s.capeLean / 2 + s.capeFlap) * Mth.DEG_TO_RAD + 0.1f;
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
