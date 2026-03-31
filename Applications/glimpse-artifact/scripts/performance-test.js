/**
 * Performance test for Glimpse Artifact components
 * Run with: node scripts/performance-test.js
 */

import { performance } from "perf_hooks";

// Simulate component render performance
function testFilteringPerformance() {
  console.log("Testing filtering performance with various node counts...");

  // Create test data
  const nodeCounts = [10, 50, 100, 500, 1000];

  nodeCounts.forEach((count) => {
    // Generate test nodes
    const nodes = [];
    for (let i = 0; i < count; i++) {
      nodes.push({
        type: i % 2 === 0 ? "seed" : "glimpse",
        id: `node-${i}`,
        x: Math.random() * 1000,
        y: Math.random() * 1000,
      });
    }

    // Test filtering without memoization (old way)
    const start1 = performance.now();
    for (let i = 0; i < 100; i++) {
      const seedNodes = nodes.filter((n) => n.type === "seed");
      const glimpseNodes = nodes.filter((n) => n.type === "glimpse");
    }
    const end1 = performance.now();

    // Test with memoization simulation (new way - cached result)
    const start2 = performance.now();
    let cachedSeedNodes, cachedGlimpseNodes;
    for (let i = 0; i < 100; i++) {
      if (i === 0) {
        cachedSeedNodes = nodes.filter((n) => n.type === "seed");
        cachedGlimpseNodes = nodes.filter((n) => n.type === "glimpse");
      }
      // Use cached values
    }
    const end2 = performance.now();

    console.log(`Nodes: ${count}`);
    console.log(`  Without memoization: ${(end1 - start1).toFixed(2)}ms`);
    console.log(`  With memoization: ${(end2 - start2).toFixed(2)}ms`);
    console.log(
      `  Improvement: ${((end1 - start1) / (end2 - start2)).toFixed(2)}x faster`,
    );
    console.log("");
  });
}

// Test mock data generation consistency
function testMockDataConsistency() {
  console.log("Testing mock data consistency...");

  // Simulate old random approach
  const generateOldWay = () => ({
    id: `test-${Math.floor(Math.random() * 1000)}`,
    durationMs: Math.floor(Math.random() * 500) + 50,
  });

  // Simulate new pre-generated approach
  const mockData = Array.from({ length: 10 }, (_, i) => ({
    id: `test-${i}`,
    durationMs: Math.floor(Math.random() * 500) + 50,
  }));
  const generateNewWay = () =>
    mockData[Math.floor(Math.random() * mockData.length)];

  // Test consistency
  const oldResults = Array.from({ length: 5 }, generateOldWay);
  const newResults = Array.from({ length: 5 }, generateNewWay);

  console.log("Old approach (random each time):");
  oldResults.forEach((r, i) => console.log(`  ${i + 1}: ${JSON.stringify(r)}`));

  console.log("New approach (pre-generated):");
  newResults.forEach((r, i) => console.log(`  ${i + 1}: ${JSON.stringify(r)}`));

  const oldUnique = new Set(oldResults.map((r) => r.id)).size;
  const newUnique = new Set(newResults.map((r) => r.id)).size;

  console.log(`Unique IDs - Old: ${oldUnique}, New: ${newUnique}`);
  console.log("");
}

// Test ID counter behavior
function testIdCounterBehavior() {
  console.log("Testing ID counter behavior...");

  // Simulate module-level counter (old way)
  let moduleCounter = 100;
  const oldNextId = (prefix) => `${prefix}-${++moduleCounter}`;

  // Simulate useRef counter (new way)
  const useRefCounter = () => {
    let counter = { current: 100 };
    return {
      nextId: (prefix) => `${prefix}-${++counter.current}`,
      reset: () => {
        counter.current = 100;
      },
    };
  };

  // Test old behavior across "remounts"
  console.log("Old module-level counter:");
  console.log(`  First mount: ${oldNextId("seed")}`);
  console.log(`  Second mount: ${oldNextId("seed")}`); // Continues counting

  // Test new behavior with reset on "remount"
  const counter1 = useRefCounter();
  console.log("New useRef counter:");
  console.log(`  First mount: ${counter1.nextId("seed")}`);
  const counter2 = useRefCounter(); // New component instance
  console.log(`  Second mount: ${counter2.nextId("seed")}`); // Starts fresh
  console.log("");
}

// Run all tests
console.log("=== Glimpse Artifact Performance Tests ===\n");
testFilteringPerformance();
testMockDataConsistency();
testIdCounterBehavior();
console.log("=== Tests Complete ===");
