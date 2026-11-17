use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

static ROOT: OnceLock<PathBuf> = OnceLock::new();
static DEFAULT: OnceLock<PathBuf> = OnceLock::new();
static RESOURCES: OnceLock<PathBuf> = OnceLock::new();

const LOCATION: &str = "location.txt";

pub fn init(default: PathBuf) {
    let _ = ROOT.set(located(&default));
    let _ = DEFAULT.set(default);
}

fn located(default: &Path) -> PathBuf {
    std::fs::read_to_string(default.join(LOCATION))
        .ok()
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| p.is_absolute() && p.is_dir())
        .unwrap_or_else(|| default.to_path_buf())
}

pub fn default_root() -> &'static Path {
    DEFAULT.get().expect("paths::init was not called")
}

pub fn set_location(dir: &Path) -> std::io::Result<()> {
    let file = default_root().join(LOCATION);
    if dir == default_root() {
        return std::fs::remove_file(file).or_else(|e| if e.kind() == std::io::ErrorKind::NotFound { Ok(()) } else { Err(e) });
    }
    std::fs::create_dir_all(default_root())?;
    std::fs::write(file, dir.to_string_lossy().as_bytes())
}

pub fn init_resources(dir: PathBuf) {
    let _ = RESOURCES.set(dir);
}

pub fn backgrounds_dir() -> Option<PathBuf> {
    RESOURCES.get().map(|d| d.join("backgrounds")).filter(|p| p.is_dir())
}

pub fn client_jar(mc: &str) -> Option<PathBuf> {
    if mc.is_empty() || !mc.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)) {
        return None;
    }
    RESOURCES.get().map(|d| d.join("client").join(format!("kromvia-client-{mc}.jar"))).filter(|p| p.is_file())
}

/// The client build for Forge or NeoForge (`flavor`), made for Minecraft 1.21 to 1.21.10.
pub fn forge_client_jar(mc: &str, flavor: &str) -> Option<PathBuf> {
    client_jar(&format!("{mc}-{flavor}"))
}

pub fn client_versions() -> Vec<String> {
    let Some(dir) = RESOURCES.get().map(|d| d.join("client")) else { return Vec::new() };
    let mut list: Vec<String> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| e.file_name().to_str()?.strip_prefix("kromvia-client-")?.strip_suffix(".jar").map(String::from))
        .collect();
    list.sort();
    list
}

pub fn root() -> &'static Path {
    ROOT.get().expect("paths::init was not called")
}

pub fn runtimes() -> PathBuf {
    root().join("runtimes")
}

pub fn temp() -> PathBuf {
    root().join("tmp")
}

pub fn versions() -> PathBuf {
    root().join("versions")
}

pub fn libraries() -> PathBuf {
    root().join("libraries")
}

pub fn assets() -> PathBuf {
    root().join("assets")
}

pub fn instances() -> PathBuf {
    root().join("instances")
}

pub fn objects() -> PathBuf {
    root().join("objects")
}

pub fn safe_join(base: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() || rel.contains('\\') || rel.contains(':') {
        return Err(format!("unsafe path: {rel}"));
    }
    let mut out = base.to_path_buf();
    for part in Path::new(rel).components() {
        match part {
            Component::Normal(p) => out.push(p),
            Component::CurDir => {}
            _ => return Err(format!("unsafe path: {rel}")),
        }
    }
    if out == base {
        return Err(format!("unsafe path: {rel}"));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_rejects_escapes() {
        let base = Path::new("/data");
        assert_eq!(safe_join(base, "a/b.jar").unwrap(), Path::new("/data/a/b.jar"));
        assert_eq!(safe_join(base, "./a").unwrap(), Path::new("/data/a"));
        for bad in ["", ".", "../x", "a/../../x", "/etc/passwd", "C:/x", "a\\..\\x", "a:b"] {
            assert!(safe_join(base, bad).is_err(), "{bad}");
        }
    }
}
