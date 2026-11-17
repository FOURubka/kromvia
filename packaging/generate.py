#!/usr/bin/env python3
"""Writes AUR, winget and Flatpak manifests for a published GitHub release.

Usage: packaging/generate.py [version]   (default: version from tauri.conf.json)
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
REPO = "4rubka/kromvia"
APP_ID = "com.kromvia.launcher"

version = sys.argv[1] if len(sys.argv) > 1 else json.loads((ROOT.parent / "src-tauri/tauri.conf.json").read_text())["version"]
base = f"https://github.com/{REPO}/releases/download/v{version}"
deb = f"{base}/Kromvia_{version}_amd64.deb"
exe = f"{base}/Kromvia_{version}_x64-setup.exe"


def sha256(url: str) -> str:
    h = hashlib.sha256()
    with urllib.request.urlopen(url) as r:
        while chunk := r.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


deb_sha, exe_sha = sha256(deb), sha256(exe)
template = lambda name: (ROOT / name).read_text()
fill = lambda text: text.replace("@VERSION@", version).replace("@DEB_URL@", deb).replace("@DEB_SHA256@", deb_sha).replace("@EXE_URL@", exe).replace("@EXE_SHA256@", exe_sha.upper())

(ROOT / "aur/PKGBUILD").write_text(fill(template("aur/PKGBUILD.in")))
(ROOT / f"flatpak/{APP_ID}.yml").write_text(fill(template("flatpak/manifest.yml.in")))
out = ROOT / "winget" / version
out.mkdir(parents=True, exist_ok=True)
for name in ["Kromvia.Kromvia.yaml", "Kromvia.Kromvia.installer.yaml", "Kromvia.Kromvia.locale.en-US.yaml"]:
    (out / name).write_text(fill(template(f"winget/{name}.in")))
print(f"v{version}: deb {deb_sha[:12]}…, exe {exe_sha[:12]}…")
