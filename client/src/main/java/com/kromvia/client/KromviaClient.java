package com.kromvia.client;

import com.kromvia.client.cosmetic.Wardrobe;
import com.kromvia.client.fx.Fx;
import com.kromvia.client.fx.Qol;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import com.kromvia.client.module.ArmorModule;
import com.kromvia.client.module.EffectsModule;
import com.kromvia.client.module.Extras;
import com.kromvia.client.module.Features;
import com.kromvia.client.module.Info;
import com.kromvia.client.module.KeystrokesModule;
import com.kromvia.client.module.Module;
import com.kromvia.client.module.Text;
import com.kromvia.client.module.Toggles;
import com.kromvia.client.module.Visuals;
import net.fabricmc.api.ClientModInitializer;

public class KromviaClient implements ClientModInitializer {
	public static final List<Module> MODULES = withFx(
			Text.fps(),
			Text.cps(),
			Text.ping(),
			Text.coords(),
			Text.biome(),
			Text.speed(),
			Text.day(),
			Text.clock(),
			Text.server(),
			Text.memory(),
			Features.SATURATION,
			Features.ITEMS,
			Features.REACH,
			Features.COMBO,
			Features.COMPASS,
			Visuals.TARGET_HUD,
			Extras.DURABILITY,
			Extras.TPS,
			Extras.SESSION,
			Extras.PACK,
			Extras.LIGHT,
			new ArmorModule(),
			new EffectsModule(),
			new KeystrokesModule(),
			new Toggles.Zoom(),
			new Toggles.Fullbright(),
			new Toggles.AutoSprint(),
			Features.TOGGLE_SNEAK,
			Features.FREELOOK,
			Features.SNAPLOOK,
			new com.kromvia.client.module.Freecam(),
			new com.kromvia.client.module.EasyPlace(),
			Features.CRASH_PATCH,
			Features.CROSSHAIR,
			Features.NO_HURT_CAM,
			Features.LOW_FIRE,
			Features.NO_PUMPKIN,
			Features.HIDE_SCOREBOARD,
			Features.CHAT_TIME,
			Features.CLEAR_WEATHER,
			com.kromvia.client.module.IrlWeather.INSTANCE,
			Features.TIME,
			Visuals.NO_FOG,
			Visuals.OUTLINE,
			Visuals.HIT_COLOR,
			Visuals.PARTICLES,
			Extras.LOW_HEALTH,
			Extras.BOW_CHARGE,
			Extras.HIT_SOUND,
			Extras.TOTEM_POPS,
			Extras.DEATH_COORDS,
			Extras.TAB_PING);

	private static List<Module> withFx(Module... modules) {
		List<Module> all = new ArrayList<>(Arrays.asList(modules));
		all.addAll(Info.modules());
		all.addAll(Fx.modules());
		all.addAll(Qol.modules());
		return Collections.unmodifiableList(all);
	}

	@Override
	public void onInitializeClient() {
		Config.load();
		Wardrobe.loadShared();
		if ("1".equals(System.getenv("KROMVIA_AUDIT_MIXINS"))) org.spongepowered.asm.mixin.MixinEnvironment.getCurrentEnvironment().audit();
	}
}
