package com.kromvia.client.module;

import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.SliderSetting;
import net.minecraft.world.item.Items;

public final class Perf extends Module {
	public static final Perf INSTANCE = new Perf();

	public final BoolSetting hudCache = add(new BoolSetting("hud_cache", "Reuse HUD between frames", true));
	public final SliderSetting hudRate = add(new SliderSetting("hud_rate", "HUD refresh rate", 144, 30, 360, 10, " fps"));

	private Perf() {
		super("performance", "Performance", Module.Category.UTILITY, Module.Corner.TOP_LEFT, true);
		icon(Items.REDSTONE);
		shown = false;
		hudCache.shown = false;
		hudRate.shown = false;
	}

	@Override
	public boolean hud() {
		return false;
	}

	public boolean hudCache() {
		return enabled && hudCache.on();
	}
}
