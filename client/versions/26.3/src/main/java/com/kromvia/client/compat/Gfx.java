package com.kromvia.client.compat;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.PlayerFaceExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.entity.player.PlayerSkin;
import net.minecraft.world.item.ItemStack;
import org.joml.Matrix3x2fStack;
import org.joml.Quaternionf;
import org.joml.Vector3f;

public final class Gfx {
	private final GuiGraphicsExtractor g;

	private Gfx(GuiGraphicsExtractor g) {
		this.g = g;
	}

	public static Gfx of(GuiGraphicsExtractor g) {
		return new Gfx(g);
	}

	public GuiGraphicsExtractor raw() {
		return g;
	}

	public int guiWidth() {
		return g.guiWidth();
	}

	public int guiHeight() {
		return g.guiHeight();
	}

	public Matrix3x2fStack pose() {
		return g.pose();
	}

	public void fill(int x1, int y1, int x2, int y2, int color) {
		g.fill(x1, y1, x2, y2, color);
	}

	public void fillGradient(int x1, int y1, int x2, int y2, int top, int bottom) {
		g.fillGradient(x1, y1, x2, y2, top, bottom);
	}

	public void drawString(Font font, String text, int x, int y, int color) {
		g.text(font, text, x, y, color);
	}

	public void drawString(Font font, String text, int x, int y, int color, boolean shadow) {
		g.text(font, text, x, y, color, shadow);
	}

	public void drawString(Font font, Component text, int x, int y, int color) {
		g.text(font, text, x, y, color);
	}

	public void drawString(Font font, Component text, int x, int y, int color, boolean shadow) {
		g.text(font, text, x, y, color, shadow);
	}

	public void drawString(Font font, FormattedCharSequence text, int x, int y, int color, boolean shadow) {
		g.text(font, text, x, y, color, shadow);
	}

	public void drawCenteredString(Font font, String text, int x, int y, int color) {
		drawString(font, text, x - font.width(text) / 2, y, color, false);
	}

	public void drawCenteredString(Font font, Component text, int x, int y, int color) {
		drawString(font, text, x - font.width(text) / 2, y, color, false);
	}

	public void renderItem(ItemStack stack, int x, int y) {
		g.item(stack, x, y);
	}

	public void itemDecorations(ItemStack stack, int x, int y) {
		g.itemDecorations(Minecraft.getInstance().font, stack, x, y);
	}

	public void blit(Identifier texture, int x, int y, float u, float v, int w, int h, int regionW, int regionH, int texW, int texH, int color) {
		g.blit(RenderPipelines.GUI_TEXTURED, texture, x, y, u, v, w, h, regionW, regionH, texW, texH, color);
	}

	public void blit(Identifier texture, int x, int y, float u, float v, int w, int h, int regionW, int regionH, int texW, int texH) {
		g.blit(RenderPipelines.GUI_TEXTURED, texture, x, y, u, v, w, h, regionW, regionH, texW, texH);
	}

	public void face(PlayerSkin skin, int x, int y, int size) {
		PlayerFaceExtractor.extractRenderState(g, skin, x, y, size);
	}

	public void entity(EntityRenderState state, float scale, Vector3f offset, Quaternionf rotation, Quaternionf cameraAngle, int x1, int y1, int x2, int y2) {
		g.entity(state, scale, offset, rotation, cameraAngle, x1, y1, x2, y2);
	}

	public void widget(AbstractWidget widget, int mouseX, int mouseY, float delta) {
		widget.extractRenderState(g, mouseX, mouseY, delta);
	}

	public void nextStratum() {
		g.nextStratum();
	}

	public void blurBeforeThisStratum() {
		g.blurBeforeThisStratum();
	}

	public void enableScissor(int x1, int y1, int x2, int y2) {
		g.enableScissor(x1, y1, x2, y2);
	}

	public void disableScissor() {
		g.disableScissor();
	}
}
