package com.kromvia.client.mixin;

import java.net.URI;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;

import net.minecraft.network.chat.Component;
import net.minecraft.server.packs.PackLocationInfo;
import net.minecraft.server.packs.PackSelectionConfig;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.repository.BuiltInPackSource;
import net.minecraft.server.packs.repository.Pack;
import net.minecraft.server.packs.repository.PackCompatibility;
import net.minecraft.server.packs.repository.PackSource;
import net.minecraft.world.flag.FeatureFlagSet;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(BuiltInPackSource.class)
public abstract class BuiltInPackSourceMixin {
	@Shadow @Final private PackType packType;

	private static Path kromvia$root;

	@Inject(method = "loadPacks", at = @At("TAIL"))
	private void kromvia$ownPack(Consumer<Pack> out, CallbackInfo ci) {
		if (packType != PackType.CLIENT_RESOURCES) return;
		Path root = kromvia$root();
		if (root == null) return;
		PackLocationInfo info = new PackLocationInfo("kromvia", Component.literal("Kromvia"), PackSource.BUILT_IN, Optional.empty());
		Pack.Metadata meta = new Pack.Metadata(Component.literal("Kromvia client"), PackCompatibility.COMPATIBLE, FeatureFlagSet.of(), List.of());
		out.accept(new Pack(info, new net.minecraft.server.packs.PathPackResources.PathResourcesSupplier(root), meta, new PackSelectionConfig(true, Pack.Position.TOP, false)));
	}

	private static Path kromvia$root() {
		if (kromvia$root != null) return kromvia$root;
		try {
			Path src = Path.of(com.kromvia.client.KromviaClient.class.getProtectionDomain().getCodeSource().getLocation().toURI());
			if (Files.isDirectory(src)) return kromvia$root = src;
			if (!Files.isRegularFile(src)) return null;
			URI uri = URI.create("jar:" + src.toUri());
			FileSystem fs;
			try {
				fs = FileSystems.getFileSystem(uri);
			} catch (Exception e) {
				fs = FileSystems.newFileSystem(uri, Map.of());
			}
			Path root = fs.getPath("/");
			if (!Files.isDirectory(root.resolve("assets"))) return null;
			return kromvia$root = root;
		} catch (Exception e) {
			return null;
		}
	}
}
