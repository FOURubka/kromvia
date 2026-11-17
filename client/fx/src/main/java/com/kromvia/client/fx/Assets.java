package com.kromvia.client.fx;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;

public final class Assets {
	private Assets() {}

	private static final List<String> FILES = files();

	private static List<String> files() {
		List<String> out = new ArrayList<>(List.of(
				"shaders/post/motion_blur.fsh",
				"shaders/post/motion_blur.json",
				"post_effect/motion_blur_low.json",
				"post_effect/motion_blur_medium.json",
				"post_effect/motion_blur_high.json"));
		out.add("shaders/post/daltonize.fsh");
		out.add("shaders/post/daltonize.json");
		for (int n = 1; n <= 3; n++) out.add("post_effect/daltonize_" + n + ".json");
		for (String name : new String[] {"saturation", "brightness", "contrast", "hue"}) {
			out.add("shaders/post/" + name + ".fsh");
			out.add("shaders/post/" + name + ".json");
			for (int n = 0; n <= 330; n += 5) out.add("post_effect/" + name + "_" + n + ".json");
		}
		return out;
	}

	public static Map<Identifier, Resource> with(Map<Identifier, Resource> found, String dir, ResourceManager manager) {
		var pack = manager.listPacks().findFirst();
		if (pack.isEmpty()) return found;
		Map<Identifier, Resource> all = new HashMap<>(found);
		for (String path : FILES) {
			String file = "/assets/kromvia/" + path;
			if (!path.startsWith(dir + "/") || Assets.class.getResource(file) == null) continue;
			all.put(Identifier.fromNamespaceAndPath("kromvia", path), new Resource(pack.get(), () -> Assets.class.getResourceAsStream(file)));
		}
		return all;
	}
}
