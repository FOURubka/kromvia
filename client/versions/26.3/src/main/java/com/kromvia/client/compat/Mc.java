package com.kromvia.client.compat;

import com.mojang.blaze3d.platform.InputConstants;
import java.util.function.Supplier;
import net.minecraft.client.KeyMapping;
import net.minecraft.resources.Identifier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.PlayerSkin;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;

public final class Mc {
	private Mc() {}

	private static Minecraft mc() {
		return Minecraft.getInstance();
	}

	public static Screen screen() {
		return mc().gui.screen();
	}

	public static void setScreen(Screen screen) {
		mc().gui.setScreen(screen);
	}

	public static void leaveWorld(Screen next) {
		if (mc().level != null) mc().disconnectFromWorld(ClientLevel.DEFAULT_QUIT_MESSAGE);
		setScreen(next);
	}

	public static boolean hudHidden() {
		return mc().gui.hud.isHidden();
	}

	public static void actionbar(Component message) {
		mc().gui.hud.setOverlayMessage(message, false);
	}

	public static void say(Component message) {
		mc().gui.hud.getChat().addClientSystemMessage(message);
	}

	public static long dayTime(Level level) {
		return level.getDefaultClockTime();
	}

	public static boolean keyDown(int key) {
		return InputConstants.isKeyDown(key);
	}

	private static KeyMapping.Category binds;

	public static KeyMapping bind(String name, int key) {
		if (binds == null) binds = KeyMapping.Category.register(Identifier.fromNamespaceAndPath("kromvia", "binds"));
		return new KeyMapping(name, key, binds);
	}

	public static Item redDye() {
		return Items.DYE.red();
	}

	public static EntityType<?> playerType() {
		return EntityTypes.PLAYER;
	}

	public static Supplier<PlayerSkin> ownSkin() {
		return mc().getSkinManager().createLookup(mc().getGameProfile(), false);
	}

	public static void fullBright(EntityRenderState state) {
		state.lightCoords = 0xF000F0;
	}

	public static void initScreen(Screen s, int w, int h) {
		s.init(w, h);
	}

	public static String label(AbstractWidget w) {
		return w.getMessage().getString();
	}

	public static void place(AbstractWidget w, int x, int y, int width) {
		w.setX(x);
		w.setY(y);
		w.setWidth(width);
	}

	public static float[] view() {
		net.minecraft.client.Camera cam = mc().gameRenderer.mainCamera();
		net.minecraft.world.phys.Vec3 p = cam.position();
		return new float[] {(float) p.x, (float) p.y, (float) p.z, cam.yRot(), cam.xRot(), com.kromvia.client.module.Info.fov};
	}

	public static String gpu() {
		try {
			return com.mojang.blaze3d.systems.RenderSystem.getDevice().getDeviceInfo().name();
		} catch (RuntimeException e) {
			return "";
		}
	}
}
