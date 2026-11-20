package com.kromvia.client.fx.mixin;

import com.kromvia.client.fx.Fx;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.ScreenEffectRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ScreenEffectRenderer.class)
public class FxTotemAnimationMixin {
	static {
		Fx.TOTEM_POP.size.shown = true;
	}

	@Inject(method = "renderItemActivationAnimation", at = @At("HEAD"), cancellable = true)
	private void kromvia$hide(CallbackInfo ci) {
		if (Fx.TOTEM_POP.enabled && Fx.TOTEM_POP.size.value() <= 0) ci.cancel();
	}

	@WrapOperation(method = "renderItemActivationAnimation", at = @At(value = "INVOKE", ordinal = 0, target = "Lcom/mojang/blaze3d/vertex/PoseStack;scale(FFF)V"))
	private void kromvia$size(PoseStack pose, float x, float y, float z, Operation<Void> op) {
		float k = Fx.TOTEM_POP.enabled ? Fx.TOTEM_POP.size.value() : 1;
		op.call(pose, x * k, y * k, z * k);
	}
}
