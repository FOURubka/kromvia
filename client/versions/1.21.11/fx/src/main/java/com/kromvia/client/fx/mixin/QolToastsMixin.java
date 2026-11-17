package com.kromvia.client.fx.mixin;

import com.kromvia.client.compat.Gfx;
import com.kromvia.client.ui.Notes;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.toasts.ToastManager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ToastManager.class)
public abstract class QolToastsMixin {
	@Inject(method = "render", at = @At("TAIL"))
	private void kromvia$notes(GuiGraphics g, CallbackInfo ci) {
		com.kromvia.client.fx.Tips.render(Gfx.of(g));
		Notes.render(Gfx.of(g));
	}
}
