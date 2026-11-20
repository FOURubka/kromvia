package com.kromvia.client.module;

import com.kromvia.client.compat.Mc;
import com.kromvia.client.compat.Gfx;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.kromvia.client.KromviaClient;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.SliderSetting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.server.packs.repository.Pack;
import net.minecraft.sounds.SoundEvents;
import com.kromvia.client.compat.ARGB;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.LightLayer;

public final class Extras {
	private Extras() {}

	private static class Flag extends Module {
		Flag(String id, String name, Category cat, boolean on) {
			super(id, name, cat, Corner.TOP_LEFT, on);
		}

		@Override
		public boolean hud() {
			return false;
		}
	}

	private static void chat(Minecraft mc, String text) {
		Mc.say(new net.minecraft.network.chat.TextComponent("§2[§aK§2] §r" + text));
	}

	public static final Module LOW_HEALTH = new Flag("low_health", "Low HP Warning", Module.Category.PVP, false) {
		final SliderSetting hearts = add(new SliderSetting("hearts", "Below", 4, 1, 10, 0.5F, " ♥"));
		final SliderSetting strength = add(new SliderSetting("strength", "Strength", 70, 20, 100, 5, "%"));

		{
			icon(Items.REDSTONE);
		}

		@Override
		public void overlay(Gfx g, Minecraft mc) {
			if (mc.player == null || mc.player.isCreative() || mc.player.isSpectator()) return;
			float hp = mc.player.getHealth() + mc.player.getAbsorptionAmount();
			float limit = hearts.value() * 2;
			if (hp >= limit || hp <= 0) return;
			float danger = 1 - hp / limit;
			float beat = 0.6F + 0.4F * Mth.sin(System.currentTimeMillis() / (danger > 0.5F ? 110F : 180F));
			int a = Math.round(0xB0 * strength.value() / 100F * (0.35F + 0.65F * danger) * beat);
			int w = g.guiWidth(), h = g.guiHeight(), band = Math.max(24, h / 5);
			int red = ARGB.color(a, 0xB01818);
			g.fillGradient(0, 0, w, band, red, 0);
			g.fillGradient(0, h - band, w, h, 0, red);
			for (int i = 0; i < band; i += 2) {
				int c = ARGB.color(Math.round(a * (1 - i / (float) band)), 0xB01818);
				g.fill(i, 0, i + 2, h, c);
				g.fill(w - i - 2, 0, w - i, h, c);
			}
		}
	};

	public static final Module DURABILITY = new TextModule("durability", "Durability Alert", Module.Category.PVP, false) {
		final SliderSetting below = add(new SliderSetting("below", "Warn below", 15, 5, 50, 5, "%"));
		private final EquipmentSlot[] SLOTS = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET, EquipmentSlot.MAINHAND, EquipmentSlot.OFFHAND};
		private final String[] NAMES = {"Helmet", "Chestplate", "Leggings", "Boots", "Hand", "Offhand"};

		@Override
		protected String text(Minecraft mc) {
			if (mc.player == null) return "";
			StringBuilder b = new StringBuilder();
			for (int i = 0; i < SLOTS.length; i++) {
				ItemStack s = mc.player.getItemBySlot(SLOTS[i]);
				if (!s.isDamageableItem()) continue;
				int left = Math.round(100F * (s.getMaxDamage() - s.getDamageValue()) / s.getMaxDamage());
				if (left < below.value()) b.append(NAMES[i]).append(' ').append(left).append("%  ");
			}
			return b.length() == 0 ? "" : "⚠ " + b.toString().trim();
		}

		@Override
		public void render(Gfx g, Minecraft mc, int x, int y) {
			if ((System.currentTimeMillis() / 400) % 2 == 0 || mc.player == null) super.render(g, mc, x, y);
		}

		@Override
		public String sample() {
			return "⚠ Helmet 9%";
		}
	}.icon(Items.ANVIL);

	public static final Module BOW_CHARGE = new Flag("bow_charge", "Bow Charge", Module.Category.PVP, false) {
		{
			icon(Items.BOW);
		}

		@Override
		public void overlay(Gfx g, Minecraft mc) {
			if (mc.player == null || !mc.player.isUsingItem()) return;
			ItemStack use = mc.player.getUseItem();
			float f;
			if (use.getItem() == Items.BOW) f = BowItem.getPowerForTime(mc.player.getTicksUsingItem());
			else if (use.getItem() == Items.CROSSBOW) f = Math.min(1, mc.player.getTicksUsingItem() / (float) CrossbowItem.getChargeDuration(use));
			else return;
			int cx = g.guiWidth() / 2, y = g.guiHeight() / 2 + 10, w = 30;
			g.fill(cx - w / 2 - 1, y - 1, cx + w / 2 + 1, y + 3, 0xA0000000);
			g.fill(cx - w / 2, y, cx - w / 2 + Math.round(w * f), y + 2, f >= 1 ? 0xFFB49CFF : 0xFF8B5CF6);
		}
	};

	private static long sessionStart;

	public static final Module SESSION = new TextModule("session", "Session Time", Module.Category.HUD, false) {
		{
			icon(Items.COMPASS);
		}

		@Override
		public void tick(Minecraft mc) {
			if (mc.level == null) sessionStart = 0;
			else if (sessionStart == 0) sessionStart = System.currentTimeMillis();
		}

		@Override
		protected String text(Minecraft mc) {
			if (sessionStart == 0) return "";
			long s = (System.currentTimeMillis() - sessionStart) / 1000;
			return String.format("%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60);
		}

		@Override
		public String sample() {
			return "1:24:07";
		}
	};

	public static final Module PACK = new TextModule("pack_display", "Pack Display", Module.Category.HUD, false) {
		{
			icon(Items.PAINTING);
		}

		@Override
		protected String text(Minecraft mc) {
			String top = "";
			for (Pack p : mc.getResourcePackRepository().getSelectedPacks()) {
				if (!p.isRequired()) top = p.getTitle().getString();
			}
			return top.isEmpty() ? "" : "Pack: " + top;
		}

		@Override
		public String sample() {
			return "Pack: Faithful 32x";
		}
	};

	public static final Module LIGHT = new TextModule("light_level", "Light Level", Module.Category.HUD, false) {
		{
			icon(Items.TORCH);
		}

		@Override
		protected String text(Minecraft mc) {
			if (mc.player == null || mc.level == null) return "";
			net.minecraft.core.BlockPos pos = mc.player.blockPosition();
			return "Light " + mc.level.getBrightness(LightLayer.BLOCK, pos) + " (sky " + mc.level.getBrightness(LightLayer.SKY, pos) + ")";
		}

		@Override
		public String sample() {
			return "Light 12 (sky 15)";
		}
	};

	public static final class HitSound extends Flag {
		final ChoiceSetting sound = add(new ChoiceSetting("sound", "Sound", 0, "Ding", "Pling", "Click"));
		final SliderSetting volume = add(new SliderSetting("volume", "Volume", 60, 10, 100, 10, "%"));
		final SliderSetting pitch = add(new SliderSetting("pitch", "Pitch", 1.2F, 0.5F, 2, 0.1F, "x"));

		HitSound() {
			super("hit_sound", "Hit Sound", Module.Category.PVP, false);
			icon(Items.NOTE_BLOCK);
		}
	}

	public static final HitSound HIT_SOUND = new HitSound();

	public static void onAttack(Minecraft mc, Entity target) {
		if (!HIT_SOUND.enabled) return;
		float v = HIT_SOUND.volume.value() / 100F, p = HIT_SOUND.pitch.value();
		int sound = HIT_SOUND.sound.index();
		mc.getSoundManager().play(SimpleSoundInstance.forUI(sound == 1 ? SoundEvents.NOTE_BLOCK_PLING
				: sound == 2 ? SoundEvents.UI_BUTTON_CLICK : SoundEvents.EXPERIENCE_ORB_PICKUP, p, v));
	}

	private static long lastGameTime = -1, lastAt;
	private static float tps = -1;

	public static void onServerTime(long gameTime) {
		long now = System.currentTimeMillis();
		if (lastGameTime >= 0 && gameTime > lastGameTime && now > lastAt) {
			float sample = Math.min(20, (gameTime - lastGameTime) * 1000F / (now - lastAt));
			tps = tps < 0 ? sample : Mth.lerp(0.3F, tps, sample);
		}
		lastGameTime = gameTime;
		lastAt = now;
	}

	public static final Module TPS = new TextModule("tps", "Server TPS", Module.Category.HUD, false) {
		{
			icon(Items.REPEATER);
		}

		@Override
		public void tick(Minecraft mc) {
			if (mc.level == null) {
				lastGameTime = -1;
				tps = -1;
			}
		}

		@Override
		protected String text(Minecraft mc) {
			if (tps < 0) return "";
			boolean stalled = System.currentTimeMillis() - lastAt > 5000;
			return stalled ? "TPS 0.0 (no response)" : String.format("TPS %.1f", tps);
		}

		@Override
		public String sample() {
			return "TPS 19.8";
		}
	};

	private static final Map<UUID, Integer> pops = new HashMap<>();

	public static final Module TOTEM_POPS = new Flag("totem_pops", "Totem Pop Counter", Module.Category.PVP, false) {
		{
			icon(Items.TOTEM_OF_UNDYING);
		}

		@Override
		public void tick(Minecraft mc) {
			if (mc.level == null) pops.clear();
		}
	};

	public static java.util.function.Consumer<Entity> totemListener = e -> {};

	public static void onTotem(Minecraft mc, Entity e) {
		totemListener.accept(e);
		if (!TOTEM_POPS.enabled || e == mc.player) return;
		int n = pops.merge(e.getUUID(), 1, Integer::sum);
		chat(mc, "§f" + e.getName().getString() + " §7popped §e" + n + " §7totem" + (n == 1 ? "" : "s"));
	}

	public static final Module DEATH_COORDS = new Flag("death_coords", "Death Coordinates", Module.Category.UTILITY, true) {
		private boolean dead;

		{
			icon(Items.SKELETON_SKULL);
		}

		@Override
		public void tick(Minecraft mc) {
			if (mc.player == null) return;
			boolean now = mc.player.isDeadOrDying();
			if (now && !dead) {
				net.minecraft.core.BlockPos p = mc.player.blockPosition();
				chat(mc, "§7You died at §f" + p.getX() + " " + p.getY() + " " + p.getZ() + " §7in §f" + mc.level.dimension().location().getPath());
			}
			dead = now;
		}
	};

	public static final class TabPing extends Flag {
		public final BoolSetting colored = add(new BoolSetting("colored", "Colour by ping", true));

		TabPing() {
			super("tab_ping", "Numeric Tab Ping", Module.Category.UTILITY, false);
			icon(Items.NAME_TAG);
		}

		public int color(int ms) {
			if (!colored.on()) return 0xFFFFFFFF;
			return ms < 80 ? 0xFF8B5CF6 : ms < 150 ? 0xFFFFF15A : ms < 300 ? 0xFFF08A24 : 0xFFFF4040;
		}
	}

	public static final TabPing TAB_PING = new TabPing();
}
