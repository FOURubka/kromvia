package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import com.mojang.blaze3d.platform.NativeImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

public final class Heads {
	private static final Map<String, Identifier> loaded = new HashMap<>();
	private static final Map<String, String> sources = new HashMap<>();
	private static final Map<String, int[]> sizes = new HashMap<>();

	private Heads() {}

	public static void draw(Gfx g, String key, String dataUrl, int x, int y, int size) {
		Identifier id = get(key, dataUrl);
		if (id == null) {
			g.fill(x, y, x + size, y + size, UiStyle.LINE);
			return;
		}
		g.blit(id, x, y, 0, 0, size, size, 8, 8, 8, 8, 0xFFFFFFFF);
	}

	public static void image(Gfx g, String key, String dataUrl, int x, int y, int w, int h) {
		Identifier id = get(key, dataUrl);
		int[] size = sizes.get(key);
		if (id == null || size == null) {
			g.fill(x, y, x + w, y + h, UiStyle.LINE);
			return;
		}
		g.blit(id, x, y, 0, 0, w, h, size[0], size[1], size[0], size[1], 0xFFFFFFFF);
	}

	private static Identifier get(String key, String dataUrl) {
		if (dataUrl == null || dataUrl.indexOf(',') < 0) return null;
		if (dataUrl.equals(sources.get(key))) return loaded.get(key);
		Identifier old = loaded.remove(key);
		if (old != null) Minecraft.getInstance().getTextureManager().release(old);
		sources.put(key, dataUrl);
		try {
			byte[] png = Base64.getDecoder().decode(dataUrl.substring(dataUrl.indexOf(',') + 1));
			NativeImage ni = NativeImage.read(new ByteArrayInputStream(png));
			sizes.put(key, new int[] {ni.getWidth(), ni.getHeight()});
			Identifier id = Identifier.fromNamespaceAndPath("kromvia", "head/" + Integer.toHexString(key.hashCode()));
			Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(id::toString, ni));
			loaded.put(key, id);
			return id;
		} catch (IOException | IllegalArgumentException e) {
			return null;
		}
	}
}
