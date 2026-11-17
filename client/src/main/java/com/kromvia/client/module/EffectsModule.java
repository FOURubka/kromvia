package com.kromvia.client.module;

import com.kromvia.client.compat.Gfx;
import java.util.ArrayList;
import java.util.List;

import net.minecraft.client.Minecraft;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.item.Items;

public class EffectsModule extends Module {
	public EffectsModule() {
		super("effects", "Potion Effects", Category.PVP, Corner.TOP_RIGHT, false);
		icon(Items.POTION);
	}

	private static List<String> lines(Minecraft mc) {
		List<String> out = new ArrayList<>();
		if (mc.player == null) return out;
		for (MobEffectInstance e : mc.player.getActiveEffects()) {
			String name = e.getEffect().value().getDisplayName().getString();
			String level = e.getAmplifier() > 0 ? " " + roman(e.getAmplifier() + 1) : "";
			String time = e.isInfiniteDuration() ? "∞" : String.format("%d:%02d", e.getDuration() / 1200, e.getDuration() / 20 % 60);
			out.add(name + level + "  " + time);
		}
		return out;
	}

	private static String roman(int n) {
		return switch (n) {
			case 2 -> "II";
			case 3 -> "III";
			case 4 -> "IV";
			case 5 -> "V";
			default -> String.valueOf(n);
		};
	}

	@Override
	public boolean visible(Minecraft mc) {
		return !lines(mc).isEmpty();
	}

	@Override
	public int width(Minecraft mc) {
		int w = 0;
		for (String l : lines(mc)) w = Math.max(w, mc.font.width(l));
		return w + 6;
	}

	@Override
	public int height(Minecraft mc) {
		return lines(mc).size() * (mc.font.lineHeight + 3) + 3;
	}

	@Override
	public void render(Gfx g, Minecraft mc, int x, int y) {
		g.fill(x, y, x + width(mc), y + height(mc), TextModule.PLATE);
		int yy = y + 3;
		for (String l : lines(mc)) {
			g.drawString(mc.font, l, x + 3, yy, 0xFFFFFFFF, true);
			yy += mc.font.lineHeight + 3;
		}
	}
}
