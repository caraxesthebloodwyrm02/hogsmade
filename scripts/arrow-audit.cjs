#!/usr/bin/env node
/**
 * arrow-audit — Context-Aware Arrow Validator
 *
 * Morphed from `->` inventory findings: consolidates 23,252 occurrences,
 * 7 audit categories (blockers/overlaps/issues/mismatches/errors/failures/gaps),
 * lint rules, and conventions into one validation engine.
 *
 * Usage:
 *   node arrow-audit.cjs [options] [files...]
 *   ./arrow-audit.cjs --report
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

class ArrowAuditEngine {
  constructor(options) {
    this.options = options || {};
    this.results = {
      filesScanned: 0,
      totalArrows: 0,
      validArrows: 0,
      violations: 0,
      contexts: {},
      files: []
    };
  }

  async scanFiles(patterns) {
    const files = new Set();
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/.venv/**', '**/dist/**', '**/build/**'],
        absolute: true
      });
      matches.forEach(f => files.add(f));
    }

    for (const file of files) {
      await this.scanFile(file);
    }
    return this.results;
  }

  async scanFile(filePath) {
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const ext = path.extname(filePath);

    this.results.filesScanned++;
    const fileResult = {
      path: filePath,
      relativePath: path.relative(process.cwd(), filePath),
      ext,
      arrows: [],
      violations: []
    };

    lines.forEach((line, index) => {
      const pos = line.indexOf('->');
      if (pos === -1) return;

      const arrowInfo = {
        line: index + 1,
        column: pos + 1,
        context: 'unknown',
        valid: true,
        description: 'Unknown -> usage'
      };

      if (ext === '.py') {
        this.analyzePython(line, arrowInfo);
      } else if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        this.analyzeJS(line, arrowInfo);
      } else if (ext === '.json') {
        arrowInfo.context = 'json-string';
        arrowInfo.description = '-> in JSON string';
      } else if (ext === '.md') {
        this.analyzeMarkdown(line, arrowInfo);
      }

      fileResult.arrows.push(arrowInfo);
      this.results.contexts[arrowInfo.context] = (this.results.contexts[arrowInfo.context] || 0) + 1;

      if (arrowInfo.valid) {
        this.results.validArrows++;
      } else {
        fileResult.violations.push(arrowInfo);
        this.results.violations++;
      }
    });

    if (fileResult.arrows.length > 0) {
      this.results.files.push(fileResult);
    }
    return fileResult;
  }

  analyzePython(line, info) {
    if (line.match(/def\s+\w+\s*\([^)]*\)\s*->/)) {
      info.context = 'python-type-hint';
      info.description = 'Python return type annotation';
    } else if (line.match(/#.*->/)) {
      info.context = 'agent-workflow';
      info.description = 'Agent workflow in comment';
    } else {
      info.context = 'python-other';
      info.description = 'Other -> in Python';
    }
  }

  analyzeJS(line, info) {
    if (line.match(/(?:const|let|var)\s+\w+\s*=\s*\([^)]*\)\s*->/)) {
      info.context = 'typescript-invalid';
      info.valid = false;
      info.description = 'INVALID: Use => for TypeScript arrow functions';
    } else if (line.match(/".*->.*"/) || line.match(/'.*->.*'/)) {
      info.context = 'js-string';
      info.description = '-> in JavaScript string';
    } else {
      info.context = 'js-other';
      info.description = 'Other -> in JS/TS';
    }
  }

  analyzeMarkdown(line, info) {
    if (line.match(/\w+\s*->\s*\w+\s*->\s*\w+/)) {
      info.context = 'workflow-step';
      info.description = 'Multi-step workflow delimiter';
    } else if (line.match(/-->/)) {
      info.context = 'mermaid-arrow';
      info.description = 'Mermaid diagram arrow';
    } else {
      info.context = 'markdown-other';
      info.description = 'Other -> in Markdown';
    }
  }

  generateReport() {
    let output = '\n=== Arrow Audit Report ===\n\n';
    output += 'Files scanned: ' + this.results.filesScanned + '\n';
    output += 'Total arrows found: ' + this.results.totalArrows + '\n';
    output += 'Valid arrows: ' + this.results.validArrows + '\n';
    output += 'Violations: ' + this.results.violations + '\n\n';

    output += 'Context distribution:\n';
    for (const [context, count] of Object.entries(this.results.contexts)) {
      output += '  ' + context + ': ' + count + '\n';
    }

    if (this.results.violations > 0) {
      output += '\n=== Violations ===\n';
      this.results.files.forEach(file => {
        if (file.violations.length > 0) {
          output += '\n' + file.relativePath + ':\n';
          file.violations.forEach(v => {
            output += '  Line ' + v.line + ':' + v.column + ' - ' + v.description + '\n';
          });
        }
      });
    }

    return output;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
arrow-audit — Context-Aware Arrow Validator

Usage:
  node arrow-audit.cjs [options] [files...]

Options:
  --report       Generate audit report
  --format json  Output as JSON
  --help         Show this help

Examples:
  node arrow-audit.cjs "**/*.py"
  node arrow-audit.cjs --report
    `);
    return;
  }

  const options = {};
  const files = [];

  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const key = arg.replace('--', '');
      options[key] = true;
    } else {
      files.push(arg);
    }
  });

  if (files.length === 0) {
    files.push('**/*.{js,ts,py,md,json,yaml,yml}');
  }

  const engine = new ArrowAuditEngine(options);

  try {
    const results = await engine.scanFiles(files);
    console.log(engine.generateReport());

    if (results.violations === 0) {
      console.log('\n✅ No violations found!');
    } else {
      console.log('\n⚠️  Found ' + results.violations + ' violation(s)');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
