"""Tests for stale_inventory_audit classifier and scanner."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from roots.security.scripts import stale_inventory_audit as audit_module
from roots.security.scripts.stale_inventory_audit import (
    FindingType,
    RecommendedAction,
    DEFAULT_SUBJECT_ROOT,
    Severity,
    classify,
    build_summary_counts,
    generate_json_manifest,
    generate_markdown_report,
    resolve_subject_root,
    run_audit,
)


# ---------------------------------------------------------------------------
# classify() unit tests — pure deterministic classifier
# ---------------------------------------------------------------------------

class TestClassifier:
    """Fixture-driven tests for the classify() function."""

    def test_live_etc_reference_to_legacy(self) -> None:
        """If /etc config points to legacy path and legacy exists -> live_cutover_blocker HIGH."""
        f = classify(
            legacy_path="/home/caraxes/config/firewall-audit.nft",
            legacy_exists=True,
            canonical_path="roots/security/firewall/firewall-audit.nft",
            canonical_exists=True,
            referrer_path="/etc/nftables.conf",
            referrer_line=3,
            is_live_system_config=True,
            is_historical_source=False,
            is_canonical_file=False,
            has_active_consumers=True,
        )
        assert f.finding_type == FindingType.LIVE_CUTOVER_BLOCKER
        assert f.severity == Severity.HIGH
        assert f.recommended_action == RecommendedAction.UPDATE_LIVE_REFERENCE

    def test_active_skill_doc_reference_to_legacy(self) -> None:
        """Active skill/doc referencing legacy path -> active_stale_reference MEDIUM."""
        f = classify(
            legacy_path="/home/caraxes/arch-advanced-maintenance.sh",
            legacy_exists=True,
            canonical_path="roots/security/maintenance/arch-advanced-maintenance.sh",
            canonical_exists=True,
            referrer_path="skills/os-guardrails/SKILL.md",
            referrer_line=42,
            is_live_system_config=False,
            is_historical_source=False,
            is_canonical_file=False,
            has_active_consumers=True,
        )
        assert f.finding_type == FindingType.ACTIVE_STALE_REFERENCE
        assert f.severity == Severity.MEDIUM
        assert f.recommended_action == RecommendedAction.UPDATE_ACTIVE_DOC_OR_SKILL

    def test_historical_transcript_reference(self) -> None:
        """Reference in historical transcript -> historical_reference INFO."""
        f = classify(
            legacy_path="/home/caraxes/strict-firewall.nft",
            legacy_exists=True,
            canonical_path="roots/security/firewall/strict-firewall.nft",
            canonical_exists=True,
            referrer_path="roots/security/docs/arch-linux-security-hardening-plan-review.md",
            referrer_line=100,
            is_live_system_config=False,
            is_historical_source=True,
            is_canonical_file=False,
            has_active_consumers=False,
        )
        assert f.finding_type == FindingType.HISTORICAL_REFERENCE
        assert f.severity == Severity.INFO
        assert f.historical is True
        assert f.recommended_action == RecommendedAction.RETAIN_HISTORICAL

    def test_canonical_file_self_referencing_old_path(self) -> None:
        """Canonical file mentions legacy path -> canonical_self_inconsistency MEDIUM."""
        f = classify(
            legacy_path="/home/caraxes/config/firewall-audit.nft",
            legacy_exists=True,
            canonical_path="roots/security/firewall/firewall-audit.nft",
            canonical_exists=True,
            referrer_path="roots/security/firewall/firewall-audit.nft",
            referrer_line=5,
            is_live_system_config=False,
            is_historical_source=False,
            is_canonical_file=True,
            has_active_consumers=False,
        )
        assert f.finding_type == FindingType.CANONICAL_SELF_INCONSISTENCY
        assert f.severity == Severity.MEDIUM
        assert f.recommended_action == RecommendedAction.UPDATE_ACTIVE_DOC_OR_SKILL

    def test_legacy_file_present_no_consumers(self) -> None:
        """Legacy file present, canonical exists, no active consumers -> safe_duplicate LOW."""
        f = classify(
            legacy_path="/home/caraxes/strict-firewall.nft",
            legacy_exists=True,
            canonical_path="roots/security/firewall/strict-firewall.nft",
            canonical_exists=True,
            referrer_path=None,
            referrer_line=None,
            is_live_system_config=False,
            is_historical_source=False,
            is_canonical_file=False,
            has_active_consumers=False,
        )
        assert f.finding_type == FindingType.SAFE_DUPLICATE
        assert f.severity == Severity.LOW
        assert f.recommended_action == RecommendedAction.DELETE_LEGACY_PATH_AFTER_CUTOVER

    def test_missing_legacy_still_referenced_active(self) -> None:
        """Legacy file gone but still referenced from active config -> orphan_reference HIGH."""
        f = classify(
            legacy_path="/home/caraxes/arch-devtool-deep-clean.sh",
            legacy_exists=False,
            canonical_path="roots/security/maintenance/arch-devtool-deep-clean.sh",
            canonical_exists=True,
            referrer_path="skills/os-guardrails/SKILL.md",
            referrer_line=15,
            is_live_system_config=False,
            is_historical_source=False,
            is_canonical_file=False,
            has_active_consumers=False,  # irrelevant; orphan takes priority
        )
        assert f.finding_type == FindingType.ORPHAN_REFERENCE
        assert f.severity == Severity.HIGH
        assert f.recommended_action == RecommendedAction.UPDATE_ACTIVE_DOC_OR_SKILL


def test_default_subject_root_is_home_caraxes() -> None:
    assert resolve_subject_root() == DEFAULT_SUBJECT_ROOT


def test_public_api_excludes_private_names() -> None:
    assert audit_module.__all__
    assert all(not name.startswith("_") for name in audit_module.__all__)
    assert "_scan_filesystem" not in audit_module.__all__
    assert "run_audit" in audit_module.__all__


# ---------------------------------------------------------------------------
# Golden-output test — fixture tree
# ---------------------------------------------------------------------------

FIXTURE_RULESET = {
    "scope": "test-security-migration",
    "version": "1.0.0",
    "canonical_paths": [
        "roots/security/firewall/firewall-audit.nft",
        "roots/security/maintenance/arch-advanced-maintenance.sh",
    ],
    "legacy_paths": [
        "/tmp/test_audit_fixture/legacy/firewall-audit.nft",
        "/tmp/test_audit_fixture/legacy/arch-advanced-maintenance.sh",
    ],
    "active_scan_sources": [
        "active_source/SKILL.md",
    ],
    "historical_sources": [
        "historical/plan-review.md",
    ],
    "historical_patterns": [
        "*plan-review*",
    ],
    "live_system_bindings": {},
}


@pytest.fixture()
def fixture_tree(tmp_path: Path) -> Path:
    """Build a minimal fixture tree for golden-output testing."""
    ws = tmp_path / "workspace"
    ws.mkdir()

    # Canonical files
    (ws / "roots/security/firewall").mkdir(parents=True)
    (ws / "roots/security/firewall/firewall-audit.nft").write_text("# canonical nft\n")
    (ws / "roots/security/maintenance").mkdir(parents=True)
    (ws / "roots/security/maintenance/arch-advanced-maintenance.sh").write_text("#!/bin/bash\n")

    # Active source referencing legacy path
    (ws / "active_source").mkdir()
    (ws / "active_source/SKILL.md").write_text(
        "Run the script at /tmp/test_audit_fixture/legacy/arch-advanced-maintenance.sh\n"
    )

    # Historical doc referencing legacy path
    (ws / "historical").mkdir()
    (ws / "historical/plan-review.md").write_text(
        "Old path was /tmp/test_audit_fixture/legacy/firewall-audit.nft\n"
    )

    # Write the ruleset
    ruleset_path = ws / "test_ruleset.json"
    ruleset_path.write_text(json.dumps(FIXTURE_RULESET, indent=2))

    return ws


class TestGoldenOutput:
    """Run against a fixture tree and assert summary counts + manifest categories."""

    def test_fixture_tree_counts(self, fixture_tree: Path, tmp_path: Path) -> None:
        # Create legacy files on disk for the test
        legacy_dir = tmp_path / "test_audit_fixture" / "legacy"
        # We DON'T create legacy files to test orphan detection
        # Instead, create one and leave the other missing
        legacy_dir.mkdir(parents=True)
        (legacy_dir / "arch-advanced-maintenance.sh").write_text("#!/bin/bash\n")
        # firewall-audit.nft is NOT created -> orphan for active, historical for history

        # Patch tmp_path into legacy paths (they use /tmp/test_audit_fixture)
        ruleset_path = fixture_tree / "test_ruleset.json"
        rs = json.loads(ruleset_path.read_text())
        # Update legacy paths to use actual tmp_path
        rs["legacy_paths"] = [
            str(legacy_dir / "firewall-audit.nft"),
            str(legacy_dir / "arch-advanced-maintenance.sh"),
        ]
        # Update active scan source references too
        (fixture_tree / "active_source/SKILL.md").write_text(
            f"Run the script at {legacy_dir / 'arch-advanced-maintenance.sh'}\n"
        )
        (fixture_tree / "historical/plan-review.md").write_text(
            f"Old path was {legacy_dir / 'firewall-audit.nft'}\n"
        )
        ruleset_path.write_text(json.dumps(rs, indent=2))

        findings, manifest, report = run_audit(fixture_tree, ruleset_path)

        counts = manifest["summary_counts"]
        # Should have historical_reference for plan-review.md
        assert counts.get("historical_reference", 0) >= 1, f"Expected historical; got {counts}"
        # The active source references arch-advanced-maintenance.sh which exists -> active_stale_reference
        assert counts.get("active_stale_reference", 0) >= 1, f"Expected active stale; got {counts}"
        subject = str(legacy_dir / "arch-advanced-maintenance.sh")
        assert not any(
            f["subject_path"] == subject and f["finding_type"] == "safe_duplicate"
            for f in manifest["findings"]
        ), f"Actively referenced legacy path was mislabeled safe_duplicate: {manifest['findings']}"
        # Total should be > 0
        assert counts["total"] > 0

        # Verify manifest structure
        assert "scan_id" in manifest
        assert "generated_at" in manifest
        for f in manifest["findings"]:
            assert "id" in f
            assert "finding_type" in f
            assert "severity" in f
            assert "subject_path" in f
            assert "recommended_action" in f
            assert "historical" in f

        # Verify no historical finding is mislabeled
        for f in manifest["findings"]:
            if "plan-review" in f.get("referrer_path", ""):
                assert f["finding_type"] == "historical_reference"
                assert f["historical"] is True

        # Markdown report has summary heading
        assert "## Summary" in report
        assert "Total findings:" in report

    def test_fixture_tree_no_canonical_mislabeled_historical(
        self, fixture_tree: Path, tmp_path: Path
    ) -> None:
        """No finding under roots/security is mislabeled as historical."""
        legacy_dir = tmp_path / "test_audit_fixture" / "legacy"
        legacy_dir.mkdir(parents=True, exist_ok=True)

        ruleset_path = fixture_tree / "test_ruleset.json"
        rs = json.loads(ruleset_path.read_text())
        rs["legacy_paths"] = [
            str(legacy_dir / "firewall-audit.nft"),
            str(legacy_dir / "arch-advanced-maintenance.sh"),
        ]
        ruleset_path.write_text(json.dumps(rs, indent=2))

        findings, manifest, report = run_audit(fixture_tree, ruleset_path)

        for f in findings:
            if f.referrer_path.startswith("roots/security"):
                assert f.finding_type != FindingType.HISTORICAL_REFERENCE, (
                    f"Finding {f.id} under roots/security was mislabeled as historical: {f}"
                )

    def test_historical_source_scanned_once_when_also_in_active_sources(
        self, fixture_tree: Path, tmp_path: Path
    ) -> None:
        legacy_dir = tmp_path / "test_audit_fixture" / "legacy"
        legacy_dir.mkdir(parents=True, exist_ok=True)

        ruleset_path = fixture_tree / "test_ruleset.json"
        rs = json.loads(ruleset_path.read_text())
        rs["legacy_paths"] = [str(legacy_dir / "firewall-audit.nft")]
        rs["active_scan_sources"] = [
            "historical/plan-review.md",
        ]
        rs["historical_sources"] = [
            "historical/plan-review.md",
        ]
        (fixture_tree / "historical/plan-review.md").write_text(
            f"Old path was {legacy_dir / 'firewall-audit.nft'}\n"
        )
        ruleset_path.write_text(json.dumps(rs, indent=2))

        findings, manifest, report = run_audit(fixture_tree, ruleset_path)

        matching = [
            f for f in manifest["findings"]
            if f["referrer_path"] == "historical/plan-review.md"
        ]
        assert len(matching) == 1, f"Expected one historical finding, got {matching}"
        assert matching[0]["finding_type"] == "historical_reference"

    def test_real_scope_fixture_mixed_findings(self, tmp_path: Path) -> None:
        subject_root = tmp_path / "home"
        subject_root.mkdir()

        (subject_root / "roots/security/firewall").mkdir(parents=True)
        (subject_root / "roots/security/maintenance").mkdir(parents=True)
        (subject_root / "roots/security/docs").mkdir(parents=True)

        canonical_firewall = subject_root / "roots/security/firewall/firewall-audit.nft"
        canonical_firewall.write_text("# canonical firewall\n")
        canonical_maint = subject_root / "roots/security/maintenance/arch-advanced-maintenance.sh"
        canonical_maint.write_text("#!/bin/bash\n")
        canonical_duplicate = subject_root / "roots/security/firewall/strict-firewall.nft"
        canonical_duplicate.write_text("# canonical duplicate\n")

        live_legacy = subject_root / "config/firewall-audit.nft"
        live_legacy.parent.mkdir(parents=True)
        live_legacy.write_text("# old firewall\n")
        active_legacy = subject_root / "arch-advanced-maintenance.sh"
        active_legacy.write_text("#!/bin/bash\n")
        duplicate_legacy = subject_root / "strict-firewall.nft"
        duplicate_legacy.write_text("# old duplicate\n")
        historical_legacy = subject_root / "docs/security-hardening-guide.md"
        historical_legacy.parent.mkdir(parents=True)
        historical_legacy.write_text("# old historical\n")

        active_source = subject_root / "skills/os-guardrails/SKILL.md"
        active_source.parent.mkdir(parents=True)
        active_source.write_text(f"Use {active_legacy}\n")

        historical_source = subject_root / "roots/security/docs/arch-linux-security-hardening-plan-review.md"
        historical_source.write_text(f"Old path was {historical_legacy}\n")

        live_config = tmp_path / "etc-nftables.conf"
        live_config.write_text(f'include "{live_legacy}"\n')

        ruleset = {
            "scope": "real-scope-fixture",
            "version": "1.0.0",
            "canonical_paths": [
                "roots/security/firewall/firewall-audit.nft",
                "roots/security/firewall/strict-firewall.nft",
                "roots/security/maintenance/arch-advanced-maintenance.sh",
                "roots/security/docs/security-hardening-guide.md",
            ],
            "legacy_paths": [
                str(live_legacy),
                str(active_legacy),
                str(duplicate_legacy),
                str(historical_legacy),
            ],
            "active_scan_sources": [
                "skills/os-guardrails/**",
                str(live_config),
            ],
            "historical_sources": [
                "roots/security/docs/arch-linux-security-hardening-plan-review.md",
            ],
            "historical_patterns": [
                "*plan-review*",
            ],
            "live_system_bindings": {
                str(live_config): str(live_legacy),
            },
        }
        ruleset_path = subject_root / "test_ruleset.json"
        ruleset_path.write_text(json.dumps(ruleset, indent=2))

        findings, manifest, report = run_audit(subject_root, ruleset_path)
        counts = manifest["summary_counts"]

        assert counts["live_cutover_blocker"] == 1
        assert counts["active_stale_reference"] == 1
        assert counts["historical_reference"] == 1
        assert counts["safe_duplicate"] == 1
        assert not any(
            f["subject_path"] == str(active_legacy) and f["finding_type"] == "safe_duplicate"
            for f in manifest["findings"]
        )


# ---------------------------------------------------------------------------
# Report generator tests
# ---------------------------------------------------------------------------

class TestReportGenerators:
    def test_json_manifest_shape(self) -> None:
        findings = [
            classify(
                legacy_path="/some/path",
                legacy_exists=True,
                canonical_path="roots/security/firewall/firewall-audit.nft",
                canonical_exists=True,
                referrer_path=None,
                referrer_line=None,
                is_live_system_config=False,
                is_historical_source=False,
                is_canonical_file=False,
                has_active_consumers=False,
            )
        ]
        findings[0].id = "SMI-0001"
        manifest = generate_json_manifest(findings)

        assert "scan_id" in manifest
        assert "generated_at" in manifest
        assert manifest["scope"] == "security-migration"
        assert manifest["summary_counts"]["total"] == 1
        assert len(manifest["findings"]) == 1
        rec = manifest["findings"][0]
        assert rec["id"] == "SMI-0001"

    def test_markdown_report_structure(self) -> None:
        findings = [
            classify(
                legacy_path="/some/path",
                legacy_exists=False,
                canonical_path="roots/x",
                canonical_exists=True,
                referrer_path="skills/SKILL.md",
                referrer_line=10,
                is_live_system_config=False,
                is_historical_source=False,
                is_canonical_file=False,
                has_active_consumers=False,
            )
        ]
        findings[0].id = "SMI-0001"
        report = generate_markdown_report(findings)
        assert "# Security-Migration Stale Inventory Audit Report" in report
        assert "## Summary" in report
        assert "SMI-0001" in report

    def test_summary_counts_match_manifest(self) -> None:
        f1 = classify(
            legacy_path="/a", legacy_exists=True, canonical_path="c", canonical_exists=True,
            referrer_path="/etc/x", referrer_line=1, is_live_system_config=True,
            is_historical_source=False, is_canonical_file=False, has_active_consumers=True,
        )
        f2 = classify(
            legacy_path="/b", legacy_exists=True, canonical_path="d", canonical_exists=True,
            referrer_path="doc.md", referrer_line=5, is_live_system_config=False,
            is_historical_source=True, is_canonical_file=False, has_active_consumers=False,
        )
        f1.id = "SMI-0001"
        f2.id = "SMI-0002"
        counts = build_summary_counts([f1, f2])
        assert counts["total"] == 2
        assert counts["live_cutover_blocker"] == 1
        assert counts["historical_reference"] == 1
