# CodeMap Schema Usage Guide

## Overview

The CodeMap JSON schema provides a comprehensive structure for generating detailed codebase maps with exact file locations, lines of code (LOC), dependencies, and detailed metadata.

## Key Features

### 📍 **Exact Path Information**

- Full URI paths for all files and directories
- Precise file names with extensions
- Hierarchical directory structure
- Parent-child relationships

### 📊 **Detailed LOC Metrics**

- **Total lines**: All lines including comments and blanks
- **Code lines**: Actual executable code
- **Comment lines**: Documentation and inline comments
- **Blank lines**: Empty whitespace lines

### 🗂️ **File Classification**

- **Basename**: Name without extension
- **Extension**: Including the dot (`.js`, `.ts`, `.md`)
- **Language**: Detected programming language
- **Encoding**: File character encoding
- **Line endings**: LF, CRLF, or CR

### 🔍 **Code Structure Analysis**

- **Functions**: Name, type, parameters, complexity
- **Classes**: Inheritance, methods, properties
- **Imports/Exports**: Module dependencies
- **Complexity metrics**: Cyclomatic, cognitive, Halstead

### 📈 **Quality Metrics**

- **Maintainability index**: 0-100 scale
- **Technical debt**: Estimated in hours
- **Test coverage**: Lines, functions, branches
- **Dependency analysis**: Strength and circularity

## Example Usage

### Basic CodeMap Structure

```json
{
  "codeMap": {
    "metadata": {
      "generatedAt": "2026-03-15T22:45:00.000Z",
      "version": "1.0.0",
      "generator": "glimpse-codemap",
      "rootPath": "file:///c:/Users/USER/CascadeProjects/glimpse-engine",
      "totalFiles": 42,
      "totalLOC": 15420,
      "languages": [
        {
          "name": "JavaScript",
          "extension": ".js",
          "fileCount": 25,
          "loc": 8900,
          "percentage": 57.7
        },
        {
          "name": "TypeScript",
          "extension": ".ts",
          "fileCount": 12,
          "loc": 5200,
          "percentage": 33.7
        }
      ]
    },
    "directories": {
      "core": {
        "path": "file:///c:/Users/USER/CascadeProjects/glimpse-engine/core",
        "name": "core",
        "parent": "file:///c:/Users/USER/CascadeProjects/glimpse-engine",
        "depth": 1,
        "fileCount": 15,
        "subdirectoryCount": 0,
        "loc": 7500,
        "languages": ["JavaScript", "TypeScript"],
        "files": {
          "activity-tracker.js": {
            "path": "file:///c:/Users/USER/CascadeProjects/glimpse-engine/core/activity-tracker.js",
            "name": "activity-tracker.js",
            "basename": "activity-tracker",
            "extension": ".js",
            "language": "JavaScript",
            "directory": "file:///c:/Users/USER/CascadeProjects/glimpse-engine/core",
            "size": 8192,
            "loc": {
              "total": 292,
              "code": 210,
              "comment": 45,
              "blank": 37
            },
            "functions": [
              {
                "name": "recordSession",
                "type": "method",
                "line": 66,
                "lineEnd": 85,
                "parameters": [
                  {
                    "name": "sessionData",
                    "type": "object"
                  }
                ],
                "complexity": 3
              }
            ],
            "complexity": {
              "cyclomatic": 12,
              "cognitive": 8
            }
          }
        }
      }
    },
    "files": {
      "activity-tracker.js": {
        "$ref": "#/directories/core/files/activity-tracker.js"
      }
    }
  }
}
```

## Implementation Guidelines

### 1. **Path Generation**

```javascript
const path = require("path");

function generateFilePath(root, relativePath) {
  return `file://${path.resolve(root, relativePath)}`;
}

// Example:
// generateFilePath('/glimpse-engine', 'core/activity-tracker.js')
// Returns: "file:///c:/Users/USER/CascadeProjects/glimpse-engine/core/activity-tracker.js"
```

### 2. **LOC Calculation**

```javascript
function calculateLOC(content) {
  const lines = content.split("\n");
  return {
    total: lines.length,
    code: lines.filter(
      (line) => line.trim() && !line.trim().startsWith("//") && !line.trim().startsWith("*"),
    ).length,
    comment: lines.filter((line) => line.trim().startsWith("//") || line.trim().startsWith("*"))
      .length,
    blank: lines.filter((line) => !line.trim()).length,
  };
}
```

### 3. **File Extension Mapping**

```javascript
const LANGUAGE_MAP = {
  ".js": "JavaScript",
  ".ts": "TypeScript",
  ".jsx": "JavaScript",
  ".tsx": "TypeScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".json": "JSON",
  ".md": "Markdown",
  ".html": "HTML",
  ".css": "CSS",
  ".py": "Python",
  ".java": "Java",
  ".cpp": "C++",
  ".c": "C",
  ".rs": "Rust",
};
```

### 4. **Complexity Analysis**

```javascript
function calculateCyclomaticComplexity(functionCode) {
  let complexity = 1; // Base complexity

  // Count decision points
  const decisions = ["if", "else", "while", "for", "case", "catch", "&&", "||"];
  decisions.forEach((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "g");
    const matches = functionCode.match(regex);
    if (matches) complexity += matches.length;
  });

  return complexity;
}
```

## Validation

### Using JSON Schema Validator

```javascript
const Ajv = require("ajv");
const schema = require("./codemap-schema.json");

const ajv = new Ajv();
const validate = ajv.compile(schema);

function validateCodeMap(codeMap) {
  const valid = validate(codeMap);
  if (!valid) {
    console.error("Validation errors:", validate.errors);
    return false;
  }
  return true;
}
```

### Required Fields Checklist

- [ ] `metadata.generatedAt` (ISO 8601 timestamp)
- [ ] `metadata.rootPath` (file URI)
- [ ] `metadata.totalFiles` (integer)
- [ ] `metadata.totalLOC` (integer)
- [ ] Each file has `path`, `name`, `extension`, `directory`
- [ ] Each file has `loc` breakdown (total, code, comment, blank)
- [ ] Directory paths are valid URIs
- [ ] File extensions match language patterns

## Integration with Glimpse

### Activity Tracking Integration

```javascript
// In activity-tracker.js
function generateCodeMap() {
  const codeMap = {
    codeMap: {
      metadata: {
        generatedAt: new Date().toISOString(),
        version: "1.0.0",
        generator: "glimpse-activity-tracker",
        rootPath: `file://${process.cwd()}`,
        totalFiles: this.analyzedFiles,
        totalLOC: this.totalLOC,
      },
      // ... rest of structure
    },
  };

  // Track code map generation as activity
  this.recordSession({
    scenario: "codemap-generation",
    duration: Date.now() - startTime,
    recordCount: this.analyzedFiles,
    complexity: "moderate",
    status: "success",
  });

  return codeMap;
}
```

### Visual Feedback Integration

```javascript
// In visual-feedback.js
renderCodeMapView(codeMap) {
  const { metadata, directories, files } = codeMap.codeMap;

  openFrame('🗺️ CodeMap Analysis');

  section('Overview');
  kv('Total Files', metadata.totalFiles);
  kv('Total LOC', metadata.totalLOC);
  kv('Languages', metadata.languages.length);

  section('Largest Files');
  const sortedFiles = Object.values(files)
    .sort((a, b) => b.loc.total - a.loc.total)
    .slice(0, 10);

  sortedFiles.forEach(file => {
    kv(file.name, `${file.loc.total} LOC`);
  });
}
```

## Performance Considerations

### Large Codebases

- Use streaming for file reading
- Implement lazy evaluation for complex metrics
- Cache results for repeated analysis
- Consider parallel processing for independent files

### Memory Management

- Process directories depth-first to limit memory usage
- Use generators for large file lists
- Implement incremental updates for live monitoring

## Extensions

### Custom Metrics

```json
{
  "customMetrics": {
    "churnRate": 0.15,
    "hotspots": ["core/activity-tracker.js", "core/visual-feedback.js"],
    "technicalDebtRatio": 0.08,
    "documentationCoverage": 0.65
  }
}
```

### Integration Points

- **Git Integration**: Add commit history, blame information
- **CI/CD Integration**: Build metrics, test results
- **IDE Integration**: Real-time updates, navigation
- **Security Analysis**: Vulnerability scanning, dependency checks

This schema provides a comprehensive foundation for detailed codebase analysis and can be extended with additional metrics and integration points as needed.
