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
		return RenderType.lightning();
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
		b.vertex(p.pose(), (float) x, (float) y, (float) z).color(argb >> 16 & 0xFF, argb >> 8 & 0xFF, argb & 0xFF, argb >>> 24).endVertex();
	}

	static void modelVertex(VertexConsumer b, PoseStack.Pose p, float x, float y, float z, int color, float u, float v, int light, float nx, float ny, float nz) {
		b.vertex(p.pose(), x, y, z).color(color >> 16 & 0xFF, color >> 8 & 0xFF, color & 0xFF, color >>> 24).uv(u, v).overlayCoords(OverlayTexture.NO_OVERLAY).uv2(light).normal(p.normal(), nx, ny, nz).endVertex();
	}

	static void mulPose(PoseStack ps, org.joml.Matrix4f m) {
		float[] a = new float[16];
		m.get(a);
		com.mojang.math.Matrix4f converted = new com.mojang.math.Matrix4f();
		converted.load(java.nio.FloatBuffer.wrap(a));
		ps.mulPoseMatrix(converted);
	}

	static void text(Object out, PoseStack pose, String text, float x, float y, int color, boolean shadow, boolean seeThrough, int background) {
		Minecraft.getInstance().font.drawInBatch(text, x, y, color, shadow, pose.last().pose(), (MultiBufferSource) out, seeThrough, background, 0xF000F0);
	}
}
