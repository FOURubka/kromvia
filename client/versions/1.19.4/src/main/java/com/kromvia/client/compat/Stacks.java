package com.kromvia.client.compat;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.NonNullList;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.MapItem;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.material.MaterialColor;
import net.minecraft.world.level.saveddata.maps.MapItemSavedData;

public final class Stacks {
	private Stacks() {}

	public static List<ItemStack> contents(ItemStack stack) {
		CompoundTag tag = stack.getTagElement("BlockEntityTag");
		if (tag == null || !tag.contains("Items", 9)) return new ArrayList<>();
		NonNullList<ItemStack> list = NonNullList.withSize(27, ItemStack.EMPTY);
		ContainerHelper.loadAllItems(tag, list);
		return list;
	}

	public static int[] map(ItemStack stack, Level level) {
		MapItemSavedData data = MapItem.getSavedData(stack, level);
		if (data == null) return null;
		int[] out = new int[16384];
		for (int i = 0; i < out.length; i++) out[i] = (data.colors[i] & 0xFF) < 4 ? 0 : abgr(color(data.colors[i]));
		return out;
	}

	private static int color(byte packed) {
		return MaterialColor.getColorFromPackedId(packed);
	}

	private static int abgr(int c) {
		return c & 0xFF00FF00 | (c & 0xFF) << 16 | c >> 16 & 0xFF;
	}
}
