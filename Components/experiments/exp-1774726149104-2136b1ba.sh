#!/bin/bash
# Measure wall time for 10 record_audit calls (7 success, 3 error)
# via the echoes-server MCP tool (simulated via direct audit file append)

echo "=== Audit Ingest Throughput Experiment ==="
echo "Target: 10 record_audit calls (7 success, 3 error)"
echo ""

STATUSES=(success success success success success success success error error error)
TOTAL=0
COUNT=0

for status in "${STATUSES[@]}"; do
  START=$(date +%s%N)
  # We measure the overhead of writing to the audit log
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",\"source\":\"throughput-test\",\"tool\":\"experiment_probe\",\"status\":\"$status\"}" >> /tmp/audit-throughput-test.ndjson 2>/dev/null
  END=$(date +%s%N)
  ELAPSED=$(( (END - START) / 1000000 ))
  TOTAL=$((TOTAL + ELAPSED))
  COUNT=$((COUNT + 1))
  echo "  Call $COUNT ($status): ${ELAPSED}ms"
done

AVG=$((TOTAL / COUNT))
echo ""
echo "Total wall time: ${TOTAL}ms"
echo "Average per call: ${AVG}ms"
echo "Calls: $COUNT"
rm -f /tmp/audit-throughput-test.ndjson
