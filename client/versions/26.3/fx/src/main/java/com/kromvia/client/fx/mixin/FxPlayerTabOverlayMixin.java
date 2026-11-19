package com.kromvia.client.fx.mixin;

import com.kromvia.client.fx.Players;
import net.minecraft.client.gui.components.PlayerTabOverlay;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(PlayerTabOverlay.class)
public class FxPlayerTabOverlayMixin {
	@Inject(method = "getNameForDisplay", at = @At("RETURN"), cancellable = true)
	private void kromvia$badge(PlayerInfo info, CallbackInfoReturnable<Component> cir) {
		cir.setReturnValue(Players.badgedTab(info.getProfile().name(), cir.getReturnValue()));
	}
}
