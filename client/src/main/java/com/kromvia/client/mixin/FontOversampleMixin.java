package com.kromvia.client.mixin;

import com.kromvia.client.ui.UiFont;
import com.mojang.blaze3d.font.TrueTypeGlyphProvider;
import it.unimi.dsi.fastutil.ints.IntSet;
import it.unimi.dsi.fastutil.ints.IntSets;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(TrueTypeGlyphProvider.class)
public abstract class FontOversampleMixin {
	@Unique
	private boolean kromvia$off;

	@ModifyVariable(method = "<init>", at = @At("HEAD"), argsOnly = true, ordinal = 1)
	private static float kromvia$oversample(float oversample) {
		return UiFont.oversample(oversample);
	}

	@Inject(method = "<init>", at = @At("RETURN"))
	private void kromvia$mark(CallbackInfo ci) {
		kromvia$off = UiFont.built() && UiFont.off();
	}

	@Inject(method = "getGlyph", at = @At("HEAD"), cancellable = true)
	private void kromvia$glyph(CallbackInfoReturnable<Object> cir) {
		if (kromvia$off) cir.setReturnValue(null);
	}

	@Inject(method = "getSupportedGlyphs", at = @At("HEAD"), cancellable = true, require = 0)
	private void kromvia$supported(CallbackInfoReturnable<IntSet> cir) {
		if (kromvia$off) cir.setReturnValue(IntSets.EMPTY_SET);
	}
}
