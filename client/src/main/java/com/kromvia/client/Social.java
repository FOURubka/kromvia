package com.kromvia.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.function.Consumer;

public final class Social {
	private Social() {}

	public static final class Friend {
		public final String id;
		public final String name;
		public final boolean online;
		public final int unread;
		public final String head;
		public final String room;
		public final String server;

		Friend(String id, String name, boolean online, int unread, String head, String room, String server) {
			this.id = id;
			this.name = name;
			this.online = online;
			this.unread = unread;
			this.head = head;
			this.room = room;
			this.server = server;
		}
	}

	public static final class Invite {
		public final String party;
		public final String from;

		Invite(String party, String from) {
			this.party = party;
			this.from = from;
		}
	}

	public static final class ClanMember {
		public final String id;
		public final String name;
		public final boolean online;
		public final String server;
		public final boolean me;

		ClanMember(String id, String name, boolean online, String server, boolean me) {
			this.id = id;
			this.name = name;
			this.online = online;
			this.server = server;
			this.me = me;
		}
	}

	public static final class ClanLine {
		public final String from;
		public final String text;

		ClanLine(String from, String text) {
			this.from = from;
			this.text = text;
		}
	}

	public static final class Line {
		public final boolean mine;
		public final String text;

		Line(boolean mine, String text) {
			this.mine = mine;
			this.text = text;
		}
	}

	public static volatile int version;
	private static volatile boolean received;
	private static volatile String me;
	private static volatile String clanId;
	private static volatile String clanTag;
	private static volatile int clanUnread;
	private static volatile List<ClanMember> clanMembers = Collections.emptyList();
	private static volatile List<ClanLine> clanChat = Collections.emptyList();
	private static volatile boolean connected;
	private static volatile String error;
	private static volatile List<Friend> friends = Collections.emptyList();
	private static volatile List<String> members = Collections.emptyList();
	private static volatile String leader;
	private static volatile String room;
	private static volatile boolean inParty;
	private static volatile List<Invite> invites = Collections.emptyList();
	private static volatile String chatWith;
	private static volatile List<Line> lines = Collections.emptyList();

	public static void set(JsonObject s) {
		me = str(s, "me");
		JsonObject clan = s.has("clan") && s.get("clan").isJsonObject() ? s.getAsJsonObject("clan") : null;
		clanId = clan == null ? null : str(clan, "id");
		clanTag = clan == null ? null : str(clan, "tag");
		clanUnread = clan != null && clan.has("unread") ? clan.get("unread").getAsInt() : 0;
		List<ClanMember> cm = new ArrayList<>();
		List<ClanLine> cl = new ArrayList<>();
		if (clan != null) {
			for (JsonElement e : arr(clan, "members")) {
				JsonObject o = e.getAsJsonObject();
				cm.add(new ClanMember(str(o, "id"), str(o, "name"), o.has("online") && o.get("online").getAsBoolean(), str(o, "server"), o.has("me") && o.get("me").getAsBoolean()));
			}
			for (JsonElement e : arr(clan, "chat")) {
				JsonObject o = e.getAsJsonObject();
				cl.add(new ClanLine(str(o, "from"), str(o, "text")));
			}
		}
		clanMembers = Collections.unmodifiableList(cm);
		clanChat = Collections.unmodifiableList(cl);
		connected = s.has("connected") && s.get("connected").getAsBoolean();
		error = str(s, "error");
		List<Friend> fs = new ArrayList<>();
		for (JsonElement e : arr(s, "friends")) {
			JsonObject o = e.getAsJsonObject();
			fs.add(new Friend(str(o, "id"), str(o, "name"), o.has("online") && o.get("online").getAsBoolean(), o.has("unread") ? o.get("unread").getAsInt() : 0, str(o, "head"), str(o, "room"), str(o, "server")));
		}
		friends = Collections.unmodifiableList(fs);
		JsonObject party = s.has("party") && s.get("party").isJsonObject() ? s.getAsJsonObject("party") : null;
		inParty = party != null;
		leader = party == null ? null : str(party, "leader");
		room = party == null ? null : str(party, "room");
		List<String> ms = new ArrayList<>();
		if (party != null) for (JsonElement e : arr(party, "members")) ms.add(str(e.getAsJsonObject(), "name"));
		members = Collections.unmodifiableList(ms);
		List<Invite> is = new ArrayList<>();
		for (JsonElement e : arr(s, "invites")) {
			JsonObject o = e.getAsJsonObject();
			JsonObject from = o.has("from") && o.get("from").isJsonObject() ? o.getAsJsonObject("from") : new JsonObject();
			is.add(new Invite(str(o, "party"), str(from, "name")));
		}
		invites = Collections.unmodifiableList(is);
		JsonObject chat = s.has("chat") && s.get("chat").isJsonObject() ? s.getAsJsonObject("chat") : null;
		chatWith = chat == null ? null : str(chat, "with");
		List<Line> ls = new ArrayList<>();
		if (chat != null) {
			for (JsonElement e : arr(chat, "messages")) {
				JsonObject o = e.getAsJsonObject();
				ls.add(new Line(me != null && me.equals(str(o, "from")), str(o, "text")));
			}
		}
		lines = Collections.unmodifiableList(ls);
		received = true;
		version++;
	}

	private static String str(JsonObject o, String key) {
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : null;
	}

	private static JsonArray arr(JsonObject o, String key) {
		return o.has(key) && o.get(key).isJsonArray() ? o.getAsJsonArray(key) : new JsonArray();
	}

	public static String clanId() {
		return clanId;
	}

	public static String clanTag() {
		return clanTag;
	}

	public static boolean inClan() {
		return clanId != null;
	}

	public static int clanUnread() {
		return clanUnread;
	}

	public static List<ClanMember> clanMembers() {
		return clanMembers;
	}

	public static List<ClanLine> clanChat() {
		return clanChat;
	}

	public static void clanSend(String text) {
		ask("clanSend", "text", text);
	}

	public static void clanOpen() {
		ask("clanOpen", null, null);
	}

	public static boolean available() {
		return Accounts.sender != null && Accounts.available();
	}

	public static boolean received() {
		return received;
	}

	public static boolean signedOut() {
		return received && me == null;
	}

	public static boolean connected() {
		return connected;
	}

	public static String error() {
		return error;
	}

	public static List<Friend> friends() {
		return friends;
	}

	public static boolean inParty() {
		return inParty;
	}

	public static boolean leads() {
		return inParty && me != null && me.equals(leader);
	}

	public static List<String> members() {
		return members;
	}

	public static String room() {
		return room;
	}

	public static List<Invite> invites() {
		return invites;
	}

	public static String chatWith() {
		return chatWith;
	}

	public static List<Line> lines() {
		return lines;
	}

	public static void load() {
		ask("load", null, null);
	}

	public static void open(String friend) {
		ask("open", "id", friend);
	}

	public static void send(String to, String text) {
		JsonObject a = new JsonObject();
		a.addProperty("do", "send");
		a.addProperty("to", to);
		a.addProperty("text", text);
		send(a);
	}

	public static void sendScreenshot(String to) {
		ask("shot", "to", to);
	}

	public static void openUrl(String url) {
		ask("url", "url", url);
	}

	public static String leader() {
		return leader;
	}

	public static void joinFriend(String friend) {
		ask("joinFriend", "id", friend);
	}

	public static void invite(String friend) {
		ask("invite", "id", friend);
	}

	public static void join(String party) {
		ask("join", "party", party);
	}

	public static void decline(String party) {
		ask("decline", "party", party);
	}

	public static void leave() {
		ask("leave", null, null);
	}

	private static void ask(String what, String key, String value) {
		JsonObject a = new JsonObject();
		a.addProperty("do", what);
		if (key != null) a.addProperty(key, value);
		send(a);
	}

	private static void send(JsonObject a) {
		Consumer<String> out = Accounts.sender;
		if (out == null) return;
		JsonObject msg = new JsonObject();
		msg.add("social", a);
		out.accept(msg.toString());
	}
}
