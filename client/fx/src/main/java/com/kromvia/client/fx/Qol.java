package com.kromvia.client.fx;

import com.kromvia.client.Accounts;

import com.google.common.collect.Ordering;
import com.kromvia.client.compat.Gfx;
import com.kromvia.client.compat.Mc;
import com.kromvia.client.module.Module;
import com.kromvia.client.module.Toggles;
import com.kromvia.client.module.setting.BoolSetting;
import com.kromvia.client.module.setting.ChoiceSetting;
import com.kromvia.client.module.setting.SliderSetting;
import com.kromvia.client.module.setting.TextSetting;
import com.kromvia.client.mixin.OverlayTextureAccessor;
import com.mojang.blaze3d.platform.NativeImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.WeakHashMap;
import java.util.concurrent.CompletableFuture;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import org.jspecify.annotations.Nullable;

public final class Qol {
	private Qol() {}

	private static class Flag extends Module {
		Flag(String id, String name, Category cat) {
			super(id, name, cat, Corner.TOP_LEFT, false);
		}

		@Override
		public boolean hud() {
			return false;
		}
	}

	public static final class ChatFilter extends Flag {
		public final TextSetting words = add(new TextSetting("words", "Words, comma separated", "", 512));
		public final ChoiceSetting mode = add(new ChoiceSetting("mode", "Messages with them", 0, "Hide", "Mask"));

		ChatFilter() {
			super("chat_filter", "Chat Filter", Category.UTILITY);
			icon(Items.BARRIER);
		}

		List<String> list() {
			return Arrays.stream(words.get().toLowerCase(Locale.ROOT).split(",")).map(String::trim).filter(w -> !w.isEmpty()).toList();
		}
	}

	public static final ChatFilter FILTER = new ChatFilter();

	private static boolean relayNotice(String text) {
		return text.contains("e4mc.link") || text.startsWith("Local game hosted on domain") || text.startsWith("Local game no longer publicly hosted");
	}

	public static @Nullable Component filter(Component message) {
		if (relayNotice(message.getString())) return null;
		More.AUTO_GG.onChat(message.getString());
		if (!FILTER.enabled) return message;
		List<String> words = FILTER.list();
		String text = message.getString().toLowerCase(Locale.ROOT);
		if (words.stream().noneMatch(text::contains)) return message;
		if (FILTER.mode.index() == 0) return null;
		MutableComponent out = Component.empty();
		message.visit((style, part) -> {
			out.append(Component.literal(mask(part, words)).setStyle(style));
			return Optional.empty();
		}, Style.EMPTY);
		return out;
	}

	private static String mask(String part, List<String> words) {
		for (String w : words) {
			part = java.util.regex.Pattern.compile(java.util.regex.Pattern.quote(w), java.util.regex.Pattern.CASE_INSENSITIVE | java.util.regex.Pattern.UNICODE_CASE)
					.matcher(part).replaceAll(m -> "*".repeat(m.group().length()));
		}
		return part;
	}

	public static final class ChatTools extends Flag {
		public final BoolSetting copy = add(new BoolSetting("copy", "Ctrl+click copies a message", true));
		public final BoolSetting delete = add(new BoolSetting("delete", "Ctrl+Shift+click deletes it", true));
		public final BoolSetting images = add(new BoolSetting("images", "Preview image links (the site sees your IP)", false));
		public final BoolSetting screenshots = add(new BoolSetting("screenshots", "Buttons under screenshots", true));
		public final BoolSetting safeCommands = add(new BoolSetting("safe_commands", "Clicked commands go to the chat box first", false));

		ChatTools() {
			super("chat_tools", "Chat Tools", Category.UTILITY);
			icon(Items.WRITABLE_BOOK);
		}
	}

	public static final ChatTools TOOLS = new ChatTools();

	public static boolean copies(Minecraft mc) {
		return TOOLS.enabled && TOOLS.copy.on() && mc.hasControlDown() && !mc.hasShiftDown();
	}

	public static boolean deletes(Minecraft mc) {
		return TOOLS.enabled && TOOLS.delete.on() && mc.hasControlDown() && mc.hasShiftDown();
	}

	public interface ChatLines {
		@Nullable Component kromvia$at(double x, double y, boolean delete);
	}

	public static boolean chatClick(Minecraft mc, ChatLines chat, double x, double y) {
		boolean delete = deletes(mc);
		if (!delete && !copies(mc)) return false;
		Component message = chat.kromvia$at(x, y, delete);
		if (message == null) return false;
		if (!delete) copy(mc, message);
		return true;
	}

	static void shared(Minecraft mc, String url, String error) {
		if (url == null) {
			Mc.say(Component.literal("Could not share: " + error).withStyle(ChatFormatting.RED));
			return;
		}
		mc.keyboardHandler.setClipboard(url);
		Mc.say(Component.literal("Link copied: ").withStyle(ChatFormatting.GRAY).append(button(url, ChatFormatting.AQUA, Chat.copy(url))));
	}

	public static void copy(Minecraft mc, Component message) {
		mc.keyboardHandler.setClipboard(message.getString());
	}

	private static final String DELETE = "kromvia:delete-screenshot ";
	private static final String SHARE = "kromvia:share-screenshot ";
	private static final String DISCORD = "kromvia:discord-screenshot ";
	private static final Map<String, File> DELETABLE = new java.util.HashMap<>();

	public static Component screenshotButtons(Component message) {
		if (!TOOLS.enabled || !TOOLS.screenshots.on()) return message;
		if (!(message.getContents() instanceof TranslatableContents t) || !t.getKey().equals("screenshot.success") || t.getArgs().length == 0) return message;
		if (!(t.getArgs()[0] instanceof Component name)) return message;
		String path = Chat.filePath(name.getStyle().getClickEvent());
		if (path == null) return message;
		return message.copy()
				.append(" ").append(button("Copy path", ChatFormatting.AQUA, Chat.copy(path)))
				.append(" ").append(button("Folder", ChatFormatting.GREEN, Chat.openFile(new File(path).getParent())))
				.append(" ").append(button("Share", ChatFormatting.LIGHT_PURPLE, Chat.run(SHARE + deletable(new File(path)))))
				.append(" ").append(button("Discord", ChatFormatting.BLUE, Chat.run(DISCORD + deletable(new File(path)))))
				.append(" ").append(button("Delete", ChatFormatting.RED, Chat.run(DELETE + deletable(new File(path)))));
	}

	private static String deletable(File file) {
		String nonce = java.util.UUID.randomUUID().toString();
		DELETABLE.put(nonce, file);
		return nonce;
	}

	private static Component button(String text, ChatFormatting color, ClickEvent click) {
		return Component.literal("[" + text + "]").withStyle(s -> s.withColor(color).withClickEvent(click).withHoverEvent(Chat.hover(Component.literal(text))));
	}

	public static boolean clicked(Minecraft mc, Style style) {
		String command = Chat.command(style.getClickEvent());
		boolean share = command != null && command.startsWith(SHARE), discord = command != null && command.startsWith(DISCORD);
		if (share || discord) {
			File file = DELETABLE.get(command.substring((share ? SHARE : DISCORD).length()));
			if (file == null || !TOOLS.enabled) return true;
			if (Accounts.sender == null) {
				Mc.say(Component.literal("Sharing needs the Kromvia launcher").withStyle(ChatFormatting.GRAY));
				return true;
			}
			com.google.gson.JsonObject msg = new com.google.gson.JsonObject();
			msg.addProperty(share ? "share_screenshot" : "discord_screenshot", file.getName());
			Accounts.sender.accept(msg.toString());
			if (share) Mc.say(Component.literal("Uploading " + file.getName() + "…").withStyle(ChatFormatting.GRAY));
			return true;
		}
		if (command != null && !command.startsWith("kromvia:") && TOOLS.enabled && TOOLS.safeCommands.on()) {
			Mc.setScreen(Chat.chatWith(command.startsWith("/") ? command : "/" + command));
			return true;
		}
		if (command == null || !command.startsWith(DELETE)) return false;
		File file = DELETABLE.get(command.substring(DELETE.length()));
		if (file == null || !TOOLS.enabled) return true;
		File folder = new File(mc.gameDirectory, "screenshots").getAbsoluteFile();
		if (!folder.equals(file.getAbsoluteFile().getParentFile()) || !file.getName().endsWith(".png")) return true;
		Screen back = Mc.screen();
		Mc.setScreen(new ConfirmScreen(yes -> {
			Mc.setScreen(back);
			if (!yes) return;
			DELETABLE.values().remove(file);
			boolean gone = file.delete();
			Mc.say(Component.literal(gone ? "Deleted " + file.getName() : "Could not delete " + file.getName()).withStyle(ChatFormatting.GRAY));
		}, Component.literal("Delete this screenshot?"), Component.literal(file.getName())));
		return true;
	}

	private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
	private static final int MAX_BYTES = 8 << 20;
	private static final int CACHE = 24;

	private static final class Preview {
		CompletableFuture<BufferedImage> loading;
		Identifier id;
		int w, h;
		boolean failed;
	}

	private static final Map<String, Preview> PREVIEWS = new LinkedHashMap<>(16, 0.75F, true);

	public static @Nullable String imageUrl(@Nullable Style style) {
		if (style == null || !TOOLS.enabled || !TOOLS.images.on()) return null;
		URI uri = Chat.url(style.getClickEvent());
		if (uri == null) return null;
		String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase(Locale.ROOT);
		boolean image = path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".gif") || path.endsWith(".webp") || path.endsWith(".bmp");
		return image && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) ? uri.toString() : null;
	}

	public static void preview(Gfx g, Minecraft mc, String url, int mouseX, int mouseY) {
		Preview p = PREVIEWS.computeIfAbsent(url, Qol::load);
		trimCache(mc);
		if (p.id == null && !p.failed && p.loading.isDone()) upload(mc, url, p);
		if (p.failed) return;
		if (p.id == null) {
			g.drawString(mc.font, "Loading image…", mouseX + 8, mouseY - 14, 0xFFAAAAAA);
			return;
		}
		float s = Math.min(1, Math.min(200F / p.w, 140F / p.h));
		int w = Math.round(p.w * s), h = Math.round(p.h * s);
		int x = Math.min(mouseX + 8, g.guiWidth() - w - 4), y = Math.max(4, mouseY - h - 8);
		g.fill(x - 2, y - 2, x + w + 2, y + h + 2, 0xE0101014);
		g.blit(p.id, x, y, 0, 0, w, h, p.w, p.h, p.w, p.h);
	}

	private static Preview load(String url) {
		Preview p = new Preview();
		HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10)).header("User-Agent", "Kromvia").build();
		p.loading = CompletableFuture.supplyAsync(() -> publicHost(req.uri().getHost())).thenCompose(ok -> ok
				? HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofInputStream())
				: CompletableFuture.<HttpResponse<java.io.InputStream>>failedFuture(new SecurityException("local address"))).thenApply(res -> {
			try (java.io.InputStream in = res.body()) {
				if (res.statusCode() != 200 || res.headers().firstValueAsLong("content-length").orElse(0) > MAX_BYTES) return null;
				byte[] body = in.readNBytes(MAX_BYTES + 1);
				return body.length > MAX_BYTES ? null : decode(body);
			} catch (Exception e) {
				return null;
			}
		});
		return p;
	}

	private static BufferedImage decode(byte[] body) throws java.io.IOException {
		try (var in = ImageIO.createImageInputStream(new ByteArrayInputStream(body))) {
			var readers = ImageIO.getImageReaders(in);
			if (!readers.hasNext()) return null;
			var reader = readers.next();
			try {
				reader.setInput(in, true, true);
				if (reader.getWidth(0) > 4096 || reader.getHeight(0) > 4096) return null;
				return reader.read(0);
			} finally {
				reader.dispose();
			}
		}
	}

	private static boolean publicHost(String host) {
		try {
			for (InetAddress a : InetAddress.getAllByName(host)) {
				byte[] b = a.getAddress();
				boolean ula = b.length == 16 && (b[0] & 0xFE) == 0xFC;
				if (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress() || a.isAnyLocalAddress() || a.isMulticastAddress() || ula) return false;
			}
			return true;
		} catch (Exception e) {
			return false;
		}
	}

	private static void upload(Minecraft mc, String url, Preview p) {
		BufferedImage img = p.loading.isCompletedExceptionally() ? null : p.loading.getNow(null);
		if (img == null || img.getWidth() > 4096 || img.getHeight() > 4096) {
			p.failed = true;
			return;
		}
		NativeImage n = new NativeImage(img.getWidth(), img.getHeight(), false);
		for (int y = 0; y < img.getHeight(); y++) {
			for (int x = 0; x < img.getWidth(); x++) Ver.setPixel(n, x, y, img.getRGB(x, y));
		}
		p.id = Identifier.fromNamespaceAndPath("kromvia", "chat_preview/" + Integer.toHexString(url.hashCode()) + "_" + System.nanoTime());
		p.w = img.getWidth();
		p.h = img.getHeight();
		mc.getTextureManager().register(p.id, Chat.texture("kromvia chat preview", n));
	}

	private static void trimCache(Minecraft mc) {
		while (PREVIEWS.size() > CACHE) {
			var oldest = PREVIEWS.entrySet().iterator().next();
			if (oldest.getValue().id != null) mc.getTextureManager().release(oldest.getValue().id);
			PREVIEWS.remove(oldest.getKey());
		}
	}

	public static final Module CONFIRM_DISCONNECT = new Flag("confirm_disconnect", "Confirm Disconnect", Module.Category.UTILITY).icon(Items.OAK_DOOR);

	public static Button.OnPress confirmDisconnect(Screen pause, Button.OnPress original) {
		return button -> {
			if (!CONFIRM_DISCONNECT.enabled) {
				original.onPress(button);
				return;
			}
			Mc.setScreen(new ConfirmScreen(yes -> {
				Mc.setScreen(pause);
				if (yes) original.onPress(button);
			}, Component.literal("Leave the world?"), Component.literal("You will be disconnected.")));
		};
	}

	public static final class Bobbing extends Flag {
		public final BoolSetting screen = add(new BoolSetting("screen", "Screen bobs when walking", true));
		public final BoolSetting hand = add(new BoolSetting("hand", "Hand bobs when walking", true));
		public final BoolSetting screenTilt = add(new BoolSetting("screen_tilt", "Screen tilts when hurt", true));
		public final BoolSetting handTilt = add(new BoolSetting("hand_tilt", "Hand tilts when hurt", true));

		Bobbing() {
			super("bobbing", "Bobbing", Category.UTILITY);
			icon(Items.FEATHER);
		}

		public boolean on(BoolSetting s) {
			return !enabled || s.on();
		}
	}

	public static final Bobbing BOBBING = new Bobbing();

	public static final class Fov extends Flag {
		final SliderSetting fov = add(new SliderSetting("fov", "Field of view", 90, 30, 150, 1, "°"));

		Fov() {
			super("custom_fov", "Custom FOV", Category.UTILITY);
			icon(Items.SPYGLASS);
		}
	}

	public static final Fov FOV = new Fov();

	public static Object fov(Object vanilla) {
		return FOV.enabled ? Integer.valueOf(Math.round(FOV.fov.value())) : vanilla;
	}

	public static final class Gamma extends Flag {
		final SliderSetting overworld = add(new SliderSetting("overworld", "Overworld", 50, 0, 500, 10, "%"));
		final SliderSetting nether = add(new SliderSetting("nether", "Nether", 100, 0, 500, 10, "%"));
		final SliderSetting end = add(new SliderSetting("end", "End", 100, 0, 500, 10, "%"));
		final BoolSetting dynamic = add(new BoolSetting("dynamic", "Brighter in the dark", false));
		final SliderSetting boost = add(new SliderSetting("boost", "Extra in the dark", 100, 10, 300, 10, "%"));

		Gamma() {
			super("dimension_gamma", "Gamma per Dimension", Category.UTILITY);
			icon(Items.LANTERN);
		}
	}

	public static final Gamma GAMMA = new Gamma();
	private static Module fullbright;

	private static boolean fullbright() {
		if (fullbright == null) fullbright = com.kromvia.client.KromviaClient.MODULES.stream().filter(m -> m instanceof Toggles.Fullbright).findFirst().orElse(GAMMA);
		return fullbright != GAMMA && fullbright.enabled;
	}

	public static Object gamma(Object vanilla) {
		Minecraft mc = Minecraft.getInstance();
		if (!GAMMA.enabled || mc.level == null || fullbright()) return vanilla;
		var dim = mc.level.dimension();
		SliderSetting s = dim == Level.NETHER ? GAMMA.nether : dim == Level.END ? GAMMA.end : GAMMA.overworld;
		float target = 0;
		if (GAMMA.dynamic.on() && mc.player != null) target = (1 - mc.level.getRawBrightness(mc.player.blockPosition(), 0) / 15F) * GAMMA.boost.value() / 100;
		darkBoost += (target - darkBoost) * 0.02F;
		return Double.valueOf(s.value() / 100 + darkBoost);
	}

	private static float darkBoost;

	public static final class DamageTint extends Flag {
		DamageTint() {
			super("damage_tint", "Damage Tint by Type", Category.PVP);
			icon(Items.BLAZE_POWDER);
		}

		@Override
		public void tick(Minecraft mc) {
			paintTints(mc, true);
		}

		@Override
		public void disable(Minecraft mc) {
			paintTints(mc, false);
		}
	}

	public static final DamageTint DAMAGE_TINT = new DamageTint();

	private static final int[] TINTS = {0, 0xB2FF8A1E, 0xB27FD4FF, 0xB27A3BD1, 0xB2E0C060, 0xB2FFD24A, 0xB22E6BFF, 0xB2FFFFFF};

	private static void paintTints(Minecraft mc, boolean on) {
		var tex = ((OverlayTextureAccessor) mc.gameRenderer.overlayTexture()).kromvia$texture();
		var img = tex.getPixels();
		if (img == null) return;
		int base = Ver.getPixel(img, 0, 0);
		if (Ver.getPixel(img, 1, 0) == (on ? TINTS[1] : base)) return;
		for (int x = 1; x < TINTS.length; x++) {
			for (int y = 0; y < 8; y++) Ver.setPixel(img, x, y, on ? TINTS[x] : base);
		}
		tex.upload();
	}

	private static final Map<LivingEntity, Integer> HURT_BY = new WeakHashMap<>();

	public static void hurt(LivingEntity entity, DamageSource source) {
		int t = Ver.damageKind(source);
		HURT_BY.put(entity, t);
	}

	public static int tintColumn(LivingEntity entity) {
		return DAMAGE_TINT.enabled ? HURT_BY.getOrDefault(entity, 0) : 0;
	}

	public static int overlay(int packed, int column) {
		return column > 0 && (packed & 0xFFFF) == 0 && (packed >>> 16) < 8 ? packed | column : packed;
	}

	public static final class VisibleDamage extends Flag {
		final BoolSetting players = add(new BoolSetting("players", "On players", true));
		final BoolSetting mobs = add(new BoolSetting("mobs", "On mobs", true));

		VisibleDamage() {
			super("visible_damage", "Visible Damage", Category.PVP);
			icon(Items.CRACKED_STONE_BRICKS);
		}
	}

	public static final VisibleDamage VISIBLE_DAMAGE = new VisibleDamage();

	public static int cracks(LivingEntity entity) {
		if (!VISIBLE_DAMAGE.enabled || entity.isDeadOrDying() || entity == Minecraft.getInstance().player && Minecraft.getInstance().options.getCameraType().isFirstPerson()) return -1;
		if (!(entity instanceof Player ? VISIBLE_DAMAGE.players.on() : VISIBLE_DAMAGE.mobs.on())) return -1;
		float left = entity.getHealth() / Math.max(1, entity.getMaxHealth());
		return left > 0.75F ? -1 : left > 0.5F ? 2 : left > 0.25F ? 5 : 8;
	}

	public interface LivingState {
		int kromvia$tint();

		int kromvia$cracks();

		void kromvia$set(int tint, int cracks);

		default boolean kromvia$mount() {
			return false;
		}

		default void kromvia$mount(boolean faded) {}
	}

	public static final class EffectTimers extends Flag {
		EffectTimers() {
			super("effect_timers", "Effect Timers", Category.HUD);
			icon(Items.CLOCK);
		}
	}

	public static final EffectTimers EFFECT_TIMERS = new EffectTimers();

	public static void effectTimers(Gfx g, Minecraft mc) {
		if (!EFFECT_TIMERS.enabled || mc.player == null) return;
		Collection<MobEffectInstance> effects = mc.player.getActiveEffects();
		Screen screen = Mc.screen();
		if (effects.isEmpty() || screen != null && Ver.showsEffects(screen)) return;
		int good = 0, bad = 0;
		for (MobEffectInstance e : Ordering.natural().reverse().sortedCopy(effects)) {
			if (!e.showIcon()) continue;
			int x = g.guiWidth(), y = mc.isDemo() ? 16 : 1;
			if (e.getEffect().value().isBeneficial()) {
				x -= 25 * ++good;
			} else {
				x -= 25 * ++bad;
				y += 26;
			}
			String time = time(e);
			g.pose().pushMatrix();
			g.pose().translate(x + 12, y + 17);
			g.pose().scale(0.5F, 0.5F);
			int color = e.getDuration() != -1 && e.getDuration() <= 200 && (mc.player.tickCount / 5) % 2 == 0 ? 0xFFFF5555 : 0xFFFFFFFF;
			g.drawCenteredString(mc.font, time, 0, 0, color);
			g.pose().popMatrix();
		}
	}

	private static String time(MobEffectInstance e) {
		if (e.isInfiniteDuration()) return "∞";
		int s = e.getDuration() / 20;
		return s >= 3600 ? s / 3600 + "h" : s / 60 + ":" + String.format("%02d", s % 60);
	}

	public static final class ArmorBar extends Flag {
		final BoolSetting number = add(new BoolSetting("number", "Show the number", true));

		ArmorBar() {
			super("armor_bar", "Detailed Armour Bar", Category.HUD);
			icon(Items.DIAMOND_CHESTPLATE);
		}
	}

	public static final ArmorBar ARMOR_BAR = new ArmorBar();

	public static boolean detailedArmor() {
		return ARMOR_BAR.enabled;
	}

	public interface Sprite {
		void draw(Identifier sprite, int x, int y, int color);
	}

	private static final Identifier ARMOR_FULL = Identifier.withDefaultNamespace("hud/armor_full");
	private static final Identifier ARMOR_HALF = Identifier.withDefaultNamespace("hud/armor_half");
	private static final Identifier ARMOR_EMPTY = Identifier.withDefaultNamespace("hud/armor_empty");

	public static void drawArmor(Gfx g, Minecraft mc, Player player, int x, int y, Sprite sprite) {
		int armor = player.getArmorValue();
		if (armor <= 0) return;
		int[] colors = armorColors(player);
		for (int i = 0; i < 10; i++) {
			int point = i * 2, color = point < colors.length ? colors[point] : -1;
			if (point + 1 < armor) sprite.draw(ARMOR_FULL, x + i * 8, y, color);
			else if (point + 1 == armor) sprite.draw(ARMOR_HALF, x + i * 8, y, color);
			else sprite.draw(ARMOR_EMPTY, x + i * 8, y, -1);
		}
		if (ARMOR_BAR.number.on()) g.drawString(mc.font, String.valueOf(armor), x + 82, y + 1, 0xFFFFFFFF, true);
	}

	private static final EquipmentSlot[] ARMOR = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};

	static int[] armorColors(Player player) {
		List<Integer> out = new ArrayList<>();
		for (EquipmentSlot slot : ARMOR) {
			ItemStack stack = player.getItemBySlot(slot);
			int points = (int) Math.round(Ver.armor(stack, slot));
			for (int i = 0; i < points; i++) out.add(material(stack));
		}
		return out.stream().mapToInt(Integer::intValue).toArray();
	}

	private static int material(ItemStack stack) {
		String id = stack.getItem().toString();
		if (id.contains("netherite")) return 0xFF6E5F66;
		if (id.contains("diamond")) return 0xFF4DE3D6;
		if (id.contains("golden")) return 0xFFF5D33B;
		if (id.contains("iron")) return 0xFFE6E6E6;
		if (id.contains("chainmail")) return 0xFFA0A0A0;
		if (id.contains("copper")) return 0xFFE07B52;
		if (id.contains("leather")) return 0xFFB0703F;
		if (id.contains("turtle")) return 0xFF5CB847;
		return 0xFFFFFFFF;
	}

	public static final class Inventory extends Flag {
		final BoolSetting blur = add(new BoolSetting("blur", "Blur the world behind", true));
		final BoolSetting clickOut = add(new BoolSetting("click_out", "Click outside closes it", false));
		final BoolSetting cursor = add(new BoolSetting("cursor", "Keep the cursor where it was", true));

		Inventory() {
			super("inventory", "Inventory", Category.UTILITY);
			icon(Items.CHEST);
		}
	}

	public static final Inventory INVENTORY = new Inventory();

	public static boolean blurInventory() {
		return INVENTORY.enabled && INVENTORY.blur.on();
	}

	public static boolean clickOutCloses() {
		return INVENTORY.enabled && INVENTORY.clickOut.on();
	}

	private static double cursorX, cursorY;
	private static long cursorAt;

	public static void cursorTaken(double x, double y) {
		cursorX = x;
		cursorY = y;
		cursorAt = System.currentTimeMillis();
	}

	public static double @Nullable [] cursorBack() {
		boolean recent = System.currentTimeMillis() - cursorAt < 3000;
		return INVENTORY.enabled && INVENTORY.cursor.on() && recent ? new double[] {cursorX, cursorY} : null;
	}

	public static final class InventoryScale extends Flag {
		final SliderSetting scale = add(new SliderSetting("scale", "GUI scale in containers", 2, 1, 6, 1, "x"));
		private int applied;

		InventoryScale() {
			super("inventory_scale", "Inventory Scale", Category.UTILITY);
			icon(Items.CHEST);
		}

		@Override
		public void tick(Minecraft mc) {
			int want = Mc.screen() instanceof net.minecraft.client.gui.screens.inventory.AbstractContainerScreen ? Math.round(scale.value()) : 0;
			int now = (int) Math.round((double) mc.getWindow().getGuiScale());
			if (want == applied && (want == 0 || want == now)) return;
			applied = want;
			Ver.guiScale(mc, want);
		}

		@Override
		public void disable(Minecraft mc) {
			if (applied != 0) Ver.guiScale(mc, 0);
			applied = 0;
		}
	}

	public static final InventoryScale INVENTORY_SCALE = new InventoryScale();

	public static List<Module> modules() {
		List<Module> all = new ArrayList<>(List.of(FILTER, TOOLS, CONFIRM_DISCONNECT, BOBBING, FOV, GAMMA, DAMAGE_TINT, VISIBLE_DAMAGE, EFFECT_TIMERS, INVENTORY_SCALE));
		if (!Ver.DAMAGE_TYPES) all.remove(DAMAGE_TINT);
		if (Ver.ARMOR) all.add(ARMOR_BAR);
		all.add(INVENTORY);
		all.add(Onboarding.AGAIN);
		return all;
	}
}
