package com.kromvia.client.module;

import com.kromvia.client.compat.Gfx;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;

public class ArmorModule extends Module {
	private static final EquipmentSlot[] SLOTS = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET, EquipmentSlot.MAINHAND};

	public ArmorModule() {
		super("armor", "Armor Status", Category.PVP, Corner.TOP_RIGHT, false);
		icon(Items.DIAMOND_CHESTPLATE);
	}

	final ChoiceSetting durability = add(new ChoiceSetting("durability", "Durability", 0, "Number", "Percent", "Hidden"));
	final BoolSetting held = add(new BoolSetting("held", "Held item", true));

	@Override
	public boolean visible(Minecraft mc) {
		if (mc.player == null) return false;
		for (EquipmentSlot s : SLOTS) {
			if (!mc.player.getItemBySlot(s).isEmpty()) return true;
		}
		return false;
	}

	@Override
	public int width(Minecraft mc) {
		return 56;
	}

	@Override
	public int height(Minecraft mc) {
		return SLOTS.length * 17;
	}

	@Override
	public void render(Gfx g, Minecraft mc, int x, int y) {
		for (int i = 0; i < SLOTS.length; i++) {
			ItemStack stack = mc.player.getItemBySlot(SLOTS[i]);
			if (stack.isEmpty() || SLOTS[i] == EquipmentSlot.MAINHAND && !held.on()) continue;
			int yy = y + i * 17;
			g.renderItem(stack, x + width(mc) - 16, yy);
			int left = stack.getMaxDamage() - stack.getDamageValue();
			String label;
			if (!stack.isDamageableItem()) label = stack.getCount() > 1 ? String.valueOf(stack.getCount()) : "";
			else if (durability.index() == 1) label = left * 100 / stack.getMaxDamage() + "%";
			else if (durability.index() == 2) label = "";
			else label = String.valueOf(left);
			if (!label.isEmpty()) {
				int color = stack.isDamageableItem() ? 0xFF000000 | net.minecraft.util.Mth.hsvToRgb(Math.max(0F, 1F - stack.getDamageValue() / (float) stack.getMaxDamage()) / 3F, 1F, 1F) : 0xFFFFFFFF;
				g.drawString(mc.font, label, x + width(mc) - 20 - mc.font.width(label), yy + 4, color, true);
			}
		}
	}
}
