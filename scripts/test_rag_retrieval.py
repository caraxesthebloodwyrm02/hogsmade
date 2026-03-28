#!/usr/bin/env python3
"""Simple RAG retrieval test without LLM generation."""

import os
import sys
from pathlib import Path

# Add GRID to path
grid_root = Path(__file__).parent.parent
sys.path.insert(0, str(grid_root / "src"))

from tools.rag.config import RAGConfig
from tools.rag.rag_engine import RAGEngine


def main():
    # Configure for local only
    os.environ["RAG_LLM_MODEL_LOCAL"] = "ministral-3:latest"
    os.environ["RAG_EMBEDDING_MODEL"] = "nomic-embed-text-v2-moe:latest"

    config = RAGConfig.from_env()
    config.ensure_local_only()

    print("🔧 Initializing RAG engine for retrieval test...")
    print(f"   Embedding model: {config.embedding_model}")
    print(f"   Vector store: {config.vector_store_path}")

    # Initialize engine (will fail on LLM but we just want retrieval)
    try:
        engine = RAGEngine(config=config)
    except RuntimeError as e:
        if "No compatible LLM model" in str(e):
            print("⚠️  LLM not available, but we can still test retrieval")
            # Create a minimal engine without LLM
            from tools.rag.embeddings.nomic_v2 import OllamaEmbeddingProvider
            from tools.rag.vector_store.chromadb_store import ChromaDBVectorStore

            embedding_provider = OllamaEmbeddingProvider(
                model=config.embedding_model,
                base_url=config.ollama_base_url
            )
            vector_store = ChromaDBVectorStore(
                collection_name=config.collection_name,
                persist_directory=config.vector_store_path
            )
            engine = type('Engine', (), {
                'embedding_provider': embedding_provider,
                'vector_store': vector_store,
                'config': config
            })()
        else:
            raise

    # Test queries
    queries = [
        "What is GRID?",
        "How does the RAG system work?",
        "What are MCP servers?",
        "Embedding scopes and collections"
    ]

    print("\n🔍 Testing retrieval:")
    print("=" * 60)

    for query in queries:
        print(f"\nQuery: {query}")
        try:
            # Generate embedding
            query_embedding = engine.embedding_provider.embed(query)

            # Search vector store
            results = engine.vector_store.query(
                query_embedding=query_embedding,
                n_results=3,
                include=["documents", "metadatas", "distances"]
            )

            docs = results.get("documents", [])
            metas = results.get("metadatas", [])
            dists = results.get("distances", [])

            if docs:
                print(f"  Found {len(docs)} results:")
                for i, (doc, meta, dist) in enumerate(zip(docs, metas, dists), 1):
                    path = meta.get("path", "Unknown")
                    print(f"    {i}. {path} (distance: {dist:.4f})")
                    print(f"       {doc[:100]}...")
            else:
                print("  No results found")

        except Exception as e:
            print(f"  Error: {e}")

    # Show vector store stats
    print("\n📊 Vector Store Stats:")
    print(f"   Collection: {config.collection_name}")
    print(f"   Document count: {engine.vector_store.count()}")

if __name__ == "__main__":
    main()
