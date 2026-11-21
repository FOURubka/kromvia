package com.kromvia.client.fx;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.world.damagesource.DamageSource;

import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ItemStack;

import net.minecraft.client.gui.screens.inventory.EffectRenderingInventoryScreen;

final class Ver {
	private Ver() {}

	static final boolean DAMAGE_TYPES = false;

	static final boolean ARMOR = false;

	private static int swap(int c) {
		return c & 0xFF00FF00 | (c & 0xFF) << 16 | c >> 16 & 0xFF;
	}

	static int getPixel(NativeImage image, int x, int y) {
		return swap(image.getPixelRGBA(x, y));
	}

	static void setPixel(NativeImage image, int x, int y, int argb) {
		image.setPixelRGBA(x, y, swap(argb));
	}

	static float partial(Minecraft mc) {
		return mc.getFrameTime();
	}

	static float walkPos(net.minecraft.world.entity.LivingEntity e, float partial) {
		return e.animationPosition - e.animationSpeed * (1 - partial);
	}

	static float walkSpeed(net.minecraft.world.entity.LivingEntity e, float partial) {
		return net.minecraft.util.Mth.lerp(partial, e.animationSpeedOld, e.animationSpeed);
	}

	static boolean showsEffects(Screen screen) {
		return screen instanceof EffectRenderingInventoryScreen<?>;
	}

	static double armor(ItemStack stack, EquipmentSlot slot) {
		double sum = 0;
		for (AttributeModifier m : stack.getAttributeModifiers(slot).get(Attributes.ARMOR)) {
			if (m.getOperation() == AttributeModifier.Operation.ADDITION) sum += m.getAmount();
		}
		return sum;
	}

	static int damageKind(DamageSource source) {
		return 0;
	}

	static void guiScale(Minecraft mc, int scale) {
		if (scale == 0) {
			mc.resizeDisplay();
			return;
		}
		com.mojang.blaze3d.platform.Window w = mc.getWindow();
		w.setGuiScale(scale);
		if (mc.screen != null) mc.screen.resize(mc, w.getGuiScaledWidth(), w.getGuiScaledHeight());
	}
}
