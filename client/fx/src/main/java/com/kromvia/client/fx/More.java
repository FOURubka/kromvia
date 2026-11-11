package com.kromvia.client.fx;

import com.kromvia.client.Binds;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.module.Module;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ColorSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.SliderSetting;
import com.kromvia.client.module.setting.TextSetting;
import com.mojang.blaze3d.platform.InputConstants;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.CameraType;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.SingleQuadParticle;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public final class More {
	private static final KeyMapping LOOK_BACK = Binds.add("Behind You (back)", InputConstants.KEY_V);
	private static final KeyMapping LOOK_FRONT = Binds.add("Behind You (front)", InputConstants.KEY_B);

	private More() {}

	private static class Flag extends Module {
		Flag(String id, String name, Category cat) {
			super(id, name, cat, Corner.TOP_LEFT, false);
		}

		@Override
		public boolean hud() {
			return false;
		}
	}

	public static final class HandSway extends Flag {
		final SliderSetting amount = add(new SliderSetting("amount", "Sway", 100, 0, 300, 10, "%"));

		HandSway() {
			super("hand_sway", "Hand Sway", Category.UTILITY);
			icon(Items.FEATHER);
		}
	}

	public static final HandSway HAND_SWAY = new HandSway();

	public static float sway(float vanilla) {
		return HAND_SWAY.enabled ? vanilla * HAND_SWAY.amount.value() / 100 : vanilla;
	}

	public static final Module CHAT_HISTORY = new Flag("chat_history", "Chat History", Module.Category.UTILITY) {
		private final Path file = FabricLoader.getInstance().getConfigDir().resolve("kromvia-chat-history.txt");
		private boolean loaded;
		private String last;
		private int size = -1;

		{
			icon(Items.WRITABLE_BOOK);
		}

		@Override
		public void tick(Minecraft mc) {
			var recent = MoreVer.chat(mc).getRecentChat();
			if (!loaded) {
				loaded = true;
				if (recent.isEmpty() && Files.isRegularFile(file)) {
					try {
						for (String line : Files.readAllLines(file)) {
							if (!line.isBlank()) MoreVer.chat(mc).addRecentChat(line);
						}
					} catch (IOException ignored) {
					}
				}
				size = recent.size();
				last = recent.isEmpty() ? null : recent.get(recent.size() - 1);
				return;
			}
			String now = recent.isEmpty() ? null : recent.get(recent.size() - 1);
			if (recent.size() == size && java.util.Objects.equals(now, last)) return;
			size = recent.size();
			last = now;
			try {
				List<String> out = new ArrayList<>();
				for (String s : recent) {
					if (!secret(s)) out.add(s);
				}
				Files.write(file, out);
			} catch (IOException ignored) {
			}
		}
	};

	private static final java.util.Set<String> AUTH = java.util.Set.of("login", "l", "log", "register", "reg", "changepassword",
			"changepass", "cp", "2fa", "totp", "unregister", "email", "premium", "password", "pass");

	private static boolean secret(String line) {
		if (!line.startsWith("/")) return false;
		String cmd = line.substring(1).split(" ", 2)[0].toLowerCase(java.util.Locale.ROOT);
		int colon = cmd.indexOf(':');
		return AUTH.contains(colon < 0 ? cmd : cmd.substring(colon + 1));
	}

	public static final Module BEHIND_YOU = new Flag("behind_you", "Behind You (hold V / B)", Module.Category.UTILITY) {
		private CameraType before;

		{
			icon(Items.SPYGLASS);
		}

		@Override
		public void tick(Minecraft mc) {
			boolean free = Mc.screen() == null;
			CameraType want = free && Binds.down(LOOK_BACK) ? CameraType.THIRD_PERSON_BACK
					: free && Binds.down(LOOK_FRONT) ? CameraType.THIRD_PERSON_FRONT : null;
			if (want != null) {
				if (before == null) before = mc.options.getCameraType();
				if (mc.options.getCameraType() != want) mc.options.setCameraType(want);
			} else if (before != null) {
				mc.options.setCameraType(before);
				before = null;
			}
		}

		@Override
		public void disable(Minecraft mc) {
			if (before != null) mc.options.setCameraType(before);
			before = null;
		}
	};

	public static final class AttackIndicator extends Flag {
		final BoolSetting hideFull = add(new BoolSetting("hide_full", "Hide when charged", true));
		final ColorSetting sword = add(new ColorSetting("sword", "Sword", 0xFF8B5CF6));
		final ColorSetting axe = add(new ColorSetting("axe", "Axe", 0xFFEF4444));
		final ColorSetting other = add(new ColorSetting("other", "Other", 0xFFE5E7EB));
		final BoolSetting blend = add(new BoolSetting("blend", "Blend from the charging colour", false));
		final ColorSetting charging = add(new ColorSetting("charging", "Charging", 0xFF4B5563));

		AttackIndicator() {
			super("attack_indicator", "Attack Indicator", Category.PVP);
			icon(Items.IRON_SWORD);
		}

		@Override
		public void overlay(Gfx g, Minecraft mc) {
			if (mc.player == null || Mc.hudHidden() || !mc.options.getCameraType().isFirstPerson()) return;
			float charge = mc.player.getAttackStrengthScale(0);
			if (charge >= 1 && hideFull.on()) return;
			ItemStack held = mc.player.getMainHandItem();
			String id = held.getItem().toString();
			int color = id.contains("sword") ? sword.argb() : id.contains("_axe") ? axe.argb() : other.argb();
			if (blend.on()) color = mix(charging.argb(), color, Math.min(charge, 1));
			int x = g.guiWidth() / 2 - 8, y = g.guiHeight() / 2 + 9;
			g.fill(x, y, x + 16, y + 2, 0x80000000);
			g.fill(x, y, x + Math.round(16 * Math.min(charge, 1)), y + 2, color);
		}
	}

	public static final AttackIndicator ATTACK_INDICATOR = new AttackIndicator();

	private static int mix(int from, int to, float t) {
		int out = 0;
		for (int shift = 0; shift < 32; shift += 8) {
			int a = from >>> shift & 255, b = to >>> shift & 255;
			out |= Math.round(a + (b - a) * t) << shift;
		}
		return out;
	}

	public static final class ParticleColor extends Flag {
		final ColorSetting crit = add(new ColorSetting("crit", "Crit", 0xFFFFD34D));
		final ColorSetting sharpness = add(new ColorSetting("sharpness", "Sharpness", 0xFF8B5CF6));

		ParticleColor() {
			super("particle_color", "Hit Particle Colour", Category.PVP);
			icon(Items.FIREWORK_STAR);
		}
	}

	public static final ParticleColor PARTICLE_COLOR = new ParticleColor();

	public static void tint(ParticleOptions options, Particle particle) {
		if (!PARTICLE_COLOR.enabled || !(particle instanceof SingleQuadParticle p)) return;
		int c;
		if (options.getType() == ParticleTypes.CRIT) c = PARTICLE_COLOR.crit.argb();
		else if (options.getType() == ParticleTypes.ENCHANTED_HIT) c = PARTICLE_COLOR.sharpness.argb();
		else return;
		p.setColor((c >> 16 & 255) / 255F, (c >> 8 & 255) / 255F, (c & 255) / 255F);
	}

	public static final Module EFFECT_BARS = new Flag("effect_bars", "Effect Bars", Module.Category.HUD) {
		private final Map<Object, Integer> longest = new HashMap<>();

		{
			icon(Items.POTION);
		}

		@Override
		public void overlay(Gfx g, Minecraft mc) {
			if (mc.player == null || Mc.hudHidden()) return;
			int good = 0, bad = 0;
			for (MobEffectInstance e : mc.player.getActiveEffects()) {
				if (!e.showIcon()) continue;
				boolean beneficial = e.getEffect().value().isBeneficial();
				int x = g.guiWidth() - 25 * (beneficial ? ++good : ++bad);
				int y = (beneficial ? 1 : 27) + (mc.isDemo() ? 15 : 0);
				if (e.isInfiniteDuration()) continue;
				int max = longest.merge(e.getEffect(), e.getDuration(), Math::max);
				g.fill(x + 1, y + 22, x + 23, y + 24, 0x80000000);
				g.fill(x + 1, y + 22, x + 1 + Math.round(22F * e.getDuration() / max), y + 24, beneficial ? 0xFF8B5CF6 : 0xFFEF4444);
			}
			longest.keySet().removeIf(k -> mc.player.getActiveEffects().stream().noneMatch(e -> e.getEffect() == k));
		}
	};

	public static final class Macros extends Flag {
		private static final KeyMapping[] KEYS = {Binds.add("Chat macro F6", InputConstants.KEY_F6), Binds.add("Chat macro F7", InputConstants.KEY_F7),
				Binds.add("Chat macro F8", InputConstants.KEY_F8), Binds.add("Chat macro F9", InputConstants.KEY_F9)};
		final List<TextSetting> lines = new ArrayList<>();
		private final boolean[] down = new boolean[KEYS.length];

		Macros() {
			super("chat_macros", "Chat Macros (F6-F9)", Category.UTILITY);
			icon(Items.PAPER);
			for (int i = 0; i < KEYS.length; i++) lines.add(add(new TextSetting("f" + (i + 6), "F" + (i + 6), "", 256)));
		}

		@Override
		public void tick(Minecraft mc) {
			for (int i = 0; i < KEYS.length; i++) {
				boolean now = Mc.screen() == null && Binds.down(KEYS[i]);
				if (now && !down[i] && mc.player != null) {
					String text = lines.get(i).get().trim();
					if (!text.isEmpty()) Say.send(mc, text);
				}
				down[i] = now;
			}
		}
	}

	public static final Macros MACROS = new Macros();

	public static final class AutoGg extends Flag {
		private static final String[][] KNOWN = {
				{"hypixel", "1st killer -", "1st place -", "winner:", "winners:", "winner -", "winning team -", "1st -", "winner!", "top seeker:", "last team standing!", "most wool placed -", "your overall winstreak:"},
				{"mineplex", "1st place:", "won the game!"},
				{"cubecraft", "won the game!", "is the winner!", "thank you for playing"},
				{"minemen", "match results", "winner:"},
				{"pvp.land", "match results", "winner:"},
				{"lunar", "match results", "winner:"},
				{"pika", "has won the game", "won the game!"},
				{"jartex", "has won the game", "won the game!"},
				{"hoplite", "has won the game", "victory!"},
				{"mccisland", "game over!", "you finished"},
				{"blocksmc", "has won the game", "won the game!"},
				{"bedwarspractice", "you won", "match ended"},
		};
		private static final String[] GENERIC = {"has won the game", "won the game!", "winner:", "winners:", "game over!", "match results"};
		private static final java.util.regex.Pattern PLAYER_LINE = java.util.regex.Pattern.compile("^(\\[[^\\]]{1,24}\\] ?)*<?[A-Za-z0-9_]{2,16}>? ?(:|»|>>|➜|→) .*");
		final TextSetting message = add(new TextSetting("message", "Message", "gg", 100));
		final TextSetting second = add(new TextSetting("second", "Second message (optional)", "", 100));
		final ChoiceSetting servers = add(new ChoiceSetting("servers", "Works on", 0, "Known servers", "Any server", "Only my triggers"));
		final TextSetting triggers = add(new TextSetting("triggers", "My triggers, comma separated", "", 512));
		final TextSetting only = add(new TextSetting("only", "Only on servers (part of address)", "", 256));
		final SliderSetting delay = add(new SliderSetting("delay", "Delay", 1, 0, 5, 0.5F, " s"));
		final SliderSetting cooldown = add(new SliderSetting("cooldown", "Cooldown", 10, 5, 60, 5, " s"));
		private long sendAt, lastAt;

		AutoGg() {
			super("auto_gg", "Auto GG", Category.UTILITY);
			icon(Items.GOLD_INGOT);
		}

		private static boolean has(String text, String[] list, int from) {
			for (int i = from; i < list.length; i++) {
				String t = list[i].trim();
				if (!t.isEmpty() && text.contains(t)) return true;
			}
			return false;
		}

		private boolean triggered(String text, String address) {
			if (has(text, triggers.get().toLowerCase(Locale.ROOT).split(","), 0)) return true;
			if (servers.index() == 2) return false;
			for (String[] known : KNOWN) {
				if (address.contains(known[0])) return has(text, known, 1);
			}
			return servers.index() == 1 && has(text, GENERIC, 0);
		}

		public void onChat(String raw) {
			Minecraft mc = Minecraft.getInstance();
			long now = System.currentTimeMillis();
			if (!enabled || mc.player == null || mc.getCurrentServer() == null || now - lastAt < cooldown.value() * 1000) return;
			String text = raw.replaceAll("§.", "").trim();
			if (text.isEmpty() || PLAYER_LINE.matcher(text).matches()) return;
			String address = mc.getCurrentServer().ip.toLowerCase(Locale.ROOT);
			if (!only.get().trim().isEmpty() && !has(address, only.get().toLowerCase(Locale.ROOT).split(","), 0)) return;
			if (!triggered(text.toLowerCase(Locale.ROOT), address)) return;
			lastAt = now;
			sendAt = now + Math.round(delay.value() * 1000);
		}

		@Override
		public void tick(Minecraft mc) {
			if (sendAt == 0 || System.currentTimeMillis() < sendAt) return;
			sendAt = 0;
			if (mc.player == null) return;
			for (TextSetting line : List.of(message, second)) {
				String text = line.get().trim();
				if (!text.isEmpty()) Say.send(mc, text);
			}
		}

		@Override
		public void disable(Minecraft mc) {
			sendAt = 0;
		}
	}

	public static final AutoGg AUTO_GG = new AutoGg();

	public static List<Module> modules() {
		return List.of(HAND_SWAY, CHAT_HISTORY, BEHIND_YOU, ATTACK_INDICATOR, PARTICLE_COLOR, EFFECT_BARS, MACROS, AUTO_GG);
	}
}
