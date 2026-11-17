package com.kromvia.client.mixin;

import com.kromvia.client.module.Features;
import com.kromvia.client.module.Toggles;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Camera;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(GameRenderer.class)
public class GameRendererMixin {
	@Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
	private void kromvia$zoom(Camera camera, float delta, boolean useFovSetting, CallbackInfoReturnable<Double> cir) {
		float f = Toggles.Zoom.factor();
		if (f != 1) cir.setReturnValue(cir.getReturnValue() * f);
		if (useFovSetting) com.kromvia.client.module.Info.fov = (float) (double) cir.getReturnValue();
	}

	@Inject(method = "bobHurt", at = @At("HEAD"), cancellable = true)
	private void kromvia$noHurtCam(PoseStack pose, float delta, CallbackInfo ci) {
		if (Features.NO_HURT_CAM.enabled) ci.cancel();
	}
}
