
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};

const MB: u64 = 1024 * 1024;

pub fn auto_memory_mb(total_ram_bytes: u64, mod_count: usize, shaders: bool) -> u64 {
    let total_mb = total_ram_bytes / MB;
    let mut want: u64 = if mod_count == 0 { 2048 } else { 3072 + mod_count as u64 * 16 };
    if shaders {
        want += 1024;
    }
    let cap = (total_mb / 2).max(1024);
    want.clamp(1024, 12288).min(cap) / 256 * 256
}

pub fn total_ram_bytes() -> u64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.total_memory()
}

pub fn jvm_flags(memory_mb: u64) -> Vec<String> {
    let mut flags = vec![
        format!("-Xmx{memory_mb}M"),
        format!("-Xms{}M", (memory_mb / 2).min(2048)),
        "-XX:+UseG1GC".into(),
        "-XX:+ParallelRefProcEnabled".into(),
        "-XX:MaxGCPauseMillis=50".into(),
        "-XX:+UnlockExperimentalVMOptions".into(),
        "-XX:+DisableExplicitGC".into(),
        "-XX:G1NewSizePercent=30".into(),
        "-XX:G1MaxNewSizePercent=40".into(),
        "-XX:G1ReservePercent=20".into(),
        "-XX:G1MixedGCCountTarget=4".into(),
        "-XX:InitiatingHeapOccupancyPercent=15".into(),
        "-XX:G1RSetUpdatingPauseTimePercent=5".into(),
        "-XX:SurvivorRatio=32".into(),
        "-XX:+PerfDisableSharedMem".into(),
        "-XX:MaxTenuringThreshold=1".into(),
    ];
    flags.push(format!("-XX:G1HeapRegionSize={}M", if memory_mb >= 12 * 1024 { 16 } else { 8 }));
    flags
}

fn known_xx_flags(java: &Path) -> Option<Arc<HashSet<String>>> {
    static CACHE: LazyLock<Mutex<HashMap<PathBuf, Arc<HashSet<String>>>>> = LazyLock::new(Default::default);
    if let Some(known) = CACHE.lock().unwrap().get(java) {
        return Some(known.clone());
    }
    let mut cmd = std::process::Command::new(java);
    cmd.args(["-XX:+UnlockExperimentalVMOptions", "-XX:+UnlockDiagnosticVMOptions", "-XX:+PrintFlagsFinal", "-version"]);
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000); // CREATE_NO_WINDOW
    let out = cmd
        .output()
        .ok()
        .filter(|o| o.status.success())?;
    let known: HashSet<String> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| l.contains('='))
        .filter_map(|l| l.split_whitespace().nth(1).map(String::from))
        .collect();
    if known.is_empty() {
        return None;
    }
    let known = Arc::new(known);
    CACHE.lock().unwrap().insert(java.to_path_buf(), known.clone());
    Some(known)
}

fn xx_name(flag: &str) -> Option<&str> {
    let rest = flag.strip_prefix("-XX:")?;
    let rest = rest.strip_prefix(['+', '-']).unwrap_or(rest);
    Some(rest.split_once('=').map_or(rest, |(n, _)| n))
}

pub fn drop_unknown_flags(java: &Path, flags: &mut Vec<String>) -> Vec<String> {
    let Some(known) = known_xx_flags(java) else { return vec![] };
    let (keep, dropped): (Vec<String>, Vec<String>) = std::mem::take(flags).into_iter().partition(|f| xx_name(f).is_none_or(|n| known.contains(n)));
    *flags = keep;
    dropped
}

const OWNED_FLAGS: [&str; 7] = ["-cp", "-classpath", "--class-path", "-jar", "-p", "--module-path", "-Djava.library.path"];

pub fn check_jvm_args(args: &str) -> Result<(), String> {
    for arg in args.split_whitespace() {
        if !arg.starts_with('-') {
            return Err(format!("\"{arg}\" is not a JVM argument; arguments start with -"));
        }
        if OWNED_FLAGS.iter().any(|f| arg == *f || arg.starts_with(&format!("{f}="))) {
            return Err(format!("{arg} is set by the launcher"));
        }
        if let Some(size) = ["-Xmx", "-Xms", "-Xss"].iter().find_map(|p| arg.strip_prefix(p)) {
            let digits = size.trim_end_matches(['k', 'K', 'm', 'M', 'g', 'G']);
            if digits.is_empty() || digits.len() + 1 < size.len() || !digits.chars().all(|c| c.is_ascii_digit()) {
                return Err(format!("bad memory size in {arg}"));
            }
        }
        if arg == "-" || arg.contains(['"', '\'', ';', '|', '&', '`', '$']) {
            return Err(format!("unexpected characters in {arg}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const GB: u64 = 1024 * MB;

    #[test]
    fn memory_scales_and_caps() {
        assert_eq!(auto_memory_mb(16 * GB, 0, false), 2048);
        assert_eq!(auto_memory_mb(16 * GB, 100, false), 4608);
        assert_eq!(auto_memory_mb(16 * GB, 100, true), 5632);
        assert_eq!(auto_memory_mb(4 * GB, 100, true), 2048);
        assert_eq!(auto_memory_mb(64 * GB, 1000, true), 12288);
        assert_eq!(auto_memory_mb(GB, 0, false), 1024);
    }

    #[test]
    fn flags_include_heap() {
        let f = jvm_flags(4096);
        assert_eq!(f[0], "-Xmx4096M");
        assert_eq!(f[1], "-Xms2048M");
        assert!(f.contains(&"-XX:G1HeapRegionSize=8M".to_string()));
    }

    #[test]
    fn parses_xx_names() {
        assert_eq!(xx_name("-XX:+UseG1GC"), Some("UseG1GC"));
        assert_eq!(xx_name("-XX:-UseG1GC"), Some("UseG1GC"));
        assert_eq!(xx_name("-XX:MaxGCPauseMillis=50"), Some("MaxGCPauseMillis"));
        assert_eq!(xx_name("-Xmx4G"), None);
    }

    #[test]
    #[ignore]
    fn drops_unknown_flags() {
        let mut flags = vec!["-Xmx2G".to_string(), "-XX:+UseG1GC".into(), "-XX:+NoSuchFlagKromvia".into(), "-XX:Bogus=1".into()];
        let dropped = drop_unknown_flags(Path::new("java"), &mut flags);
        assert_eq!(flags, ["-Xmx2G", "-XX:+UseG1GC"]);
        assert_eq!(dropped, ["-XX:+NoSuchFlagKromvia", "-XX:Bogus=1"]);
    }

    #[test]
    fn validates_jvm_args() {
        assert!(check_jvm_args("-Xmx4G -XX:+UseZGC -Dfoo=bar").is_ok());
        assert!(check_jvm_args("").is_ok());
        assert!(check_jvm_args("java -Xmx4G").is_err());
        assert!(check_jvm_args("-cp /tmp/x.jar").is_err());
        assert!(check_jvm_args("-Djava.library.path=/tmp").is_err());
        assert!(check_jvm_args("-Xmx").is_err());
        assert!(check_jvm_args("-Xmx4GB").is_err());
        assert!(check_jvm_args("-Xmx4G; rm -rf").is_err());
        assert!(check_jvm_args("-Dx=$HOME").is_err());
    }
}
