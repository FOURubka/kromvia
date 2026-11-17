package com.kromvia.client.fx;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.kromvia.client.Accounts;
import com.kromvia.client.PlayTime;
import com.kromvia.client.Social;
import com.kromvia.client.cosmetic.Wardrobe;
import com.kromvia.client.module.Module;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.toasts.SystemToast;
import net.minecraft.network.chat.TextComponent;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/** No world effects before 1.16.2, only the launcher bridge: social, accounts, wardrobe sync and toasts. */
public final class Fx {
	private static final Logger PRESENCE = LogManager.getLogger("kromvia-presence");
	private static final int MAX_TEXT = 200;

	private Fx() {}

	static {
		Accounts.sender = PRESENCE::info;
		Thread t = new Thread(Fx::read, "Kromvia launcher bridge");
		t.setDaemon(true);
		t.start();
	}

	public static List<Module> modules() {
		return Collections.emptyList();
	}

	private static void read() {
		try (BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
			for (String line; (line = in.readLine()) != null; ) {
				try {
					handle(new JsonParser().parse(line).getAsJsonObject());
				} catch (RuntimeException ignored) {
				}
			}
		} catch (IOException ignored) {
		}
	}

	private static void handle(JsonObject msg) {
		Minecraft mc = Minecraft.getInstance();
		if (msg.has("social") && msg.get("social").isJsonObject()) {
			Social.set(msg.getAsJsonObject("social"));
		} else if (msg.has("ghost") && msg.get("ghost").isJsonObject()) {
			com.kromvia.client.Ghosts.answer(msg.getAsJsonObject("ghost"));
		} else if (msg.has("room") && msg.get("room").isJsonObject()) {
			com.kromvia.client.ui.ModsScreen.room(msg.getAsJsonObject("room"));
		} else if (msg.has("mods") && msg.get("mods").isJsonObject()) {
			com.kromvia.client.ui.ModsScreen.answer(msg.getAsJsonObject("mods"));
		} else if (msg.has("ping") && msg.get("ping").isJsonObject()) {
			com.kromvia.client.module.Info.pinged(msg.getAsJsonObject("ping"));
		} else if (msg.has("accounts") && msg.get("accounts").isJsonObject()) {
			Accounts.set(msg.getAsJsonObject("accounts"));
		} else if (msg.has("wardrobe")) {
			if (mc != null) mc.execute(Wardrobe::loadShared);
		} else if (msg.has("playtime") && msg.get("playtime").isJsonObject()) {
			JsonObject p = msg.getAsJsonObject("playtime");
			PlayTime.set(p.get("build").getAsLong(), p.get("total").getAsLong());
		} else if (msg.has("toast") && msg.get("toast").isJsonObject() && mc != null) {
			JsonObject toast = msg.getAsJsonObject("toast");
			String title = toast.get("title").getAsString();
			String text = toast.get("text").getAsString();
			String shown = text.length() > MAX_TEXT ? text.substring(0, MAX_TEXT) + "…" : text;
			mc.execute(() -> SystemToast.addOrUpdate(mc.getToasts(), SystemToast.SystemToastIds.TUTORIAL_HINT, new TextComponent(title), new TextComponent(shown)));
		}
	}
}
