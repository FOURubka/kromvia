package com.kromvia.client.fx.mixin;

import com.kromvia.client.module.Info;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(ItemStack.class)
public abstract class QolTooltipMixin {
	@Inject(method = "getTooltipLines", at = @At("RETURN"), cancellable = true)
	private void kromvia$durability(CallbackInfoReturnable<List<Component>> cir) {
		ItemStack self = (ItemStack) (Object) this;
		if (!Info.ITEM_TIPS.enabled || !Info.TIP_DURABILITY.on() || !self.isDamageableItem() || cir.getReturnValue().isEmpty()) return;
		int max = self.getMaxDamage();
		List<Component> lines = new ArrayList<>(cir.getReturnValue());
		lines.add(Component.literal("Durability: " + (max - self.getDamageValue()) + " / " + max).withStyle(ChatFormatting.GRAY));
		cir.setReturnValue(lines);
	}
}
