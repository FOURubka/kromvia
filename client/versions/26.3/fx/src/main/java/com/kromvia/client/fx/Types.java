package com.kromvia.client.fx;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

final class Types {
	private Types() {}

	static RenderType shapes() {
		return RenderTypes.debugQuads();
	}

	static void shapes(Object out, PoseStack pose, Geometry geometry) {
		((SubmitNodeCollector) out).submitCustomGeometry(pose, shapes(), geometry::draw);
	}

	static RenderType model(Identifier texture) {
		return RenderTypes.entityCutout(texture);
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
		((SubmitNodeCollector) out).submitText(pose, x, y, net.minecraft.network.chat.Component.literal(text).getVisualOrderText(), shadow,
				seeThrough ? net.minecraft.client.gui.Font.DisplayMode.SEE_THROUGH : net.minecraft.client.gui.Font.DisplayMode.NORMAL, 0xF000F0, color, background, 0);
	}
}
