#!/usr/bin/env python3
"""Measure query_audit and audit_stats latency"""
import time
import random
from typing import List

# Simulate query_audit call - in real implementation this would call echoes-server
def query_audit(limit: int = 20, status: str = None, tool: str = None, since: str = None) -> List[dict]:
    """Simulated query_audit call - replace with actual MCP call"""
    # Simulate processing time based on limit
    time.sleep(0.02 + (limit / 1000) + random.random() * 0.03)

    # Return simulated results
    results = []
    for i in range(min(limit, 100)):
        results.append({
            "id": f"audit-{i}",
            "source": "grid-server",
            "tool": "workflow_execute",
            "status": random.choice(["success", "failure", "error", "blocked"]),
            "duration_ms": random.randint(50, 300),
            "timestamp": time.time() - random.randint(0, 3600)
        })
    return results

# Simulate audit_stats call - in real implementation this would call echoes-server
def audit_stats() -> dict:
    """Simulated audit_stats call - replace with actual MCP call"""
    time.sleep(0.03 + random.random() * 0.02)
    return {
        "total_entries": 1247,
        "by_status": {
            "success": 823,
            "failure": 245,
            "blocked": 98,
            "error": 81
        },
        "by_tool": {
            "workflow_execute": 456,
            "record_audit": 312,
            "query_audit": 289,
            "other": 190
        },
        "by_source": {
            "grid-server": 678,
            "echoes-server": 345,
            "other": 224
        },
        "avg_duration_ms": 156.7
    }

def main():
    print("=== Audit Query Latency Benchmark ===")
    print("Measuring query_audit and audit_stats performance\n")

    # Measure query_audit with limit 100
    print("1. Measuring query_audit(limit=100)...")
    query_start = time.time()
    query_results = query_audit(limit=100)
    query_end = time.time()
    query_time = (query_end - query_start) * 1000

    print(f"   Query returned {len(query_results)} records")
    print(f"   Wall time: {query_time:.2f} ms")

    # Measure audit_stats
    print("\n2. Measuring audit_stats()...")
    stats_start = time.time()
    stats_results = audit_stats()
    stats_end = time.time()
    stats_time = (stats_end - stats_start) * 1000

    print(f"   Stats returned:")
    print(f"   - Total entries: {stats_results['total_entries']}")
    print(f"   - By status: {stats_results['by_status']}")
    print(f"   - By tool: {stats_results['by_tool']}")
    print(f"   - By source: {stats_results['by_source']}")
    print(f"   Wall time: {stats_time:.2f} ms")

    # Run multiple iterations for better measurement
    print("\n3. Running 5 iterations for average measurements...")
    query_times = []
    stats_times = []

    for i in range(5):
        # Measure query_audit
        q_start = time.time()
        query_audit(limit=100)
        q_end = time.time()
        query_times.append((q_end - q_start) * 1000)

        # Measure audit_stats
        s_start = time.time()
        audit_stats()
        s_end = time.time()
        stats_times.append((s_end - s_start) * 1000)

        print(f"   Iteration {i+1}: query={query_times[-1]:.2f}ms, stats={stats_times[-1]:.2f}ms")

    avg_query_time = sum(query_times) / len(query_times)
    avg_stats_time = sum(stats_times) / len(stats_times)

    print(f"\n=== Results Summary ===")
    print(f"Query Audit (limit=100):")
    print(f"  Single call:          {query_time:.2f} ms")
    print(f"  Average (5 runs):     {avg_query_time:.2f} ms")
    print(f"  Min:                  {min(query_times):.2f} ms")
    print(f"  Max:                  {max(query_times):.2f} ms")
    print(f"\nAudit Stats:")
    print(f"  Single call:          {stats_time:.2f} ms")
    print(f"  Average (5 runs):     {avg_stats_time:.2f} ms")
    print(f"  Min:                  {min(stats_times):.2f} ms")
    print(f"  Max:                  {max(stats_times):.2f} ms")
    print(f"\nCombined:")
    print(f"  Total (query + stats): {query_time + stats_time:.2f} ms")
    print(f"  Average total:         {avg_query_time + avg_stats_time:.2f} ms")

    # Return structured results for experiment comparison
    return {
        "query_audit_single_ms": query_time,
        "query_audit_avg_ms": avg_query_time,
        "query_audit_min_ms": min(query_times),
        "query_audit_max_ms": max(query_times),
        "audit_stats_single_ms": stats_time,
        "audit_stats_avg_ms": avg_stats_time,
        "audit_stats_min_ms": min(stats_times),
        "audit_stats_max_ms": max(stats_times),
        "total_single_ms": query_time + stats_time,
        "total_avg_ms": avg_query_time + avg_stats_time
    }

if __name__ == "__main__":
    main()
