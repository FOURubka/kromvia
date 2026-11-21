package com.kromvia.client.fx;

import com.kromvia.client.Accounts;
import com.kromvia.client.PlayTime;
import com.kromvia.client.Social;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import net.minecraft.client.Minecraft;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.ui.Notes;
import com.kromvia.client.ui.SocialScreen;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

final class Toasts {
	private static final int MAX_TEXT = 200;

	private static final Logger PRESENCE = LoggerFactory.getLogger("kromvia-presence");

	private Toasts() {}

	static void listen() {
		Accounts.sender = PRESENCE::info;
		Thread t = new Thread(Toasts::read, "Kromvia launcher toasts");
		t.setDaemon(true);
		t.start();
	}

	private static Notes.Note note(String title, String text, JsonObject action) {
		String party = action != null && action.has("party") ? action.get("party").getAsString() : null;
		String chat = action != null && action.has("chat") ? action.get("chat").getAsString() : null;
		if (party != null) {
			return new Notes.Note(title, text, Toasts::openSocial)
					.button("Join", true, () -> Social.join(party))
					.button("Decline", false, () -> Social.decline(party));
		}
		if (chat != null) {
			return new Notes.Note(title, text, () -> {
				Social.open(chat);
				openSocial();
			}).button("Reply", true, () -> {
				Social.open(chat);
				openSocial();
			});
		}
		return new Notes.Note(title, text, null);
	}

	private static void openSocial() {
		if (!(Mc.screen() instanceof SocialScreen)) Mc.setScreen(new SocialScreen(Mc.screen()));
	}

	private static void read() {
		try (BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8))) {
			for (String line; (line = in.readLine()) != null; ) {
				try {
					JsonObject msg = JsonParser.parseString(line).getAsJsonObject();
					Minecraft mc = Minecraft.getInstance();
					JsonObject social = msg.getAsJsonObject("social");
					if (social != null) {
						Social.set(social);
						continue;
					}
					JsonObject room = msg.getAsJsonObject("room");
					if (room != null) {
						com.kromvia.client.ui.ModsScreen.room(room);
						continue;
					}
					JsonObject mods = msg.getAsJsonObject("mods");
					if (mods != null) {
						com.kromvia.client.ui.ModsScreen.answer(mods);
						continue;
					}
					JsonObject ping = msg.getAsJsonObject("ping");
					if (ping != null) {
						com.kromvia.client.module.Info.pinged(ping);
						continue;
					}
					JsonObject accounts = msg.getAsJsonObject("accounts");
					if (accounts != null) {
						Accounts.set(accounts);
						continue;
					}
					if (msg.has("wardrobe") && mc != null) {
						mc.execute(com.kromvia.client.cosmetic.Wardrobe::loadShared);
						continue;
					}
					if (msg.has("media")) {
						Media.set(msg.get("media").isJsonNull() ? null : msg.getAsJsonObject("media"));
						continue;
					}
					JsonObject played = msg.getAsJsonObject("playtime");
					if (played != null) {
						PlayTime.set(played.get("build").getAsLong(), played.get("total").getAsLong());
						continue;
					}
					JsonObject shared = msg.getAsJsonObject("shared");
					if (shared != null && mc != null) {
						String url = shared.has("url") ? shared.get("url").getAsString() : null;
						String error = shared.has("error") ? shared.get("error").getAsString() : "";
						mc.execute(() -> Qol.shared(mc, url, error));
						continue;
					}
					JsonObject worn = msg.getAsJsonObject("worn");
					if (worn != null && mc != null) {
						String host = worn.get("host").isJsonNull() ? null : worn.get("host").getAsString();
						JsonObject found = worn.getAsJsonObject("worn");
						mc.execute(() -> Players.answer(host, found));
						continue;
					}
					JsonObject toast = msg.getAsJsonObject("toast");
					if (toast == null) continue;
					String title = toast.get("title").getAsString();
					String text = toast.get("text").getAsString();
					String shown = text.length() > MAX_TEXT ? text.substring(0, MAX_TEXT) + "…" : text;
					JsonObject action = toast.has("action") && toast.get("action").isJsonObject() ? toast.getAsJsonObject("action") : null;
					if (mc != null) mc.execute(() -> Notes.add(note(title, shown, action)));
				} catch (RuntimeException ignored) {
				}
			}
		} catch (IOException ignored) {
		}
	}
}
