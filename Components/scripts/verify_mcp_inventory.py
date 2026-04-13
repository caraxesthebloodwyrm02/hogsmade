#!/usr/bin/env python3
"""Verify mcp_config.json matches mcp_inventory.manifest.json and GRID mcp-setup discovery.

Exit non-zero on drift (fail-closed). Stdlib only.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cascade-root",
        type=Path,
        default=None,
        help="CascadeProjects root (default: parent of scripts/)",
    )
    args = parser.parse_args()
    script_dir = Path(__file__).resolve().parent
    if args.cascade_root is not None:
        cascade_root = args.cascade_root
    else:
        direct_root = script_dir.parent
        if (direct_root / "mcp_config.json").is_file():
            cascade_root = direct_root
        else:
            cascade_root = direct_root.parent
    cascade_root = cascade_root.resolve()

    mcp_path = cascade_root / "mcp_config.json"
    manifest_path = cascade_root / "mcp_inventory.manifest.json"
    if not mcp_path.is_file():
        example_path = cascade_root / "mcp_config.example.json"
        if example_path.is_file():
            print(
                f"verify_mcp_inventory: {mcp_path.name} not found; "
                f"falling back to {example_path.name} for key-set validation (live config is gitignored)"
            )
            mcp_path = example_path
        else:
            print(f"verify_mcp_inventory: missing {mcp_path}", file=sys.stderr)
            return 2
    if not manifest_path.is_file():
        print(f"verify_mcp_inventory: missing {manifest_path}", file=sys.stderr)
        return 2

    mcp = _load_json(mcp_path)
    manifest = _load_json(manifest_path)
    servers = manifest.get("servers")
    if not isinstance(servers, list):
        print("verify_mcp_inventory: manifest.servers must be a list", file=sys.stderr)
        return 2

    mcp_servers = mcp.get("mcpServers")
    if not isinstance(mcp_servers, dict):
        print("verify_mcp_inventory: mcp_config.mcpServers must be an object", file=sys.stderr)
        return 2

    canonical_keys = set(mcp_servers.keys())
    manifest_keys = {s["mcpServerKey"] for s in servers if s.get("mcpServerKey")}

    if canonical_keys != manifest_keys:
        only_mcp = sorted(canonical_keys - manifest_keys)
        only_manifest = sorted(manifest_keys - canonical_keys)
        print("verify_mcp_inventory: mcp_config keys != manifest mcpServerKey set", file=sys.stderr)
        if only_mcp:
            print(f"  only in mcp_config.json: {only_mcp}", file=sys.stderr)
        if only_manifest:
            print(f"  only in manifest (missing from mcp_config): {only_manifest}", file=sys.stderr)
        return 1

    rel = manifest.get("paths", {}).get("gridRepoRelativeToCascade")
    if not rel or not isinstance(rel, str):
        print("verify_mcp_inventory: manifest.paths.gridRepoRelativeToCascade required", file=sys.stderr)
        return 2

    grid_root = (cascade_root / rel).resolve()
    mcp_setup_server = grid_root / "mcp-setup" / "server"
    if not mcp_setup_server.is_dir():
        print(
            f"verify_mcp_inventory: GRID mcp-setup/server not found at {mcp_setup_server} "
            "(skipping filesystem discovery; OK in CI without sibling roots/GRID)",
        )
        return 0

    on_disk = {p.name for p in mcp_setup_server.glob("*_mcp_server.py")}
    # Only entries whose gridPythonScript lives under mcp-setup/ must match
    # mcp-setup/server/*_mcp_server.py. Src-layout servers (e.g. src/grid/mcp/*.py)
    # are validated by path existence below.
    manifest_mcp_setup_scripts: set[str] = set()
    for s in servers:
        gps = s.get("gridPythonScript")
        if gps and str(gps).replace("\\", "/").startswith("mcp-setup/"):
            manifest_mcp_setup_scripts.add(Path(gps).name)

    if on_disk != manifest_mcp_setup_scripts:
        only_disk = sorted(on_disk - manifest_mcp_setup_scripts)
        only_manifest_f = sorted(manifest_mcp_setup_scripts - on_disk)
        print(
            "verify_mcp_inventory: mcp-setup/server/*_mcp_server.py != "
            "manifest gridPythonScript basenames (mcp-setup/* only)",
            file=sys.stderr,
        )
        if only_disk:
            print(f"  on disk, not in manifest: {only_disk}", file=sys.stderr)
        if only_manifest_f:
            print(f"  in manifest, missing on disk: {only_manifest_f}", file=sys.stderr)
        return 1

    for s in servers:
        gps = s.get("gridPythonScript")
        if not gps:
            continue
        full = grid_root / gps
        if not full.is_file():
            print(f"verify_mcp_inventory: missing file for manifest entry: {full}", file=sys.stderr)
            return 1

    excluded = [s for s in servers if s.get("status") == "excluded_from_editor_canonical"]
    for s in excluded:
        if not s.get("reason"):
            print(
                f"verify_mcp_inventory: excluded server {s.get('id')} must have non-empty reason",
                file=sys.stderr,
            )
            return 1

    print(
        f"verify_mcp_inventory: OK ({len(canonical_keys)} editor-canonical servers, "
        f"{len(on_disk)} mcp-setup Python artifacts, "
        f"{sum(1 for s in servers if s.get('gridPythonScript'))} gridPythonScript paths)",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
