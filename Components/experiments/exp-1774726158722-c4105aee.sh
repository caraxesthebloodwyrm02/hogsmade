#!/bin/bash
# Measure read latency against the echoes audit log
echo "=== Audit Query Latency Experiment ==="

AUDIT_FILE="$HOME/.echoes/audit.ndjson"

if [ ! -f "$AUDIT_FILE" ]; then
  echo "ERROR: Audit file not found at $AUDIT_FILE"
  exit 1
fi

LINES=$(wc -l < "$AUDIT_FILE")
echo "Audit log size: $LINES entries"
echo ""

# Simulate query_audit limit 100 (tail + parse)
echo "--- query_audit (limit 100) ---"
START=$(date +%s%N)
tail -100 "$AUDIT_FILE" | python3 -c "import sys,json; entries=[json.loads(l) for l in sys.stdin]; print(f'Parsed {len(entries)} entries')" 2>/dev/null
END=$(date +%s%N)
QUERY_MS=$(( (END - START) / 1000000 ))
echo "Latency: ${QUERY_MS}ms"
echo ""

# Simulate audit_stats (full scan + aggregate)
echo "--- audit_stats (full scan) ---"
START=$(date +%s%N)
python3 -c "
import sys, json
from collections import Counter
entries = []
for line in open('$AUDIT_FILE'):
    try:
        entries.append(json.loads(line.strip()))
    except:
        pass
by_status = Counter(e.get('status','?') for e in entries)
by_tool = Counter(e.get('tool','?') for e in entries)
print(f'Total: {len(entries)}')
print(f'By status: {dict(by_status)}')
print(f'Unique tools: {len(by_tool)}')
" 2>/dev/null
END=$(date +%s%N)
STATS_MS=$(( (END - START) / 1000000 ))
echo "Latency: ${STATS_MS}ms"
echo ""

echo "=== Summary ==="
echo "query_audit (100): ${QUERY_MS}ms"
echo "audit_stats (full): ${STATS_MS}ms"
TOTAL=$((QUERY_MS + STATS_MS))
echo "Combined: ${TOTAL}ms"
