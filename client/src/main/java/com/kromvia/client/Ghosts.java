package com.kromvia.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;

public final class Ghosts {
	private Ghosts() {}

	public static final int HZ = 10;
	public static final int MAX_POINTS = HZ * 60 * 10;
	public static final double SAME_START = 4;

	public static final class Run {
		public final String name, dim, place;
		public final long ms;
		public final float[] pts;
		public String file;

		public Run(String name, String dim, String place, long ms, float[] pts) {
			this.name = name;
			this.dim = dim;
			this.place = place;
			this.ms = ms;
			this.pts = pts;
		}

		public int size() {
			return pts.length / 3;
		}

		public double[] at(double t) {
			int n = size();
			double i = Math.max(0, Math.min(n - 1, t * HZ / 1000.0));
			int a = (int) Math.floor(i), b = Math.min(n - 1, a + 1);
			double f = i - a;
			return new double[] {lerp(pts[a * 3], pts[b * 3], f), lerp(pts[a * 3 + 1], pts[b * 3 + 1], f), lerp(pts[a * 3 + 2], pts[b * 3 + 2], f)};
		}

		public double startDistance(double x, double y, double z) {
			double dx = pts[0] - x, dy = pts[1] - y, dz = pts[2] - z;
			return Math.sqrt(dx * dx + dy * dy + dz * dz);
		}

		public double timeNear(double x, double y, double z, double fromMs) {
			int n = size();
			int from = (int) Math.max(0, fromMs * HZ / 1000 - HZ * 5);
			int to = (int) Math.min(n, fromMs * HZ / 1000 + HZ * 5);
			double best = Double.MAX_VALUE;
			int bi = -1;
			for (int i = from; i < to; i++) {
				double dx = pts[i * 3] - x, dy = pts[i * 3 + 1] - y, dz = pts[i * 3 + 2] - z;
				double d = dx * dx + dy * dy + dz * dz;
				if (d < best) {
					best = d;
					bi = i;
				}
			}
			return bi < 0 || best > 36 ? -1 : bi * 1000.0 / HZ;
		}

		JsonObject json() {
			JsonObject o = new JsonObject();
			o.addProperty("v", 1);
			o.addProperty("name", name);
			o.addProperty("dim", dim);
			o.addProperty("place", place);
			o.addProperty("ms", ms);
			StringBuilder b = new StringBuilder();
			for (int i = 0; i < pts.length; i++) {
				if (i > 0) b.append(i % 3 == 0 ? ';' : ',');
				b.append(String.format(Locale.ROOT, "%.2f", pts[i]));
			}
			o.addProperty("pts", b.toString());
			return o;
		}

		static Run of(JsonObject o) {
			String[] parts = o.get("pts").getAsString().split("[;,]");
			if (parts.length < 6 || parts.length % 3 != 0 || parts.length > MAX_POINTS * 3) throw new IllegalArgumentException("bad ghost");
			float[] pts = new float[parts.length];
			for (int i = 0; i < parts.length; i++) {
				pts[i] = Float.parseFloat(parts[i]);
				if (!Float.isFinite(pts[i]) || Math.abs(pts[i]) > 3e7) throw new IllegalArgumentException("bad ghost");
			}
			String place = o.has("place") ? o.get("place").getAsString() : "";
			return new Run(o.get("name").getAsString(), o.get("dim").getAsString(), place, o.get("ms").getAsLong(), pts);
		}
	}

	private static volatile Run pinned;
	private static volatile String status = "";
	private static volatile List<Run> saved;

	private static double lerp(double a, double b, double f) {
		return a + (b - a) * f;
	}

	private static File dir() {
		return new File(Minecraft.getInstance().gameDirectory, "kromvia/ghosts");
	}

	public static String place(Minecraft mc) {
		String server = Config.currentServer(mc);
		if (server != null) return server;
		return "local";
	}

	public static synchronized List<Run> list() {
		if (saved != null) return saved;
		List<Run> out = new ArrayList<>();
		File[] files = dir().listFiles((d, n) -> n.endsWith(".json"));
		if (files != null) {
			for (File f : files) {
				try {
					Run r = Run.of(new JsonParser().parse(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8)).getAsJsonObject());
					r.file = f.getName();
					out.add(r);
				} catch (IOException | RuntimeException ignored) {
				}
			}
		}
		Collections.sort(out, (a, b) -> Long.compare(a.ms, b.ms));
		saved = Collections.unmodifiableList(out);
		return saved;
	}

	public static Run best(String dim, String place, double x, double y, double z) {
		Run p = pinned;
		if (p != null && p.dim.equals(dim) && p.startDistance(x, y, z) <= SAME_START) return p;
		Run best = null;
		for (Run r : list()) {
			if (r.dim.equals(dim) && r.place.equals(place) && r.startDistance(x, y, z) <= SAME_START && (best == null || r.ms < best.ms)) best = r;
		}
		return best;
	}

	public static synchronized void save(Run run) {
		File d = dir();
		if (!d.isDirectory() && !d.mkdirs()) return;
		String file = Long.toString(System.currentTimeMillis(), 36) + ".json";
		try {
			Files.write(new File(d, file).toPath(), run.json().toString().getBytes(StandardCharsets.UTF_8));
			run.file = file;
		} catch (IOException ignored) {
		}
		saved = null;
	}

	public static synchronized void delete(Run run) {
		if (run.file != null && !new File(dir(), run.file).delete()) return;
		if (run == pinned) pinned = null;
		saved = null;
	}

	public static Run pinned() {
		return pinned;
	}

	public static void pin(Run run) {
		pinned = run;
	}

	public static String status() {
		return status;
	}

	private static void ask(String key, Object value) {
		Consumer<String> out = Accounts.sender;
		if (out == null) {
			status = "Start the game from the Kromvia launcher to share ghosts.";
			return;
		}
		JsonObject g = new JsonObject();
		if (value instanceof JsonObject) g.add(key, (JsonObject) value);
		else g.addProperty(key, (String) value);
		JsonObject msg = new JsonObject();
		msg.add("ghost", g);
		out.accept(msg.toString());
	}

	public static void share(Run run) {
		status = "Uploading…";
		ask("share", run.json());
	}

	public static void load(String code) {
		status = "Loading " + code + "…";
		ask("load", code.trim().toUpperCase(Locale.ROOT));
	}

	public static void answer(JsonObject o) {
		Minecraft mc = Minecraft.getInstance();
		if (o.has("error")) {
			status = o.get("error").getAsString();
		} else if (o.has("code")) {
			String code = o.get("code").getAsString();
			status = "Code " + code + " copied. Friends paste it in Ghosts.";
			mc.execute(() -> mc.keyboardHandler.setClipboard(code));
		} else if (o.has("data") && o.get("data").isJsonObject()) {
			try {
				Run r = Run.of(o.getAsJsonObject("data"));
				String from = o.has("from") ? o.get("from").getAsString() : r.name;
				pinned = new Run(from, r.dim, r.place, r.ms, r.pts);
				status = "Loaded " + from + "'s ghost. Go to its start (marked in the world) and press the ghost key.";
			} catch (RuntimeException e) {
				status = "That code is not a ghost.";
			}
		}
	}
}
