//! One `options.txt` shared by the instances that opt in: their key binds and video settings follow the player.
//! Before launch the shared values are merged into the instance's file; after exit the instance's file is merged back.

use std::path::{Path, PathBuf};

use crate::engine::core::paths;

/// Per-instance on purpose: the data version, which packs are on and the last server.
const SKIP: [&str; 4] = ["version", "resourcePacks", "incompatibleResourcePacks", "lastServer"];

fn store() -> PathBuf {
    paths::root().join("shared-options.txt")
}

fn parse(text: &str) -> Vec<(String, String)> {
    text.lines().filter_map(|l| l.split_once(':')).map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

/// `into` with every shareable key of `from` set; keys `into` lacks are appended in `from`'s order.
fn merge(into: &str, from: &str) -> String {
    let from: Vec<(String, String)> = parse(from).into_iter().filter(|(k, _)| !SKIP.contains(&k.as_str())).collect();
    let mut out: Vec<(String, String)> = parse(into);
    for (k, v) in from {
        match out.iter_mut().find(|(ok, _)| *ok == k) {
            Some(slot) => slot.1 = v,
            None => out.push((k, v)),
        }
    }
    out.into_iter().map(|(k, v)| format!("{k}:{v}\n")).collect()
}

fn read(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

pub fn apply(game_dir: &Path) -> Result<(), String> {
    let shared = read(&store());
    if shared.is_empty() {
        return Ok(());
    }
    let file = game_dir.join("options.txt");
    std::fs::write(&file, merge(&read(&file), &shared)).map_err(|e| e.to_string())
}

pub fn collect(game_dir: &Path) -> Result<(), String> {
    let mine = read(&game_dir.join("options.txt"));
    if mine.is_empty() {
        return Ok(());
    }
    std::fs::create_dir_all(paths::root()).map_err(|e| e.to_string())?;
    std::fs::write(store(), merge(&read(&store()), &mine)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_shared_keys_and_keeps_per_instance_ones() {
        let instance = "version:3465\nfov:70\nresourcePacks:[\"vanilla\"]\nkey_key.jump:key.keyboard.space\n";
        let shared = "version:4000\nfov:90\nresourcePacks:[]\nkey_key.sprint:key.keyboard.left.control\n";
        assert_eq!(
            merge(instance, shared),
            "version:3465\nfov:90\nresourcePacks:[\"vanilla\"]\nkey_key.jump:key.keyboard.space\nkey_key.sprint:key.keyboard.left.control\n"
        );
        assert_eq!(merge("", "lastServer:a.b\nguiScale:2\n"), "guiScale:2\n");
    }
}
