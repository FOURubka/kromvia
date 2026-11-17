package com.kromvia.client.compat;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.PlayerFaceRenderer;
import com.kromvia.client.cosmetic.CosmeticsLayer;
import com.mojang.blaze3d.platform.Lighting;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.math.Axis;
import java.util.List;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.player.PlayerRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import com.kromvia.client.mixin.EntityRenderDispatcherAccessor;
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
		g.setColor((color >> 16 & 0xFF) / 255F, (color >> 8 & 0xFF) / 255F, (color & 0xFF) / 255F, (color >>> 24) / 255F);
		RenderSystem.enableBlend();
		g.blit(texture, x, y, w, h, u, v, regionW, regionH, texW, texH);
		RenderSystem.disableBlend();
		g.setColor(1, 1, 1, 1);
	}

	public void blit(ResourceLocation texture, int x, int y, float u, float v, int w, int h, int regionW, int regionH, int texW, int texH) {
		RenderSystem.enableBlend();
		g.blit(texture, x, y, w, h, u, v, regionW, regionH, texW, texH);
		RenderSystem.disableBlend();
	}

	public void face(PlayerSkin skin, int x, int y, int size) {
		PlayerFaceRenderer.draw(g, skin, x, y, size);
	}

	public void entity(EntityRenderState state, float scale, Vector3f offset, Quaternionf rotation, Quaternionf cameraAngle, int x1, int y1, int x2, int y2) {
		PlayerRenderState player = (PlayerRenderState) state;
		var renderers = ((EntityRenderDispatcherAccessor) Minecraft.getInstance().getEntityRenderDispatcher()).kromvia$playerRenderers();
		PlayerRenderer renderer = (PlayerRenderer) renderers.getOrDefault(player.skin.model(), renderers.get(PlayerSkin.Model.WIDE));
		PlayerModel<AbstractClientPlayer> model = renderer.getModel();
		PoseStack pose = g.pose();
		g.enableScissor(x1, y1, x2, y2);
		pose.pushPose();
		pose.translate((x1 + x2) / 2F, (y1 + y2) / 2F, 50);
		pose.scale(scale, scale, -scale);
		pose.translate(offset.x, offset.y, offset.z);
		pose.mulPose(rotation);
		pose.mulPose(Axis.YP.rotationDegrees(180 - player.bodyRot));
		pose.scale(-1, -1, 1);
		pose.scale(0.9375F, 0.9375F, 0.9375F);
		pose.translate(0, -1.501F, 0);
		g.flush();
		Lighting.setupForEntityInInventory();
		for (ModelPart part : List.of(model.head, model.hat, model.body, model.jacket, model.rightArm, model.rightSleeve,
				model.leftArm, model.leftSleeve, model.rightLeg, model.rightPants, model.leftLeg, model.leftPants)) {
			part.resetPose();
		}
		model.setAllVisible(true);
		model.crouching = false;
		model.riding = false;
		model.young = false;
		model.attackTime = 0;
		var buffers = g.bufferSource();
		model.renderToBuffer(pose, buffers.getBuffer(model.renderType(player.skin.texture())), 0xF000F0, OverlayTexture.NO_OVERLAY, 1, 1, 1, 1);
		new CosmeticsLayer(renderer).render(pose, buffers, 0xF000F0, player);
		g.flush();
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
	}

	public void enableScissor(int x1, int y1, int x2, int y2) {
		g.enableScissor(x1, y1, x2, y2);
	}

	public void disableScissor() {
		g.disableScissor();
	}
}
