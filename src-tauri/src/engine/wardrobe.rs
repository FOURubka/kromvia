
use std::path::PathBuf;

use base64::Engine;
use serde_json::{Map, Value};

use crate::engine::core::paths;

const SLOTS: [&str; 7] = ["head", "face", "neck", "back", "body", "feet", "effect"];
const BACKS: [&str; 3] = ["none", "cape", "elytra"];
const STYLES: [&str; 4] = ["kromvia", "ember", "frost", "custom"];
const ART_LEN: usize = 10 * 16 * 4;
const MAX_CAPE: usize = 64 * 1024;

pub fn json_path() -> PathBuf {
    paths::root().join("wardrobe.json")
}

pub fn cape_path() -> PathBuf {
    paths::root().join("wardrobe-cape.png")
}

fn valid_id(id: &str) -> bool {
    (1..=40).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_' || b == b'-')
}

pub fn valid_art(art: &str) -> bool {
    base64::engine::general_purpose::STANDARD.decode(art).is_ok_and(|b| b.len() == ART_LEN)
}

pub fn clean(v: &Value) -> Result<Value, String> {
    let mut equipped = Map::new();
    for (slot, id) in v["equipped"].as_object().into_iter().flatten() {
        if let (true, Some(id)) = (SLOTS.contains(&slot.as_str()), id.as_str()) {
            if !valid_id(id) {
                return Err(format!("bad cosmetic id {id}"));
            }
            equipped.insert(slot.clone(), Value::String(id.into()));
        }
    }
    let mut colors = Map::new();
    for (id, c) in v["colors"].as_object().into_iter().flatten() {
        if let (true, Some(c)) = (valid_id(id), c.as_u64().filter(|c| *c <= u32::MAX as u64)) {
            colors.insert(id.clone(), Value::from(c));
        }
    }
    let pick = |key: &str, allowed: &[&str], default: &str| {
        Value::String(v[key].as_str().filter(|s| allowed.contains(s)).unwrap_or(default).into())
    };
    let art = v["art"].as_str().filter(|a| valid_art(a));
    let mut style = pick("style", &STYLES, "kromvia");
    if style == "custom" && art.is_none() {
        style = Value::String("kromvia".into());
    }
    let mut out = serde_json::json!({
        "equipped": equipped,
        "colors": colors,
        "back": pick("back", &BACKS, "cape"),
        "style": style,
        "dev": v["dev"].as_bool().unwrap_or(false),
    });
    if let Some(art) = art {
        out["art"] = Value::String(art.into());
    }
    Ok(out)
}

pub fn save(v: &Value, cape_png: Option<&str>) -> Result<(), String> {
    let clean = clean(v)?;
    std::fs::create_dir_all(paths::root()).map_err(|e| e.to_string())?;
    let tmp = json_path().with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&clean).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, json_path()).map_err(|e| e.to_string())?;
    match cape_png {
        Some(url) => {
            let b64 = url.strip_prefix("data:image/png;base64,").ok_or("cape must be a PNG data URL")?;
            let png = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
            if png.len() > MAX_CAPE || !png.starts_with(b"\x89PNG\r\n\x1a\n") {
                return Err("bad cape picture".into());
            }
            std::fs::write(cape_path(), png).map_err(|e| e.to_string())
        }
        None => match std::fs::remove_file(cape_path()) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        },
    }
}

pub fn load() -> Option<Value> {
    let bytes = std::fs::read(json_path()).ok()?;
    clean(&serde_json::from_slice(&bytes).ok()?).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_what_the_game_or_page_sends() {
        let v = serde_json::json!({
            "equipped": { "head": "top_hat", "back": "wings-angel", "tail": "x", "body": "../etc" },
            "colors": { "top_hat": 4294967295u64, "bad id": 1, "cap": -1 },
            "back": "jetpack",
            "style": "frost",
            "extra": true
        });
        assert!(clean(&v).is_err());
        let mut v = v;
        v["equipped"]["body"] = Value::String("hoodie".into());
        let c = clean(&v).unwrap();
        assert_eq!(c["equipped"], serde_json::json!({ "head": "top_hat", "back": "wings-angel", "body": "hoodie" }));
        assert_eq!(c["colors"], serde_json::json!({ "top_hat": 4294967295u64 }));
        assert_eq!((c["back"].as_str(), c["style"].as_str()), (Some("cape"), Some("frost")));
        assert!(c.get("extra").is_none());
        let art = base64::engine::general_purpose::STANDARD.encode([7u8; ART_LEN]);
        let custom = clean(&serde_json::json!({ "style": "custom", "art": art })).unwrap();
        assert_eq!((custom["style"].as_str(), custom["art"].as_str()), (Some("custom"), Some(art.as_str())));
        assert_eq!(clean(&serde_json::json!({ "style": "custom", "art": "AAAA" })).unwrap()["style"], "kromvia");
    }
}
