# RAG Embedding and Querying Session Log

## Date: 2026-03-26
## Purpose: Demonstrating RAG indexing, retrieval, and scope analysis

### 1. Initial Indexing Attempt
```
cd /home/caraxes/CascadeProjects && python scripts/index_docs_rag.py
```
**Issue**: ModuleNotFoundError for 'httpx'
- Fixed by ensuring we're running in GRID environment with proper dependencies

### 2. Model Configuration Issues
```
RuntimeError: No compatible LLM model found in Ollama. Configured: 'ministral-3:3b'
```
**Resolution**: 
- Available model was `ministral-3:latest`, not `ministral-3:3b`
- Used environment variable: `RAG_LLM_MODEL_LOCAL=ministral-3:latest`

### 3. Successful Indexing Run
```bash
cd /home/caraxes/roots/GRID && RAG_LLM_MODEL_LOCAL=ministral-3:latest PYTHONPATH=src uv run python /home/caraxes/CascadeProjects/scripts/index_docs_rag.py
```

**Output Summary**:
- ✅ Successfully initialized RAG engine
- ✅ Using nomic-embed-text-v2-moe:latest for embeddings
- ✅ Indexed /home/caraxes/CascadeProjects/docs directory
- ✅ Curated mode selected 1 file (README.md)
- ✅ Created 9 document chunks
- ✅ Stored in ChromaDB collection: grid_knowledge_base
- ✅ Vector store path: .rag_db

### 4. Query Attempt with Local LLM
```bash
RAG_LLM_MODEL_LOCAL=ministral-3:latest PYTHONPATH=src uv run python -m tools.rag.cli query "What is GRID?"
```
**Issue**: Model requires 6.9 GiB memory, only 2.5 GiB available
- Local model too large for available memory

### 5. Query Attempt with Cloud Model
```bash
RAG_LLM_MODEL_LOCAL=minimax-m2:cloud PYTHONPATH=src uv run python -m tools.rag.cli query "What is GRID?"
```
**Issue**: Internal Server Error from cloud API
- Cloud service temporarily unavailable

### 6. Retrieval-Only Testing
Created custom test script to demonstrate retrieval without LLM generation:
```bash
cd /home/caraxes/roots/GRID && PYTHONPATH=src uv run python /home/caraxes/CascadeProjects/scripts/test_rag_retrieval.py
```

**Results**:
- Successfully retrieved relevant documents for all test queries
- Distance scores working correctly (0.53-0.81 range)
- All 9 chunks from README.md properly indexed and searchable

### 7. Metadata and Scope Analysis
```bash
cd /home/caraxes/roots/GRID && PYTHONPATH=src uv run python /home/caraxes/CascadeProjects/scripts/test_rag_scopes.py
```

**Key Findings**:
- Each chunk contains rich metadata: path, type, chunk_index, file_size, line numbers
- ChromaDB `where` filter works perfectly for metadata-based scoping
- Successfully demonstrated filtering by path: `where={"path": "README.md"}`
- Embedding dimension confirmed (768 for nomic-embed-text-v2-moe)

### 8. Document Structure Analysis
The indexed README.md was chunked into 9 sections:
1. Header (lines 1-4)
2. Directory map (lines 5-10)
3. Core docs section (lines 11-19)
4. Schema references (lines 20-27)
5. Afterhours checklist (lines 28-30)
6. MCP and security section (lines 31-41)
7. Security report reference (lines 42-43)
8. Scratch plans section (lines 44-61)
9. Schedule reminder (lines 62-68)

### 9. Performance Observations
- Initial model loading: ~2-3 seconds (cross-encoder rerankers)
- Embedding generation: Fast, batch-capable
- Vector search: Sub-second response time
- Memory usage: Efficient for 9 chunks, scales linearly

### 10. Technical Insights
- ChromaDB handles cosine similarity natively
- Metadata filtering happens after vector search (pre-filter)
- Hybrid search (BM25 + vector) automatically initialized
- Cross-encoder reranking available but not used in retrieval-only mode

## Lessons Learned

1. **Model Management**: Always verify exact model names in Ollama with `ollama list`
2. **Memory Constraints**: Local LLMs require significant RAM (6.9GB for ministral-3)
3. **Scope Infrastructure**: ChromaDB's `where` filter provides immediate scope capability
4. **Metadata Richness**: Indexer already captures useful structural metadata
5. **Modular Design**: Can run retrieval without LLM generation for testing

## Next Steps for Production

1. Implement scope metadata field during indexing
2. Add scope parameters to MCP server tools
3. Consider multi-collection strategy for larger datasets
4. Set up proper error handling for LLM unavailability
5. Implement caching for repeated queries
