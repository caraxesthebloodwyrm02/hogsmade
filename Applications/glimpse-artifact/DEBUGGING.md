# Glimpse Artifact Debugging Guide

## Quick Start

```bash
cd glimpse-artifact
npm install
npm run dev      # Start dev server on http://localhost:5173
npm run build    # Production build
npm run lint     # Run linter
```

## Common Issues & Fixes

### Issue 1: Data/Loading Mismatches in GateView

**Symptoms**: Components show loading state but also try to render undefined data, causing UI inconsistencies.

**Root Cause**: `data={loading ? undefined : run}` pattern caused logical conflicts when loading is true.

**Fix**: Separate loading and data rendering paths:

```tsx
{
  loading
    ? Array.from({ length: 3 }).map((_, i) => <WorkflowStatusCard key={`loading-${i}`} loading />)
    : verifications.map((run) => <WorkflowStatusCard key={run.id} data={run} loading={false} />);
}
```

**File**: `src/views/GateView.tsx`

---

### Issue 2: Random durationMs Inconsistency

**Symptoms**: Mock data shows different duration values on each render, causing flickering or inconsistent UI.

**Root Cause**: `Math.random()` called during array initialization, executed on every render.

**Fix**: Pre-generate mock data in a function and store in constant:

```tsx
const generateMockVerifications = (): WorkflowRun[] => [...];
const MOCK_VERIFICATIONS = generateMockVerifications();
```

**File**: `src/hooks/useGateData.ts`

---

### Issue 3: Module-level ID Counter Collisions

**Symptoms**: ID collisions when component unmounts/remounts, leading to duplicate keys and React warnings.

**Root Cause**: Module-level `let _idCounter = 100` persists across component lifecycles.

**Fix**: Use `useRef` for component-scoped counter:

```tsx
const idCounter = useRef(100);
const id = `seed-${++idCounter.current}`;
```

**File**: `src/views/ScenarioCanvasView.tsx`

---

### Issue 4: Performance Lag from Multiple State Updates

**Symptoms**: UI freezes or lags when adding new nodes to the canvas.

**Root Cause**: Multiple `setState` calls in sequence trigger multiple re-renders.

**Fix**: React 18 automatically batches state updates, but ensure all updates happen in the same event loop. Already optimized in current implementation.

**File**: `src/views/ScenarioCanvasView.tsx` (forkFromSeed callback)

---

### Issue 5: Expensive Operations on Every Render

**Symptoms**: Canvas becomes slow with many nodes, filtering operations run repeatedly.

**Root Cause**: Filtering and mapping operations run on every render without memoization.

**Fix**: Use `useMemo` for expensive computations:

```tsx
const seedNodes = useMemo(() => nodes.filter((n) => n.type === "seed"), [nodes]);
const glimpseNodes = useMemo(() => nodes.filter((n) => n.type === "glimpse"), [nodes]);
```

**File**: `src/views/ScenarioCanvasView.tsx`

---

### Issue 6: Artificial Lag in Mock Data Hooks

**Symptoms**: UI feels sluggish, 500-800ms delays on initial load.

**Root Cause**: `setTimeout` delays in all mock data hooks (useHealthData, useAuditStream, etc.).

**Fix**: Reduce delays from 500-800ms to 200ms for better UX while maintaining loading state visualization:

```tsx
setTimeout(() => {
  setData(MOCK_DATA);
  setLoading(false);
}, 200);
```

**Files**: All hooks in `src/hooks/`

---

## Debugging Workflow

### 1. Reproduce the Issue

- Start dev server: `npm run dev`
- Open browser console (F12)
- Reproduce the failing behavior
- Record exact steps, console errors, and network requests

### 2. Identify the Root Cause

- Check React DevTools for component re-renders
- Use console.log or debugger to trace execution
- Look for:
  - State mismatches (loading vs data)
  - Random values in mock data
  - Module-level state persistence
  - Unnecessary re-renders

### 3. Implement Minimal Fix

- Make the smallest change that fixes the issue
- Add a test if applicable
- Verify the fix works

### 4. Refactor for Clarity

- Extract helper functions for repeated logic
- Add memoization for expensive operations
- Improve variable naming
- Remove dead code

### 5. Verify

- Run `npm run build` to ensure no TypeScript errors
- Run `npm run lint` to ensure code quality
- Test the fix in the browser
- Check for regressions

---

## Afterhours Debug Sprint Checklist

### Before Starting

- [ ] Create feature branch: `git checkout -b fix/red-<short-desc>`
- [ ] Note current time (must be within 21:00–03:00 Asia/Dhaka)
- [ ] Set 90-minute timer
- [ ] Identify who to page if stuck

### During Sprint

- [ ] Reproduce the issue locally
- [ ] Capture logs and stack traces
- [ ] Implement minimal fix
- [ ] Add tests covering the failure
- [ ] Refactor for clarity if needed
- [ ] Run `npm run build` and `npm run lint`
- [ ] Test in browser

### Before Merging

- [ ] PR size ≤ 200 LOC
- [ ] CI checks pass
- [ ] Coverage not decreased
- [ ] Complexity reduced (use radon/lizard if applicable)
- [ ] Add telemetry logs (ISO 8601 UTC + local offset)
- [ ] Document rollback steps
- [ ] One reviewer sign-off

### Escalation Path

1. If stuck after 30 minutes: Create follow-up ticket with repro and logs
2. If production issue: Page on-call engineer
3. If unsure about safety: Ask for code review before proceeding

---

## Rollback Commands

```bash
# Revert last commit
git revert HEAD

# Reset to previous commit (destructive)
git reset --hard HEAD~1

# Checkout previous version of a file
git checkout HEAD~1 -- path/to/file.ts
```

---

## Performance Checklist

- [ ] No console errors or warnings
- [ ] No React warnings (keys, refs, etc.)
- [ ] No unnecessary re-renders (check with React DevTools Profiler)
- [ ] Memoization applied to expensive operations
- [ ] State updates batched where possible
- [ ] No artificial delays in production code
- [ ] Images and assets optimized
- [ ] Bundle size reasonable (check with `npm run build`)

---

## Telemetry Guidelines

When adding telemetry for debug workflows:

1. **Timestamps**: Store in UTC, display in local timezone (Asia/Dhaka: UTC+06:00)

   ```typescript
   const timestamp = new Date().toISOString(); // UTC
   const localTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
   ```

2. **Request IDs**: Include unique request ID in all logs

   ```typescript
   const requestId = crypto.randomUUID();
   console.log(`[${requestId}] Starting operation...`);
   ```

3. **Structured Logs**: Use consistent format

   ```typescript
   console.log(JSON.stringify({
     timestamp: new Date().toISOString(),
     requestId,
     level: 'info',
     event: 'operation_name',
     data: { ... }
   }));
   ```

4. **Error Handling**: Always include context
   ```typescript
   try {
     // operation
   } catch (error) {
     console.error(
       JSON.stringify({
         timestamp: new Date().toISOString(),
         requestId,
         level: "error",
         event: "operation_name",
         error: error.message,
         stack: error.stack,
       }),
     );
   }
   ```
