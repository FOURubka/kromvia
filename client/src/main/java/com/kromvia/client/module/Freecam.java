package com.kromvia.client.module;

import com.kromvia.client.Binds;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.SliderSetting;
import net.minecraft.client.CameraType;
import net.minecraft.client.KeyMapping;
import com.kromvia.client.compat.Gfx;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.item.Items;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

public final class Freecam extends Module {
	static Freecam instance;
	private static boolean active, bypass;
	private static double x, y, z, vx, vy, vz;
	private static float yaw, pitch;
	private static boolean placed;
	private static long last;

	final ChoiceSetting mode = add(new ChoiceSetting("mode", "Activation", 0, "Toggle", "Hold"));
	final SliderSetting speed = add(new SliderSetting("speed", "Speed", 10, 1, 60, 1, " b/s"));
	final SliderSetting boost = add(new SliderSetting("boost", "Sprint boost", 3, 1, 10, 0.5F, "x"));
	final SliderSetting sensitivity = add(new SliderSetting("sensitivity", "Mouse sensitivity", 100, 25, 200, 5, "%"));
	final ChoiceSetting movement = add(new ChoiceSetting("movement", "Fly direction", 0, "Where I look", "Flat"));
	final ChoiceSetting interact = add(new ChoiceSetting("interact", "Block interaction", 0, "Off", "Where I look (in reach)"));
	final BoolSetting collide = add(new BoolSetting("collide", "Collide with blocks", false));
	final BoolSetting smooth = add(new BoolSetting("smooth", "Smooth movement", true));
	final BoolSetting remember = add(new BoolSetting("remember", "Remember last position", false));
	final BoolSetting servers = add(new BoolSetting("servers", "Allow on servers", false));

	private CameraType saved;
	private boolean held;

	public Freecam() {
		super("freecam", "Freecam", Category.UTILITY, Corner.TOP_LEFT, false);
		icon(Items.ENDER_EYE);
		instance = this;
	}

	@Override
	public boolean hud() {
		return false;
	}

	public static boolean active() {
		return active;
	}

	@Override
	public void tick(Minecraft mc) {
		if (mc.player == null || mc.level == null) {
			if (active) stop(mc);
			placed = false;
			return;
		}
		boolean down = Mc.screen() == null && Binds.down(Binds.FREECAM);
		boolean hold = mode.index() == 1;
		if (down && !held) {
			if (!active) start(mc);
			else if (!hold) stop(mc);
		} else if (hold && held && !down && active) {
			stop(mc);
		}
		held = down;
	}

	private void start(Minecraft mc) {
		if (!mc.hasSingleplayerServer()) {
			if (!servers.on()) {
				Mc.say(Component.literal("§5[§dK§5] §rFreecam is off on servers. Turn on \"Allow on servers\" in its settings at your own risk: anti-cheats can ban for it."));
				return;
			}
			Mc.say(Component.literal("§5[§dK§5] §rFreecam is not recommended on servers: some anti-cheats flag it."));
		}
		saved = mc.options.getCameraType();
		mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
		if (!remember.on() || !placed) {
			Vec3 eye = mc.player.getEyePosition(1F);
			x = eye.x;
			y = eye.y;
			z = eye.z;
			yaw = mc.player.getYRot();
			pitch = mc.player.getXRot();
			placed = true;
		}
		vx = vy = vz = 0;
		last = System.nanoTime();
		active = true;
	}

	private void stop(Minecraft mc) {
		active = false;
		if (saved != null) mc.options.setCameraType(saved);
		saved = null;
		KeyMapping.releaseAll();
		KeyMapping.setAll();
	}

	@Override
	public void disable(Minecraft mc) {
		if (active) stop(mc);
	}

	public static boolean blocks(KeyMapping k) {
		if (!active || bypass) return false;
		Options o = Minecraft.getInstance().options;
		if (k == o.keyUp || k == o.keyDown || k == o.keyLeft || k == o.keyRight || k == o.keyJump || k == o.keyShift || k == o.keySprint) return true;
		return instance.interact.index() == 0 && (k == o.keyAttack || k == o.keyUse || k == o.keyPickItem);
	}

	public static void turn(double dx, double dy) {
		float s = 0.15F * instance.sensitivity.value() / 100F;
		yaw += (float) dx * s;
		pitch = Mth.clamp(pitch + (float) dy * s, -90, 90);
	}

	public static float yaw() {
		return yaw;
	}

	public static float pitch() {
		return pitch;
	}

	public static Vec3 frame() {
		long now = System.nanoTime();
		float dt = Math.min(0.1F, (now - last) / 1e9F);
		last = now;
		Minecraft mc = Minecraft.getInstance();
		Freecam f = instance;
		float fwd = 0, side = 0, up = 0;
		boolean fast = false;
		if (Mc.screen() == null) {
			Options o = mc.options;
			bypass = true;
			if (o.keyUp.isDown()) fwd++;
			if (o.keyDown.isDown()) fwd--;
			if (o.keyLeft.isDown()) side++;
			if (o.keyRight.isDown()) side--;
			if (o.keyJump.isDown()) up++;
			if (o.keyShift.isDown()) up--;
			fast = o.keySprint.isDown();
			bypass = false;
		}
		double ry = Math.toRadians(yaw), rp = Math.toRadians(pitch);
		boolean look = f.movement.index() == 0;
		double cp = look ? Math.cos(rp) : 1;
		double tx = -Math.sin(ry) * cp * fwd + Math.cos(ry) * side;
		double tz = Math.cos(ry) * cp * fwd + Math.sin(ry) * side;
		double ty = (look ? -Math.sin(rp) * fwd : 0) + up;
		double len = Math.sqrt(tx * tx + ty * ty + tz * tz);
		double v = f.speed.value() * (fast ? f.boost.value() : 1);
		if (len > 0) {
			tx = tx / len * v;
			ty = ty / len * v;
			tz = tz / len * v;
		}
		if (f.smooth.on()) {
			double a = 1 - Math.exp(-dt * 10);
			vx += (tx - vx) * a;
			vy += (ty - vy) * a;
			vz += (tz - vz) * a;
		} else {
			vx = tx;
			vy = ty;
			vz = tz;
		}
		boolean solid = f.collide.on() && mc.level != null;
		if (!solid || free(mc, x + vx * dt, y, z)) x += vx * dt;
		else vx = 0;
		if (!solid || free(mc, x, y + vy * dt, z)) y += vy * dt;
		else vy = 0;
		if (!solid || free(mc, x, y, z + vz * dt)) z += vz * dt;
		else vz = 0;
		aim(mc);
		return new Vec3(x, y, z);
	}

	public static void aim(Minecraft mc) {
		if (!active || instance.interact.index() == 0 || mc.player == null || mc.level == null) return;
		Vec3 from = new Vec3(x, y, z);
		double ry = Math.toRadians(yaw), rp = Math.toRadians(pitch);
		Vec3 dir = new Vec3(-Math.sin(ry) * Math.cos(rp), -Math.sin(rp), Math.cos(ry) * Math.cos(rp));
		Vec3 eye = mc.player.getEyePosition(1F);
		double blockReach = mc.player.isCreative() ? 5 : 4.5, entityReach = 3;
		double far = eye.distanceTo(from) + blockReach;
		Vec3 to = from.add(dir.scale(far));
		HitResult hit = mc.level.clip(new ClipContext(from, to, ClipContext.Block.OUTLINE, ClipContext.Fluid.NONE, mc.player));
		double limit = hit.getType() == HitResult.Type.MISS ? far : from.distanceTo(hit.getLocation());
		Entity best = null;
		Vec3 bestAt = null;
		for (Entity e : mc.level.getEntities(mc.player, new AABB(from, to).inflate(1), e -> !e.isSpectator() && e.isPickable())) {
			Vec3 at = e.getBoundingBox().inflate(e.getPickRadius()).clip(from, to).orElse(null);
			if (at == null || from.distanceTo(at) >= limit) continue;
			limit = from.distanceTo(at);
			best = e;
			bestAt = at;
		}
		if (best != null) {
			mc.hitResult = eye.distanceTo(bestAt) <= entityReach ? new EntityHitResult(best, bestAt) : miss(to);
		} else if (hit.getType() == HitResult.Type.BLOCK) {
			mc.hitResult = eye.distanceTo(hit.getLocation()) <= blockReach ? hit : miss(to);
		} else {
			mc.hitResult = miss(to);
		}
	}

	private static HitResult miss(Vec3 to) {
		return BlockHitResult.miss(to, net.minecraft.core.Direction.UP, net.minecraft.core.BlockPos.ZERO);
	}

	@Override
	public void overlay(Gfx g, Minecraft mc) {
		if (!active || interact.index() == 0 || Mc.hudHidden()) return;
		int cx = g.guiWidth() / 2, cy = g.guiHeight() / 2;
		boolean target = mc.hitResult != null && mc.hitResult.getType() != HitResult.Type.MISS;
		int col = target ? 0xFFFFFFFF : 0x80FFFFFF;
		g.fill(cx - 4, cy, cx + 5, cy + 1, col);
		g.fill(cx, cy - 4, cx + 1, cy + 5, col);
	}

	private static boolean free(Minecraft mc, double px, double py, double pz) {
		double r = 0.15;
		return mc.level.noCollision(new AABB(px - r, py - r, pz - r, px + r, py + r, pz + r));
	}
}
