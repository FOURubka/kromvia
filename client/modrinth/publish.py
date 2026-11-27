#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

API = "https://api.modrinth.com/v2"
API_V3 = "https://api.modrinth.com/v3"
SUMMARY = "PvP and QoL client mod with its own title screen, module menu and HUD editor. 1.15.2 to 26.3 on Fabric, Forge and NeoForge."
AGENT = "kromvia/client-publisher (kromvia.com)"
HERE = Path(__file__).resolve().parent
CLIENT = HERE.parent
JARS = CLIENT.parent / "src-tauri" / "resources" / "client"
JAR = re.compile(r"kromvia-client-(?P<mc>[\d.]+?)(?:-(?P<loader>forge|neoforge))?\.jar")


def request(method, path, token, body=None, headers=None, api=API):
    req = urllib.request.Request(api + path, data=body, method=method)
    req.add_header("User-Agent", AGENT)
    if token:
        req.add_header("Authorization", token)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> {e.code}: {e.read().decode(errors='replace')}")


def multipart(data, name, payload):
    boundary = uuid.uuid4().hex
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="data"\r\nContent-Type: application/json\r\n\r\n'.encode(),
        json.dumps(data).encode(),
        f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/java-archive\r\n\r\n'.encode(),
        payload,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    return b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def mod_version():
    for line in (CLIENT / "gradle.properties").read_text().splitlines():
        if line.startswith("version="):
            return line.split("=", 1)[1].strip()
    sys.exit("no version in client/gradle.properties")


def main():
    ap = argparse.ArgumentParser(description="Upload Kromvia Client jars to Modrinth (dry run unless --publish).")
    ap.add_argument("project", help="Modrinth project slug or id")
    ap.add_argument("--publish", action="store_true", help="actually upload")
    ap.add_argument("--body", action="store_true", help="replace the project description with description.md")
    ap.add_argument("--gallery", action="store_true", help="upload every image in gallery/")
    ap.add_argument("--type", default="beta", choices=["release", "beta", "alpha"])
    ap.add_argument("--only", nargs="*", help="limit to these Minecraft versions")
    ap.add_argument("--no-versions", action="store_true", help="skip uploading jars")
    args = ap.parse_args()

    token = os.environ.get("MODRINTH_TOKEN")
    token_file = Path.home() / ".config" / "modrinth" / "token"
    if not token and token_file.is_file():
        token = token_file.read_text().strip()
    if args.publish and not token:
        sys.exit("set MODRINTH_TOKEN")

    project = request("GET", f"/project/{urllib.parse.quote(args.project)}", token)
    pid = project["id"]
    known = {t["version"] for t in request("GET", "/tag/game_version", None)}
    existing = {v["version_number"] for v in request("GET", f"/project/{pid}/version", token)}
    version = mod_version()
    changelog_file = HERE / "changelog.md"
    changelog = changelog_file.read_text() if changelog_file.is_file() else ""

    plan, skipped = [], []
    jars = [(jar, JAR.fullmatch(jar.name)) for jar in JARS.glob("kromvia-client-*.jar")]
    jars = sorted(((j, m) for j, m in jars if m), key=lambda jm: ([int(x) for x in jm[1]["mc"].split(".")], jm[1]["loader"] or ""))
    for jar, m in jars:
        mc, loader = m["mc"], m["loader"] or "fabric"
        if args.only and mc not in args.only:
            continue
        number = f"{version}+{mc}-{loader}"
        if number in existing:
            skipped.append(f"{number} (already on Modrinth)")
        elif mc not in known:
            skipped.append(f"{number} (Modrinth has no game version {mc})")
        else:
            plan.append((jar, mc, loader, number))

    print(f"project {project['slug']} ({pid}), mod version {version}")
    for jar, _, _, number in plan:
        print(f"  upload {number:32} {jar.name}")
    for s in skipped:
        print(f"  skip   {s}")

    if not args.publish:
        print("dry run, add --publish to upload")
        return

    if args.body:
        body = (HERE / "description.md").read_text()
        page = {
            "description": SUMMARY,
            "body": body,
            "categories": ["utility"],
            "license_id": "GPL-3.0-only",
            "client_side": "required",
            "server_side": "unsupported",
        }
        request("PATCH", f"/project/{pid}", token, json.dumps(page).encode(), {"Content-Type": "application/json"})
        print("description updated")

    if args.gallery:
        for i, img in enumerate(sorted((HERE / "gallery").glob("*.png"))):
            title = img.stem.replace("-", " ").capitalize()
            q = urllib.parse.urlencode({"ext": "png", "featured": "true" if i == 0 else "false", "title": title})
            request("POST", f"/project/{pid}/gallery?{q}", token, img.read_bytes(), {"Content-Type": "image/png"})
            print(f"gallery: {img.name}")

    for jar, mc, loader, number in [] if args.no_versions else plan:
        data = {
            "project_id": pid,
            "name": f"Kromvia Client {version} for {mc} ({loader.capitalize() if loader != 'neoforge' else 'NeoForge'})",
            "version_number": number,
            "changelog": changelog,
            "dependencies": [],
            "game_versions": [mc],
            "version_type": args.type,
            "loaders": [loader],
            "featured": False,
            "file_parts": ["file"],
            "primary_file": "file",
        }
        body, headers = multipart(data, jar.name, jar.read_bytes())
        v = request("POST", "/version", token, body, headers)
        request("PATCH", f"/version/{v['id']}", token, json.dumps({"environment": "client_only"}).encode(), {"Content-Type": "application/json"}, api=API_V3)
        print(f"uploaded {number}")


if __name__ == "__main__":
    main()
