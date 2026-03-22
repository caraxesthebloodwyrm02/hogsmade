# Test Suite Structure for python-basics

This directory contains a complete pytest-based test suite for learning Python testing patterns.

## Directory Structure

```
tests/
├── __init__.py              # Package initialization with path setup
├── conftest.py              # Shared fixtures and pytest configuration
├── unit/                    # Fast, isolated unit tests
│   └── test_add.py         # Tests for the add() function
├── integration/             # Integration tests for use cases
│   └── test_use_cases.py   # Tests matching EXAMPLE.md scenarios
└── README.md               # This file
```

## How to Run Tests

### Run all tests
```bash
cd /home/caraxes/CascadeProjects/DIO/program/python-basics
pytest
```

### Run only unit tests
```bash
pytest tests/unit/
```

### Run only integration tests
```bash
pytest tests/integration/
```

### Run with verbose output
```bash
pytest -v
```

### Run a specific test file
```bash
pytest tests/unit/test_add.py
```

### Run a specific test class
```bash
pytest tests/unit/test_add.py::TestAddFunction
```

### Run a specific test method
```bash
pytest tests/unit/test_add.py::TestAddFunction::test_add_positive_numbers
```

## Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| **Unit** | `tests/unit/` | Fast tests for individual functions |
| **Integration** | `tests/integration/` | Tests for complete use case scenarios |
| **Fixtures** | `conftest.py` | Reusable test data and setup |

## Key Concepts Demonstrated

1. **Test Classes**: Group related tests using `class TestSomething:`
2. **Fixtures**: Reusable setup with `@pytest.fixture`
3. **Assertions**: Using `assert` for validation
4. **Type Hints**: Full typing in test functions
5. **Docstrings**: Every test has a descriptive docstring

## Fixtures Available

- `sample_numbers`: Returns `(10, 20)`
- `large_numbers`: Returns `(1000000, 2000000)`
- `negative_numbers`: Returns `(-5, -10)`
- `add_function`: Returns the add function

## Adding New Tests

1. Create a file in `tests/unit/` or `tests/integration/`
2. Name it `test_<something>.py`
3. Define test functions starting with `test_`
4. Use type hints and docstrings
5. Run with `pytest tests/unit/test_<something>.py -v`
