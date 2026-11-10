use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::loaders::LoaderKind;
use super::tuning;
use crate::engine::content::{self, conflicts, DISABLED};
use crate::engine::instances;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Fix {
    Disable { file: String },
    Find { query: String },
    Memory { mb: u64 },
    Option { key: String, value: String },
    ShadersOff,
    Conflicts,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub severity: &'static str,
    pub kind: &'static str,
    pub subject: Option<String>,
    pub value: Option<String>,
    pub fix: Option<Fix>,
}

fn finding(severity: &'static str, kind: &'static str, subject: Option<String>, value: Option<String>, fix: Option<Fix>) -> Finding {
    Finding { severity, kind, subject, value, fix }
}

const HEAVY: [(&str, &str, &str); 7] = [
    ("optifabric", "high", "optifine"),
    ("optifine", "high", "optifine"),
    ("physicsmod", "high", "physics"),
    ("distanthorizons", "medium", "distantHorizons"),
    ("lambdynlights", "low", "dynamicLights"),
    ("journeymap", "low", "journeymap"),
    ("bobby", "low", "bobby"),
];

fn minor(mc: &str) -> u32 {
    let mut parts = mc.split('.');
    match parts.next() {
        Some("1") => parts.next().and_then(|p| p.parse().ok()).unwrap_or(0),
        Some(major) => major.parse::<u32>().map(|m| m.max(22)).unwrap_or(0),
        None => 0,
    }
}

fn wanted(kind: Option<LoaderKind>, mc: &str) -> Vec<(&'static [&'static str], &'static str, &'static str)> {
    let m = minor(mc);
    if m < 16 {
        return vec![];
    }
    match kind {
        Some(LoaderKind::Fabric | LoaderKind::Quilt) => {
            let mut v: Vec<(&'static [&'static str], &'static str, &'static str)> = vec![
                (&["sodium", "embeddium"], "sodium", "medium"),
                (&["lithium"], "lithium", "low"),
                (&["ferritecore"], "ferrite-core", "low"),
                (&["entityculling"], "entityculling", "low"),
                (&["modernfix"], "modernfix", "low"),
            ];
            if m >= 19 {
                v.push((&["immediatelyfast"], "immediatelyfast", "low"));
            }
            v
        }
        Some(LoaderKind::NeoForge) => vec![
            (&["sodium", "embeddium"], if m >= 21 { "sodium" } else { "embeddium" }, "medium"),
            (&["ferritecore"], "ferrite-core", "low"),
            (&["entityculling"], "entityculling", "low"),
            (&["modernfix"], "modernfix", "low"),
        ],
        Some(LoaderKind::Forge) => {
            let mut v: Vec<(&'static [&'static str], &'static str, &'static str)> = vec![
                (&["ferritecore"], "ferrite-core", "low"),
                (&["entityculling"], "entityculling", "low"),
                (&["modernfix"], "modernfix", "low"),
            ];
            if m <= 20 {
                v.insert(0, (&["embeddium", "rubidium", "magnesium"], "embeddium", "medium"));
            }
            v
        }
        _ => vec![],
    }
}

fn read_options(dir: &Path) -> HashMap<String, String> {
    std::fs::read_to_string(dir.join("options.txt"))
        .unwrap_or_default()
        .lines()
        .filter_map(|l| l.split_once(':').map(|(k, v)| (k.to_string(), v.trim().trim_matches('"').to_string())))
        .collect()
}

fn shaders_on(dir: &Path) -> Option<String> {
    let iris = std::fs::read_to_string(dir.join("config/iris.properties")).unwrap_or_default();
    let prop = |text: &str, key: &str| text.lines().find_map(|l| l.split_once('=').filter(|(k, _)| k.trim() == key).map(|(_, v)| v.trim().to_string()));
    if prop(&iris, "enableShaders").as_deref() == Some("true") {
        if let Some(pack) = prop(&iris, "shaderPack").filter(|p| !p.is_empty()) {
            return Some(pack);
        }
    }
    let optifine = std::fs::read_to_string(dir.join("optionsshaders.txt")).unwrap_or_default();
    prop(&optifine, "shaderPack").filter(|p| !p.is_empty() && p != "OFF" && p != "(internal)")
}

fn options(o: &HashMap<String, String>, m: u32, out: &mut Vec<Finding>) {
    let num = |k: &str| o.get(k).and_then(|v| v.parse::<i64>().ok());
    if let Some(rd) = num("renderDistance") {
        if rd > 16 {
            let sev = if rd > 24 { "high" } else { "medium" };
            out.push(finding(sev, "renderDistance", None, Some(rd.to_string()), Some(Fix::Option { key: "renderDistance".into(), value: "12".into() })));
        }
    }
    if m >= 18 {
        if let Some(sd) = num("simulationDistance") {
            if sd > 10 {
                out.push(finding("medium", "simulationDistance", None, Some(sd.to_string()), Some(Fix::Option { key: "simulationDistance".into(), value: "8".into() })));
            }
        }
    }
    if matches!(o.get("graphicsMode").map(String::as_str), Some("2" | "fabulous")) {
        out.push(finding("medium", "fabulous", None, None, Some(Fix::Option { key: "graphicsMode".into(), value: "1".into() })));
    }
    if let Some(blend) = num("biomeBlendRadius") {
        if blend > 3 {
            out.push(finding("low", "biomeBlend", None, Some(blend.to_string()), Some(Fix::Option { key: "biomeBlendRadius".into(), value: "2".into() })));
        }
    }
    if let Some(fps) = num("maxFps") {
        if fps < 60 {
            out.push(finding("medium", "maxFps", None, Some(fps.to_string()), Some(Fix::Option { key: "maxFps".into(), value: "260".into() })));
        }
    }
}

pub fn auto_memory(instance_id: &str) -> u64 {
    let mods = content::list(instance_id).map_or(0, |l| l.iter().filter(|f| f.folder == "mods" && f.enabled && !f.file.ends_with(DISABLED)).count());
    let shaders = instances::game_dir(instance_id).is_ok_and(|d| shaders_on(&d).is_some());
    tuning::auto_memory_mb(tuning::total_ram_bytes(), mods, shaders)
}

pub async fn scan(instance_id: &str) -> Result<Vec<Finding>, String> {
    let inst = instances::get(instance_id)?;
    let dir = instances::game_dir(instance_id)?;
    let kind = inst.loader.as_ref().map(|l| l.kind);
    let m = minor(&inst.mc_version);
    let mods: Vec<String> = content::list(instance_id)?
        .into_iter()
        .filter(|f| f.folder == "mods" && f.enabled && !f.file.ends_with(DISABLED))
        .map(|f| f.file)
        .collect();
    let mods_dir = dir.join("mods");
    let scan_dir = mods_dir.clone();
    let files = mods.clone();
    let ids: Vec<(String, String)> = tokio::task::spawn_blocking(move || {
        files.iter().filter_map(|f| conflicts::jar_id(&scan_dir.join(f)).map(|id| (id.to_lowercase(), f.clone()))).collect()
    })
    .await
    .map_err(|e| e.to_string())?;
    let has = |id: &str| ids.iter().any(|(i, _)| i == id);

    let mut out = vec![];

    let broken = conflicts::scan(instance_id).await.map(|c| c.iter().filter(|c| c.severity == "error").count()).unwrap_or(0);
    if broken > 0 {
        out.push(finding("high", "conflicts", None, Some(broken.to_string()), Some(Fix::Conflicts)));
    }

    let shaders = shaders_on(&dir);
    let total = tuning::total_ram_bytes();
    let total_mb = total / (1024 * 1024);
    let recommended = tuning::auto_memory_mb(total, mods.len(), shaders.is_some());
    let set = inst.memory_mb.unwrap_or(recommended);
    if set * 10 < recommended * 8 {
        out.push(finding("high", "memoryLow", None, Some(format!("{set}|{recommended}")), Some(Fix::Memory { mb: recommended })));
    } else if set > total_mb * 3 / 4 || (set > 8192 && set > recommended * 2) {
        out.push(finding("medium", "memoryHigh", None, Some(format!("{set}|{recommended}")), Some(Fix::Memory { mb: recommended })));
    }

    if let Some(args) = &inst.jvm_args {
        if args.contains("-Xmx") {
            out.push(finding("medium", "jvmXmx", None, None, None));
        }
        if ["UseSerialGC", "UseParallelGC", "UseConcMarkSweepGC"].iter().any(|gc| args.contains(gc)) {
            out.push(finding("medium", "jvmGc", None, None, None));
        }
    }

    for (id, severity, kind) in HEAVY {
        if let Some((_, file)) = ids.iter().find(|(i, _)| i == id) {
            out.push(finding(severity, kind, Some(file.clone()), None, Some(Fix::Disable { file: file.clone() })));
        }
    }
    if !has("optifabric") && !has("optifine") {
        if let Some(file) = mods.iter().find(|f| f.to_lowercase().contains("optifine")) {
            out.push(finding("high", "optifine", Some(file.clone()), None, Some(Fix::Disable { file: file.clone() })));
        }
    }

    if inst.loader.is_none() {
        out.push(finding("low", "vanilla", None, None, None));
    }
    for (ids_any, project, severity) in wanted(kind, &inst.mc_version) {
        if ids_any.iter().any(|i| has(i)) {
            continue;
        }
        if project == "sodium" && (has("optifabric") || has("optifine")) {
            continue;
        }
        out.push(finding(severity, "missing", Some(project.to_string()), None, Some(Fix::Find { query: project.to_string() })));
    }

    if let Some(pack) = shaders {
        out.push(finding("medium", "shaders", Some(pack), None, Some(Fix::ShadersOff)));
    }
    if mods.len() > 200 {
        out.push(finding("low", "manyMods", None, Some(mods.len().to_string()), None));
    }
    options(&read_options(&dir), m, &mut out);

    let rank = |s: &str| match s {
        "high" => 0,
        "medium" => 1,
        _ => 2,
    };
    out.sort_by_key(|f| rank(f.severity));
    Ok(out)
}

pub fn fix(instance_id: &str, fix: Fix) -> Result<(), String> {
    let dir = instances::game_dir(instance_id)?;
    match fix {
        Fix::Memory { mb } => instances::set_memory(instance_id, Some(mb)).map(|_| ()),
        Fix::Option { key, value } => {
            let path = dir.join("options.txt");
            let text = std::fs::read_to_string(&path).unwrap_or_default();
            let mut lines: Vec<String> = text.lines().map(String::from).collect();
            let line = format!("{key}:{value}");
            match lines.iter_mut().find(|l| l.split_once(':').is_some_and(|(k, _)| k == key)) {
                Some(l) => *l = line,
                None => lines.push(line),
            }
            std::fs::write(&path, lines.join("\n") + "\n").map_err(|e| e.to_string())
        }
        Fix::ShadersOff => {
            let iris = dir.join("config/iris.properties");
            if let Ok(text) = std::fs::read_to_string(&iris) {
                let out: Vec<String> =
                    text.lines().map(|l| if l.split_once('=').is_some_and(|(k, _)| k.trim() == "enableShaders") { "enableShaders=false".into() } else { l.to_string() }).collect();
                std::fs::write(&iris, out.join("\n") + "\n").map_err(|e| e.to_string())?;
            }
            let optifine = dir.join("optionsshaders.txt");
            if let Ok(text) = std::fs::read_to_string(&optifine) {
                let out: Vec<String> =
                    text.lines().map(|l| if l.split_once('=').is_some_and(|(k, _)| k.trim() == "shaderPack") { "shaderPack=OFF".into() } else { l.to_string() }).collect();
                std::fs::write(&optifine, out.join("\n") + "\n").map_err(|e| e.to_string())?;
            }
            Ok(())
        }
        Fix::Disable { .. } | Fix::Find { .. } | Fix::Conflicts => Err("handled by the launcher UI".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_versions() {
        assert_eq!(minor("1.20.1"), 20);
        assert_eq!(minor("1.16.5"), 16);
        assert_eq!(minor("26.3"), 26);
        assert_eq!(minor("1.8.9"), 8);
    }

    #[test]
    fn flags_heavy_options() {
        let o: HashMap<String, String> =
            [("renderDistance", "32"), ("simulationDistance", "12"), ("graphicsMode", "2"), ("maxFps", "30")].iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        let mut out = vec![];
        options(&o, 21, &mut out);
        let kinds: Vec<&str> = out.iter().map(|f| f.kind).collect();
        assert_eq!(kinds, ["renderDistance", "simulationDistance", "fabulous", "maxFps"]);
        assert_eq!(out[0].severity, "high");
    }

    #[test]
    fn suggests_mods_per_loader() {
        assert!(wanted(Some(LoaderKind::Fabric), "1.21.1").iter().any(|(_, p, _)| *p == "sodium"));
        assert!(wanted(Some(LoaderKind::Forge), "1.21.1").iter().all(|(_, p, _)| *p != "embeddium"));
        assert!(wanted(Some(LoaderKind::Fabric), "1.12.2").is_empty());
    }
}
