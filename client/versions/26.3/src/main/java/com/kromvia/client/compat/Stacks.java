package com.kromvia.client.compat;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.NonNullList;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.MapItem;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.saveddata.maps.MapItemSavedData;

public final class Stacks {
	private Stacks() {}

	public static List<ItemStack> contents(ItemStack stack) {
		ItemContainerContents c = stack.get(DataComponents.CONTAINER);
		if (c == null) return new ArrayList<>();
		NonNullList<ItemStack> list = NonNullList.withSize(27, ItemStack.EMPTY);
		c.copyInto(list);
		return list;
	}

	public static int[] map(ItemStack stack, Level level) {
		MapItemSavedData data = MapItem.getSavedData(stack, level);
		if (data == null) return null;
		int[] out = new int[16384];
		for (int i = 0; i < out.length; i++) out[i] = (data.colors[i] & 0xFF) < 4 ? 0 : MapColor.getColorFromPackedId(data.colors[i]);
		return out;
	}
}
