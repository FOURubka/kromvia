package com.kromvia.client.module;

import com.kromvia.client.compat.Gfx;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.ColorSetting;
import com.kromvia.client.module.setting.SliderSetting;
import com.kromvia.client.module.setting.TextSetting;
import net.minecraft.client.Minecraft;
import net.minecraft.util.ARGB;
import net.minecraft.util.Mth;

public abstract class TextModule extends Module {
	static final int PLATE = 0x90000000;

	public final ChoiceSetting colorMode = add(new ChoiceSetting("color_mode", "Colour", 0, "Solid", "Gradient", "Rainbow", "Flowing gradient", "Pulse", "Rainbow (one colour)"));
	public final ColorSetting color = add(new ColorSetting("color", "Main colour", 0xFFFFFFFF));
	public final ColorSetting color2 = add(new ColorSetting("color2", "Gradient end", 0xFF8B5CF6));
	public final SliderSetting animSpeed = add(new SliderSetting("speed", "Animation speed", 100, 10, 300, 10, "%"));
	public final SliderSetting rainbowSaturation = add(new SliderSetting("saturation", "Rainbow saturation", 65, 0, 100, 5, "%"));
	public final BoolSetting background = add(new BoolSetting("background", "Background", true));
	public final ColorSetting backgroundColor = add(new ColorSetting("background_color", "Background colour", 0xFF000000));
	public final ChoiceSetting accentLine = add(new ChoiceSetting("accent", "Accent line", 0, "None", "Left", "Bottom", "Outline"));
	public final SliderSetting opacity = add(new SliderSetting("opacity", "Background opacity", 55, 0, 100, 5, "%"));
	public final BoolSetting shadow = add(new BoolSetting("shadow", "Text shadow", true));
	public final ChoiceSetting brackets = add(new ChoiceSetting("brackets", "Brackets", 0, "None", "[ ]", "( )", "< >"));
	public final ChoiceSetting textCase = add(new ChoiceSetting("case", "Letters", 0, "Normal", "UPPERCASE", "lowercase"));
	public final TextSetting prefix = add(new TextSetting("prefix", "Text before", "", 16));
	public final TextSetting suffix = add(new TextSetting("suffix", "Text after", "", 16));
	public final SliderSetting padding = add(new SliderSetting("padding", "Padding", 3, 0, 8, 1, "px"));
	public final SliderSetting size = add(new SliderSetting("scale", "Size", 100, 50, 200, 10, "%"));

	protected TextModule(String id, String name, Category category, boolean enabledByDefault) {
		super(id, name, category, Corner.TOP_LEFT, enabledByDefault);
	}

	protected abstract String text(Minecraft mc);

	private static final long REFRESH_MS = 50;
	private String live = "";
	private long liveAt;
	private String laid;
	private long laidAt;
	private String[] glyphs = new String[0];
	private int[] offsets = new int[0];
	private int laidWidth;

	private String live(Minecraft mc) {
		long now = System.currentTimeMillis();
		if (now - liveAt >= REFRESH_MS || now < liveAt) {
			live = text(mc);
			liveAt = now;
		}
		return live;
	}

	private String shown(Minecraft mc) {
		String t = mc.player == null ? "" : live(mc);
		if (t.isEmpty()) t = sample();
		if (textCase.index() == 1) t = t.toUpperCase(java.util.Locale.ROOT);
		else if (textCase.index() == 2) t = t.toLowerCase(java.util.Locale.ROOT);
		t = prefix.get() + t + suffix.get();
		switch (brackets.index()) {
			case 1: return "[" + t + "]";
			case 2: return "(" + t + ")";
			case 3: return "<" + t + ">";
			default: return t;
		}
	}

	private void lay(Minecraft mc, String s) {
		long now = System.currentTimeMillis();
		if (s.equals(laid) && now - laidAt < 1000 && now >= laidAt) return;
		laid = s;
		laidAt = now;
		glyphs = new String[s.length()];
		offsets = new int[s.length()];
		int x = 0;
		for (int i = 0; i < glyphs.length; i++) {
			glyphs[i] = String.valueOf(s.charAt(i));
			offsets[i] = x;
			x += mc.font.width(glyphs[i]);
		}
		laidWidth = mc.font.width(s);
	}

	@Override
	public boolean visible(Minecraft mc) {
		return mc.player != null && !live(mc).isEmpty();
	}

	@Override
	public float scale() {
		return size.value() / 100F;
	}

	@Override
	public int width(Minecraft mc) {
		lay(mc, shown(mc));
		return laidWidth + padX() * 2;
	}

	private int padX() {
		return Math.round(padding.value());
	}

	private int padY() {
		return Math.max(1, padX() - 1);
	}

	@Override
	public int height(Minecraft mc) {
		return mc.font.lineHeight + padY() * 2;
	}

	public int colorAt(int i, int length, long now) {
		float speed = animSpeed.value() / 100F;
		float sat = rainbowSaturation.value() / 100F;
		float along = length > 1 ? i / (float) (length - 1) : 0;
		switch (colorMode.index()) {
			case 1:
				return ARGB.srgbLerp(along, color.argb(), color2.argb());
			case 2:
				return 0xFF000000 | Mth.hsvToRgb(((now * speed / 20 + i * 12) % 360) / 360F, sat, 1F);
			case 3: {
				float t = (along * 0.5F + now * speed / 2000F) % 1F;
				return ARGB.srgbLerp(t < 0.5F ? t * 2 : (1 - t) * 2, color.argb(), color2.argb());
			}
			case 4:
				return ARGB.srgbLerp((float) (Math.sin(now * speed / 1500.0 * Math.PI * 2) * 0.5 + 0.5), color.argb(), color2.argb());
			case 5:
				return 0xFF000000 | Mth.hsvToRgb(((now * speed / 20) % 360) / 360F, sat, 1F);
			default:
				return color.argb();
		}
	}

	@Override
	public void render(Gfx g, Minecraft mc, int x, int y) {
		String s = shown(mc);
		lay(mc, s);
		int w = laidWidth + padX() * 2, h = height(mc);
		int tx = x + padX(), ty = y + padY();
		long now = System.currentTimeMillis();
		if (background.on()) {
			int a = Math.round(opacity.value() * 2.55F);
			g.fill(x, y, x + w, y + h, a << 24 | backgroundColor.argb() & 0xFFFFFF);
		}
		int line = colorAt(0, s.length(), now);
		switch (accentLine.index()) {
			case 1: g.fill(x, y, x + 1, y + h, line); break;
			case 2: g.fill(x, y + h - 1, x + w, y + h, line); break;
			case 3:
				g.fill(x - 1, y - 1, x + w + 1, y, line);
				g.fill(x - 1, y + h, x + w + 1, y + h + 1, line);
				g.fill(x - 1, y, x, y + h, line);
				g.fill(x + w, y, x + w + 1, y + h, line);
				break;
			default: break;
		}
		int mode = colorMode.index();
		if (mode == 0 || mode == 4 || mode == 5) {
			g.drawString(mc.font, s, tx, ty, line, shadow.on());
			return;
		}
		for (int i = 0; i < glyphs.length; i++) {
			g.drawString(mc.font, glyphs[i], tx + offsets[i], ty, colorAt(i, glyphs.length, now), shadow.on());
		}
	}
}
