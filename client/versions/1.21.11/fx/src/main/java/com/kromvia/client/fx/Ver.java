package com.kromvia.client.fx;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;

import net.minecraft.core.component.DataComponents;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.ItemAttributeModifiers;

final class Ver {
	private Ver() {}

	static final boolean DAMAGE_TYPES = true;

	static final boolean ARMOR = true;

	static int getPixel(NativeImage image, int x, int y) {
		return image.getPixel(x, y);
	}

	static void setPixel(NativeImage image, int x, int y, int argb) {
		image.setPixel(x, y, argb);
	}

	static float partial(Minecraft mc) {
		return mc.getDeltaTracker().getGameTimeDeltaPartialTick(false);
	}

	static float walkPos(net.minecraft.world.entity.LivingEntity e, float partial) {
		return e.walkAnimation.position(partial);
	}

	static float walkSpeed(net.minecraft.world.entity.LivingEntity e, float partial) {
		return e.walkAnimation.speed(partial);
	}

	static boolean showsEffects(Screen screen) {
		return screen.showsActiveEffects();
	}

	static double armor(ItemStack stack, EquipmentSlot slot) {
		double sum = 0;
		for (var e : stack.getOrDefault(DataComponents.ATTRIBUTE_MODIFIERS, ItemAttributeModifiers.EMPTY).modifiers()) {
			if (e.attribute().equals(Attributes.ARMOR) && e.modifier().operation() == AttributeModifier.Operation.ADD_VALUE) sum += e.modifier().amount();
		}
		return sum;
	}

	static int damageKind(DamageSource source) {
		if (source.is(DamageTypeTags.IS_FIRE)) return 1;
		if (source.is(DamageTypeTags.IS_FREEZING)) return 2;
		if (source.is(DamageTypeTags.WITCH_RESISTANT_TO) || source.is(DamageTypes.WITHER)) return 3;
		if (source.is(DamageTypeTags.IS_FALL)) return 4;
		if (source.is(DamageTypeTags.IS_EXPLOSION)) return 5;
		if (source.is(DamageTypeTags.IS_DROWNING)) return 6;
		if (source.is(DamageTypeTags.IS_LIGHTNING)) return 7;
		return 0;
	}

	static void guiScale(Minecraft mc, int scale) {
		if (scale == 0) {
			mc.resizeDisplay();
			return;
		}
		var w = mc.getWindow();
		w.setGuiScale(scale);
		if (mc.screen != null) mc.screen.resize(w.getGuiScaledWidth(), w.getGuiScaledHeight());
	}
}
