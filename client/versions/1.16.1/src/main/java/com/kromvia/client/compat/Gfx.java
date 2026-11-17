package com.kromvia.client.compat;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiComponent;
import net.minecraft.client.gui.components.AbstractWidget;
import com.kromvia.client.cosmetic.CosmeticsLayer;
import com.mojang.blaze3d.systems.RenderSystem;
import java.util.List;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.player.PlayerRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.platform.Window;
import net.minecraft.client.Minecraft;
import com.kromvia.client.mixin.EntityRenderDispatcherAccessor;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import com.kromvia.client.compat.PlayerSkin;
import net.minecraft.world.item.ItemStack;
import com.mojang.math.Quaternion;
import com.mojang.math.Vector3f;

public final class Gfx {
	private static final GuiComponent TEXT = new GuiComponent() {};

	private final PoseStack g;

	private Gfx(PoseStack g) {
		this.g = g;
	}

	public static void centered(PoseStack g, Font font, net.minecraft.network.chat.FormattedText text, int x, int y, int color) {
		TEXT.drawCenteredString(g, font, text, x, y, color);
	}

	public static Gfx of(PoseStack g) {
		return new Gfx(g);
	}

	public PoseStack raw() {
		return g;
	}

	public int guiWidth() {
		return Minecraft.getInstance().getWindow().getGuiScaledWidth();
	}

	public int guiHeight() {
		return Minecraft.getInstance().getWindow().getGuiScaledHeight();
	}

	public Pose pose() {
		return new Pose(g);
	}

	public static final class Pose {
		private final PoseStack stack;

		Pose(PoseStack stack) {
			this.stack = stack;
		}

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
			stack.mulPose(Vector3f.ZP.rotation(radians));
		}
	}

	public void fill(int x1, int y1, int x2, int y2, int color) {
		GuiComponent.fill(g, x1, y1, x2, y2, color);
	}

	public void fillGradient(int x1, int y1, int x2, int y2, int top, int bottom) {
		Gradient.draw(g, x1, y1, x2, y2, top, bottom);
	}

	public void drawString(Font font, String text, int x, int y, int color) {
		font.drawShadow(g, text, x, y, color);
	}

	public void drawString(Font font, String text, int x, int y, int color, boolean shadow) {
		if (shadow) font.drawShadow(g, text, x, y, color);
		else font.draw(g, text, x, y, color);
	}

	public void drawString(Font font, Component text, int x, int y, int color) {
		font.drawShadow(g, text, x, y, color);
	}

	public void drawString(Font font, Component text, int x, int y, int color, boolean shadow) {
		if (shadow) font.drawShadow(g, text, x, y, color);
		else font.draw(g, text, x, y, color);
	}

	public void drawCenteredString(Font font, String text, int x, int y, int color) {
		drawString(font, text, x - font.width(text) / 2, y, color, false);
	}

	public void drawCenteredString(Font font, Component text, int x, int y, int color) {
		drawString(font, text, x - font.width(text) / 2, y, color, false);
	}

	public void renderItem(ItemStack stack, int x, int y) {
		RenderSystem.pushMatrix();
		RenderSystem.multMatrix(g.last().pose());
		Minecraft.getInstance().getItemRenderer().renderGuiItem(stack, x, y);
		RenderSystem.popMatrix();
	}

	public void itemDecorations(ItemStack stack, int x, int y) {
		RenderSystem.pushMatrix();
		RenderSystem.multMatrix(g.last().pose());
		Minecraft.getInstance().getItemRenderer().renderGuiItemDecorations(Minecraft.getInstance().font, stack, x, y);
		RenderSystem.popMatrix();
	}

	public void blit(ResourceLocation texture, int x, int y, float u, float v, int w, int h, int regionW, int regionH, int texW, int texH, int color) {
		RenderSystem.color4f((color >> 16 & 0xFF) / 255F, (color >> 8 & 0xFF) / 255F, (color & 0xFF) / 255F, (color >>> 24) / 255F);
		blit(texture, x, y, u, v, w, h, regionW, regionH, texW, texH);
		RenderSystem.color4f(1, 1, 1, 1);
	}

	public void blit(ResourceLocation texture, int x, int y, float u, float v, int w, int h, int regionW, int regionH, int texW, int texH) {
		Minecraft.getInstance().getTextureManager().bind(texture);
		RenderSystem.enableBlend();
		GuiComponent.blit(g, x, y, w, h, u, v, regionW, regionH, texW, texH);
		RenderSystem.disableBlend();
	}

	public void face(PlayerSkin skin, int x, int y, int size) {
		Minecraft.getInstance().getTextureManager().bind(skin.texture());
		GuiComponent.blit(g, x, y, size, size, 8, 8, 8, 8, 64, 64);
		GuiComponent.blit(g, x, y, size, size, 40, 8, 8, 8, 64, 64);
	}

	public void entity(EntityRenderState state, float scale, Vector3f offset, Quaternion rotation, Quaternion cameraAngle, int x1, int y1, int x2, int y2) {
		PlayerRenderState player = (PlayerRenderState) state;
		java.util.Map<String, net.minecraft.client.renderer.entity.EntityRenderer<? extends net.minecraft.world.entity.player.Player>> renderers = ((EntityRenderDispatcherAccessor) Minecraft.getInstance().getEntityRenderDispatcher()).kromvia$playerRenderers();
		PlayerRenderer renderer = (PlayerRenderer) renderers.getOrDefault(player.skin.model().id, renderers.get("default"));
		PlayerModel<AbstractClientPlayer> model = renderer.getModel();
		PoseStack pose = g;
		enableScissor(x1, y1, x2, y2);
		pose.pushPose();
		pose.translate((x1 + x2) / 2F, (y1 + y2) / 2F, 50);
		pose.scale(scale, scale, -scale);
		pose.translate(offset.x(), offset.y(), offset.z());
		pose.mulPose(rotation);
		pose.mulPose(Vector3f.YP.rotationDegrees(180 - player.bodyRot));
		pose.scale(-1, -1, 1);
		pose.scale(0.9375F, 0.9375F, 0.9375F);
		pose.translate(0, -1.501F, 0);
		flush();
		float armY = player.skin.model().id.equals("slim") ? 2.5F : 2F;
		for (ModelPart part : java.util.Arrays.asList(model.head, model.body, model.rightArm, model.leftArm, model.rightLeg, model.leftLeg)) {
			part.xRot = part.yRot = part.zRot = 0;
		}
		model.head.setPos(0, 0, 0);
		model.body.setPos(0, 0, 0);
		model.rightArm.setPos(-5, armY, 0);
		model.leftArm.setPos(5, armY, 0);
		model.rightLeg.setPos(-1.9F, 12, 0);
		model.leftLeg.setPos(1.9F, 12, 0);
		model.hat.copyFrom(model.head);
		model.jacket.copyFrom(model.body);
		model.rightSleeve.copyFrom(model.rightArm);
		model.leftSleeve.copyFrom(model.leftArm);
		model.rightPants.copyFrom(model.rightLeg);
		model.leftPants.copyFrom(model.leftLeg);
		model.setAllVisible(true);
		model.crouching = false;
		model.riding = false;
		model.young = false;
		model.attackTime = 0;
		net.minecraft.client.renderer.MultiBufferSource.BufferSource buffers = Minecraft.getInstance().renderBuffers().bufferSource();
		model.renderToBuffer(pose, buffers.getBuffer(model.renderType(player.skin.texture())), 0xF000F0, OverlayTexture.NO_OVERLAY, 1, 1, 1, 1);
		new CosmeticsLayer(renderer).render(pose, buffers, 0xF000F0, player);
		flush();
		pose.popPose();
		disableScissor();
	}

	public void widget(AbstractWidget widget, int mouseX, int mouseY, float delta) {
		widget.render(g, mouseX, mouseY, delta);
	}

	public void nextStratum() {
		flush();
	}

	public void blurBeforeThisStratum() {
		flush();
	}

	public void enableScissor(int x1, int y1, int x2, int y2) {
		Window window = Minecraft.getInstance().getWindow();
		double scale = window.getGuiScale();
		org.lwjgl.opengl.GL11.glEnable(org.lwjgl.opengl.GL11.GL_SCISSOR_TEST);
		org.lwjgl.opengl.GL11.glScissor((int) (x1 * scale), (int) (window.getHeight() - y2 * scale),
				Math.max(0, (int) ((x2 - x1) * scale)), Math.max(0, (int) ((y2 - y1) * scale)));
	}

	public void disableScissor() {
		org.lwjgl.opengl.GL11.glDisable(org.lwjgl.opengl.GL11.GL_SCISSOR_TEST);
	}

	private static final class Gradient extends GuiComponent {
		static void draw(PoseStack pose, int x1, int y1, int x2, int y2, int top, int bottom) {
			new Gradient().fillGradient(pose, x1, y1, x2, y2, top, bottom);
		}
	}

	private static void flush() {
		RenderSystem.disableDepthTest();
		Minecraft.getInstance().renderBuffers().bufferSource().endBatch();
		RenderSystem.enableDepthTest();
	}
}
