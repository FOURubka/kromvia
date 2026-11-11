package com.kromvia.client.ui;

import com.kromvia.client.Binds;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import com.kromvia.client.Config;
import com.kromvia.client.KromviaClient;
import com.kromvia.client.module.Module;
import com.kromvia.client.module.ModuleInfo;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.Setting;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

public class ModuleMenu extends KScreen {
	private static final int SIDEBAR = 92;
	private static final int GAP = 6;
	private static final int TAB = 22;
	private static final String[] CATEGORY_NAMES = {"All", "HUD", "PvP", "Utility"};

	private final List<Card> cards = new ArrayList<>();
	private final List<KButton> tabs = new ArrayList<>();
	private final long opened = System.currentTimeMillis();
	private String query = "";
	private Module.Category category = null;
	private float scroll;
	private int scrollTarget;
	private float marker = -1;
	private int px, py, pw, ph, cols;
	private EditBox search;
	private Card hovered;
	private long hoverSince;

	private static final int TABS = CATEGORY_NAMES.length + 1;

	private static final class Card {
		final Module module;
		final ModuleCard card;
		final KButton gear;
		final KButton star;
		final int index;
		final String words;
		boolean shown = true;

		Card(Module module, ModuleCard card, KButton gear, KButton star, int index) {
			this.module = module;
			this.card = card;
			this.gear = gear;
			this.star = star;
			this.index = index;
			StringBuilder b = new StringBuilder(module.name).append('\n').append(ModuleInfo.description(module));
			for (Setting<?> s : module.settings) {
				if (!s.shown) continue;
				b.append('\n').append(s.name);
				if (s instanceof ChoiceSetting) {
					for (String o : ((ChoiceSetting) s).options) b.append('\n').append(o);
				}
			}
			words = b.toString().toLowerCase(Locale.ROOT);
		}
	}

	private boolean favOnly;

	public ModuleMenu() {
		super(Component.literal("Kromvia"));
	}

	@Override
	protected void init() {
		cards.clear();
		tabs.clear();
		cols = Math.max(2, Math.min(5, (width - 60 - SIDEBAR - 20) / (ModuleCard.W + GAP)));
		pw = SIDEBAR + 20 + cols * (ModuleCard.W + GAP);
		ph = Math.min(height - 30, 344);
		px = (width - pw) / 2;
		py = (height - ph) / 2;

		for (int i = 0; i < CATEGORY_NAMES.length; i++) {
			Module.Category c = i == 0 ? null : Module.Category.values()[i - 1];
			KButton tab = new KButton(px + 8, py + 40 + i * TAB, SIDEBAR - 16, TAB - 2, Component.literal(label(i, c)), b -> {
				if (category == c && !favOnly) return;
				category = c;
				favOnly = false;
				refilter();
			}, () -> category == c && !favOnly).flat().appear(60 + i * 40);
			tabs.add(addRenderableWidget(tab));
		}
		KButton favTab = new KButton(px + 8, py + 40 + CATEGORY_NAMES.length * TAB, SIDEBAR - 16, TAB - 2, Component.literal("★ Favourites"), b -> {
			if (favOnly) return;
			favOnly = true;
			refilter();
		}, () -> favOnly).flat().appear(60 + CATEGORY_NAMES.length * 40);
		tabs.add(addRenderableWidget(favTab));
		int lift = com.kromvia.client.Launcher.PRESENT ? 0 : 24;
		addRenderableWidget(new KButton(px + 8, py + ph - 102 + lift, SIDEBAR - 16, 20, Component.literal("Profiles"),
				b -> Mc.setScreen(new ProfilesScreen(this))).appear(160));
		addRenderableWidget(new KButton(px + 8, py + ph - 78 + lift, SIDEBAR - 16, 20, Component.literal("Edit HUD"),
				b -> Mc.setScreen(new HudEditor(this))).appear(200));
		if (lift == 0) {
			addRenderableWidget(new KButton(px + 8, py + ph - 54, SIDEBAR - 16, 20, Component.literal("Wardrobe"),
					b -> Mc.setScreen(new CosmeticsScreen(this))).appear(240));
		}
		addRenderableWidget(new KButton(px + 8, py + ph - 30, SIDEBAR - 16, 20, Component.literal("Done"), b -> onClose()).appear(280));

		int gx = px + SIDEBAR + 10;
		search = new EditBox(font, gx + 18, py + 13, pw - SIDEBAR - 46, 12, Component.literal("Search"));
		search.setBordered(false);
		search.setTextColor(UiStyle.TEXT);
		search.setHint(Component.literal("Search modules…"));
		search.setValue(query);
		search.setResponder(q -> {
			query = q;
			refilter();
		});
		addRenderableWidget(search);
		setInitialFocus(search);

		for (Module m : KromviaClient.MODULES) {
			if (!m.shown) continue;
			ModuleCard card = new ModuleCard(0, 0, m, b -> {
				m.enabled = !m.enabled;
				if (!m.enabled) m.disable(minecraft);
				Config.save();
			});
			KButton gear = null;
			if (!m.settings.isEmpty()) {
				gear = new KButton(0, 0, 14, 14, Component.literal("⚙"), b -> Mc.setScreen(new ModuleSettingsScreen(this, m)));
				addWidget(gear);
			}
			KButton star = new KButton(0, 0, 14, 14, Component.literal(starLabel(m)), b -> {
				if (!Config.STARRED.remove(m.id)) Config.STARRED.add(m.id);
				b.setMessage(Component.literal(starLabel(m)));
				Config.save();
				if (favOnly) refilter();
				else order();
			}).flat();
			addWidget(star);
			addWidget(card);
			cards.add(new Card(m, card, gear, star, cards.size()));
		}
		refilter();
	}

	private static String starLabel(Module m) {
		return Config.STARRED.contains(m.id) ? "§e★" : "§8☆";
	}

	private void order() {
		cards.sort((a, b) -> {
			boolean fa = Config.STARRED.contains(a.module.id), fb = Config.STARRED.contains(b.module.id);
			return fa != fb ? (fa ? -1 : 1) : Integer.compare(a.index, b.index);
		});
	}

	private void refilter() {
		String q = query.trim().toLowerCase(Locale.ROOT);
		for (Card c : cards) {
			Module m = c.module;
			boolean tab = favOnly ? Config.STARRED.contains(m.id) : category == null || m.category == category;
			c.shown = tab && (q.isEmpty() || c.words.contains(q));
		}
		order();
		scrollTarget = 0;
		scroll = 0;
		layout();
		reveal();
	}

	private String label(int i, Module.Category c) {
		int n = 0;
		for (Module m : KromviaClient.MODULES) if (m.shown && (c == null || m.category == c)) n++;
		return CATEGORY_NAMES[i] + "  §8" + n;
	}

	private void reveal() {
		long now = System.currentTimeMillis();
		int i = 0;
		for (Card c : cards) {
			if (!c.shown) continue;
			c.card.reveal(now + (i / cols) * 45L + (i % cols) * 20L);
			i++;
		}
	}

	private int gridTop() {
		return py + 38;
	}

	private int gridBottom() {
		return py + ph - 8;
	}

	private int maxScroll() {
		int n = 0;
		for (Card c : cards) if (c.shown) n++;
		int content = ((n + cols - 1) / cols) * (ModuleCard.H + GAP);
		return Math.max(0, content - (gridBottom() - gridTop()));
	}

	private void layout() {
		int gx = px + SIDEBAR + 10;
		int s = Math.round(scroll);
		int i = 0;
		for (Card c : cards) {
			boolean shown = c.shown;
			int x = gx + (i % cols) * (ModuleCard.W + GAP);
			int y = gridTop() + (i / cols) * (ModuleCard.H + GAP) - s;
			boolean inView = shown && y + ModuleCard.H > gridTop() && y < gridBottom();
			c.card.visible = inView;
			c.card.setPosition(x, y);
			c.card.clip(gridTop(), gridBottom());
			if (c.gear != null) {
				c.gear.visible = inView;
				c.gear.setPosition(x + ModuleCard.W - 17, y + 4);
				c.gear.clip(gridTop(), gridBottom());
			}
			c.star.visible = inView;
			c.star.setPosition(x + 3, y + 4);
			c.star.clip(gridTop(), gridBottom());
			if (shown) i++;
		}
	}

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		scrollTarget = Mth.clamp(scrollTarget - (int) (scrollY * (ModuleCard.H + GAP) / 2), 0, maxScroll());
		return true;
	}

	private float intro() {
		return UiStyle.since(opened, 260);
	}

	private void zoom(Gfx g, float t) {
		float s = 0.94F + 0.06F * t;
		g.pose().translate(width / 2F, height / 2F + (1 - t) * 10);
		g.pose().scale(s, s);
		g.pose().translate(-width / 2F, -height / 2F);
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		float t = intro();
		if (minecraft.options.getMenuBackgroundBlurriness() >= 1) g.blurBeforeThisStratum();
		UiStyle.dim(g, width, height, t);
		g.pose().pushMatrix();
		zoom(g, t);
		UiStyle.panel(g, px, py, pw, ph);
		g.fill(px + SIDEBAR, py + 1, px + SIDEBAR + 1, py + ph - 1, UiStyle.LINE);

		int sx = px + SIDEBAR + 10, sw = pw - SIDEBAR - 20;
		boolean focused = search != null && search.isFocused();
		g.fill(sx, py + 8, sx + sw, py + 28, 0xFF0D1014);
		g.fill(sx, py + 27, sx + sw, py + 28, focused ? UiStyle.FRONT : UiStyle.LINE);
		g.drawString(font, "⌕", sx + 6, py + 14, focused ? UiStyle.FRONT : UiStyle.MUTED, false);

		int sel = favOnly ? CATEGORY_NAMES.length : category == null ? 0 : category.ordinal() + 1;
		float target = py + 40 + sel * TAB;
		marker = marker < 0 ? target : Mth.lerp(0.3F, marker, target);
		int my = Math.round(marker);
		g.fill(px + 8, my, px + SIDEBAR - 8, my + TAB - 2, 0xFF1C1633);
		g.fill(px + 8, my, px + 10, my + TAB - 2, UiStyle.FRONT);
		g.pose().popMatrix();
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		scroll = Mth.lerp(0.35F, scroll, scrollTarget);
		if (Math.abs(scroll - scrollTarget) < 0.5F) scroll = scrollTarget;
		layout();

		float t = intro();
		g.pose().pushMatrix();
		zoom(g, t);
		super.draw(g, mouseX, mouseY, delta);

		g.enableScissor(px + SIDEBAR + 1, gridTop(), px + pw - 1, gridBottom());
		for (Card c : cards) {
			g.widget(c.card, mouseX, mouseY, delta);
			if (c.gear != null) g.widget(c.gear, mouseX, mouseY, delta);
			g.widget(c.star, mouseX, mouseY, delta);
		}
		g.disableScissor();
		Card hovered = null;
		for (Card c : cards) {
			if (c.card.visible && c.card.isMouseOver(mouseX, mouseY)) hovered = c;
		}
		if (hovered != this.hovered) {
			this.hovered = hovered;
			hoverSince = System.currentTimeMillis();
		}

		g.fillGradient(px + SIDEBAR + 1, gridTop(), px + pw - 1, gridTop() + 8, 0xF6090B0E, 0x00090B0E);
		g.fillGradient(px + SIDEBAR + 1, gridBottom() - 8, px + pw - 1, gridBottom(), 0x00090B0E, 0xF6090B0E);
		int max = maxScroll();
		if (max > 0) {
			int track = gridBottom() - gridTop();
			int bar = Math.max(16, track * track / (track + max));
			int by = gridTop() + Math.round((track - bar) * (scroll / max));
			g.fill(px + pw - 4, by, px + pw - 2, by + bar, 0x668B5CF6);
		}

		UiStyle.logo(g, px + 8, py + 9, 18);
		g.drawString(font, "KROMVIA", px + 30, py + 11, UiStyle.TEXT, false);
		g.drawString(font, "client", px + 30, py + 21, UiStyle.SIDE, false);
		int on = 0;
		for (Card c : cards) if (c.module.enabled) on++;
		String count = on + " / " + cards.size() + " enabled";
		g.drawString(font, count, px + 10, py + 40 + TABS * TAB + 6, UiStyle.MUTED, false);
		g.fill(px + 10, py + 40 + TABS * TAB + 18, px + 10 + Math.round((SIDEBAR - 20) * on / (float) cards.size()),
				py + 40 + TABS * TAB + 20, UiStyle.FRONT);
		g.pose().popMatrix();
		if (hovered != null && System.currentTimeMillis() - hoverSince > 350) tooltip(g, ModuleInfo.description(hovered.module), mouseX, mouseY);
	}

	private void tooltip(Gfx g, String text, int mouseX, int mouseY) {
		if (text.isEmpty()) return;
		List<String> lines = new ArrayList<>();
		StringBuilder line = new StringBuilder();
		for (String word : text.split(" ")) {
			String next = line.length() == 0 ? word : line + " " + word;
			if (font.width(next) > 170 && line.length() > 0) {
				lines.add(line.toString());
				line = new StringBuilder(word);
			} else {
				line = new StringBuilder(next);
			}
		}
		lines.add(line.toString());
		int w = 0;
		for (String l : lines) w = Math.max(w, font.width(l));
		int h = lines.size() * 10 + 6;
		int x = Math.min(mouseX + 10, width - w - 12), y = Math.min(mouseY + 12, height - h - 4);
		g.fill(x - 1, y - 1, x + w + 9, y + h + 1, UiStyle.LINE);
		g.fill(x, y, x + w + 8, y + h, 0xFF0B0D11);
		g.fill(x, y, x + 2, y + h, UiStyle.FRONT);
		for (int i = 0; i < lines.size(); i++) g.drawString(font, lines.get(i), x + 6, y + 4 + i * 10, UiStyle.TEXT, false);
	}

	@Override
	protected boolean keyDown(int key) {
		if (key == Binds.code(Binds.MENU)) {
			onClose();
			return true;
		}
		return false;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
