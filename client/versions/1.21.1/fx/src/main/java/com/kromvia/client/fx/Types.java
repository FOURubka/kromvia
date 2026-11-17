package com.kromvia.client.fx;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;

final class Types {
	private Types() {}

	static RenderType shapes() {
		return RenderType.debugQuads();
	}

	static void shapes(Object out, PoseStack pose, Geometry geometry) {
		MultiBufferSource.BufferSource buffers = (MultiBufferSource.BufferSource) out;
		VertexConsumer b = buffers.getBuffer(shapes());
		geometry.draw(pose.last(), b);
		buffers.endBatch(shapes());
	}

	static RenderType model(ResourceLocation texture) {
		return RenderType.entityCutoutNoCull(texture);
	}

	static void vertex(VertexConsumer b, PoseStack.Pose p, double x, double y, double z, int argb) {
		b.addVertex(p, (float) x, (float) y, (float) z).setColor(argb);
	}

	static void modelVertex(VertexConsumer b, PoseStack.Pose p, float x, float y, float z, int color, float u, float v, int light, float nx, float ny, float nz) {
		b.addVertex(p, x, y, z).setColor(color).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(light).setNormal(p, nx, ny, nz);
	}

	static void mulPose(PoseStack ps, org.joml.Matrix4f m) {
		ps.mulPose(m);
	}

	static void text(Object out, PoseStack pose, String text, float x, float y, int color, boolean shadow, boolean seeThrough, int background) {
		Minecraft.getInstance().font.drawInBatch(text, x, y, color, shadow, pose.last().pose(), (MultiBufferSource) out,
				seeThrough ? net.minecraft.client.gui.Font.DisplayMode.SEE_THROUGH : net.minecraft.client.gui.Font.DisplayMode.NORMAL, background, 0xF000F0);
	}
}
