
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

use crate::engine::{content, instances};

const KEEP: usize = 40;
const EVERY: Duration = Duration::from_secs(5);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub started: u64,
    pub seconds: u64,
    pub ram_avg_mb: u64,
    pub ram_peak_mb: u64,
    pub cpu_avg: f32,
    pub mods: Vec<String>,
    #[serde(default)]
    pub files: Vec<String>,
    #[serde(default)]
    pub mod_set: String,
    #[serde(default)]
    pub fps_avg: Option<f32>,
    #[serde(default)]
    pub fps_low: Option<f32>,
    #[serde(default)]
    pub gpu: String,
}

#[derive(Default, Clone, Copy)]
struct Frames {
    sum_avg: f64,
    sum_low: f64,
    weight: f64,
}

static FRAMES: std::sync::Mutex<Option<std::collections::HashMap<String, Frames>>> = std::sync::Mutex::new(None);

pub fn frames(instance_id: &str, avg: f64, low: f64, n: f64) {
    if !(avg.is_finite() && low.is_finite() && n > 0.0 && avg < 10_000.0 && low <= avg + 1.0) {
        return;
    }
    let mut all = FRAMES.lock().unwrap_or_else(|e| e.into_inner());
    let f = all.get_or_insert_with(Default::default).entry(instance_id.to_string()).or_default();
    f.sum_avg += avg * n;
    f.sum_low += low * n;
    f.weight += n;
}

static GPUS: std::sync::Mutex<Option<std::collections::HashMap<String, String>>> = std::sync::Mutex::new(None);

pub fn gpu(instance_id: &str, name: &str) {
    let name: String = name.chars().filter(|c| !c.is_control()).take(120).collect();
    if !name.is_empty() {
        GPUS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(Default::default).insert(instance_id.to_string(), name);
    }
}

fn take_gpu(instance_id: &str) -> String {
    GPUS.lock().unwrap_or_else(|e| e.into_inner()).as_mut().and_then(|m| m.remove(instance_id)).unwrap_or_default()
}

fn take_frames(instance_id: &str) -> Option<(f32, f32)> {
    let f = FRAMES.lock().unwrap_or_else(|e| e.into_inner()).as_mut()?.remove(instance_id)?;
    (f.weight > 0.0).then(|| ((f.sum_avg / f.weight) as f32, (f.sum_low / f.weight) as f32))
}

pub fn mod_set(files: &[String]) -> String {
    use sha2::{Digest, Sha256};
    let mut sorted = files.to_vec();
    sorted.sort();
    Sha256::digest(sorted.join("\n").as_bytes()).iter().take(8).map(|b| format!("{b:02x}")).collect()
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Regression {
    pub before_low: f32,
    pub after_low: f32,
    pub drop_percent: u32,
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub before_set: String,
}

const DROP: f32 = 0.8;

pub fn regression(runs: &[Run]) -> Option<Regression> {
    let timed: Vec<&Run> = runs.iter().filter(|r| r.fps_low.is_some() && !r.mod_set.is_empty()).collect();
    let now = *timed.last()?;
    let before: Vec<&Run> = timed.iter().rev().skip(1).copied().skip_while(|r| r.mod_set == now.mod_set).collect();
    let set = &before.first()?.mod_set;
    let mut lows: Vec<f32> = before.iter().take_while(|r| &r.mod_set == set).take(3).filter_map(|r| r.fps_low).collect();
    lows.sort_by(|a, b| a.total_cmp(b));
    let before_low = lows[lows.len() / 2];
    let after_low = now.fps_low?;
    if before_low <= 0.0 || after_low >= before_low * DROP {
        return None;
    }
    let old = before[0];
    Some(Regression {
        before_low,
        after_low,
        drop_percent: ((1.0 - after_low / before_low) * 100.0).round() as u32,
        added: now.mods.iter().filter(|m| !old.mods.contains(m)).cloned().collect(),
        removed: old.mods.iter().filter(|m| !now.mods.contains(m)).cloned().collect(),
        before_set: set.clone(),
    })
}

fn path(instance_id: &str) -> Result<std::path::PathBuf, String> {
    Ok(instances::dir(instance_id)?.join("metrics.json"))
}

pub fn list(instance_id: &str) -> Vec<Run> {
    path(instance_id).ok().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save(instance_id: &str, run: Run) {
    let mut runs = list(instance_id);
    runs.push(run);
    let skip = runs.len().saturating_sub(KEEP);
    if let (Ok(p), Ok(json)) = (path(instance_id), serde_json::to_vec(&runs[skip..])) {
        let _ = std::fs::write(p, json);
    }
}

pub fn watch(instance_id: String, pid: u32) -> (oneshot::Sender<()>, oneshot::Receiver<Option<Run>>) {
    let (tx, mut rx) = oneshot::channel();
    let (done_tx, done_rx) = oneshot::channel();
    let enabled: Vec<content::InstalledFile> = content::list(&instance_id).map(|l| l.into_iter().filter(|f| f.folder == "mods" && f.enabled).collect()).unwrap_or_default();
    let mods: Vec<String> = enabled.iter().map(|f| f.title.clone()).collect();
    let files: Vec<String> = enabled.into_iter().map(|f| f.file).collect();
    let set = mod_set(&files);
    take_frames(&instance_id);
    let started = instances::now();
    tauri::async_runtime::spawn(async move {
        use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
        let pid = Pid::from_u32(pid);
        let cores = std::thread::available_parallelism().map_or(1, |n| n.get()) as f32;
        let mut sys = System::new();
        let (mut ram, mut peak, mut cpu, mut n) = (0u64, 0u64, 0f32, 0u64);
        let begun = std::time::Instant::now();
        loop {
            tokio::select! {
                _ = &mut rx => break,
                _ = tokio::time::sleep(EVERY) => {}
            }
            sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), true, ProcessRefreshKind::nothing().with_memory().with_cpu());
            let Some(p) = sys.process(pid) else { break };
            if begun.elapsed() < EVERY * 2 {
                continue;
            }
            let mb = p.memory() / (1024 * 1024);
            ram += mb;
            peak = peak.max(mb);
            cpu += p.cpu_usage() / cores;
            n += 1;
        }
        let fps = take_frames(&instance_id);
        let gpu = take_gpu(&instance_id);
        if n < 2 {
            let _ = done_tx.send(None);
            return;
        }
        let run = Run {
                started,
                seconds: begun.elapsed().as_secs(),
                ram_avg_mb: ram / n,
                ram_peak_mb: peak,
                cpu_avg: cpu / n as f32,
                mods,
                files,
                mod_set: set,
                fps_avg: fps.map(|f| f.0),
                fps_low: fps.map(|f| f.1),
                gpu,
        };
        save(&instance_id, run.clone());
        let _ = done_tx.send(Some(run));
    });
    (tx, done_rx)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(set: &str, mods: &[&str], low: Option<f32>) -> Run {
        Run { started: 0, seconds: 60, ram_avg_mb: 1, ram_peak_mb: 1, cpu_avg: 1.0, mods: mods.iter().map(|s| s.to_string()).collect(), files: vec![], mod_set: set.into(), fps_avg: low.map(|l| l * 2.0), fps_low: low, gpu: String::new() }
    }

    #[test]
    fn spots_a_drop_after_a_mod_change() {
        let runs = vec![run("a", &["Sodium"], Some(100.0)), run("a", &["Sodium"], Some(90.0)), run("a", &["Sodium"], Some(110.0)), run("b", &["Sodium", "Heavy"], Some(60.0))];
        let r = regression(&runs).unwrap();
        assert_eq!((r.before_low, r.after_low, r.drop_percent, r.before_set.as_str()), (100.0, 60.0, 40, "a"));
        assert_eq!(r.added, vec!["Heavy".to_string()]);
        assert!(regression(&runs[..3]).is_none());
        let mut fine = runs.clone();
        fine[3].fps_low = Some(95.0);
        assert!(regression(&fine).is_none());
        assert!(regression(&[run("a", &[], None), run("b", &[], Some(10.0))]).is_none());
    }
}
