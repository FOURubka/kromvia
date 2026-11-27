package com.kromvia.client.fx;

import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.KScreen;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.ui.UiStyle;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Date;
import java.util.Deque;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

public class ChatSearchScreen extends KScreen {
	private static final int MAX = 1000, ROW = 11;
	private static final Deque<Long> TIMES = new ArrayDeque<>();
	private static final Deque<String> LINES = new ArrayDeque<>();
	private final Screen parent;
	private final List<String> hits = new ArrayList<>();
	private final List<Long> hitTimes = new ArrayList<>();
	private EditBox search;
	private String query = "";
	private int scroll, px, py, pw, ph;
	private String copied;
	private long copiedAt;

	public static synchronized void log(String text) {
		if (text == null || text.trim().isEmpty()) return;
		LINES.addLast(text);
		TIMES.addLast(System.currentTimeMillis());
		while (LINES.size() > MAX) {
			LINES.removeFirst();
			TIMES.removeFirst();
		}
	}

	public ChatSearchScreen(Screen parent) {
		super(Component.literal("Search chat"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 20, 420);
		ph = Math.min(height - 20, 280);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		search = new EditBox(font, px + 10, py + 10, pw - 20, 16, Component.literal("Search"));
		search.setMaxLength(80);
		search.setValue(query);
		search.setResponder(q -> {
			query = q;
			scroll = 0;
			refresh();
		});
		addRenderableWidget(search);
		setInitialFocus(search);
		refresh();
	}

	private synchronized void refresh() {
		hits.clear();
		hitTimes.clear();
		String q = query.toLowerCase(Locale.ROOT);
		Iterator<String> l = LINES.descendingIterator();
		Iterator<Long> t = TIMES.descendingIterator();
		while (l.hasNext()) {
			String s = l.next();
			long at = t.next();
			if (q.isEmpty() || s.toLowerCase(Locale.ROOT).contains(q)) {
				hits.add(s);
				hitTimes.add(at);
			}
		}
	}

	private int rows() {
		return (ph - 50) / ROW;
	}

	@Override
	protected void mouseDown(double x, double y) {
		int i = (int) ((y - (py + 32)) / ROW) + scroll;
		if (x < px || x > px + pw || y < py + 32 || i < 0 || i >= hits.size() || i - scroll >= rows()) return;
		Minecraft.getInstance().keyboardHandler.setClipboard(hits.get(i));
		copied = hits.get(i);
		copiedAt = System.currentTimeMillis();
	}

	@Override
	public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
		scroll = Math.max(0, Math.min(Math.max(0, hits.size() - rows()), scroll - (int) Math.signum(scrollY) * 3));
		return true;
	}

	@Override
	protected void drawBackground(Gfx g, int mouseX, int mouseY, float delta) {
		UiStyle.dim(g, width, height, 1);
		UiStyle.panel(g, px, py, pw, ph);
	}

	@Override
	protected void draw(Gfx g, int mouseX, int mouseY, float delta) {
		SimpleDateFormat time = new SimpleDateFormat("HH:mm");
		int y = py + 32;
		for (int i = scroll; i < hits.size() && i - scroll < rows(); i++) {
			boolean hover = mouseY >= y && mouseY < y + ROW && mouseX >= px && mouseX <= px + pw;
			if (hover) g.fill(px + 6, y - 1, px + pw - 6, y + ROW - 1, 0x22FFFFFF);
			g.drawString(font, time.format(new Date(hitTimes.get(i))), px + 10, y + 1, UiStyle.MUTED, false);
			g.drawString(font, fit(hits.get(i), pw - 56), px + 42, y + 1, UiStyle.TEXT, false);
			y += ROW;
		}
		String foot = copied != null && System.currentTimeMillis() - copiedAt < 1500 ? "Copied" : hits.size() + " messages · click one to copy";
		g.drawString(font, foot, px + 10, py + ph - 14, UiStyle.MUTED, false);
		super.draw(g, mouseX, mouseY, delta);
	}

	private String fit(String s, int w) {
		if (font.width(s) <= w) return s;
		while (s.length() > 1 && font.width(s + "…") > w) s = s.substring(0, s.length() - 1);
		return s + "…";
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
