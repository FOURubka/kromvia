
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::engine::core::paths::{self, safe_join};
use crate::engine::instances::{self, Instance, Settings};

const FILES: &[&str] = &[
    "mods", "config", "defaultconfigs", "resourcepacks", "shaderpacks", "options.txt", "optionsof.txt", "optionsshaders.txt", "servers.dat",
];

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: String,
    pub name: String,
    pub instance: Instance,
    pub created: u64,
}

fn root() -> PathBuf {
    paths::root().join("templates")
}

fn dir(id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || id.contains(['/', '\\', '.']) {
        return Err(format!("bad template id {id}"));
    }
    safe_join(&root(), id)
}

pub fn list() -> Vec<Template> {
    let Ok(rd) = std::fs::read_dir(root()) else { return vec![] };
    let mut out: Vec<Template> = rd
        .flatten()
        .filter_map(|e| std::fs::read(e.path().join("template.json")).ok())
        .filter_map(|b| serde_json::from_slice(&b).ok())
        .collect();
    out.sort_by_key(|t| t.name.to_lowercase());
    out
}

fn get(id: &str) -> Result<Template, String> {
    let bytes = std::fs::read(dir(id)?.join("template.json")).map_err(|_| format!("no template {id}"))?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

pub fn save(instance_id: &str, name: &str) -> Result<Template, String> {
    let name: String = name.trim().chars().take(64).collect();
    if name.is_empty() {
        return Err("template needs a name".into());
    }
    let inst = instances::get(instance_id)?;
    let base = instances::slug(&name);
    let mut id = base.clone();
    let mut n = 2;
    while dir(&id)?.exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    let to = dir(&id)?;
    let files = to.join("files");
    std::fs::create_dir_all(&files).map_err(|e| e.to_string())?;
    let game = instances::game_dir(instance_id)?;
    let copy = || -> Result<(), String> {
        for entry in FILES {
            let src = game.join(entry);
            if src.is_dir() {
                instances::copy_dir(&src, &files.join(entry))?;
            } else if src.is_file() {
                std::fs::copy(&src, files.join(entry)).map_err(|e| e.to_string())?;
            }
        }
        let template = Template { id: id.clone(), name, instance: inst, created: instances::now() };
        std::fs::write(to.join("template.json"), serde_json::to_vec_pretty(&template).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        Ok(())
    };
    if let Err(e) = copy() {
        let _ = std::fs::remove_dir_all(&to);
        return Err(e);
    }
    get(&id)
}

pub fn delete(id: &str) -> Result<(), String> {
    get(id)?;
    std::fs::remove_dir_all(dir(id)?).map_err(|e| e.to_string())
}

pub fn create(template_id: &str, name: &str) -> Result<Instance, String> {
    let template = get(template_id)?;
    let src = template.instance;
    let inst = instances::create(name, &src.mc_version, src.loader.clone())?;
    let made = || -> Result<Instance, String> {
        instances::copy_dir(&dir(template_id)?.join("files"), &instances::game_dir(&inst.id)?)?;
        let inst = instances::update(
            &inst.id,
            Settings {
                name: inst.name.clone(),
                mc_version: src.mc_version,
                loader: src.loader,
                memory_mb: src.memory_mb,
                java_path: src.java_path,
                jvm_args: src.jvm_args,
                resolution: src.resolution,
                gpu: src.gpu,
                group: src.group,
                no_client: Some(src.no_client),
                hooks: None,
                shared_options: Some(src.shared_options),
            },
        )?;
        match src.icon {
            Some(icon) => instances::set_icon(&inst.id, Some(icon)),
            None => Ok(inst),
        }
    };
    made().inspect_err(|_| {
        let _ = instances::delete(&inst.id);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_and_creates_from_templates() {
        paths::init(std::env::temp_dir().join(format!("kromvia-tpl-{}", std::process::id())));
        let a = instances::create("Base", "1.21.4", None).unwrap();
        let game = instances::game_dir(&a.id).unwrap();
        std::fs::create_dir_all(game.join("mods")).unwrap();
        std::fs::write(game.join("mods/sodium.jar"), b"x").unwrap();
        std::fs::create_dir_all(game.join("saves/World")).unwrap();
        std::fs::write(game.join("saves/World/level.dat"), b"x").unwrap();

        let t = save(&a.id, "  PvP base ").unwrap();
        assert_eq!((t.id.as_str(), t.name.as_str()), ("pvp-base", "PvP base"));
        assert_eq!(save(&a.id, "PvP base").unwrap().id, "pvp-base-2");
        assert_eq!(list().len(), 2);

        let b = create("pvp-base", "From template").unwrap();
        let bgame = instances::game_dir(&b.id).unwrap();
        assert!(bgame.join("mods/sodium.jar").is_file());
        assert!(!bgame.join("saves").exists());
        assert_eq!(b.mc_version, "1.21.4");

        delete("pvp-base").unwrap();
        assert!(create("pvp-base", "x").is_err());
        assert!(dir("../x").is_err());
        for i in [a, b] {
            instances::delete(&i.id).unwrap();
        }
        delete("pvp-base-2").unwrap();
    }
}
