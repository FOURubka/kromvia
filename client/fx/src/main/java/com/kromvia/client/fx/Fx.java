package com.kromvia.client.fx;

import com.kromvia.client.module.Module;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.ColorSetting;
import com.kromvia.client.module.setting.SliderSetting;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector3f;
import org.joml.Vector4f;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class Fx {
	private Fx() {}

	private static final Logger LOG = LoggerFactory.getLogger("kromvia");
	private static final int VIOLET = 0xFF8B5CF6;

	private static class Flag extends Module {
		Flag(String id, String name, Category cat) {
			super(id, name, cat, Corner.TOP_LEFT, false);
		}

		@Override
		public boolean hud() {
			return false;
		}
	}

	private abstract static class WorldFx extends Flag {
		WorldFx(String id, String name, Category cat) {
			super(id, name, cat);
		}

		abstract void draw(Minecraft mc, VertexConsumer b, PoseStack.Pose p, Vec3 cam, float partial);
	}

	private static int rainbow(float hue) {
		return 0xFF000000 | Mth.hsvToRgb(hue - (float) Math.floor(hue), 0.75F, 1);
	}

	public static final class MotionBlur extends Flag {
		final ChoiceSetting strength = add(new ChoiceSetting("strength", "Strength", 1, "Low", "Medium", "High"));

		MotionBlur() {
			super("motion_blur", "Motion Blur", Category.UTILITY);
			icon(Items.ENDER_EYE);
		}

		private final Matrix4f view = new Matrix4f(), projection = new Matrix4f();
		private final Matrix4f prevView = new Matrix4f(), prevProjection = new Matrix4f();
		private Vec3 position = Vec3.ZERO, prevPosition = Vec3.ZERO;
		private boolean haveFrame, havePrevious;

		public void capture(Vec3 pos, Matrix4f viewMatrix, Matrix4f projectionMatrix) {
			if (haveFrame) {
				prevView.set(view);
				prevProjection.set(projection);
				prevPosition = position;
				havePrevious = true;
			}
			view.set(viewMatrix);
			projection.set(projectionMatrix);
			position = pos;
			haveFrame = true;
		}

		public void render(Minecraft mc, Object target, Object pool) {
			if (!enabled || !haveFrame) return;
			String name = "motion_blur_" + strength.current().toLowerCase(Locale.ROOT);
			boolean still = !havePrevious || position.subtract(prevPosition).lengthSqr() > 64;
			Matrix4f inverse = new Matrix4f(projection).mul(view).invert();
			Matrix4f previous = still ? new Matrix4f(projection).mul(view) : new Matrix4f(prevProjection).mul(prevView);
			try {
				BlurBackend.draw(mc, name, inverse, previous, Vec3.ZERO, target, pool);
			} catch (RuntimeException e) {
				LOG.warn("Motion blur {} failed, switching it off", name, e);
				enabled = false;
			}
		}

		public void audit(Minecraft mc) {
			for (String level : new String[] {"low", "medium", "high"}) {
				try {
					BlurBackend.load(mc, "motion_blur_" + level);
					LOG.info("Motion blur {} loads", level);
				} catch (RuntimeException e) {
					LOG.error("Motion blur {} does not load", level, e);
				}
			}
		}
	}

	public static final MotionBlur MOTION_BLUR = new MotionBlur();

	public static final class Saturation extends Flag {
		final SliderSetting amount = add(new SliderSetting("amount", "Saturation", 150, 0, 200, 25, "%"));
		final SliderSetting brightness = add(new SliderSetting("brightness", "Brightness", 100, 50, 150, 10, "%"));
		final SliderSetting contrast = add(new SliderSetting("contrast", "Contrast", 100, 50, 150, 10, "%"));
		final SliderSetting hue = add(new SliderSetting("hue", "Hue shift", 0, 0, 330, 30, "°"));

		Saturation() {
			super("screen_colours", "Screen Colours", Category.UTILITY);
			icon(Items.INK_SAC);
		}

		public void render(Minecraft mc, Object target, Object pool) {
			if (!enabled) return;
			pass(mc, target, pool, "saturation", amount.value(), 25, 100);
			pass(mc, target, pool, "brightness", brightness.value(), 10, 100);
			pass(mc, target, pool, "contrast", contrast.value(), 10, 100);
			pass(mc, target, pool, "hue", hue.value(), 30, 0);
		}

		private void pass(Minecraft mc, Object target, Object pool, String name, float value, int step, int neutral) {
			int n = Math.round(value / step) * step;
			if (!enabled || n == neutral) return;
			try {
				BlurBackend.draw(mc, name + "_" + n, new Matrix4f(), new Matrix4f(), Vec3.ZERO, target, pool);
			} catch (RuntimeException e) {
				LOG.warn("Screen colours {} {} failed, switching it off", name, n, e);
				enabled = false;
			}
		}

		public void audit(Minecraft mc) {
			if (!BlurBackend.SUPPORTED) return;
			int failed = 0;
			for (String name : new String[] {"saturation", "brightness", "contrast", "hue"}) {
				int step = name.equals("saturation") ? 25 : name.equals("hue") ? 30 : 10;
				int min = name.equals("saturation") ? 0 : name.equals("hue") ? 30 : 50;
				int max = name.equals("saturation") ? 200 : name.equals("hue") ? 330 : 150;
				for (int n = min; n <= max; n += step) {
					if (n == 100 && !name.equals("hue")) continue;
					try {
						if (BlurBackend.load(mc, name + "_" + n) == null) {
							failed++;
							LOG.error("Screen colours {}_{} does not load", name, n);
						}
					} catch (RuntimeException e) {
						failed++;
						LOG.error("Screen colours {}_{} does not load", name, n, e);
					}
				}
			}
			if (failed == 0) LOG.info("Screen colours load");
		}
	}

	public static final Saturation SATURATION = new Saturation();

	public static final class Ambience extends Flag {
		final ColorSetting sky = add(new ColorSetting("sky", "Sky", VIOLET));
		final ColorSetting fog = add(new ColorSetting("fog", "Fog", VIOLET));
		final SliderSetting strength = add(new SliderSetting("strength", "Strength", 50, 5, 100, 5, "%"));

		Ambience() {
			super("ambience", "Ambience", Category.UTILITY);
			icon(Items.SUNFLOWER);
		}

		private float mix(float vanilla, int channel) {
			return Mth.lerp(strength.value() / 100, vanilla, channel / 255F);
		}

		public int sky(int rgb) {
			int c = sky.argb();
			return rgb & 0xFF000000 | Math.round(mix((rgb >> 16 & 0xFF) / 255F, c >> 16 & 0xFF) * 255) << 16
					| Math.round(mix((rgb >> 8 & 0xFF) / 255F, c >> 8 & 0xFF) * 255) << 8 | Math.round(mix((rgb & 0xFF) / 255F, c & 0xFF) * 255);
		}

		public void sky(Vector3f rgb) {
			int c = sky.argb();
			rgb.set(mix(rgb.x, c >> 16 & 0xFF), mix(rgb.y, c >> 8 & 0xFF), mix(rgb.z, c & 0xFF));
		}

		public void fog(Vector4f rgba) {
			int c = fog.argb();
			rgba.set(mix(rgba.x, c >> 16 & 0xFF), mix(rgba.y, c >> 8 & 0xFF), mix(rgba.z, c & 0xFF), rgba.w);
		}
	}

	public static final Ambience AMBIENCE = new Ambience();

	public static final Module OLD_ANIMATIONS = new Flag("old_animations", "1.7 Animations", Module.Category.PVP).icon(Items.CLOCK);

	public static final class HandPosition extends Flag {
		final SliderSetting x = add(new SliderSetting("x", "Sideways", 0, -0.5F, 0.5F, 0.05F, ""));
		final SliderSetting y = add(new SliderSetting("y", "Height", 0, -0.5F, 0.5F, 0.05F, ""));
		final SliderSetting z = add(new SliderSetting("z", "Depth", 0, -0.5F, 0.5F, 0.05F, ""));
		final SliderSetting scale = add(new SliderSetting("scale", "Size", 1, 0.5F, 1.5F, 0.05F, "x"));

		HandPosition() {
			super("hand_position", "Hand Position", Category.UTILITY);
			icon(Items.STICK);
		}

		public void apply(PoseStack pose) {
			pose.translate(x.value(), y.value(), z.value());
			float s = scale.value();
			pose.scale(s, s, s);
		}
	}

	public static final HandPosition HAND = new HandPosition();

	public static final class Trails extends WorldFx {
		final ColorSetting color = add(new ColorSetting("color", "Colour", VIOLET));
		final BoolSetting rainbow = add(new BoolSetting("rainbow", "Rainbow", false));
		final SliderSetting length = add(new SliderSetting("length", "Length", 20, 5, 60, 5, "t"));
		final SliderSetting height = add(new SliderSetting("height", "Height", 0.4F, 0.1F, 1.8F, 0.1F, "m"));
		private final ArrayDeque<Vec3> points = new ArrayDeque<>();

		Trails() {
			super("trails", "Trails", Category.UTILITY);
			icon(Items.FIREWORK_ROCKET);
		}

		@Override
		public void tick(Minecraft mc) {
			if (mc.player == null) {
				points.clear();
				return;
			}
			points.addFirst(mc.player.position());
			while (points.size() > length.value()) points.removeLast();
		}

		@Override
		public void disable(Minecraft mc) {
			points.clear();
		}

		@Override
		void draw(Minecraft mc, VertexConsumer b, PoseStack.Pose p, Vec3 cam, float partial) {
			if (mc.player.isInvisible() || points.isEmpty()) return;
			Vec3 prev = mc.player.getPosition(partial).subtract(cam);
			float h = height.value(), n = points.size();
			int i = 0;
			for (Vec3 point : points) {
				Vec3 cur = point.subtract(cam);
				int c0 = segmentColor(i, n), c1 = segmentColor(i + 1, n);
				Draw.vertex(b, p, prev.x, prev.y, prev.z, c0);
				Draw.vertex(b, p, prev.x, prev.y + h, prev.z, Draw.alpha(c0, 0));
				Draw.vertex(b, p, cur.x, cur.y + h, cur.z, Draw.alpha(c1, 0));
				Draw.vertex(b, p, cur.x, cur.y, cur.z, c1);
				prev = cur;
				i++;
			}
		}

		private int segmentColor(int i, float n) {
			int c = rainbow.on() ? rainbow(i / 30F) : color.argb();
			return Draw.alpha(c, 0.7F * (1 - i / n));
		}
	}

	public static final Trails TRAILS = new Trails();

	public static final class JumpCircles extends WorldFx {
		private static final int LIFE = 20;
		final ColorSetting color = add(new ColorSetting("color", "Colour", VIOLET));
		final SliderSetting radius = add(new SliderSetting("radius", "Size", 1.2F, 0.5F, 3, 0.1F, "m"));

		private record Circle(Vec3 pos, int born) {}

		private final List<Circle> circles = new ArrayList<>();
		private boolean wasOnGround = true;
		private int age;

		JumpCircles() {
			super("jump_circles", "Jump Circles", Category.UTILITY);
			icon(Items.SLIME_BALL);
		}

		@Override
		public void tick(Minecraft mc) {
			age++;
			circles.removeIf(c -> age - c.born > LIFE);
			if (mc.player == null) return;
			boolean onGround = mc.player.onGround();
			if (wasOnGround && !onGround && mc.player.getDeltaMovement().y > 0) circles.add(new Circle(mc.player.position(), age));
			wasOnGround = onGround;
		}

		@Override
		public void disable(Minecraft mc) {
			circles.clear();
		}

		@Override
		void draw(Minecraft mc, VertexConsumer b, PoseStack.Pose p, Vec3 cam, float partial) {
			for (Circle c : circles) {
				float t = Mth.clamp((age - c.born + partial) / LIFE, 0, 1);
				float r = radius.value() * (1 - (1 - t) * (1 - t) * (1 - t));
				Vec3 at = c.pos.subtract(cam);
				int col = Draw.alpha(color.argb(), 1 - t);
				Draw.ring(b, p, at.x, at.y + 0.02, at.z, r * 0.75F, r, Draw.alpha(col, 0), col, 48);
			}
		}
	}

	public static final JumpCircles JUMP_CIRCLES = new JumpCircles();

	public static final class ChinaHat extends WorldFx {
		private static final int SEGMENTS = 32;
		final ColorSetting color = add(new ColorSetting("color", "Colour", VIOLET));
		final BoolSetting rainbow = add(new BoolSetting("rainbow", "Rainbow", false));
		final SliderSetting size = add(new SliderSetting("size", "Size", 0.6F, 0.3F, 1.2F, 0.05F, "m"));
		private final int[] colors = new int[SEGMENTS];

		ChinaHat() {
			super("china_hat", "China Hat", Category.UTILITY);
			icon(Items.BOWL);
		}

		@Override
		void draw(Minecraft mc, VertexConsumer b, PoseStack.Pose p, Vec3 cam, float partial) {
			if (mc.options.getCameraType().isFirstPerson() || mc.player.isInvisible()) return;
			Vec3 at = mc.player.getPosition(partial).subtract(cam);
			float spin = (mc.player.tickCount + partial) / 80F;
			for (int i = 0; i < SEGMENTS; i++) colors[i] = rainbow.on() ? rainbow(spin + (float) i / SEGMENTS) : color.argb();
			float r = size.value();
			Draw.cone(b, p, at.x, at.y + mc.player.getBbHeight() + 0.05, at.z, r, r * 0.45F, colors, 0.4F, 0.8F);
		}
	}

	public static final ChinaHat CHINA_HAT = new ChinaHat();

	private static LivingEntity attacked;
	private static long attackedAt;

	private static LivingEntity target(Minecraft mc) {
		if (mc.crosshairPickEntity instanceof LivingEntity le && le.isAlive()) return le;
		boolean fresh = System.currentTimeMillis() - attackedAt < 4000;
		return fresh && attacked != null && attacked.isAlive() && attacked.level() == mc.level ? attacked : null;
	}

	public static final class TargetMarker extends WorldFx {
		final ColorSetting color = add(new ColorSetting("color", "Colour", VIOLET));

		TargetMarker() {
			super("target_marker", "Target Marker", Category.PVP);
			icon(Items.TARGET);
		}

		@Override
		void draw(Minecraft mc, VertexConsumer b, PoseStack.Pose p, Vec3 cam, float partial) {
			LivingEntity e = target(mc);
			if (e == null || e == mc.player) return;
			Vec3 at = e.getPosition(partial).subtract(cam);
			float time = e.tickCount + partial;
			float h = e.getBbHeight(), y = h * (0.5F + 0.42F * Mth.sin(time * 0.1F));
			float r = e.getBbWidth() * 0.75F + 0.15F;
			int c = color.argb();
			Draw.band(b, p, at.x, at.y + y, at.z, r, 0.35F, Draw.alpha(c, 0.6F), Draw.alpha(c, 0), 40);
			Draw.ring(b, p, at.x, at.y + y, at.z, r - 0.03F, r + 0.03F, Draw.alpha(c, 0.9F), Draw.alpha(c, 0.9F), 40);
		}
	}

	public static final TargetMarker TARGET_MARKER = new TargetMarker();

	public static final class HitBubbles extends WorldFx {
		private static final int LIFE = 12;
		final ColorSetting color = add(new ColorSetting("color", "Colour", VIOLET));

		private record Bubble(Vec3 pos, int born, float size) {}

		private final List<Bubble> bubbles = new ArrayList<>();
		private int age;

		HitBubbles() {
			super("hit_bubbles", "Hit Bubbles", Category.PVP);
			icon(Items.GLASS_BOTTLE);
		}

		void hit(Minecraft mc, Entity target) {
			Vec3 at = mc.hitResult != null && mc.hitResult.getType() == net.minecraft.world.phys.HitResult.Type.ENTITY
					? mc.hitResult.getLocation() : target.getBoundingBox().getCenter();
			bubbles.add(new Bubble(at, age, 0.3F + target.getBbWidth() * 0.3F));
		}

		@Override
		public void tick(Minecraft mc) {
			age++;
			bubbles.removeIf(bb -> age - bb.born > LIFE);
		}

		@Override
		public void disable(Minecraft mc) {
			bubbles.clear();
		}

		@Override
		void draw(Minecraft mc, VertexConsumer b, PoseStack.Pose p, Vec3 cam, float partial) {
			for (Bubble bb : bubbles) {
				float t = Mth.clamp((age - bb.born + partial) / LIFE, 0, 1);
				float r = bb.size * (0.3F + 0.7F * (1 - (1 - t) * (1 - t)));
				Vec3 at = bb.pos.subtract(cam);
				int c = Draw.alpha(color.argb(), 1 - t);
				Draw.facingRing(b, p, at.x, at.y, at.z, r * 0.8F, r, Draw.alpha(c, 0.15F), c, 32);
				Draw.facingRing(b, p, at.x, at.y, at.z, 0, r * 0.8F, Draw.alpha(c, 0.05F), Draw.alpha(c, 0.15F), 32);
			}
		}
	}

	public static final HitBubbles HIT_BUBBLES = new HitBubbles();

	public static final class Hitboxes extends WorldFx {
		final ColorSetting players = add(new ColorSetting("players", "Players", VIOLET));
		final ColorSetting monsters = add(new ColorSetting("monsters", "Monsters", 0xFFFF5050));
		final ColorSetting animals = add(new ColorSetting("animals", "Other mobs", 0xFF50D070));
		final ColorSetting other = add(new ColorSetting("other", "Items and others", 0xFFFFFFFF));
		final SliderSetting thickness = add(new SliderSetting("thickness", "Thickness", 1.5F, 0.5F, 4, 0.5F, "px"));
		final BoolSetting look = add(new BoolSetting("look", "Look direction", true));

		Hitboxes() {
			super("hitboxes", "Hitboxes", Category.PVP);
			icon(Items.SCAFFOLDING);
		}

		private int color(Entity e) {
			if (e instanceof net.minecraft.world.entity.player.Player) return players.argb();
			if (e instanceof net.minecraft.world.entity.monster.Enemy) return monsters.argb();
			if (e instanceof LivingEntity) return animals.argb();
			return other.argb();
		}

		@Override
		void draw(Minecraft mc, VertexConsumer b, PoseStack.Pose p, Vec3 cam, float partial) {
			float px = thickness.value() * 0.0025F;
			for (Entity e : mc.level.entitiesForRendering()) {
				if (e == mc.getCameraEntity() && mc.options.getCameraType().isFirstPerson() || e.isInvisibleTo(mc.player)) continue;
				Vec3 at = e.getPosition(partial);
				if (at.distanceToSqr(cam) > 64 * 64) continue;
				var box = e.getBoundingBox().move(at.subtract(e.position())).move(-cam.x, -cam.y, -cam.z);
				int c = color(e);
				double w = px * Math.max(1, Math.sqrt(box.getCenter().lengthSqr()));
				double[] xs = {box.minX, box.maxX}, ys = {box.minY, box.maxY}, zs = {box.minZ, box.maxZ};
				for (int i = 0; i < 2; i++) {
					for (int j = 0; j < 2; j++) {
						Draw.line(b, p, xs[0], ys[i], zs[j], xs[1], ys[i], zs[j], w, c);
						Draw.line(b, p, xs[i], ys[0], zs[j], xs[i], ys[1], zs[j], w, c);
						Draw.line(b, p, xs[i], ys[j], zs[0], xs[i], ys[j], zs[1], w, c);
					}
				}
				if (look.on() && e instanceof LivingEntity) {
					Vec3 eye = e.getEyePosition(partial).subtract(cam), to = eye.add(e.getViewVector(partial).scale(2));
					Draw.line(b, p, eye.x, eye.y, eye.z, to.x, to.y, to.z, w, 0xFF4080FF);
				}
			}
		}
	}

	public static final Hitboxes HITBOXES = new Hitboxes();

	private static final List<WorldFx> WORLD = List.of(TRAILS, JUMP_CIRCLES, CHINA_HAT, TARGET_MARKER, HIT_BUBBLES, HITBOXES);

	public static final Players PLAYERS = new Players();

	static {
		Toasts.listen();
	}

	public static List<Module> modules() {
		List<Module> all = new ArrayList<>(List.of(AMBIENCE, OLD_ANIMATIONS, HAND, TRAILS, JUMP_CIRCLES, CHINA_HAT, TARGET_MARKER, HIT_BUBBLES, HITBOXES));
		if (BlurBackend.SUPPORTED) all.add(0, MOTION_BLUR);
		if (BlurBackend.SUPPORTED) all.add(1, SATURATION);
		if (com.kromvia.client.Launcher.PRESENT) all.add(0, PLAYERS);
		all.addAll(Tweaks.modules());
		all.addAll(More.modules());
		if (com.kromvia.client.Launcher.PRESENT) {
			all.add(Media.INSTANCE);
			all.add(Lyrics.INSTANCE);
		}
		return all;
	}

	public static void submitWorld(PoseStack pose, Object out, Vec3 cam) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null) return;
		Lyrics.INSTANCE.world(mc, pose, out, cam);
		if (WORLD.stream().noneMatch(m -> m.enabled)) return;
		float partial = Ver.partial(mc);
		Types.shapes(out, pose, (p, b) -> {
			for (WorldFx m : WORLD) {
				if (m.enabled) m.draw(mc, b, p, cam, partial);
			}
		});
	}

	public static void onAttack(Entity target) {
		if (target instanceof LivingEntity le) {
			attacked = le;
			attackedAt = System.currentTimeMillis();
		}
		if (HIT_BUBBLES.enabled) HIT_BUBBLES.hit(Minecraft.getInstance(), target);
	}
}
