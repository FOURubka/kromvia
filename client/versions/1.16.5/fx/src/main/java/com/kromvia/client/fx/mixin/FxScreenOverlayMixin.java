package com.kromvia.client.fx.mixin;

import com.kromvia.client.fx.Tweaks;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.ScreenEffectRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Constant;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyConstant;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ScreenEffectRenderer.class)
public class FxScreenOverlayMixin {
	@ModifyConstant(method = "renderFire", constant = @Constant(floatValue = 0.9F))
	private static float kromvia$fire(float alpha) {
		return Tweaks.OVERLAYS.fire(alpha);
	}

	@ModifyConstant(method = "renderFire", constant = @Constant(doubleValue = -0.30000001192092896))
	private static double kromvia$fireHeight(double y) {
		return Tweaks.OVERLAYS.fireY((float) y);
	}

	@Inject(method = "renderWater", at = @At("HEAD"), cancellable = true)
	private static void kromvia$water(Minecraft mc, PoseStack pose, CallbackInfo ci) {
		if (Tweaks.OVERLAYS.hides(Tweaks.OVERLAYS.water)) ci.cancel();
	}
}
