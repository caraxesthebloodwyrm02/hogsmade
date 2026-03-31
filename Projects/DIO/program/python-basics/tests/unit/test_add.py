"""
Unit tests for the add function and arithmetic utilities.

These tests are fast, isolated, and test one thing at a time.
"""

from src import add


class TestAddFunction:
    """Test cases for the add() function."""

    def test_add_positive_numbers(self) -> None:
        """Should correctly add two positive integers."""
        result = add(2, 3)
        assert result == 5

    def test_add_with_zero(self) -> None:
        """Should return the other number when adding zero."""
        assert add(5, 0) == 5
        assert add(0, 5) == 5

    def test_add_negative_numbers(self) -> None:
        """Should correctly add negative integers."""
        assert add(-2, -3) == -5
        assert add(-5, 3) == -2

    def test_add_large_numbers(self) -> None:
        """Should handle large integer values."""
        assert add(1000000, 2000000) == 3000000

    def test_add_commutative_property(self) -> None:
        """Should be commutative: a + b = b + a."""
        a, b = 7, 13
        assert add(a, b) == add(b, a)


class TestAddTypeHints:
    """Tests verifying type hint behavior (runtime contracts)."""

    def test_add_returns_int(self) -> None:
        """Should return an integer type."""
        result = add(1, 2)
        assert isinstance(result, int)

    def test_add_accepts_int_only(self) -> None:
        """Should work with integer inputs."""
        # Python type hints are not enforced at runtime
        # This tests that the function works with the intended types
        result = add(int("5"), int("3"))  # Casting strings to int
        assert result == 8


class TestAddEdgeCases:
    """Edge case and boundary tests."""

    def test_add_same_number(self) -> None:
        """Should correctly add a number to itself."""
        assert add(5, 5) == 10

    def test_add_result_is_even(self) -> None:
        """Adding two odd numbers should give an even result."""
        result = add(3, 5)
        assert result % 2 == 0
