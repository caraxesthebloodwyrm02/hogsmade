/**
 * Verify all fixes are working correctly
 * Run with: node scripts/verify-fixes.js
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

const projectRoot = process.cwd();

function checkFile(filePath, checks) {
  const fullPath = join(projectRoot, filePath);
  if (!existsSync(fullPath)) {
    console.log(`❌ File not found: ${filePath}`);
    return false;
  }

  const content = readFileSync(fullPath, "utf8");
  let allPassed = true;

  checks.forEach(({ name, test, expected }) => {
    const passed = test(content);
    console.log(`${passed ? "✅" : "❌"} ${filePath}: ${name}`);
    if (!passed && expected) {
      console.log(`   Expected: ${expected}`);
    }
    allPassed = allPassed && passed;
  });

  return allPassed;
}

function verifyFixes() {
  console.log("=== Verifying Glimpse Artifact Fixes ===\n");

  let allChecksPassed = true;

  // Check GateView.tsx fixes
  allChecksPassed &= checkFile("src/views/GateView.tsx", [
    {
      name: "Loading/data separation",
      test: (content) =>
        content.includes(
          "loading\n              ? Array.from({ length: 3 })",
        ) && content.includes(": verifications.map("),
      expected: "Should have separate loading and data paths",
    },
    {
      name: "No undefined data prop",
      test: (content) => !content.includes("data={loading ? undefined"),
      expected: "Should not pass undefined data when loading",
    },
  ]);

  // Check useGateData.ts fixes
  allChecksPassed &= checkFile("src/hooks/useGateData.ts", [
    {
      name: "Pre-generated mock data",
      test: (content) =>
        content.includes("generateMockVerifications") &&
        content.includes(
          "const MOCK_VERIFICATIONS = generateMockVerifications()",
        ),
      expected: "Should pre-generate mock data for consistency",
    },
    {
      name: "Reduced loading delay",
      test: (content) =>
        content.includes("setTimeout(() => {") && content.includes("}, 200);"),
      expected: "Should use 200ms delay instead of 600ms",
    },
  ]);

  // Check other hooks for reduced lag
  const hooks = [
    "src/hooks/useHealthData.ts",
    "src/hooks/useAuditStream.ts",
    "src/hooks/useExperiments.ts",
    "src/hooks/useFocusSession.ts",
  ];

  hooks.forEach((hook) => {
    allChecksPassed &= checkFile(hook, [
      {
        name: "Reduced loading delay",
        test: (content) => content.includes("}, 200);"),
        expected: "Should use 200ms delay",
      },
    ]);
  });

  // Check ScenarioCanvasView.tsx fixes
  allChecksPassed &= checkFile("src/views/ScenarioCanvasView.tsx", [
    {
      name: "useMemo imported",
      test: (content) =>
        content.includes("import {") && content.includes("useMemo"),
      expected: "Should import useMemo",
    },
    {
      name: "useRef for ID counter",
      test: (content) => content.includes("const idCounter = useRef(100)"),
      expected: "Should use useRef for ID counter",
    },
    {
      name: "Memoized filtering",
      test: (content) =>
        content.includes("const seedNodes = useMemo") &&
        content.includes("const glimpseNodes = useMemo"),
      expected: "Should memoize filtered nodes",
    },
    {
      name: "No module-level counter",
      test: (content) => !content.includes("let _idCounter = 100"),
      expected: "Should not have module-level counter",
    },
    {
      name: "Type annotations for nodes",
      test: (content) => content.includes("map((node: CanvasNode) =>"),
      expected: "Should have type annotations for node parameters",
    },
  ]);

  // Check documentation exists
  allChecksPassed &= checkFile("DEBUGGING.md", [
    {
      name: "Debugging guide exists",
      test: (content) => content.includes("Common Issues & Fixes"),
      expected: "Should have debugging documentation",
    },
  ]);

  allChecksPassed &= checkFile("FIXES_SUMMARY.md", [
    {
      name: "Fixes summary exists",
      test: (content) => content.includes("Issues Fixed"),
      expected: "Should have fixes summary",
    },
  ]);

  console.log("\n=== Verification Complete ===");
  console.log(
    allChecksPassed ? "\n✅ All checks passed!" : "\n❌ Some checks failed!",
  );

  return allChecksPassed;
}

// Run verification
verifyFixes();
