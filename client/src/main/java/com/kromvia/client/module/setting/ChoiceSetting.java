package com.kromvia.client.module.setting;

import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;

public final class ChoiceSetting extends Setting<Integer> {
	public final String[] options;
	public Runnable changed;

	public ChoiceSetting(String id, String name, int value, String... options) {
		super(id, name, value);
		this.options = options;
	}

	public int index() {
		return value;
	}

	public String current() {
		return options[value];
	}

	public void next() {
		value = (value + 1) % options.length;
		if (changed != null) changed.run();
	}

	@Override
	public JsonElement save() {
		return new JsonPrimitive(options[value]);
	}

	@Override
	public void load(JsonElement json) {
		if (!json.isJsonPrimitive()) return;
		String s = json.getAsString();
		for (int i = 0; i < options.length; i++) {
			if (options[i].equals(s)) value = i;
		}
	}
}
