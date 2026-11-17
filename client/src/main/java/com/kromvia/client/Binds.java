package com.kromvia.client;

import com.kromvia.client.compat.Mc;
import com.kromvia.client.mixin.KeyMappingAccessor;
import com.mojang.blaze3d.platform.InputConstants;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import net.minecraft.client.KeyMapping;

public final class Binds {
	private static final List<KeyMapping> ALL = new ArrayList<>();

	public static final KeyMapping MENU = add("Open Kromvia menu", InputConstants.KEY_RSHIFT);
	public static final KeyMapping ZOOM = add("Zoom", InputConstants.KEY_C);
	public static final KeyMapping FREELOOK = add("Freelook", InputConstants.KEY_LALT);
	public static final KeyMapping SNAPLOOK = add("Snaplook", InputConstants.KEY_V);
	public static final KeyMapping FREECAM = add("Freecam", InputConstants.KEY_F4);
	public static final KeyMapping PING = add("Party ping", InputConstants.KEY_Z);
	public static final KeyMapping GHOST = add("Ghost run start/stop", InputConstants.KEY_K);

	private Binds() {}

	public static KeyMapping add(String name, int key) {
		KeyMapping k = Mc.bind(name, key);
		ALL.add(k);
		return k;
	}

	public static KeyMapping[] append(KeyMapping[] mappings) {
		List<KeyMapping> out = new ArrayList<>(Arrays.asList(mappings));
		for (KeyMapping k : ALL) if (!out.contains(k)) out.add(k);
		return out.toArray(new KeyMapping[0]);
	}

	public static int code(KeyMapping k) {
		return ((KeyMappingAccessor) k).kromvia$key().getValue();
	}

	public static boolean down(KeyMapping k) {
		InputConstants.Key key = ((KeyMappingAccessor) k).kromvia$key();
		if (key.equals(InputConstants.UNKNOWN)) return false;
		return key.getType() == InputConstants.Type.MOUSE ? k.isDown() : Mc.keyDown(key.getValue());
	}
}
