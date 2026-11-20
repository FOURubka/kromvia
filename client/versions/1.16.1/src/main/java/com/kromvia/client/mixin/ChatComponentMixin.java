package com.kromvia.client.mixin;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

import com.kromvia.client.module.Features;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.TextComponent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

@Mixin(ChatComponent.class)
public class ChatComponentMixin {
	@Unique
	private static final DateTimeFormatter KROMVIA_TIME = DateTimeFormatter.ofPattern("HH:mm");

	@ModifyVariable(method = "addMessage(Lnet/minecraft/network/chat/Component;I)V",
			at = @At("HEAD"), argsOnly = true, ordinal = 0)
	private Component kromvia$timestamp(Component message) {
		if (!Features.CHAT_TIME.enabled) return message;
		return new TextComponent("").append(new TextComponent("[" + LocalTime.now().format(KROMVIA_TIME) + "] ").withStyle(ChatFormatting.DARK_GRAY)).append(message);
	}
}
