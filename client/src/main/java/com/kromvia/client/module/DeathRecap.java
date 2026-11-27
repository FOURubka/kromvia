package com.kromvia.client.module;

import com.kromvia.client.ui.Notes;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public final class DeathRecap extends Module {
	private static final long WINDOW_MS = 10000;
	private final List<Hit> hits = new ArrayList<>();
	private float lastHealth = -1;
	private boolean dead;

	private static final class Hit {
		final long at;
		final String who, weapon;
		final float damage, distance;

		Hit(long at, String who, String weapon, float damage, float distance) {
			this.at = at;
			this.who = who;
			this.weapon = weapon;
			this.damage = damage;
			this.distance = distance;
		}
	}

	public DeathRecap() {
		super("death_recap", "Death Recap", Module.Category.PVP, Module.Corner.TOP_LEFT, true);
		icon(Items.SKELETON_SKULL);
	}

	@Override
	public boolean hud() {
		return false;
	}

	@Override
	public void tick(Minecraft mc) {
		if (mc.player == null) {
			hits.clear();
			lastHealth = -1;
			return;
		}
		long now = System.currentTimeMillis();
		float health = mc.player.getHealth();
		if (lastHealth >= 0 && health < lastHealth) {
			LivingEntity by = mc.player.getLastHurtByMob();
			String who = by == null ? "Environment" : by.getName().getString();
			ItemStack held = by == null ? ItemStack.EMPTY : by.getMainHandItem();
			String weapon = held.isEmpty() ? (by == null ? "" : "hand") : held.getHoverName().getString();
			hits.add(new Hit(now, who, weapon, lastHealth - health, by == null ? -1 : by.distanceTo(mc.player)));
		}
		lastHealth = health;
		while (!hits.isEmpty() && now - hits.get(0).at > WINDOW_MS) hits.remove(0);
		boolean isDead = mc.player.isDeadOrDying();
		if (isDead && !dead && !hits.isEmpty()) show(now);
		if (isDead && !dead) hits.clear();
		dead = isDead;
	}

	private void show(long now) {
		Hit last = hits.get(hits.size() - 1);
		Map<String, float[]> by = new LinkedHashMap<>();
		float closest = Float.MAX_VALUE;
		for (Hit h : hits) {
			float[] v = by.get(h.who);
			if (v == null) by.put(h.who, v = new float[2]);
			v[0] += h.damage;
			v[1]++;
			if (h.distance >= 0) closest = Math.min(closest, h.distance);
		}
		StringBuilder text = new StringBuilder();
		for (Map.Entry<String, float[]> e : by.entrySet()) {
			if (text.length() > 0) text.append(" · ");
			text.append(e.getKey()).append(": ").append(Math.round(e.getValue()[0] * 5) / 10.0).append("♥ in ").append((int) e.getValue()[1]).append(e.getValue()[1] == 1 ? " hit" : " hits");
		}
		long span = Math.max(1, (now - hits.get(0).at) / 1000);
		text.append(" · over ").append(span).append(" s");
		if (closest != Float.MAX_VALUE) text.append(" · closest ").append(Math.round(closest * 10) / 10.0).append(" m");
		String title = "Killed by " + last.who + (last.weapon.isEmpty() ? "" : " with " + last.weapon);
		Notes.add(new Notes.Note(title, text.toString(), null));
	}
}
