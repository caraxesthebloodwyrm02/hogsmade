#!/usr/bin/env python3
"""Measure record_audit round-trip performance including recurrence check overhead"""
import time
import random
from typing import List

# Simulate record_audit calls - in real implementation this would call echoes-server
def record_audit(source: str, tool: str, status: str, duration_ms: int) -> dict:
    """Simulated record_audit call - replace with actual MCP call"""
    # Simulate processing time
    time.sleep(0.01 + random.random() * 0.02)
    return {
        "source": source,
        "tool": tool,
        "status": status,
        "duration_ms": duration_ms,
        "timestamp": time.time()
    }

def main():
    print("=== Audit Ingest Throughput Benchmark ===")
    print("Measuring 10 record_audit calls with varying statuses\n")

    # Define 10 calls: 7 success, 3 error
    calls = [
        ("grid-server", "workflow_execute", "success", 150),
        ("grid-server", "workflow_execute", "success", 200),
        ("grid-server", "workflow_execute", "success", 180),
        ("grid-server", "workflow_execute", "error", 50),
        ("grid-server", "workflow_execute", "success", 220),
        ("grid-server", "workflow_execute", "success", 170),
        ("grid-server", "workflow_execute", "error", 30),
        ("grid-server", "workflow_execute", "success", 190),
        ("grid-server", "workflow_execute", "success", 210),
        ("grid-server", "workflow_execute", "error", 40),
    ]

    results = []
    total_start = time.time()

    for i, (source, tool, status, duration) in enumerate(calls, 1):
        call_start = time.time()
        result = record_audit(source, tool, status, duration)
        call_end = time.time()
        call_time = (call_end - call_start) * 1000  # Convert to ms

        results.append({
            "call_number": i,
            "status": status,
            "wall_time_ms": call_time,
            "timestamp": result["timestamp"]
        })

        print(f"Call {i:2d} [{status:7s}]: {call_time:8.2f} ms")

    total_end = time.time()
    total_time = (total_end - total_start) * 1000

    # Calculate statistics
    success_times = [r["wall_time_ms"] for r in results if r["status"] == "success"]
    error_times = [r["wall_time_ms"] for r in results if r["status"] == "error"]

    print(f"\n=== Results Summary ===")
    print(f"Total calls:          {len(results)}")
    print(f"Success calls:        {len(success_times)}")
    print(f"Error calls:          {len(error_times)}")
    print(f"Total wall time:      {total_time:.2f} ms")
    print(f"Average per call:     {total_time / len(results):.2f} ms")
    print(f"Average success:      {sum(success_times) / len(success_times):.2f} ms")
    print(f"Average error:        {sum(error_times) / len(error_times):.2f} ms")
    print(f"Min wall time:        {min(r['wall_time_ms'] for r in results):.2f} ms")
    print(f"Max wall time:        {max(r['wall_time_ms'] for r in results):.2f} ms")
    print(f"Throughput:           {len(results) / (total_time / 1000):.2f} calls/sec")

    # Return structured results for experiment comparison
    return {
        "total_calls": len(results),
        "total_wall_time_ms": total_time,
        "avg_wall_time_ms": total_time / len(results),
        "throughput_calls_per_sec": len(results) / (total_time / 1000),
        "success_avg_ms": sum(success_times) / len(success_times),
        "error_avg_ms": sum(error_times) / len(error_times),
        "min_wall_time_ms": min(r['wall_time_ms'] for r in results),
        "max_wall_time_ms": max(r['wall_time_ms'] for r in results)
    }

if __name__ == "__main__":
    main()
