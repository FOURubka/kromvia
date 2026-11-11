package com.kromvia.client.module;

import com.kromvia.client.compat.Mc;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.SliderSetting;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

public final class Info {
	private Info() {}

	private static String fmt(String pattern, Object... args) {
		return String.format(Locale.ROOT, pattern, args);
	}

	public static final Module HEALTH = new TextModule("health", "Health", Module.Category.PVP, false) {
		final BoolSetting absorption = add(new BoolSetting("absorption", "Show absorption", true));
		final ChoiceSetting unit = add(new ChoiceSetting("unit", "Unit", 0, "Hearts", "Points"));

		@Override
		protected String text(Minecraft mc) {
			if (mc.player == null) return "";
			float div = unit.index() == 0 ? 2 : 1;
			float extra = mc.player.getAbsorptionAmount();
			String hp = fmt("%.1f", mc.player.getHealth() / div);
			return hp + (absorption.on() && extra > 0 ? fmt(" +%.1f", extra / div) : "") + " ♥";
		}

		@Override
		public String sample() {
			return "8.5 +2.0 ♥";
		}
	}.icon(Items.APPLE);

	public static final Module XP = new TextModule("xp", "XP Level", Module.Category.HUD, false) {
		final BoolSetting progress = add(new BoolSetting("progress", "Show progress", true));

		@Override
		protected String text(Minecraft mc) {
			if (mc.player == null) return "";
			String level = "Lvl " + mc.player.experienceLevel;
			return progress.on() ? level + "  " + Math.round(mc.player.experienceProgress * 100) + "%" : level;
		}

		@Override
		public String sample() {
			return "Lvl 30  45%";
		}
	}.icon(Items.EXPERIENCE_BOTTLE);

	public static final Module NETHER_COORDS = new TextModule("nether_coords", "Nether Coords", Module.Category.HUD, false) {
		@Override
		protected String text(Minecraft mc) {
			if (mc.player == null || mc.level == null) return "";
			double x = mc.player.getX(), z = mc.player.getZ();
			if (mc.level.dimension() == Level.NETHER) return "Overworld " + Mth.floor(x * 8) + " " + Mth.floor(z * 8);
			if (mc.level.dimension() == Level.OVERWORLD) return "Nether " + Mth.floor(x / 8) + " " + Mth.floor(z / 8);
			return "";
		}

		@Override
		public String sample() {
			return "Nether 16 -32";
		}
	}.icon(Items.NETHERRACK);

	public static final Module PLAYERS = new TextModule("player_count", "Player Count", Module.Category.HUD, false) {
		final ChoiceSetting format = add(new ChoiceSetting("format", "Format", 0, "12 players", "Players: 12", "12"));

		@Override
		protected String text(Minecraft mc) {
			if (mc.getConnection() == null) return "";
			int n = mc.getConnection().getOnlinePlayers().size();
			if (format.index() == 1) return "Players: " + n;
			if (format.index() == 2) return String.valueOf(n);
			return n + (n == 1 ? " player" : " players");
		}

		@Override
		public String sample() {
			return "12 players";
		}
	}.icon(Items.PLAYER_HEAD);

	public static final Module WORLD_TIME = new TextModule("world_time", "World Time", Module.Category.HUD, false) {
		final ChoiceSetting format = add(new ChoiceSetting("format", "Format", 0, "24-hour", "12-hour"));

		@Override
		protected String text(Minecraft mc) {
			if (mc.level == null) return "";
			long t = Math.floorMod(Mc.dayTime(mc.level), 24000L);
			int hour = (int) ((t / 1000 + 6) % 24), minute = (int) (t % 1000 * 60 / 1000);
			if (format.index() == 0) return fmt("%02d:%02d", hour, minute);
			return fmt("%d:%02d %s", hour % 12 == 0 ? 12 : hour % 12, minute, hour < 12 ? "AM" : "PM");
		}

		@Override
		public String sample() {
			return "14:30";
		}
	}.icon(Items.CLOCK);

	public static final Module ROTATION = new TextModule("rotation", "Rotation", Module.Category.HUD, false) {
		final ChoiceSetting show = add(new ChoiceSetting("show", "Show", 0, "Yaw and pitch", "Yaw", "Pitch"));
		final BoolSetting decimals = add(new BoolSetting("decimals", "Decimals", true));

		@Override
		protected String text(Minecraft mc) {
			LocalPlayer p = mc.player;
			if (p == null) return "";
			String n = decimals.on() ? "%.1f" : "%.0f";
			String yaw = fmt("Yaw " + n, Mth.wrapDegrees(p.getYRot())), pitch = fmt("Pitch " + n, p.getXRot());
			return show.index() == 1 ? yaw : show.index() == 2 ? pitch : yaw + "  " + pitch;
		}

		@Override
		public String sample() {
			return "Yaw 90.0  Pitch -12.5";
		}
	}.icon(Items.COMPASS);

	public static final Module FREE_SLOTS = new TextModule("free_slots", "Free Slots", Module.Category.HUD, false) {
		final SliderSetting warn = add(new SliderSetting("warn", "Only show at or below", 36, 0, 36, 1, " free"));

		@Override
		protected String text(Minecraft mc) {
			LocalPlayer p = mc.player;
			if (p == null) return "";
			int free = 0;
			for (int i = 0; i < 36; i++) {
				if (p.getInventory().getItem(i).isEmpty()) free++;
			}
			return free > warn.value() ? "" : free == 0 ? "Inventory full" : free + " free slots";
		}

		@Override
		public String sample() {
			return "7 free slots";
		}
	}.icon(Items.CHEST);

	public static final Module LOOKING_AT = new TextModule("looking_at", "Looking At", Module.Category.HUD, false) {
		final BoolSetting blocks = add(new BoolSetting("blocks", "Blocks", true));
		final BoolSetting entities = add(new BoolSetting("entities", "Mobs and players", true));
		final BoolSetting distance = add(new BoolSetting("distance", "Show distance", false));

		@Override
		protected String text(Minecraft mc) {
			if (mc.player == null || mc.level == null) return "";
			HitResult hit = mc.hitResult;
			String name = "";
			if (mc.crosshairPickEntity != null) {
				if (entities.on()) name = mc.crosshairPickEntity.getName().getString();
			} else if (blocks.on() && hit instanceof BlockHitResult && hit.getType() == HitResult.Type.BLOCK) {
				name = mc.level.getBlockState(((BlockHitResult) hit).getBlockPos()).getBlock().getName().getString();
			}
			if (name.isEmpty() || !distance.on() || hit == null) return name;
			return name + fmt("  %.1f m", hit.getLocation().distanceTo(mc.player.getEyePosition(1F)));
		}

		@Override
		public String sample() {
			return "Diamond Ore";
		}
	}.icon(Items.DIAMOND_ORE);

	public static final Module HELD_COUNT = new TextModule("held_count", "Held Item Count", Module.Category.PVP, false) {
		final ChoiceSetting format = add(new ChoiceSetting("format", "Format", 0, "x128", "128", "2 stacks + 0"));

		@Override
		protected String text(Minecraft mc) {
			LocalPlayer p = mc.player;
			if (p == null) return "";
			ItemStack held = p.getMainHandItem();
			if (held.isEmpty() || held.getMaxStackSize() == 1) return "";
			int n = 0;
			for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
				ItemStack s = p.getInventory().getItem(i);
				if (s.getItem() == held.getItem()) n += s.getCount();
			}
			int stack = held.getMaxStackSize();
			if (format.index() == 1) return String.valueOf(n);
			if (format.index() == 2) return n / stack + " stacks + " + n % stack;
			return "x" + n;
		}

		@Override
		public String sample() {
			return "x128";
		}
	}.icon(Items.COBBLESTONE);

	public static final Module STATUS = new TextModule("move_status", "Movement Status", Module.Category.HUD, false) {
		@Override
		protected String text(Minecraft mc) {
			LocalPlayer p = mc.player;
			if (p == null) return "";
			if (p.getAbilities().flying) return "Flying";
			if (p.isFallFlying()) return "Gliding";
			if (p.isSwimming()) return "Swimming";
			if (p.isShiftKeyDown()) return "Sneaking";
			if (p.isSprinting()) return "Sprinting";
			return "";
		}

		@Override
		public String sample() {
			return "Sprinting";
		}
	}.icon(Items.LEATHER_BOOTS);

	public static final Module AUTO_RESPAWN = new Module("auto_respawn", "Auto Respawn", Module.Category.UTILITY, Module.Corner.TOP_LEFT, false) {
		final SliderSetting delay = add(new SliderSetting("delay", "Delay", 1, 0, 5, 0.5F, " s"));
		private long diedAt;

		@Override
		public boolean hud() {
			return false;
		}

		@Override
		public void tick(Minecraft mc) {
			if (mc.player == null || mc.level == null || !(Mc.screen() instanceof DeathScreen) || mc.level.getLevelData().isHardcore()) {
				diedAt = 0;
				return;
			}
			long now = System.currentTimeMillis();
			if (diedAt == 0) diedAt = now;
			if (now - diedAt < delay.value() * 1000) return;
			diedAt = 0;
			mc.player.respawn();
			Mc.setScreen(null);
		}
	}.icon(Items.TOTEM_OF_UNDYING);

	public static List<Module> modules() {
		return Arrays.asList(HEALTH, XP, HELD_COUNT, NETHER_COORDS, WORLD_TIME, ROTATION, PLAYERS, FREE_SLOTS, LOOKING_AT, STATUS, AUTO_RESPAWN);
	}
}
