package com.kromvia.client.module;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.module.setting.BoolSetting;
import com.mojang.blaze3d.platform.InputConstants;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Items;

public final class Waypoints extends Module {
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("kromvia-waypoints.json");
	public static final KeyMapping KEY = com.kromvia.client.Binds.add("Add or remove waypoint", InputConstants.KEY_B);
	final BoolSetting death = add(new BoolSetting("death", "Waypoint where you die", true));
	final BoolSetting share = add(new BoolSetting("share", "Show new waypoints to your party", true));
	private JsonObject all;
	private boolean held, dead;

	public Waypoints() {
		super("waypoints", "Waypoints", Module.Category.UTILITY, Module.Corner.TOP_LEFT, true);
		icon(Items.COMPASS);
	}

	@Override
	public boolean hud() {
		return false;
	}

	private JsonObject all() {
		if (all != null) return all;
		try {
			all = Files.isRegularFile(FILE) ? new Gson().fromJson(new String(Files.readAllBytes(FILE), StandardCharsets.UTF_8), JsonObject.class) : new JsonObject();
		} catch (Exception e) {
			all = new JsonObject();
		}
		return all;
	}

	private void save() {
		try {
			Files.write(FILE, new Gson().toJson(all()).getBytes(StandardCharsets.UTF_8));
		} catch (Exception ignored) {}
	}

	private static String place(Minecraft mc) {
		String host = com.kromvia.client.Config.currentServer(mc);
		return (host == null ? "singleplayer" : host) + "|" + Info.dimension(mc);
	}

	private JsonArray here(Minecraft mc) {
		String key = place(mc);
		if (!all().has(key) || !all().get(key).isJsonArray()) all().add(key, new JsonArray());
		return all().getAsJsonArray(key);
	}

	@Override
	public void tick(Minecraft mc) {
		if (mc.player == null || mc.level == null) return;
		boolean down = Mc.screen() == null && com.kromvia.client.Binds.down(KEY);
		if (down && !held) toggle(mc);
		held = down;
		boolean now = mc.player.isDeadOrDying();
		if (now && !dead && death.on()) {
			JsonArray list = here(mc);
			for (int i = list.size() - 1; i >= 0; i--) {
				if ("Death".equals(str(list.get(i), "name"))) list.remove(i);
			}
			add(mc, list, "Death", mc.player.getX(), mc.player.getY(), mc.player.getZ());
		}
		dead = now;
	}

	private void toggle(Minecraft mc) {
		JsonArray list = here(mc);
		double x = mc.player.getX(), y = mc.player.getY(), z = mc.player.getZ();
		for (int i = 0; i < list.size(); i++) {
			JsonObject w = list.get(i).getAsJsonObject();
			double dx = w.get("x").getAsDouble() - x, dy = w.get("y").getAsDouble() - y, dz = w.get("z").getAsDouble() - z;
			if (dx * dx + dy * dy + dz * dz < 16) {
				list.remove(i);
				save();
				Mc.actionbar(Component.literal("§7Waypoint removed: §f" + str(w, "name")));
				return;
			}
		}
		String name = "Point " + (list.size() + 1);
		add(mc, list, name, x, y, z);
		Mc.actionbar(Component.literal("§7Waypoint added: §f" + name + " §7(press again here to remove)"));
	}

	private void add(Minecraft mc, JsonArray list, String name, double x, double y, double z) {
		JsonObject w = new JsonObject();
		w.addProperty("name", name);
		w.addProperty("x", Math.round(x * 10) / 10.0);
		w.addProperty("y", Math.round(y * 10) / 10.0 + 1);
		w.addProperty("z", Math.round(z * 10) / 10.0);
		list.add(w);
		save();
		java.util.function.Consumer<String> out = com.kromvia.client.Accounts.sender;
		if (share.on() && out != null && (com.kromvia.client.Social.inParty() || com.kromvia.client.Social.inClan())) {
			JsonObject p = new JsonObject();
			p.addProperty("x", w.get("x").getAsDouble());
			p.addProperty("y", w.get("y").getAsDouble());
			p.addProperty("z", w.get("z").getAsDouble());
			p.addProperty("dim", Info.dimension(mc));
			String host = com.kromvia.client.Config.currentServer(mc);
			if (host != null) p.addProperty("host", host);
			JsonObject msg = new JsonObject();
			msg.add("ping", p);
			out.accept(msg.toString());
		}
	}

	@Override
	public void overlay(Gfx g, Minecraft mc) {
		if (mc.level == null || mc.player == null || Mc.hudHidden()) return;
		JsonArray list = here(mc);
		if (list.size() == 0) return;
		float[] v = Mc.view();
		List<JsonObject> ws = new ArrayList<>();
		for (JsonElement e : list) ws.add(e.getAsJsonObject());
		for (JsonObject w : ws) {
			boolean isDeath = "Death".equals(str(w, "name"));
			Info.marker(g, mc, v, w.get("x").getAsDouble(), w.get("y").getAsDouble(), w.get("z").getAsDouble(), str(w, "name"), 230, 1, isDeath ? 0xE45C5C : 0x7EE0B0);
		}
	}

	private static String str(JsonElement e, String k) {
		JsonObject o = e.getAsJsonObject();
		return o.has(k) ? o.get(k).getAsString() : "";
	}
}
