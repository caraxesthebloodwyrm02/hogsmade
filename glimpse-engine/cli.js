#!/usr/bin/env node
// cli.js — glimpse tool entry point
// Usage:
//   glimpse <scenario>              Run a built-in scenario
//   glimpse run <file>              Run against your own data
//   glimpse list                    List available scenarios
//   glimpse help                    Show help
//
// Flags:
//   --interview                     Trigger calibration interview
//   --json                          Output raw JSON
//   --quiet                         Minimal output (just the signal)
//   --brief                         Skip patterns and deep engine details

import { readFileSync } from 'fs';
import { runGlimpse, autoConfig } from './core/runner.js';
import { getScenario, listScenarios } from './core/scenarios.js';
import { parseCSV } from './core/engine.js';
import * as display from './core/display.js';

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

const args = process.argv.slice(2);
const flags = {
  interview: args.includes('--interview'),
  json: args.includes('--json'),
  quiet: args.includes('--quiet'),
  brief: args.includes('--brief'),
  help: args.includes('--help') || args.includes('-h'),
};
const positional = args.filter(a => !a.startsWith('--') && !a.startsWith('-'));
const command = positional[0] || 'help';
const target = positional[1] || null;

// ============================================================================
// COMMANDS
// ============================================================================

function showHelp() {
  console.log(`
  glimpse — decision support, visualized

  Usage:
    glimpse <scenario>           Run a built-in scenario
    glimpse run <file.json|csv>  Analyze your own data
    glimpse list                 List available scenarios
    glimpse help                 Show this help

  Scenarios:
    standup      Daily team snapshot
    energy       Personal energy/wellness map
    portfolio    Project health review
    lending      Personal financial decision
    recommend    What to work on next

  Flags:
    --interview  Trigger calibration interview
    --json       Output raw JSON instead of formatted
    --quiet      Minimal output
    --brief      Skip deep engine details

  Examples:
    glimpse standup
    glimpse lending --interview
    glimpse run my-tasks.json
    glimpse run data.csv --brief
`);
}

function showList() {
  const scenarios = listScenarios();
  display.openFrame('GLIMPSE — Available Scenarios');
  scenarios.forEach(s => {
    display.row(display.icon(s.category === 'personal' ? 'contemplative' : 'focused'), s.id, s.description, { padLabel: 14 });
  });
  display.close();
}

async function runScenario(id) {
  const scenario = getScenario(id);
  if (!scenario) {
    console.error(`  Unknown scenario: "${id}". Run 'glimpse list' to see available scenarios.`);
    process.exit(1);
  }

  const session = runGlimpse({
    data: scenario.data,
    format: 'json',
    config: scenario.config,
    meta: scenario.meta,
    opts: {
      interview: flags.interview
    }
  });

  if (flags.json) {
    console.log(JSON.stringify(session, null, 2));
    return;
  }

  // Scenario-specific display
  scenario.display(session);

  // Standard engine + session footer
  display.engineSummary(session.result, { quiet: flags.quiet, brief: flags.brief });
  display.sessionRecap(session.recap, { quiet: flags.quiet });
  display.calibrationNotice(session.calibration, { quiet: flags.quiet });

  // Interview display
  if (session.interview?.questions?.length > 0 && !session.interview.result) {
    display.gap();
    display.section('Calibration Interview');
    session.interview.questions.forEach((q, i) => {
      display.interviewQuestion(q, i + 1);
    });
    console.log('\n  To score: provide answers as --answers A,B,C,...');
  }

  if (session.interview?.result) {
    display.interviewResult(session.interview.result);
  }

  display.close();
}

async function runFile(filePath) {
  if (!filePath) {
    console.error('  Usage: glimpse run <file.json|file.csv>');
    process.exit(1);
  }

  let raw;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (e) {
    console.error(`  Could not read file: ${filePath}`);
    process.exit(1);
  }

  // Detect format
  const isCSV = filePath.endsWith('.csv') || (!filePath.endsWith('.json') && !raw.trim().startsWith('['));
  let data;
  let format;

  if (isCSV) {
    data = parseCSV(raw);
    format = 'csv';
  } else {
    try {
      data = JSON.parse(raw);
      if (!Array.isArray(data)) data = [data];
      format = 'json';
    } catch (e) {
      console.error(`  Could not parse file as JSON: ${e.message}`);
      process.exit(1);
    }
  }

  // Auto-detect config
  const config = autoConfig(data);
  const genericScenario = getScenario('generic');

  const session = runGlimpse({
    data,
    format,
    config,
    meta: { source: filePath, trigger: 'manual' },
    opts: {
      interview: flags.interview
    }
  });

  if (flags.json) {
    console.log(JSON.stringify(session, null, 2));
    return;
  }

  // Generic display
  genericScenario.display(session);

  // Standard footer
  display.engineSummary(session.result, { quiet: flags.quiet, brief: flags.brief });
  display.sessionRecap(session.recap, { quiet: flags.quiet });
  display.calibrationNotice(session.calibration, { quiet: flags.quiet });

  if (session.interview?.questions?.length > 0 && !session.interview.result) {
    display.gap();
    display.section('Calibration Interview');
    session.interview.questions.forEach((q, i) => {
      display.interviewQuestion(q, i + 1);
    });
  }

  display.close();
}

// ============================================================================
// DISPATCH
// ============================================================================

async function main() {
  if (flags.help || command === 'help') {
    showHelp();
  } else if (command === 'list') {
    showList();
  } else if (command === 'run') {
    await runFile(target);
  } else {
    // Treat as scenario name
    await runScenario(command);
  }
}

main().catch(err => {
  console.error(`  Error: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
