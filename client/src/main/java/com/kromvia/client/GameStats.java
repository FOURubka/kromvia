package com.kromvia.client;

import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

public final class GameStats {
	private GameStats() {}

	private static final long KILL_WINDOW_MS = 3000;
	private static final int SEND_TICKS = 1200;
	public static volatile boolean share;
	private static int kills, deaths, totems, bestCps, ticks;
	private static double elytra;
	private static LivingEntity target;
	private static long targetAt;
	private static boolean wasDead;
	private static double lastX, lastY, lastZ;
	private static boolean flying;

	public static void attack(Entity e) {
		if (e instanceof Player && e != Minecraft.getInstance().player) {
			target = (LivingEntity) e;
			targetAt = System.currentTimeMillis();
		}
	}

	public static void totem(Minecraft mc, Entity e) {
		if (e == mc.player) totems++;
	}

	public static void tick(Minecraft mc) {
		if (mc.player == null) {
			target = null;
			flying = false;
			return;
		}
		if (target != null) {
			if (System.currentTimeMillis() - targetAt > KILL_WINDOW_MS) target = null;
			else if (target.getHealth() <= 0) {
				kills++;
				target = null;
			}
		}
		boolean dead = mc.player.getHealth() <= 0;
		if (dead && !wasDead) deaths++;
		wasDead = dead;
		double x = mc.player.getX(), y = mc.player.getY(), z = mc.player.getZ();
		if (mc.player.isFallFlying() && flying) {
			double d = Math.sqrt((x - lastX) * (x - lastX) + (y - lastY) * (y - lastY) + (z - lastZ) * (z - lastZ));
			if (d < 10) elytra += d;
		}
		flying = mc.player.isFallFlying();
		lastX = x;
		lastY = y;
		lastZ = z;
		bestCps = Math.max(bestCps, com.kromvia.client.module.Clicks.left());
		if (++ticks % SEND_TICKS == 0) send();
	}

	private static void send() {
		if (kills == 0 && deaths == 0 && totems == 0 && bestCps == 0 && elytra < 1) {
			Social.gameStats(null, share);
			return;
		}
		JsonObject d = new JsonObject();
		d.addProperty("kills", kills);
		d.addProperty("deaths", deaths);
		d.addProperty("totems", totems);
		d.addProperty("cps", bestCps);
		d.addProperty("elytra", Math.round(elytra) / 1000.0);
		if (Social.gameStats(d, share)) {
			kills = deaths = totems = bestCps = 0;
			elytra = 0;
		}
	}
}
