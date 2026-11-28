package com.kromvia.client.mixin;

import com.kromvia.client.compat.HudCache;
import com.kromvia.client.module.Perf;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.screens.Overlay;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.state.gui.GuiRenderState;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Gui.class)
public class PerfGuiMixin {
	static {
		Perf.INSTANCE.shown = true;
		Perf.INSTANCE.hudCache.shown = true;
		Perf.INSTANCE.hudRate.shown = true;
	}

	@Shadow @Final private GuiRenderState guiRenderState;
	@Shadow private Screen screen;
	@Shadow private Overlay overlay;

	@Inject(method = "extractRenderState", at = @At("HEAD"), cancellable = true)
	private void kromvia$reuseHud(DeltaTracker delta, boolean level, boolean loaded, CallbackInfo ci) {
		com.kromvia.client.module.FrameGraph.frame();
		if (HudCache.replay(Minecraft.getInstance(), guiRenderState, level, screen == null && overlay == null)) ci.cancel();
	}

	@Inject(method = "extractRenderState", at = @At("TAIL"))
	private void kromvia$recordHud(DeltaTracker delta, boolean level, boolean loaded, CallbackInfo ci) {
		HudCache.end();
	}
}
