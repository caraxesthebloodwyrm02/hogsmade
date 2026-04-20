"""Tests for the runner and manifest generation."""

import json
from pathlib import Path

from harness.grid import generate_manifest
from harness.instrument import instrument_manifest
from harness.manifest import render_manifest_markdown, write_manifest, write_manifest_json
from harness.models import PipelineConfig
from harness.runner import SYNTHETIC_CONTEXT, build_config_from_gate


class TestSyntheticContext:
    def test_context_has_agent_a(self):
        assert "agent_a" in SYNTHETIC_CONTEXT

    def test_context_has_agent_b(self):
        assert "agent_b" in SYNTHETIC_CONTEXT

    def test_context_has_ecosystem_state(self):
        assert "ecosystem_state" in SYNTHETIC_CONTEXT

    def test_agent_a_has_session(self):
        assert "session" in SYNTHETIC_CONTEXT["agent_a"]

    def test_agent_b_work_product(self):
        assert "work_product" in SYNTHETIC_CONTEXT["agent_b"]
        assert "mcq_page" in SYNTHETIC_CONTEXT["agent_b"]["work_product"]


class TestBuildConfig:
    def test_config_builds(self):
        config = build_config_from_gate()
        assert isinstance(config, PipelineConfig)
        assert config.gate_dir == "/home/caraxes/CascadeProjects/Projects/GATE"

    def test_config_picks_up_envelope(self):
        config = build_config_from_gate()
        # If the envelope exists, it should be populated
        if config.envelope_id:
            assert config.nonce is not None


class TestManifestMarkdown:
    def test_render_produces_markdown(self):
        manifest = generate_manifest(synthetic_context=SYNTHETIC_CONTEXT)
        instrument_manifest(manifest)
        md = render_manifest_markdown(manifest)
        assert "# Deployment Harness Manifest" in md
        assert "136" in md

    def test_render_includes_quantization_table(self):
        manifest = generate_manifest()
        md = render_manifest_markdown(manifest)
        assert "Quantization Profile" in md
        assert "Buildup" in md
        assert "Silence" in md
        assert "Drop" in md

    def test_render_includes_grid_map(self):
        manifest = generate_manifest()
        md = render_manifest_markdown(manifest)
        assert "Grid Map" in md
        assert "Legend" in md

    def test_render_includes_step_sequence(self):
        manifest = generate_manifest()
        md = render_manifest_markdown(manifest)
        assert "Step Sequence" in md

    def test_render_includes_io_instrumentation(self):
        manifest = generate_manifest()
        instrument_manifest(manifest)
        md = render_manifest_markdown(manifest)
        assert "IO Instrumentation" in md
        assert "Transistor Hooks" in md
        assert "Decorated Variables" in md

    def test_render_includes_ambient_env(self):
        manifest = generate_manifest()
        md = render_manifest_markdown(manifest)
        assert "HARNESS_ACTIVE" in md

    def test_render_includes_synthetic_context(self):
        manifest = generate_manifest(synthetic_context={"test": "value"})
        md = render_manifest_markdown(manifest)
        assert "Synthetic Context" in md


class TestManifestWrite:
    def test_write_markdown(self, tmp_path: Path):
        manifest = generate_manifest()
        instrument_manifest(manifest)
        path = write_manifest(manifest, output_dir=str(tmp_path))
        assert path.exists()
        assert path.suffix == ".md"
        content = path.read_text()
        assert "Deployment Harness Manifest" in content

    def test_write_json(self, tmp_path: Path):
        manifest = generate_manifest()
        instrument_manifest(manifest)
        path = write_manifest_json(manifest, output_dir=str(tmp_path))
        assert path.exists()
        assert path.suffix == ".json"
        data = json.loads(path.read_text())
        assert data["version"] == "0.1.0"
        assert len(data["cycles"]) == 2

    def test_json_roundtrip(self, tmp_path: Path):
        """Manifest should survive JSON serialization roundtrip."""
        manifest = generate_manifest(synthetic_context=SYNTHETIC_CONTEXT)
        instrument_manifest(manifest)
        path = write_manifest_json(manifest, output_dir=str(tmp_path))
        data = json.loads(path.read_text())
        assert data["total_steps"] == 136
        assert len(data["cycles"][0]["steps"]) == 68
        assert len(data["cycles"][1]["steps"]) == 68
