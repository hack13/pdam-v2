#!/usr/bin/env python3
"""Sync a PDAM library to a local directory using only Python's standard library."""

import hashlib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path


def main():
    base_url = os.environ.get("PDAM_URL") or (sys.argv[1] if len(sys.argv) > 1 else None)
    token = os.environ.get("PDAM_SYNC_TOKEN") or (sys.argv[2] if len(sys.argv) > 2 else None)
    root = os.environ.get("PDAM_SYNC_DIR") or (sys.argv[3] if len(sys.argv) > 3 else "./pdam-backup")
    if not base_url or not token:
        print("Usage: pdam-sync.py <PDAM_URL> <SYNC_TOKEN> [DIRECTORY]", file=sys.stderr)
        return 2

    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}"}
    root_path = Path(root)
    manifest_request = urllib.request.Request(f"{base_url}/api/sync/manifest", headers=headers)

    with urllib.request.urlopen(manifest_request) as response:
        if response.status != 200:
            raise RuntimeError(f"Manifest request failed: {response.status}")
        manifest = json.load(response)

    failed = 0
    skipped = 0
    synced = 0
    files = [
        (asset, version, file)
        for asset in manifest["assets"]
        for version in asset["versions"]
        for file in version["files"]
    ]

    for index, (asset, version, file) in enumerate(files, start=1):
        safe_name = re.sub(r"[\\/]", "_", file["fileName"])
        if re.fullmatch(r"\.+", safe_name):
            safe_name = "_"
        target = root_path / "assets" / asset["slug"] / "versions" / version["version"] / "files" / safe_name

        if target.is_file():
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            if digest == file["sha256"]:
                skipped += 1
                print(f"[{index}/{len(files)}] Already synced {file['fileName']}")
                continue

        file_request = urllib.request.Request(base_url + file["downloadUrl"], headers=headers)
        try:
            with urllib.request.urlopen(file_request) as response:
                if response.status != 200:
                    raise RuntimeError(f"Download failed: {response.status}")
                data = response.read()
        except Exception as error:
            print(f"Failed {file['fileName']}: {error}", file=sys.stderr)
            failed += 1
            continue

        if hashlib.sha256(data).hexdigest() != file["sha256"]:
            print(f"Hash mismatch {file['fileName']}", file=sys.stderr)
            failed += 1
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.with_name(f"{target.name}.part-{os.getpid()}")
        temp.write_bytes(data)
        temp.replace(target)
        synced += 1
        print(f"[{index}/{len(files)}] Synced {file['fileName']}")

    root_path.mkdir(parents=True, exist_ok=True)
    (root_path / ".pdam-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Synced {synced} file(s), skipped {skipped} unchanged file(s) to {root_path}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
