package com.kromvia.client.fx.mixin;

import com.kromvia.client.compat.Mc;
import com.kromvia.client.fx.Fx;
import com.kromvia.client.fx.Onboarding;
import com.kromvia.client.ui.KromviaTitleScreen;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(KromviaTitleScreen.class)
public class QolTitleScreenMixin {
	@Inject(method = "init", at = @At("TAIL"))
	private void kromvia$welcome(CallbackInfo ci) {
		Minecraft mc = Minecraft.getInstance();
		if ("1".equals(System.getenv("KROMVIA_AUDIT_MIXINS"))) mc.schedule(() -> {
			Fx.MOTION_BLUR.audit(mc);
			Fx.SATURATION.audit(mc);
			Fx.COLOUR_FILTER.audit(mc);
			mc.stop();
		});
		if (!Onboarding.needed()) return;
		mc.schedule(() -> {
			if (Mc.screen() == (Object) this) Mc.setScreen(new Onboarding(Mc.screen(), mc::resizeDisplay));
		});
	}
}
