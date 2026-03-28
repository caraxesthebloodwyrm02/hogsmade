#!/usr/bin/env python3
"""
Standalone RAG indexing script for CascadeProjects/docs.
Bypasses MCP server to index directly using GRID's RAG engine.
"""
import sys
from pathlib import Path

# Add GRID to path
grid_root = Path("/home/caraxes/roots/GRID")
sys.path.insert(0, str(grid_root / "src"))

from tools.rag import (  # noqa: E402 - must import after sys.path modification
    RAGConfig,
    RAGEngine,
)


def main():
    # Initialize RAG config from environment
    config = RAGConfig.from_env()
    config.ensure_local_only()

    print("🔧 Initializing RAG engine...")
    print(f"   Embedding model: {config.embedding_model}")
    print(f"   Vector store: {config.vector_store_path}")

    # Override models to ensure we have what we need
    config.embedding_model = "nomic-embed-text-v2-moe:latest"
    config.llm_model = "ministral-3:latest"

    # Initialize engine
    engine = RAGEngine(config=config)

    # Index the docs directory
    docs_path = "/home/caraxes/CascadeProjects/docs"
    print(f"\n🔍 Indexing: {docs_path}")
    print("   Mode: curated (high-quality files only)")

    # Use curated file set
    try:
        from tools.rag.cli import _build_curated_files
        files = _build_curated_files(docs_path)
        print(f"   Files selected: {len(files)}")
    except ImportError:
        print("   ⚠️ Curated mode not available, using full scan")
        files = None

    # Perform indexing
    engine.index(repo_path=docs_path, rebuild=False, files=files, quiet=False)

    # Get stats
    stats = engine.get_stats()
    print("\n✅ Indexing complete!")
    print("\n📊 Knowledge Base Stats:")
    print(f"   Documents: {stats.get('document_count', 0)}")
    print(f"   Chunks: {stats.get('chunk_count', 0)}")
    print(f"   Collections: {stats.get('collection_count', 0)}")

if __name__ == "__main__":
    main()
