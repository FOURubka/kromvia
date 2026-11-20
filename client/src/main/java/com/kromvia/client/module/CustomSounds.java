package com.kromvia.client.module;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.IntBuffer;
import java.nio.ShortBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;
import net.fabricmc.loader.api.FabricLoader;
import org.lwjgl.openal.AL10;
import org.lwjgl.stb.STBVorbis;
import org.lwjgl.system.MemoryStack;
import org.lwjgl.system.MemoryUtil;
import org.lwjgl.system.libc.LibCStdlib;

final class CustomSounds {
	static final Path DIR = FabricLoader.getInstance().getConfigDir().resolve("kromvia").resolve("sounds");
	static final String[] TEMPLATES = {"skeet", "tf2-crit", "osu", "aimbooster", "bonk", "brick", "slap", "squash",
			"magic_squash", "pop", "bump", "tung", "coin", "bring", "applepay", "soft", "schoolboy", "meow", "nya", "uwu",
			"moan-1", "moan-2", "moan-3", "moan-4", "boykisser-1", "boykisser-2", "boykisser-3", "boykisser-4",
			"boykisser-5", "boykisser-6", "click-1", "click-2", "click-3", "glass-1", "glass-2", "glass-3"};
	private static final Map<String, Integer> BUFFERS = new HashMap<>();
	private static final List<Integer> SOURCES = new ArrayList<>();

	private CustomSounds() {}

	static String[] list() {
		try {
			Files.createDirectories(DIR);
		} catch (IOException ignored) {
		}
		try (Stream<Path> files = Files.list(DIR)) {
			return files.map(p -> p.getFileName().toString())
					.filter(n -> n.toLowerCase(Locale.ROOT).endsWith(".ogg"))
					.sorted()
					.toArray(String[]::new);
		} catch (IOException e) {
			return new String[0];
		}
	}

	static void play(String name, float volume, float pitch) {
		int buffer = BUFFERS.computeIfAbsent(name, CustomSounds::load);
		if (buffer == 0) return;
		SOURCES.removeIf(s -> {
			if (AL10.alGetSourcei(s, AL10.AL_SOURCE_STATE) == AL10.AL_PLAYING) return false;
			AL10.alDeleteSources(s);
			return true;
		});
		int source = AL10.alGenSources();
		AL10.alSourcei(source, AL10.AL_BUFFER, buffer);
		AL10.alSourcef(source, AL10.AL_GAIN, volume);
		AL10.alSourcef(source, AL10.AL_PITCH, pitch);
		AL10.alSourcei(source, AL10.AL_SOURCE_RELATIVE, AL10.AL_TRUE);
		AL10.alSource3f(source, AL10.AL_POSITION, 0, 0, 0);
		AL10.alSourcePlay(source);
		SOURCES.add(source);
	}

	private static int load(String name) {
		byte[] bytes = read(name);
		if (bytes == null) return 0;
		ByteBuffer data = MemoryUtil.memAlloc(bytes.length).put(bytes);
		data.flip();
		try (MemoryStack stack = MemoryStack.stackPush()) {
			IntBuffer channels = stack.mallocInt(1), rate = stack.mallocInt(1);
			ShortBuffer pcm = STBVorbis.stb_vorbis_decode_memory(data, channels, rate);
			if (pcm == null) return 0;
			try {
				int buffer = AL10.alGenBuffers();
				AL10.alBufferData(buffer, channels.get(0) == 1 ? AL10.AL_FORMAT_MONO16 : AL10.AL_FORMAT_STEREO16, pcm, rate.get(0));
				return buffer;
			} finally {
				LibCStdlib.free(pcm);
			}
		} finally {
			MemoryUtil.memFree(data);
		}
	}

	private static byte[] read(String name) {
		try {
			if (!java.util.Arrays.asList(TEMPLATES).contains(name)) return Files.readAllBytes(DIR.resolve(name));
			try (InputStream in = CustomSounds.class.getResourceAsStream("/assets/kromvia/sounds/hit/" + name + ".ogg")) {
				if (in == null) return null;
				ByteArrayOutputStream out = new ByteArrayOutputStream();
				byte[] chunk = new byte[8192];
				for (int n; (n = in.read(chunk)) > 0; ) out.write(chunk, 0, n);
				return out.toByteArray();
			}
		} catch (IOException e) {
			return null;
		}
	}
}
