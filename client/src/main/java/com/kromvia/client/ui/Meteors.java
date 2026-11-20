package com.kromvia.client.ui;

import com.kromvia.client.compat.Gfx;
import java.util.Random;

final class Meteors {
	private static final int COUNT = 7;
	private static final Random RANDOM = new Random();
	private static final Meteor[] METEORS = new Meteor[COUNT];

	private Meteors() {}

	private static final class Meteor {
		float x, y, angle, speed, length;
		long born, lifeMs;

		void respawn(long now, boolean anyTime) {
			x = RANDOM.nextFloat() * 1.1F - 0.15F;
			y = RANDOM.nextFloat() * 0.8F;
			angle = (float) Math.toRadians(15 + RANDOM.nextFloat() * 22);
			speed = 0.05F + RANDOM.nextFloat() * 0.06F;
			length = 0.03F + RANDOM.nextFloat() * 0.035F;
			lifeMs = 900 + RANDOM.nextInt(1200);
			born = now + (anyTime ? -RANDOM.nextInt((int) lifeMs) : 200 + RANDOM.nextInt(1800));
		}
	}

	static void draw(Gfx g) {
		if (g.pose() == null) return;
		long now = System.currentTimeMillis();
		int sw = g.guiWidth(), sh = g.guiHeight();
		for (int i = 0; i < COUNT; i++) {
			Meteor m = METEORS[i];
			if (m == null) {
				m = METEORS[i] = new Meteor();
				m.respawn(now, true);
			}
			long age = now - m.born;
			if (age < 0) continue;
			if (age > m.lifeMs) {
				m.respawn(now, false);
				continue;
			}
			float t = age / (float) m.lifeMs;
			float alpha = Math.min(1, t / 0.15F) * Math.min(1, (1 - t) / 0.4F);
			float travel = m.speed * sw * age / 1000F;
			float x = m.x * sw + travel * (float) Math.cos(m.angle);
			float y = m.y * sh + travel * (float) Math.sin(m.angle);
			streak(g, x, y, m.angle, m.length * sw, alpha);
		}
	}

	private static void streak(Gfx g, float x, float y, float angle, float length, float alpha) {
		int len = Math.max(2, Math.round(length * 2));
		g.pose().pushMatrix();
		g.pose().translate(x, y);
		g.pose().rotate(angle - (float) Math.PI / 2);
		g.pose().scale(0.5F, 0.5F);
		g.fillGradient(-2, -len / 2, 2, 0, tint(0x003C78FF, alpha), tint(0x553C8CFF, alpha));
		g.fillGradient(-1, -len, 1, 0, tint(0x0050A0FF, alpha), tint(0xFFBFE6FF, alpha));
		g.fill(-2, -2, 2, 2, tint(0x88BFE6FF, alpha));
		g.fill(-1, -1, 1, 1, tint(0xFFFFFFFF, alpha));
		g.pose().popMatrix();
	}

	private static int tint(int argb, float alpha) {
		return Math.round((argb >>> 24) * alpha) << 24 | argb & 0xFFFFFF;
	}
}
