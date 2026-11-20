package com.kromvia.client.fx.mixin;

import com.kromvia.client.fx.Fx;
import net.minecraft.client.Camera;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.fog.FogRenderer;
import org.joml.Vector4f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(FogRenderer.class)
public class FxFogRendererMixin {
	@Inject(method = "computeFogColor", at = @At("TAIL"))
	private void kromvia$ambience(Camera camera, float partial, ClientLevel level, int renderDistance, float darken, Vector4f dest, CallbackInfo ci) {
		if (Fx.CUSTOM_SKY.enabled) Fx.CUSTOM_SKY.fog(dest);
		else if (Fx.AMBIENCE.enabled) Fx.AMBIENCE.fog(dest);
	}
}
