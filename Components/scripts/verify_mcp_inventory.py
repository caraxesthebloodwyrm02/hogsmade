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
    grid_present = mcp_setup_server.is_dir()
    if not grid_present:
        print(
            f"verify_mcp_inventory: GRID mcp-setup/server not found at {mcp_setup_server} "
            "(skipping GRID filesystem discovery; OK in CI without sibling roots/GRID)",
        )
        on_disk: set[str] = set()

    if grid_present:
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

    # ── TypeScript server triangle: filesystem ↔ package.json workspaces ↔ mcp_config ↔ manifest.
    # The earlier check covers mcp_config ↔ manifest. Here we also catch:
    #   * directories under Tools/MCPServers/ with a package.json that are missing
    #     from any of: workspaces, mcp_config, manifest;
    #   * manifest entries with runtime=typescript whose entryRelative file does not exist;
    #   * mcp_config TS entries (server keys ending in "-server") whose source file does not exist.
    ts_servers_root = cascade_root / "Tools" / "MCPServers"
    if ts_servers_root.is_dir():
        fs_ts_dirs = sorted(
            d.name for d in ts_servers_root.iterdir() if d.is_dir() and (d / "package.json").is_file()
        )

        pkg_path = cascade_root / "package.json"
        if not pkg_path.is_file():
            print(f"verify_mcp_inventory: missing {pkg_path}", file=sys.stderr)
            return 2
        pkg = _load_json(pkg_path)
        ts_prefix = "Tools/MCPServers/"
        ws_ts_dirs = sorted(
            w[len(ts_prefix) :] for w in pkg.get("workspaces", []) if w.startswith(ts_prefix)
        )

        ts_manifest_keys = sorted(
            s["mcpServerKey"]
            for s in servers
            if s.get("runtime") == "typescript" and s.get("mcpServerKey")
        )
        ts_mcp_keys = sorted(k for k in canonical_keys if k.endswith("-server"))

        fs_set = set(fs_ts_dirs)
        ws_set = set(ws_ts_dirs)
        man_set = set(ts_manifest_keys)
        cfg_set = set(ts_mcp_keys)

        missing_from_workspace = sorted(fs_set - ws_set)
        missing_from_mcp = sorted(fs_set - cfg_set)
        missing_from_manifest = sorted(fs_set - man_set)
        orphan_workspace = sorted(ws_set - fs_set)
        orphan_mcp = sorted(cfg_set - fs_set)
        orphan_manifest = sorted(man_set - fs_set)

        problems: list[str] = []
        if missing_from_workspace:
            problems.append(f"  on disk, missing from package.json workspaces: {missing_from_workspace}")
        if missing_from_mcp:
            problems.append(f"  on disk, missing from mcp_config: {missing_from_mcp}")
        if missing_from_manifest:
            problems.append(f"  on disk, missing from manifest: {missing_from_manifest}")
        if orphan_workspace:
            problems.append(f"  in package.json workspaces, no directory: {orphan_workspace}")
        if orphan_mcp:
            problems.append(f"  in mcp_config, no directory: {orphan_mcp}")
        if orphan_manifest:
            problems.append(f"  in manifest (runtime=typescript), no directory: {orphan_manifest}")

        # Manifest entryRelative must point at a real file under Tools/MCPServers/
        for s in servers:
            if s.get("runtime") != "typescript":
                continue
            entry_rel = s.get("entryRelative")
            if not entry_rel:
                problems.append(f"  manifest TS entry {s.get('mcpServerKey')!r} missing entryRelative")
                continue
            full = ts_servers_root / entry_rel
            if not full.is_file():
                problems.append(
                    f"  manifest entryRelative does not exist for {s.get('mcpServerKey')}: "
                    f"{full.relative_to(cascade_root)}"
                )

        if problems:
            print("verify_mcp_inventory: TypeScript server inventory drift", file=sys.stderr)
            for p in problems:
                print(p, file=sys.stderr)
            return 1
    else:
        fs_ts_dirs = []
        ws_ts_dirs = []
        ts_manifest_keys = []

    print(
        f"verify_mcp_inventory: OK ({len(canonical_keys)} editor-canonical servers, "
        f"{len(on_disk)} mcp-setup Python artifacts, "
        f"{sum(1 for s in servers if s.get('gridPythonScript'))} gridPythonScript paths, "
        f"{len(fs_ts_dirs)} TS server directories aligned with workspaces and manifest)",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
