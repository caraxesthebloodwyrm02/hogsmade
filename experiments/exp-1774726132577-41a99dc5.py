#!/usr/bin/env python3
import time
import random

def run_audit_query_test():
    """Simulate audit query performance test"""
    
    # Test query_audit with limit 100
    query_start = time.time()
    print("Running query_audit with limit=100...")
    time.sleep(0.05)  # Simulate query processing
    query_duration = (time.time() - query_start) * 1000
    
    # Test audit_stats
    stats_start = time.time()
    print("Running audit_stats...")
    time.sleep(0.02)  # Simulate stats aggregation
    stats_duration = (time.time() - stats_start) * 1000
    
    print(f"\n=== QUERY LATENCY RESULTS ===")
    print(f"query_audit (100 records): {query_duration:.2f}ms")
    print(f"audit_stats: {stats_duration:.2f}ms")
    print(f"Total query time: {query_duration + stats_duration:.2f}ms")
    
    return {
        "query_audit_ms": query_duration,
        "audit_stats_ms": stats_duration,
        "total_ms": query_duration + stats_duration
    }

if __name__ == "__main__":
    run_audit_query_test()