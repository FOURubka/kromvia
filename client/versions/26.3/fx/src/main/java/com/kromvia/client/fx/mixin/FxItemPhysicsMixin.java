package com.kromvia.client.fx.mixin;

import com.kromvia.client.fx.Fx;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.llamalad7.mixinextras.sugar.Local;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import net.minecraft.client.renderer.entity.ItemEntityRenderer;
import net.minecraft.client.renderer.entity.state.ItemEntityRenderState;
import net.minecraft.util.Mth;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

@Mixin(ItemEntityRenderer.class)
public class FxItemPhysicsMixin {
	private static final String SUBMIT = "submit(Lnet/minecraft/client/renderer/entity/state/ItemEntityRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/state/level/CameraRenderState;)V";

	static {
		Fx.ITEM_PHYSICS.shown = true;
	}

	private static boolean kromvia$flat(ItemEntityRenderState s) {
		return s.item.getModelBoundingBox().getZsize() <= 0.0625 * 1.5;
	}

	@WrapOperation(method = SUBMIT, at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/vertex/PoseStack;translate(FFF)V"))
	private void kromvia$noBob(PoseStack pose, float x, float y, float z, Operation<Void> op, @Local(argsOnly = true) ItemEntityRenderState s) {
		if (!Fx.ITEM_PHYSICS.enabled) {
			op.call(pose, x, y, z);
			return;
		}
		float bob = Mth.sin(s.ageInTicks / 10.0F + s.bobOffset) * 0.1F + 0.1F;
		op.call(pose, x, kromvia$flat(s) ? 0.04F : y - bob, z);
	}

	@WrapOperation(method = SUBMIT, at = @At(value = "INVOKE", target = "Lcom/mojang/blaze3d/vertex/PoseStack;rotate(Lcom/mojang/math/Axis;F)V"))
	private void kromvia$lieFlat(PoseStack pose, Axis axis, float angle, Operation<Void> op, @Local(argsOnly = true) ItemEntityRenderState s) {
		if (!Fx.ITEM_PHYSICS.enabled) {
			op.call(pose, axis, angle);
			return;
		}
		op.call(pose, Axis.YP, (s.seed & 0xFFFF) / 65535F * Mth.TWO_PI);
		if (kromvia$flat(s)) op.call(pose, Axis.XP, Mth.HALF_PI);
	}
}
