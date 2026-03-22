"""
Pytest configuration and shared fixtures.

Fixtures are reusable test setup components that keep tests DRY.
"""

import pytest
from typing import Generator
from src import add


@pytest.fixture
def sample_numbers() -> tuple[int, int]:
    """Provide a standard pair of test numbers."""
    return (10, 20)


@pytest.fixture
def large_numbers() -> tuple[int, int]:
    """Provide large numbers for scale testing."""
    return (1000000, 2000000)


@pytest.fixture
def negative_numbers() -> tuple[int, int]:
    """Provide negative numbers for edge case testing."""
    return (-5, -10)


@pytest.fixture
def add_function():
    """Provide the add function under test."""
    return add


@pytest.fixture(autouse=True)
def reset_state() -> Generator[None, None, None]:
    """Reset any state before each test (cleanup pattern)."""
    # Setup: runs before each test
    yield
    # Teardown: runs after each test
    pass
