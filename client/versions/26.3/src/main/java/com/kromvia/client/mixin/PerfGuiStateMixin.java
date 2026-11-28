package com.kromvia.client.mixin;

import com.kromvia.client.compat.HudCache;
import net.minecraft.client.renderer.state.gui.GuiElementRenderState;
import net.minecraft.client.renderer.state.gui.GuiItemRenderState;
import net.minecraft.client.renderer.state.gui.GuiRenderState;
import net.minecraft.client.renderer.state.gui.GuiTextRenderState;
import net.minecraft.client.renderer.state.gui.pip.PictureInPictureRenderState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(GuiRenderState.class)
public class PerfGuiStateMixin {
	@Inject(method = "reset", at = @At("TAIL"))
	private void kromvia$reset(CallbackInfo ci) {
		HudCache.reset();
	}

	@Inject(method = "nextStratum", at = @At("HEAD"))
	private void kromvia$stratum(CallbackInfo ci) {
		HudCache.record(GuiRenderState::nextStratum);
	}

	@Inject(method = "blurBeforeThisStratum", at = @At("HEAD"))
	private void kromvia$blur(CallbackInfo ci) {
		HudCache.record(GuiRenderState::blurBeforeThisStratum);
	}

	@Inject(method = "addItem", at = @At("HEAD"))
	private void kromvia$item(GuiItemRenderState s, CallbackInfo ci) {
		HudCache.record(g -> g.addItem(s));
	}

	@Inject(method = "addText", at = @At("HEAD"))
	private void kromvia$text(GuiTextRenderState s, CallbackInfo ci) {
		HudCache.record(g -> g.addText(s));
	}

	@Inject(method = "addPicturesInPictureState", at = @At("HEAD"))
	private void kromvia$pip(PictureInPictureRenderState s, CallbackInfo ci) {
		HudCache.record(g -> g.addPicturesInPictureState(s));
	}

	@Inject(method = "addGuiElement", at = @At("HEAD"))
	private void kromvia$element(GuiElementRenderState s, CallbackInfo ci) {
		HudCache.record(g -> g.addGuiElement(s));
	}
}
