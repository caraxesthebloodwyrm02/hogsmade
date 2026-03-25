import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CycleSignal,
  CycleSnapshot,
  EvolutionCaseSummary,
  HandoffRecord,
  EndpointSpec,
  PromotionGateResult,
} from '@/components/phase4/types';

export interface EvolutionOpenInput {
  fixtureId: string;
  label: string;
  owner?: string;
}

export interface EvolutionEndpointInput {
  endpointId: string;
  label: string;
  owner?: string;
  contract?: string;
  status: EndpointSpec['status'];
  required: boolean;
  readiness?: number;
  notes?: string;
}

export interface EvolutionHandoffInput {
  from: string;
  to: string;
  status: HandoffRecord['status'];
  summary: string;
}

export interface UseEvolutionCycleResult {
  cases: EvolutionCaseSummary[];
  snapshot: CycleSnapshot | null;
  selectedCaseId: string | null;
  loading: boolean;
  error: string | null;
  loadCases: () => Promise<void>;
  selectCase: (caseId: string) => Promise<void>;
  openCase: (input: EvolutionOpenInput) => Promise<void>;
  recordSignal: (caseId: string, type: CycleSignal['type'], note?: string) => Promise<void>;
  recordHandoff: (caseId: string, input: EvolutionHandoffInput) => Promise<void>;
  upsertEndpoint: (caseId: string, input: EvolutionEndpointInput) => Promise<void>;
  advanceCase: (caseId: string, direction?: 'forward' | 'return', reason?: string) => Promise<void>;
  evaluatePromotion: (caseId: string) => Promise<PromotionGateResult | null>;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as unknown;
  if (!response.ok) {
    if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
      throw new Error(payload.error);
    }
    throw new Error(`Request failed (${response.status})`);
  }
  return payload as T;
}

export function useEvolutionCycle(): UseEvolutionCycleResult {
  const [cases, setCases] = useState<EvolutionCaseSummary[]>([]);
  const [snapshot, setSnapshot] = useState<CycleSnapshot | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCases = useCallback(async () => {
    const response = await fetch('/api/evolution/cases');
    const payload = await readJson<{ cases: EvolutionCaseSummary[] }>(response);
    setCases(payload.cases);
    return payload.cases;
  }, []);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextCases = await refreshCases();
      if (!selectedCaseId && nextCases[0]?.caseId) {
        const detail = await fetch(`/api/evolution/cases/${nextCases[0].caseId}`);
        const payload = await readJson<{ snapshot: CycleSnapshot }>(detail);
        setSnapshot(payload.snapshot);
        setSelectedCaseId(nextCases[0].caseId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load evolution cases');
    } finally {
      setLoading(false);
    }
  }, [refreshCases, selectedCaseId]);

  const selectCase = useCallback(async (caseId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/evolution/cases/${caseId}`);
      const payload = await readJson<{ snapshot: CycleSnapshot }>(response);
      setSnapshot(payload.snapshot);
      setSelectedCaseId(caseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cycle snapshot');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateFromMutation = useCallback(async (response: Response) => {
    const payload = await readJson<{ snapshot?: CycleSnapshot; gate?: PromotionGateResult }>(response);
    if (payload.snapshot) {
      setSnapshot(payload.snapshot);
      setSelectedCaseId(payload.snapshot.caseRecord.caseId);
    }
    await refreshCases();
    return payload.gate ?? null;
  }, [refreshCases]);

  const openCase = useCallback(async (input: EvolutionOpenInput) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/evolution/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureId: input.fixtureId,
          label: input.label,
          owner: input.owner,
          args: {
            governance: 1.2,
            usability: 1.1,
            integration: 1.2,
            observability: 1,
            operationalFit: 1,
            formTarget: 'all',
            tableScope: 'all',
          },
        }),
      });
      const payload = await readJson<{ snapshot: CycleSnapshot | null }>(response);
      if (payload.snapshot) {
        setSnapshot(payload.snapshot);
        setSelectedCaseId(payload.snapshot.caseRecord.caseId);
      }
      await refreshCases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open evolution case');
    } finally {
      setLoading(false);
    }
  }, [refreshCases]);

  const recordSignal = useCallback(async (caseId: string, type: CycleSignal['type'], note?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/evolution/cases/${caseId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, note }),
      });
      await updateFromMutation(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record cycle signal');
    } finally {
      setLoading(false);
    }
  }, [updateFromMutation]);

  const recordHandoffAction = useCallback(async (caseId: string, input: EvolutionHandoffInput) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/evolution/cases/${caseId}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await updateFromMutation(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record handoff');
    } finally {
      setLoading(false);
    }
  }, [updateFromMutation]);

  const upsertEndpointAction = useCallback(async (caseId: string, input: EvolutionEndpointInput) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/evolution/cases/${caseId}/endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      await updateFromMutation(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upsert endpoint');
    } finally {
      setLoading(false);
    }
  }, [updateFromMutation]);

  const advanceCase = useCallback(async (caseId: string, direction: 'forward' | 'return' = 'forward', reason?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/evolution/cases/${caseId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction, reason }),
      });
      await updateFromMutation(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance cycle');
    } finally {
      setLoading(false);
    }
  }, [updateFromMutation]);

  const evaluatePromotion = useCallback(async (caseId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/evolution/cases/${caseId}/promotion`, {
        method: 'POST',
      });
      return await updateFromMutation(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to evaluate promotion gate');
      return null;
    } finally {
      setLoading(false);
    }
  }, [updateFromMutation]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  return useMemo(() => ({
    cases,
    snapshot,
    selectedCaseId,
    loading,
    error,
    loadCases,
    selectCase,
    openCase,
    recordSignal,
    recordHandoff: recordHandoffAction,
    upsertEndpoint: upsertEndpointAction,
    advanceCase,
    evaluatePromotion,
  }), [
    advanceCase,
    cases,
    error,
    evaluatePromotion,
    loadCases,
    loading,
    openCase,
    recordHandoffAction,
    recordSignal,
    selectedCaseId,
    snapshot,
    selectCase,
    upsertEndpointAction,
  ]);
}
