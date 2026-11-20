package com.kromvia.client.module;

import com.kromvia.client.compat.Gfx;
import java.util.ArrayList;
import java.util.List;

import com.kromvia.client.module.setting.Setting;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public abstract class Module {
	public enum Category { HUD, PVP, UTILITY }

	public enum Corner { TOP_LEFT, TOP_RIGHT, BOTTOM_RIGHT }

	public final String id;
	public final String name;
	public final Category category;
	public final Corner corner;
	public boolean enabled;
	public boolean shown = true;
	public int key = -1;
	public boolean keyHeld;
	public float hudX = -1, hudY = -1;
	public final List<Setting<?>> settings = new ArrayList<>();
	private Item iconItem = Items.PAPER;
	private ItemStack icon;

	protected Module(String id, String name, Category category, Corner corner, boolean enabledByDefault) {
		this.id = id;
		this.name = name;
		this.category = category;
		this.corner = corner;
		this.enabled = enabledByDefault;
	}

	protected <S extends Setting<?>> S add(S setting) {
		settings.add(setting);
		return setting;
	}

	public Module icon(Item item) {
		iconItem = item;
		icon = null;
		return this;
	}

	public ItemStack icon() {
		if (icon == null) icon = new ItemStack(iconItem);
		return icon;
	}

	public boolean hud() {
		return true;
	}

	public float scale() {
		return 1;
	}

	public int width(Minecraft mc) {
		return 0;
	}

	public int height(Minecraft mc) {
		return 0;
	}

	public void render(Gfx g, Minecraft mc, int x, int y) {}

	public boolean visible(Minecraft mc) {
		return true;
	}

	public boolean click(Minecraft mc, double x, double y) {
		return false;
	}

	public String sample() {
		return name;
	}

	public void overlay(Gfx g, Minecraft mc) {}

	public void tick(Minecraft mc) {}

	public void disable(Minecraft mc) {}
}
