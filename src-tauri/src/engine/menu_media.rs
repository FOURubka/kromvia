//! The player's own title screen pictures and music, applied to every instance before launch.
//! Pictures go to `<game>/kromvia/menu/`, which the client shows instead of its own background.
//! Music becomes a resource pack that replaces `music.menu`, switched on in `options.txt`.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::engine::core::paths;

const PACK: &str = "kromvia-menu";
const PACK_ID: &str = "file/kromvia-menu";

#[derive(Serialize, Default)]
pub struct Media {
    pub images: Vec<String>,
    pub music: Vec<String>,
}

fn dir(kind: &str) -> PathBuf {
    paths::root().join("menu").join(kind)
}

fn names(dir: &Path) -> Vec<String> {
    let mut out: Vec<String> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_file())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    out.sort();
    out
}

pub fn list() -> Media {
    Media { images: names(&dir("images")), music: names(&dir("music")) }
}

pub fn add(files: &[String]) -> Result<Media, String> {
    for file in files {
        let path = Path::new(file);
        let ext = path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase);
        let kind = match ext.as_deref() {
            Some("png") => "images",
            Some("ogg") => "music",
            _ => return Err(format!("{}: only .png pictures and .ogg music", path.display())),
        };
        let name = path.file_name().ok_or("bad file name")?;
        std::fs::create_dir_all(dir(kind)).map_err(|e| e.to_string())?;
        std::fs::copy(path, dir(kind).join(name)).map_err(|e| e.to_string())?;
    }
    Ok(list())
}

pub fn remove(kind: &str, name: &str) -> Result<Media, String> {
    if !matches!(kind, "images" | "music") || name.contains(['/', '\\']) || name.starts_with('.') {
        return Err("bad name".into());
    }
    std::fs::remove_file(dir(kind).join(name)).map_err(|e| e.to_string())?;
    Ok(list())
}

fn replace_dir(target: &Path, files: &[(PathBuf, PathBuf)]) -> std::io::Result<()> {
    if target.exists() {
        std::fs::remove_dir_all(target)?;
    }
    for (from, to) in files {
        std::fs::create_dir_all(to.parent().unwrap_or(target))?;
        std::fs::copy(from, to)?;
    }
    Ok(())
}

fn pack_files(music: &[String], pack: &Path) -> Vec<(PathBuf, PathBuf)> {
    music
        .iter()
        .enumerate()
        .map(|(i, n)| (dir("music").join(n), pack.join(format!("assets/minecraft/sounds/kromvia/menu_{i}.ogg"))))
        .collect()
}

fn sounds_json(count: usize) -> String {
    let sounds: Vec<serde_json::Value> =
        (0..count).map(|i| serde_json::json!({ "name": format!("kromvia/menu_{i}"), "stream": true })).collect();
    serde_json::json!({ "music.menu": { "replace": true, "sounds": sounds } }).to_string()
}

const MCMETA: &str = r#"{"pack":{"pack_format":4,"supported_formats":[4,999],"min_format":4,"max_format":999,"description":"Kromvia: your menu music"}}"#;

/// `options.txt` with our pack switched on or off in both pack lists.
fn with_pack(options: &str, on: bool) -> String {
    let mut lines: Vec<String> = options.lines().map(str::to_string).collect();
    for key in ["resourcePacks", "incompatibleResourcePacks"] {
        let prefix = format!("{key}:");
        let at = lines.iter().position(|l| l.starts_with(&prefix));
        let mut packs: Vec<String> = at
            .and_then(|i| serde_json::from_str(&lines[i][prefix.len()..]).ok())
            .unwrap_or_else(|| if key == "resourcePacks" { vec!["vanilla".to_string()] } else { Vec::new() });
        let had = packs.iter().any(|p| p == PACK_ID);
        if on && !had {
            packs.push(PACK_ID.to_string());
        } else if !on && had {
            packs.retain(|p| p != PACK_ID);
        } else {
            continue;
        }
        let line = format!("{prefix}{}", serde_json::to_string(&packs).unwrap_or_default());
        match at {
            Some(i) => lines[i] = line,
            None => lines.push(line),
        }
    }
    lines.into_iter().map(|l| l + "\n").collect()
}

pub fn apply(game_dir: &Path) -> Result<(), String> {
    let media = list();
    let images: Vec<(PathBuf, PathBuf)> =
        media.images.iter().map(|n| (dir("images").join(n), game_dir.join("kromvia/menu").join(n))).collect();
    replace_dir(&game_dir.join("kromvia/menu"), &images).map_err(|e| e.to_string())?;

    let pack = game_dir.join("resourcepacks").join(PACK);
    let on = !media.music.is_empty();
    replace_dir(&pack, &if on { pack_files(&media.music, &pack) } else { Vec::new() }).map_err(|e| e.to_string())?;
    if on {
        std::fs::write(pack.join("pack.mcmeta"), MCMETA).map_err(|e| e.to_string())?;
        std::fs::write(pack.join("assets/minecraft/sounds.json"), sounds_json(media.music.len())).map_err(|e| e.to_string())?;
    }
    let options = game_dir.join("options.txt");
    let text = std::fs::read_to_string(&options).unwrap_or_default();
    if on || text.contains(PACK_ID) {
        std::fs::write(&options, with_pack(&text, on)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn switches_pack_in_options() {
        let text = "fov:70\nresourcePacks:[\"vanilla\",\"fabric\"]\n";
        let on = with_pack(text, true);
        assert_eq!(on, "fov:70\nresourcePacks:[\"vanilla\",\"fabric\",\"file/kromvia-menu\"]\nincompatibleResourcePacks:[\"file/kromvia-menu\"]\n");
        assert_eq!(with_pack(&on, true), on);
        assert_eq!(with_pack(&on, false), "fov:70\nresourcePacks:[\"vanilla\",\"fabric\"]\nincompatibleResourcePacks:[]\n");
        assert_eq!(with_pack("", true), "resourcePacks:[\"vanilla\",\"file/kromvia-menu\"]\nincompatibleResourcePacks:[\"file/kromvia-menu\"]\n");
    }

    #[test]
    fn sounds_replace_menu_music() {
        let v: serde_json::Value = serde_json::from_str(&sounds_json(2)).unwrap();
        assert_eq!(v["music.menu"]["replace"], true);
        assert_eq!(v["music.menu"]["sounds"][1]["name"], "kromvia/menu_1");
    }
}
