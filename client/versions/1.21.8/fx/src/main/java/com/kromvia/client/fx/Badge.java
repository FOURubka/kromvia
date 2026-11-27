package com.kromvia.client.fx;

import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.resources.ResourceLocation;

final class Badge {
	static final String KROMVIA = "\uE000", CHECK = "\uE001", DEV = "\uE002";
	private static final Style FONT = Style.EMPTY.withFont(ResourceLocation.fromNamespaceAndPath("kromvia", "badge"));

	private Badge() {}

	static Style nameFont(String id) {
		return Style.EMPTY.withFont(ResourceLocation.fromNamespaceAndPath("kromvia", "name_" + id));
	}

	static MutableComponent glyph(String g) {
		return Component.literal(g).withStyle(FONT);
	}
}
