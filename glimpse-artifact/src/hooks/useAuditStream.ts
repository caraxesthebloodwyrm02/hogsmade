import { useState, useEffect } from 'react';
import type { AuditEvent } from '@/components/phase4/types';

interface UseAuditStreamResult {
  events: AuditEvent[];
  loading: boolean;
  error: string | null;
}

const MOCK_EVENTS: AuditEvent[] = [
  { id: '1', timestamp: new Date(Date.now() - 120000).toISOString(), tool: 'ecosystem_scan', source: 'seeds-server', status: 'success', durationMs: 342, summary: 'Scanned 8 repos, all healthy' },
  { id: '2', timestamp: new Date(Date.now() - 300000).toISOString(), tool: 'workflow_execute', source: 'afloat-server', status: 'success', durationMs: 1205, summary: 'Diagnostics workflow completed' },
  { id: '3', timestamp: new Date(Date.now() - 600000).toISOString(), tool: 'record_audit', source: 'echoes-server', status: 'success', durationMs: 45 },
  { id: '4', timestamp: new Date(Date.now() - 900000).toISOString(), tool: 'morning_briefing', source: 'pulse-server', status: 'success', durationMs: 890, summary: 'Generated daily briefing with 3 priorities' },
  { id: '5', timestamp: new Date(Date.now() - 1800000).toISOString(), tool: 'check_alerts', source: 'pulse-server', status: 'success', durationMs: 210, summary: 'No alerts found' },
  { id: '6', timestamp: new Date(Date.now() - 3600000).toISOString(), tool: 'workflow_execute', source: 'afloat-server', status: 'dry_run', durationMs: 150, summary: 'Dry run validated 4 steps' },
  { id: '7', timestamp: new Date(Date.now() - 7200000).toISOString(), tool: 'query_audit', source: 'echoes-server', status: 'success', durationMs: 78 },
  { id: '8', timestamp: new Date(Date.now() - 10800000).toISOString(), tool: 'focus_start', source: 'pulse-server', status: 'success', durationMs: 32, summary: 'Focus session started: Phase 4 components' },
  { id: '9', timestamp: new Date(Date.now() - 14400000).toISOString(), tool: 'ecosystem_scan', source: 'seeds-server', status: 'failure', durationMs: 5200, summary: 'Timeout scanning mcp-tool-experiment' },
  { id: '10', timestamp: new Date(Date.now() - 18000000).toISOString(), tool: 'workflow_execute', source: 'afloat-server', status: 'blocked', durationMs: 0, summary: 'Workflow blocked: missing dependency' },
];

export function useAuditStream(): UseAuditStreamResult {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, _setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setEvents(MOCK_EVENTS);
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  return { events, loading, error };
}
