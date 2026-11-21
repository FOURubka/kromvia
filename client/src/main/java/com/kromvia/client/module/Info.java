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
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
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

	public static final Module ELYTRA = new TextModule("elytra", "Elytra HUD", Module.Category.HUD, false) {
		final BoolSetting always = add(new BoolSetting("always", "Show when not gliding", false));
		final BoolSetting rockets = add(new BoolSetting("rockets", "Firework rockets", true));

		@Override
		protected String text(Minecraft mc) {
			LocalPlayer p = mc.player;
			if (p == null) return "";
			ItemStack chest = p.getItemBySlot(EquipmentSlot.CHEST);
			if (chest.getItem() != Items.ELYTRA || !p.isFallFlying() && !always.on()) return "";
			StringBuilder b = new StringBuilder(fmt("%.1f m/s  %.0f°", p.getDeltaMovement().length() * 20, -p.getXRot()));
			if (chest.isDamageableItem()) b.append("  ").append(chest.getMaxDamage() - chest.getDamageValue()).append(" dur");
			if (rockets.on()) {
				int n = 0;
				for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
					ItemStack s = p.getInventory().getItem(i);
					if (s.getItem() == Items.FIREWORK_ROCKET) n += s.getCount();
				}
				b.append("  ").append(n).append(" rockets");
			}
			return b.toString();
		}

		@Override
		public String sample() {
			return "32.4 m/s  12°  401 dur  48 rockets";
		}
	}.icon(Items.ELYTRA);

	public static final Module NEARBY = new TextModule("nearby", "Nearby Players", Module.Category.HUD, false) {
		final SliderSetting radius = add(new SliderSetting("radius", "Within", 64, 8, 256, 8, " m"));
		final SliderSetting max = add(new SliderSetting("max", "At most", 5, 1, 15, 1, ""));

		@Override
		protected String text(Minecraft mc) {
			if (mc.player == null || mc.level == null) return "";
			LocalPlayer me = mc.player;
			StringBuilder b = new StringBuilder();
			mc.level.players().stream()
					.filter(p -> p != me && !p.isSpectator())
					.filter(p -> p.distanceTo(me) <= radius.value())
					.sorted((a, c) -> Float.compare(a.distanceTo(me), c.distanceTo(me)))
					.limit((long) max.value())
					.forEach(p -> b.append(b.length() == 0 ? "" : ", ").append(name(p)).append(fmt(" %.0fm", p.distanceTo(me))));
			return b.toString();
		}

		private String name(Player p) {
			return p.getName().getString();
		}

		@Override
		public String sample() {
			return "Steve 12m, Alex 40m";
		}
	}.icon(Items.ENDER_EYE);

	/** Counts up from when it is switched on, or down from a set time. */
	public static final Module TIMER = new TextModule("timer", "Stopwatch & Timer", Module.Category.HUD, false) {
		final ChoiceSetting mode = add(new ChoiceSetting("mode", "Mode", 0, "Stopwatch", "Countdown"));
		final SliderSetting minutes = add(new SliderSetting("minutes", "Countdown", 5, 1, 120, 1, " min"));
		private long started;

		@Override
		protected String text(Minecraft mc) {
			long now = System.currentTimeMillis();
			if (started == 0) started = now;
			long ms = now - started;
			if (mode.index() == 1) {
				ms = (long) (minutes.value() * 60_000) - ms;
				// Blink once a second when the time is up.
				if (ms <= 0) return now / 500 % 2 == 0 ? "Time's up" : "";
			}
			long s = ms / 1000;
			return s >= 3600 ? fmt("%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : fmt("%02d:%02d", s / 60, s % 60);
		}

		@Override
		public void disable(Minecraft mc) {
			started = 0;
		}

		@Override
		public String sample() {
			return "04:59";
		}
	}.icon(Items.CLOCK);

	public static final BoolSetting TIP_DURABILITY = new BoolSetting("durability", "Durability as a number", true);
	public static final BoolSetting TIP_CONTAINERS = new BoolSetting("containers", "Shulker box contents", true);
	public static final BoolSetting TIP_MAPS = new BoolSetting("maps", "Map preview", true);

	public static final Module ITEM_TIPS = new Module("item_tips", "Item Tooltips", Module.Category.UTILITY, Module.Corner.TOP_LEFT, false) {
		{
			add(TIP_DURABILITY);
			add(TIP_CONTAINERS);
			add(TIP_MAPS);
		}

		@Override
		public boolean hud() {
			return false;
		}
	}.icon(Items.SHULKER_BOX);

	public static float fov = 70;

	private static final class Ping {
		final String from;
		final String dim;
		final double x, y, z;
		final long at;

		Ping(String from, String dim, double x, double y, double z) {
			this.from = from;
			this.dim = dim;
			this.x = x;
			this.y = y;
			this.z = z;
			this.at = System.currentTimeMillis();
		}
	}

	private static final java.util.Map<String, Ping> PINGS_SHOWN = new java.util.concurrent.ConcurrentHashMap<>();

	private static String dimension(Minecraft mc) {
		return mc.level.dimension().identifier().toString();
	}

	public static void pinged(com.google.gson.JsonObject o) {
		if (!PINGS.enabled) return;
		String from = o.has("name") ? o.get("name").getAsString() : "?";
		String dim = o.has("dim") ? o.get("dim").getAsString() : "";
		PINGS_SHOWN.put(from, new Ping(from, dim, o.get("x").getAsDouble(), o.get("y").getAsDouble(), o.get("z").getAsDouble()));
		Minecraft mc = Minecraft.getInstance();
		if (((PingModule) PINGS).sound.on()) mc.execute(() -> mc.getSoundManager().play(net.minecraft.client.resources.sounds.SimpleSoundInstance.forUI(net.minecraft.sounds.SoundEvents.EXPERIENCE_ORB_PICKUP, 1.6F, 0.6F)));
	}

	private static final class PingModule extends Module {
		final SliderSetting seconds = add(new SliderSetting("seconds", "Show for", 10, 3, 30, 1, " s"));
		final SliderSetting range = add(new SliderSetting("range", "Reach", 160, 32, 512, 16, " m"));
		final BoolSetting sound = add(new BoolSetting("sound", "Sound", true));
		private boolean held;
		private long sentAt;

		PingModule() {
			super("party_pings", "Party Pings", Module.Category.UTILITY, Module.Corner.TOP_LEFT, true);
		}

		@Override
		public boolean hud() {
			return false;
		}

		@Override
		public void tick(Minecraft mc) {
			boolean down = mc.player != null && Mc.screen() == null && com.kromvia.client.Binds.down(com.kromvia.client.Binds.PING);
			if (down && !held) send(mc);
			held = down;
		}

		@Override
		public void disable(Minecraft mc) {
			PINGS_SHOWN.clear();
		}

		private void send(Minecraft mc) {
			if (mc.level == null || mc.player == null) return;
			if (!com.kromvia.client.Social.inParty() && !com.kromvia.client.Social.inClan()) {
				Mc.actionbar(Component.literal("§7Pings go to your party and clanmates on this server. Invite friends from the Friends screen."));
				return;
			}
			long now = System.currentTimeMillis();
			if (now - sentAt < 700) return;
			HitResult hit = mc.player.pick(range.value(), 1F, false);
			if (hit == null || hit.getType() == HitResult.Type.MISS) {
				Mc.actionbar(Component.literal("§7Nothing to ping there"));
				return;
			}
			java.util.function.Consumer<String> out = com.kromvia.client.Accounts.sender;
			if (out == null) return;
			sentAt = now;
			double x = hit.getLocation().x, y = hit.getLocation().y, z = hit.getLocation().z;
			com.google.gson.JsonObject p = new com.google.gson.JsonObject();
			p.addProperty("x", Math.round(x * 10) / 10.0);
			p.addProperty("y", Math.round(y * 10) / 10.0);
			p.addProperty("z", Math.round(z * 10) / 10.0);
			p.addProperty("dim", dimension(mc));
			String host = com.kromvia.client.Config.currentServer(mc);
			if (host != null) p.addProperty("host", host);
			com.google.gson.JsonObject msg = new com.google.gson.JsonObject();
			msg.add("ping", p);
			out.accept(msg.toString());
			PINGS_SHOWN.put("", new Ping("You", dimension(mc), x, y, z));
		}

		@Override
		public void overlay(com.kromvia.client.compat.Gfx g, Minecraft mc) {
			if (PINGS_SHOWN.isEmpty() || mc.level == null || mc.player == null) return;
			long now = System.currentTimeMillis();
			long life = (long) (seconds.value() * 1000);
			String dim = dimension(mc);
			float[] v = Mc.view();
			double yaw = Math.toRadians(v[3]), pitch = Math.toRadians(v[4]);
			double sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
			double fx = -sy * cp, fy = -sp, fz = cy * cp;
			double rx = -cy, rz = -sy;
			double ux = -sy * sp, uy = cp, uz = cy * sp;
			int w = g.guiWidth(), h = g.guiHeight();
			double focal = h / 2.0 / Math.tan(Math.toRadians(Math.max(1, v[5])) / 2);
			for (java.util.Iterator<Ping> it = PINGS_SHOWN.values().iterator(); it.hasNext(); ) {
				Ping p = it.next();
				long age = now - p.at;
				if (age > life) {
					it.remove();
					continue;
				}
				if (!p.dim.equals(dim)) continue;
				double dx = p.x - v[0], dy = p.y - v[1], dz = p.z - v[2];
				double depth = dx * fx + dy * fy + dz * fz;
				double right = dx * rx + dz * rz;
				double up = dx * ux + dy * uy + dz * uz;
				double px, py;
				if (depth > 0.1) {
					px = w / 2.0 + right / depth * focal;
					py = h / 2.0 - up / depth * focal;
				} else {
					px = w / 2.0 + (right >= 0 ? w : -w);
					py = h / 2.0;
				}
				double ax = px - w / 2.0, ay = py - h / 2.0;
				double k = Math.min((w / 2.0 - 12) / Math.max(1e-6, Math.abs(ax)), (h / 2.0 - 12) / Math.max(1e-6, Math.abs(ay)));
				if (k < 1) {
					px = w / 2.0 + ax * k;
					py = h / 2.0 + ay * k;
				}
				float fade = age > life - 1000 ? (life - age) / 1000F : 1;
				float pop = age < 180 ? 1 + (180 - age) / 180F * 0.6F : 1;
				int a = Math.max(0, Math.min(255, Math.round(fade * 255)));
				int cx = (int) Math.round(px), cyi = (int) Math.round(py);
				int r = Math.round(3 * pop);
				int accent = (a << 24) | 0x8B5CF6, white = (a << 24) | 0xF4F5F7, rim = ((a * 3 / 4) << 24) | 0x18181D;
				g.fill(cx - r - 1, cyi - r - 1, cx + r + 2, cyi + r + 2, rim);
				g.fill(cx - r, cyi - r, cx + r + 1, cyi + r + 1, white);
				g.fill(cx - r + 1, cyi - r + 1, cx + r, cyi + r, accent);
				double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
				String label = p.from + "  " + Math.round(dist) + " m";
				int tw = mc.font.width(label);
				int ly = cyi + r + 4;
				if (ly + 10 > h) ly = cyi - r - 14;
				int lx = Math.max(2, Math.min(w - tw - 6, cx - tw / 2 - 3));
				g.fill(lx, ly, lx + tw + 6, ly + 11, ((a * 2 / 3) << 24) | 0x18181D);
				g.drawString(mc.font, label, lx + 3, ly + 2, white, false);
			}
		}
	}

	public static final Module PINGS = new PingModule().icon(Items.BELL);

	public static final Module FRAMES = new Module("frame_report", "Frame Report", Module.Category.UTILITY, Module.Corner.TOP_LEFT, true) {
		private final float[] ms = new float[20000];
		private int n;
		private long last, windowStart;

		@Override
		public boolean hud() {
			return false;
		}

		@Override
		public void overlay(com.kromvia.client.compat.Gfx g, Minecraft mc) {
			long now = System.nanoTime();
			boolean playing = mc.level != null && Mc.screen() == null && mc.isWindowActive();
			if (!playing || last == 0) {
				last = playing ? now : 0;
				return;
			}
			float dt = (now - last) / 1e6F;
			last = now;
			if (dt <= 0 || dt > 1000) return;
			if (n == 0) windowStart = now;
			if (n < ms.length) ms[n++] = dt;
			if (now - windowStart >= 30_000_000_000L) flush();
		}

		private void flush() {
			java.util.function.Consumer<String> out = com.kromvia.client.Accounts.sender;
			int count = n;
			n = 0;
			if (out == null || count < 60) return;
			float[] sorted = java.util.Arrays.copyOf(ms, count);
			java.util.Arrays.sort(sorted);
			double sum = 0;
			for (int i = 0; i < count; i++) sum += sorted[i];
			float worst = sorted[Math.min(count - 1, (int) Math.floor(count * 0.99))];
			com.google.gson.JsonObject f = new com.google.gson.JsonObject();
			f.addProperty("avg", Math.round(count * 1000.0 / sum * 10) / 10.0);
			f.addProperty("low", Math.round(1000.0 / worst * 10) / 10.0);
			f.addProperty("n", count);
			f.addProperty("gpu", Mc.gpu());
			com.google.gson.JsonObject msg = new com.google.gson.JsonObject();
			msg.add("frames", f);
			out.accept(msg.toString());
		}

		@Override
		public void disable(Minecraft mc) {
			n = 0;
			last = 0;
		}
	}.icon(Items.CLOCK);

	public static List<Module> modules() {
		return Arrays.asList(HEALTH, XP, HELD_COUNT, NETHER_COORDS, WORLD_TIME, ROTATION, PLAYERS, FREE_SLOTS, LOOKING_AT, STATUS, AUTO_RESPAWN, ELYTRA, NEARBY, TIMER, ITEM_TIPS, PINGS, FRAMES);
	}
}
