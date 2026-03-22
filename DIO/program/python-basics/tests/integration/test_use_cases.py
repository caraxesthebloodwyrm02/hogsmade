"""
Integration tests for real-world use cases.

These tests verify that the add function works correctly in complete scenarios.
"""

from src import add


class TestBasicCalculatorUseCase:
    """Test Use Case 1: Basic Calculator."""

    def test_calculate_total_cost(self) -> None:
        """Should calculate total cost for everyday math."""
        total = add(15, 25)
        assert total == 40


class TestScoreTrackingUseCase:
    """Test Use Case 2: Score Tracking."""

    def test_calculate_final_score(self) -> None:
        """Should accumulate bonus points to current score."""
        current_score = 85
        bonus_points = 10
        final_score = add(current_score, bonus_points)
        assert final_score == 95


class TestInventoryManagementUseCase:
    """Test Use Case 3: Inventory Management."""

    def test_calculate_total_inventory(self) -> None:
        """Should add new shipment to existing stock."""
        existing_stock = 120
        new_shipment = 45
        total_inventory = add(existing_stock, new_shipment)
        assert total_inventory == 165


class TestTimeCalculationUseCase:
    """Test Use Case 4: Time Calculation."""

    def test_calculate_total_hours(self) -> None:
        """Should add regular hours to overtime hours."""
        hours_worked = 8
        overtime_hours = 2
        total_hours = add(hours_worked, overtime_hours)
        assert total_hours == 10


class TestCoordinateSystemUseCase:
    """Test Use Case 5: Coordinate System."""

    def test_calculate_new_position(self) -> None:
        """Should calculate new 2D position after movement."""
        x_pos = 100
        y_pos = 50
        new_x = add(x_pos, 25)  # Move right 25 pixels
        new_y = add(y_pos, 10)  # Move down 10 pixels
        assert new_x == 125
        assert new_y == 60


class TestSubtractExtension:
    """Test the subtract function extension."""

    def test_subtract_basic(self) -> None:
        """Should subtract b from a correctly."""
        from src import subtract
        result = subtract(10, 3)
        assert result == 7

    def test_subtract_negative_result(self) -> None:
        """Should handle negative results."""
        from src import subtract
        result = subtract(5, 10)
        assert result == -5
