package com.kromvia.client.compat;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.PlayerFaceRenderer;
import com.mojang.blaze3d.platform.Lighting;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.RenderType;
import com.kromvia.client.mixin.EntityRenderDispatcherAccessor;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.state.PlayerRenderState;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.client.resources.PlayerSkin;
import net.minecraft.world.item.ItemStack;
import org.joml.Quaternionf;
import org.joml.Vector3f;

public final class Gfx {
	private final GuiGraphics g;

	private Gfx(GuiGraphics g) {
		this.g = g;
	}

	public static Gfx of(GuiGraphics g) {
		return new Gfx(g);
	}

	public GuiGraphics raw() {
		return g;
	}

	public int guiWidth() {
		return g.guiWidth();
	}

	public int guiHeight() {
		return g.guiHeight();
	}

	public Pose pose() {
		return new Pose(g.pose());
	}

	public record Pose(PoseStack stack) {
		public void pushMatrix() {
			stack.pushPose();
		}

		public void popMatrix() {
			stack.popPose();
		}

		public void translate(float x, float y) {
			stack.translate(x, y, 0);
		}

		public void scale(float x, float y) {
			stack.scale(x, y, 1);
		}

		public void rotate(float radians) {
			stack.mulPose(new Quaternionf().rotateZ(radians));
		}
	}

	public void fill(int x1, int y1, int x2, int y2, int color) {
		g.fill(x1, y1, x2, y2, color);
	}

	public void fillGradient(int x1, int y1, int x2, int y2, int top, int bottom) {
		g.fillGradient(x1, y1, x2, y2, top, bottom);
	}

	public void drawString(Font font, String text, int x, int y, int color) {
		g.drawString(font, text, x, y, color);
	}

	public void drawString(Font font, String text, int x, int y, int color, boolean shadow) {
		g.drawString(font, text, x, y, color, shadow);
	}

	public void drawString(Font font, Component text, int x, int y, int color) {
		g.drawString(font, text, x, y, color);
	}

	public void drawString(Font font, Component text, int x, int y, int color, boolean shadow) {
		g.drawString(font, text, x, y, color, shadow);
	}

	public void drawString(Font font, FormattedCharSequence text, int x, int y, int color, boolean shadow) {
		g.drawString(font, text, x, y, color, shadow);
	}

	public void drawCenteredString(Font font, String text, int x, int y, int color) {
		drawString(font, text, x - font.width(text) / 2, y, color, false);
	}

	public void drawCenteredString(Font font, Component text, int x, int y, int color) {
		drawString(font, text, x - font.width(text) / 2, y, color, false);
	}

	public void renderItem(ItemStack stack, int x, int y) {
		g.renderItem(stack, x, y);
	}

	public void itemDecorations(ItemStack stack, int x, int y) {
		g.renderItemDecorations(Minecraft.getInstance().font, stack, x, y);
	}

	public void blit(ResourceLocation texture, int x, int y, float u, float v, int w, int h, int regionW, int regionH, int texW, int texH, int color) {
		g.blit(RenderType::guiTextured, texture, x, y, u, v, w, h, regionW, regionH, texW, texH, color);
	}

	public void blit(ResourceLocation texture, int x, int y, float u, float v, int w, int h, int regionW, int regionH, int texW, int texH) {
		g.blit(RenderType::guiTextured, texture, x, y, u, v, w, h, regionW, regionH, texW, texH);
	}

	public void face(PlayerSkin skin, int x, int y, int size) {
		PlayerFaceRenderer.draw(g, skin, x, y, size);
	}

	public void entity(EntityRenderState state, float scale, Vector3f offset, Quaternionf rotation, Quaternionf cameraAngle, int x1, int y1, int x2, int y2) {
		EntityRenderDispatcher dispatcher = Minecraft.getInstance().getEntityRenderDispatcher();
		PoseStack pose = g.pose();
		g.enableScissor(x1, y1, x2, y2);
		pose.pushPose();
		pose.translate((x1 + x2) / 2F, (y1 + y2) / 2F, 50);
		pose.scale(scale, scale, -scale);
		pose.translate(offset.x, offset.y, offset.z);
		pose.mulPose(rotation);
		g.flush();
		Lighting.setupForEntityInInventory();
		dispatcher.overrideCameraOrientation(cameraAngle.conjugate(new Quaternionf()).rotateY((float) Math.PI));
		dispatcher.setRenderShadow(false);
		PlayerRenderState player = (PlayerRenderState) state;
		var renderers = ((EntityRenderDispatcherAccessor) dispatcher).kromvia$playerRenderers();
		@SuppressWarnings("unchecked")
		EntityRenderer<?, PlayerRenderState> renderer = (EntityRenderer<?, PlayerRenderState>) renderers.getOrDefault(player.skin.model(), renderers.get(PlayerSkin.Model.WIDE));
		g.drawSpecial(buffers -> renderer.render(player, pose, buffers, 0xF000F0));
		dispatcher.setRenderShadow(true);
		pose.popPose();
		Lighting.setupFor3DItems();
		g.disableScissor();
	}

	public void widget(AbstractWidget widget, int mouseX, int mouseY, float delta) {
		widget.render(g, mouseX, mouseY, delta);
	}

	public void nextStratum() {
		g.flush();
	}

	public void blurBeforeThisStratum() {
		g.flush();
		Minecraft.getInstance().gameRenderer.processBlurEffect();
		Minecraft.getInstance().getMainRenderTarget().bindWrite(false);
	}

	public void enableScissor(int x1, int y1, int x2, int y2) {
		g.enableScissor(x1, y1, x2, y2);
	}

	public void disableScissor() {
		g.disableScissor();
	}
}
