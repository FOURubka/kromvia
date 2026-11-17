package com.kromvia.client.mixin;

import com.kromvia.client.ui.UiFont;
import com.mojang.blaze3d.font.TrueTypeGlyphProvider;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(TrueTypeGlyphProvider.class)
public abstract class FontOversampleMixin {
	@ModifyVariable(method = "<init>", at = @At("HEAD"), argsOnly = true, ordinal = 1)
	private static float kromvia$oversample(float oversample) {
		return UiFont.oversample(oversample);
	}
}
