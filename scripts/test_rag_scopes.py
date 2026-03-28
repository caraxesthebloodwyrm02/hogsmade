#!/usr/bin/env python3
"""RAG retrieval test showing metadata and demonstrating scope potential."""

import os
import sys
from pathlib import Path

# Add GRID to path
grid_root = Path(__file__).parent.parent
sys.path.insert(0, str(grid_root / "src"))

from tools.rag.config import RAGConfig
from tools.rag.embeddings.nomic_v2 import OllamaEmbeddingProvider
from tools.rag.vector_store.chromadb_store import ChromaDBVectorStore


def main():
    # Configure for local only
    os.environ["RAG_EMBEDDING_MODEL"] = "nomic-embed-text-v2-moe:latest"

    config = RAGConfig.from_env()
    config.ensure_local_only()

    print("🔧 RAG Metadata & Scope Demo")
    print("=" * 60)
    print(f"   Collection: {config.collection_name}")
    print(f"   Vector store: {config.vector_store_path}")

    # Initialize components
    embedding_provider = OllamaEmbeddingProvider(
        model=config.embedding_model,
        base_url=config.ollama_base_url
    )
    vector_store = ChromaDBVectorStore(
        collection_name=config.collection_name,
        persist_directory=config.vector_store_path
    )

    # Show all documents with metadata
    print("\n📚 All Documents in Collection:")
    print("-" * 60)

    try:
        # Get all documents
        all_docs = vector_store.collection.get(include=["documents", "metadatas"])

        for i, (doc_id, document, metadata) in enumerate(zip(
            all_docs["ids"],
            all_docs["documents"],
            all_docs["metadatas"]
        ), 1):
            print(f"\n{i}. ID: {doc_id}")
            print(f"   Path: {metadata.get('path', 'N/A')}")
            print(f"   Type: {metadata.get('type', 'N/A')}")
            print(f"   Chunk index: {metadata.get('chunk_index', 'N/A')}")
            if 'file_size' in metadata:
                print(f"   File size: {metadata['file_size']} bytes")
            if 'start_line' in metadata:
                print(f"   Lines: {metadata['start_line']}-{metadata.get('end_line', '?')}")
            print(f"   Preview: {document[:100].replace(chr(10), ' ')}...")

    except Exception as e:
        print(f"Error fetching documents: {e}")

    # Demonstrate metadata filtering (scope-like behavior)
    print("\n\n🔍 Metadata Filtering Demo (Scope-like behavior):")
    print("-" * 60)

    query = "MCP servers"
    print(f"\nQuery: '{query}'")
    query_embedding = embedding_provider.embed(query)

    # 1. Search without filter
    print("\n1. All results (no filter):")
    results = vector_store.query(
        query_embedding=query_embedding,
        n_results=5,
        include=["documents", "metadatas", "distances"]
    )

    for doc, meta, dist in zip(
        results["documents"][:3],
        results["metadatas"][:3],
        results["distances"][:3]
    ):
        print(f"   - {meta.get('path', 'Unknown')} (dist: {dist:.4f})")

    # 2. Search with path filter (simulating a scope)
    print("\n2. Filtered to README.md only (simulating scope):")
    results_filtered = vector_store.query(
        query_embedding=query_embedding,
        n_results=5,
        where={"path": "README.md"},  # This is how scopes would work!
        include=["documents", "metadatas", "distances"]
    )

    if results_filtered["documents"]:
        for doc, meta, dist in zip(
            results_filtered["documents"],
            results_filtered["metadatas"],
            results_filtered["distances"]
        ):
            print(f"   - {meta.get('path', 'Unknown')} (dist: {dist:.4f})")
            print(f"     {doc[:100]}...")
    else:
        print("   No results found with this filter")

    # Show how scopes could be organized
    print("\n\n💡 Scope Design Opportunities:")
    print("-" * 60)
    print("Current metadata fields that could be used for scoping:")
    print("  • path - file path (natural for directory-based scopes)")
    print("  • type - chunk type (code_block, text, etc.)")
    print("  • Custom 'scope' field could be added during indexing")
    print("\nPossible scope strategies:")
    print("  1. Metadata-based: Add 'scope' field, use where={scope:'docs'}")
    print("  2. Collection-based: Separate collections per scope")
    print("  3. Hybrid: Collections for major domains, metadata for sub-scopes")

    # Collection stats
    print("\n📊 Collection Stats:")
    print(f"   Total documents: {vector_store.count()}")
    print(f"   Embedding dimension: {vector_store.get_dimension() or 'Unknown'}")

if __name__ == "__main__":
    main()
