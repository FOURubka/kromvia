package com.kromvia.client.ui;

import com.kromvia.client.compat.Mc;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import java.util.ArrayList;
import java.util.List;

import com.kromvia.client.Config;
import com.kromvia.client.module.Features;
import com.kromvia.client.module.Hud;
import com.kromvia.client.module.Module;
import com.kromvia.client.module.ModuleInfo;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.ColorSetting;
import com.kromvia.client.module.setting.Setting;
import com.kromvia.client.module.setting.SliderSetting;
import com.kromvia.client.module.setting.TextSetting;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class ModuleSettingsScreen extends KScreen {
	private static final int ROW = 24;
	private static final int HEADER = 34;
	private final Screen parent;
	private final Module module;
	private final boolean preview;
	private final List<Placed> placed = new ArrayList<>();
	private final List<Label> labels = new ArrayList<>();
	private final long opened = System.currentTimeMillis();
	private List<String> about = new ArrayList<>();
	private int px, py, pw, ph, scroll, contentH;
	private KButton keyButton;
	private boolean listening;

	private static final class Placed {
		final AbstractWidget widget;
		final int y;

		Placed(AbstractWidget widget, int y) {
			this.widget = widget;
			this.y = y;
		}
	}

	private static final class Label {
		final String text;
		final int y;

		Label(String text, int y) {
			this.text = text;
			this.y = y;
		}
	}

	public ModuleSettingsScreen(Screen parent, Module module) {
		super(Component.literal(module.name));
		this.parent = parent;
		this.module = module;
		this.preview = module == Features.CROSSHAIR || module.hud();
	}

	private int listX() {
		return preview ? px + pw / 2 + 6 : px + 10;
	}

	private int listW() {
		return preview ? pw / 2 - 16 : pw - 20;
	}

	private int aboutH() {
		return about.isEmpty() ? 0 : about.size() * 10 + 6;
	}

	@Override
	protected void init() {
		placed.clear();
		labels.clear();
		pw = Math.min(width - 40, preview ? 460 : 340);
		px = (width - pw) / 2;
		about = UiStyle.wrap(font, ModuleInfo.description(module), preview ? pw / 2 - 34 : pw - 24);

		int x = listX(), w = listW();
		int y = 0;
		for (Setting<?> s : module.settings) {
			if (!s.shown) continue;
			if (s instanceof BoolSetting) {
				BoolSetting b = (BoolSetting) s;
				place(new KButton(x, 0, w, 20, Component.literal(b.name + ": " + (b.on() ? "On" : "Off")), btn -> {
					b.set(!b.on());
					btn.setMessage(Component.literal(b.name + ": " + (b.on() ? "On" : "Off")));
					Config.save();
				}, b::on), y);
			} else if (s instanceof ChoiceSetting) {
				ChoiceSetting c = (ChoiceSetting) s;
				place(new KButton(x, 0, w, 20, Component.literal(c.name + ": " + c.current()), btn -> {
					c.next();
					btn.setMessage(Component.literal(c.name + ": " + c.current()));
					Config.save();
				}), y);
			} else if (s instanceof SliderSetting) {
				place(new KSlider(x, 0, w, (SliderSetting) s, Config::save), y);
			} else if (s instanceof TextSetting) {
				TextSetting tx = (TextSetting) s;
				labels.add(new Label(tx.name, y));
				EditBox box = new EditBox(font, x, 0, w, 18, Component.literal(tx.name));
				box.setMaxLength(tx.max);
				box.setValue(tx.get());
				box.setResponder(v -> {
					tx.set(v);
					Config.save();
				});
				place(box, y + 11);
				y += 11;
			} else if (s instanceof ColorSetting) {
				ColorSetting col = (ColorSetting) s;
				labels.add(new Label(col.name, y));
				int size = 14, per = Math.max(1, (w + 3) / (size + 3));
				for (int i = 0; i < ColorSetting.PALETTE.size(); i++) {
					int argb = ColorSetting.PALETTE.get(i);
					int sx = x + (i % per) * (size + 3);
					place(new Swatch(sx, 0, size, argb, () -> {
						col.set(argb);
						Config.save();
					}, () -> col.argb() == argb), y + 11 + (i / per) * (size + 3));
				}
				int last = ColorSetting.PALETTE.size();
				place(new KButton(x + (last % per) * (size + 3), 0, size, size, Component.literal("+"), b -> Mc.setScreen(new ColorPicker(this, col)),
						() -> !ColorSetting.PALETTE.contains(col.argb())), y + 11 + (last / per) * (size + 3));
				y += 11 + ((last + per) / per) * (size + 3) - ROW + 4;
			}
			y += ROW;
		}
		contentH = Math.max(0, y - 4);

		int tallest = Math.min(height - 30, 320);
		ph = preview ? tallest : Math.max(96, Math.min(tallest, HEADER + aboutH() + contentH + 38));
		py = (height - ph) / 2;

		addRenderableWidget(new KButton(px + 10, py + ph - 28, preview ? pw / 2 - 26 : 80, 20, Component.literal("Back"), b -> onClose()));
		addRenderableWidget(new KButton(px + pw - 90, py + 8, 80, 18, Component.literal(module.enabled ? "On" : "Off"), b -> {
			module.enabled = !module.enabled;
			if (!module.enabled) module.disable(minecraft);
			b.setMessage(Component.literal(module.enabled ? "On" : "Off"));
			Config.save();
		}, () -> module.enabled));

		keyButton = new KButton(px + pw - 176, py + 8, 82, 18, Component.literal(keyLabel()), b -> {
			listening = !listening;
			b.setMessage(Component.literal(keyLabel()));
		}, () -> listening);
		addRenderableWidget(keyButton);

		scroll = Math.min(scroll, maxScroll());
		layout();
	}

	private void place(AbstractWidget w, int y) {
		placed.add(new Placed(w, y));
		addRenderableWidget(w);
	}

	private int top() {
		return py + HEADER + (preview ? 0 : aboutH());
	}

	private int bottom() {
		return py + ph - (preview ? 8 : 34);
	}

	private int maxScroll() {
		return Math.max(0, contentH - (bottom() - top()));
	}

	private void layout() {
		for (Placed p : placed) {
			int y = top() + p.y - scroll;
			p.widget.setY(y);
			p.widget.visible = y >= top() && y + p.widget.getHeight() <= bottom();
		}
	}

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		scroll = Math.max(0, Math.min(maxScroll(), scroll - (int) (scrollY * ROW)));
		layout();
		return true;
	}

	private void slide(Gfx g) {
		g.pose().translate((1 - UiStyle.since(opened, 240)) * 30, 0);
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		if (minecraft.options.getMenuBackgroundBlurriness() >= 1) g.blurBeforeThisStratum();
		UiStyle.dim(g, width, height, 1);
		g.pose().pushMatrix();
		slide(g);
		UiStyle.panel(g, px, py, pw, ph);
		if (preview) {
			g.fill(px + pw / 2 - 4, py + HEADER, px + pw / 2 - 3, py + ph - 8, UiStyle.LINE);
			int l = px + 10, r = px + pw / 2 - 12, t = py + 48, b = paneBottom();
			g.fill(l, t, r, b, 0xFF0C0F13);
			for (int gx = l + 4; gx < r; gx += 8) {
				for (int gy = t + 4; gy < b; gy += 8) g.fill(gx, gy, gx + 1, gy + 1, 0xFF1A1F27);
			}
		}
		g.pose().popMatrix();
	}

	private int paneBottom() {
		return py + ph - 36 - aboutH();
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		g.pose().pushMatrix();
		slide(g);
		super.draw(g, mouseX, mouseY, delta);
		String icon = ModuleInfo.icon(module);
		if (Icons.has(icon)) {
			Icons.draw(g, icon, px + 10, py + 6, 20, module.enabled ? UiStyle.TOP : UiStyle.TEXT);
		} else {
			g.pose().pushMatrix();
			g.pose().translate(px + 10, py + 6);
			g.pose().scale(1.25F, 1.25F);
			g.renderItem(module.icon(), 0, 0);
			g.pose().popMatrix();
		}
		g.drawString(font, font.plainSubstrByWidth(module.name, pw - 34 - 182), px + 34, py + 12, UiStyle.TEXT, false);

		for (Label l : labels) {
			int y = top() + l.y - scroll;
			if (y >= top() && y + 9 <= bottom()) g.drawString(font, l.text, listX(), y, UiStyle.MUTED, false);
		}
		int max = maxScroll();
		if (max > 0) {
			int track = bottom() - top();
			int bar = Math.max(12, track * track / (track + max));
			int by = top() + Math.round((track - bar) * (scroll / (float) max));
			g.fill(px + pw - 5, by, px + pw - 3, by + bar, 0x668B5CF6);
		}

		if (preview) {
			int aboutY = py + ph - 32 - aboutH();
			for (int i = 0; i < about.size(); i++) g.drawString(font, about.get(i), px + 12, aboutY + i * 10, UiStyle.MUTED, false);
			drawPreview(g);
		} else {
			for (int i = 0; i < about.size(); i++) g.drawString(font, about.get(i), px + 12, py + HEADER + i * 10, UiStyle.MUTED, false);
		}
		g.pose().popMatrix();
	}

	private void drawPreview(Gfx g) {
		int l = px + 10, r = px + pw / 2 - 12, t = py + 48, b = paneBottom();
		int cx = (l + r) / 2, cy = (t + b) / 2;
		g.drawCenteredString(font, "Preview", cx, py + 36, UiStyle.MUTED);
		if (module == Features.CROSSHAIR) {
			Features.CROSSHAIR.draw(g, cx, cy);
			return;
		}
		int w = module.width(minecraft), h = module.height(minecraft);
		if (w <= 0 || h <= 0) return;
		float fit = Math.min(1F, Math.min((r - l - 8) / (w * module.scale()), (b - t - 8) / (h * module.scale())));
		g.pose().pushMatrix();
		g.pose().translate(cx, cy);
		g.pose().scale(fit, fit);
		Hud.drawScaled(g, minecraft, module, -Math.round(w * module.scale() / 2), -Math.round(h * module.scale() / 2));
		g.pose().popMatrix();
	}

	private String keyLabel() {
		return listening ? "Press a key" : "Key: " + Keys.name(module.key);
	}

	@Override
	protected boolean keyDown(int key) {
		if (!listening) return false;
		module.key = key == 256 || key == 259 ? -1 : key;
		module.keyHeld = true;
		listening = false;
		keyButton.setMessage(Component.literal(keyLabel()));
		Config.save();
		return true;
	}

	@Override
	public void onClose() {
		Mc.setScreen(parent);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
