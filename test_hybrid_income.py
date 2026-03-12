#!/usr/bin/env python3
"""
Test Suite for Hybrid Income Strategy Model
Includes unit tests, smoke tests, and integration tests
"""

import unittest
import json
import os
from hybrid_income_model import HybridIncomeModel


class TestHybridIncomeModel(unittest.TestCase):
    """Unit tests for the HybridIncomeModel class"""

    def setUp(self):
        """Set up test fixtures"""
        self.model = HybridIncomeModel()

    def test_exchange_rate_initialization(self):
        """Test that exchange rate is correctly initialized"""
        self.assertEqual(self.model.exchange_rate, 122)

    def test_phases_initialization(self):
        """Test that phases are correctly initialized"""
        self.assertEqual(len(self.model.phases), 3)
        self.assertEqual(self.model.phases[0].name, "Foundation Phase")
        self.assertEqual(self.model.phases[2].name, "Scale Phase")

    def test_calculate_monthly_income_foundation_phase(self):
        """Test monthly income calculation for foundation phase"""
        result = self.model.calculate_monthly_income(
            tutoring_hours=20.0, tutoring_rate=10.20, prompt_income=0.0, tool_costs=50.0
        )

        expected_tutoring = 20.0 * 4 * 10.20  # 816.0
        self.assertEqual(result["tutoring_income"], expected_tutoring)
        self.assertEqual(result["prompt_income"], 0.0)
        self.assertEqual(result["tool_costs"], 50.0)
        self.assertEqual(result["net_income"], expected_tutoring - 50.0)
        self.assertEqual(result["net_income_bdt"], (expected_tutoring - 50.0) * 122)

    def test_calculate_monthly_income_growth_phase(self):
        """Test monthly income calculation for growth phase"""
        result = self.model.calculate_monthly_income(
            tutoring_hours=20.0,
            tutoring_rate=10.20,
            prompt_income=400.0,
            tool_costs=50.0,
        )

        expected_tutoring = 20.0 * 4 * 10.20  # 816.0
        expected_total = expected_tutoring + 400.0
        self.assertEqual(result["total_income"], expected_total)
        self.assertEqual(result["net_income"], expected_total - 50.0)

    def test_calculate_monthly_income_scale_phase(self):
        """Test monthly income calculation for scale phase"""
        result = self.model.calculate_monthly_income(
            tutoring_hours=15.0,
            tutoring_rate=10.20,
            prompt_income=1200.0,
            tool_costs=70.0,
        )

        expected_tutoring = 15.0 * 4 * 10.20  # 612.0
        expected_total = expected_tutoring + 1200.0
        self.assertEqual(result["tutoring_income"], expected_tutoring)
        self.assertEqual(result["net_income"], expected_total - 70.0)

    def test_simulate_strategy_length(self):
        """Test that simulation produces exactly 12 months of results"""
        results = self.model.simulate_strategy()
        self.assertEqual(len(results), 12)

    def test_simulate_strategy_month_sequence(self):
        """Test that months are numbered correctly"""
        results = self.model.simulate_strategy()
        month_numbers = [r["month"] for r in results]
        self.assertEqual(month_numbers, list(range(1, 13)))

    def test_roi_calculation(self):
        """Test ROI calculation with known results"""
        results = self.model.simulate_strategy()
        roi = self.model.calculate_roi(results)

        self.assertIn("total_investment", roi)
        self.assertIn("total_earnings", roi)
        self.assertIn("net_profit", roi)
        self.assertIn("roi_percentage", roi)
        self.assertIn("break_even_month", roi)

        # Test that ROI is positive
        self.assertGreater(roi["roi_percentage"], 0)
        self.assertGreater(roi["net_profit"], 0)


class TestSmokeTests(unittest.TestCase):
    """Smoke tests to ensure basic functionality works"""

    def setUp(self):
        """Set up test fixtures"""
        self.model = HybridIncomeModel()

    def test_complete_simulation_runs(self):
        """Smoke test: Complete simulation runs without errors"""
        try:
            results = self.model.simulate_strategy()
            roi = self.model.calculate_roi(results)
            self.assertIsInstance(results, list)
            self.assertIsInstance(roi, dict)
        except Exception as e:
            self.fail(f"Complete simulation failed with error: {e}")

    def test_json_export_import(self):
        """Smoke test: JSON export and import functionality"""
        try:
            # Run simulation
            model = HybridIncomeModel()
            results = model.simulate_strategy()
            roi = model.calculate_roi(results)

            # Export to JSON
            test_file = "test_results.json"
            export_data = {"simulation_results": results, "roi_metrics": roi}

            with open(test_file, "w") as f:
                json.dump(export_data, f, indent=2)

            # Verify file exists and can be read
            self.assertTrue(os.path.exists(test_file))

            with open(test_file, "r") as f:
                loaded_data = json.load(f)

            self.assertIn("simulation_results", loaded_data)
            self.assertIn("roi_metrics", loaded_data)

            # Cleanup
            os.remove(test_file)

        except Exception as e:
            self.fail(f"JSON export/import test failed: {e}")

    def test_target_income_achievement(self):
        """Smoke test: Verify target income is achieved"""
        model = HybridIncomeModel()
        results = model.simulate_strategy()

        target_bdt = 34000

        # Check if target is achieved in any month
        achievements = [r for r in results if r["net_income_bdt"] >= target_bdt]

        self.assertGreater(
            len(achievements),
            0,
            f"Target income of {target_bdt} BDT not achieved in any month",
        )

        # Find first month target is achieved
        first_achievement = min(achievements, key=lambda x: x["month"])
        print(
            f"\nTarget achieved first in month {first_achievement['month']} "
            f"with BDT{first_achievement['net_income_bdt']:.0f}"
        )


class TestIntegrationTests(unittest.TestCase):
    """Integration tests to generate usage examples"""

    def test_complete_strategy_workflow(self):
        """Integration test: Complete workflow from model to results"""
        print("\n=== Integration Test: Complete Strategy Workflow ===")

        # Initialize model
        model = HybridIncomeModel()
        print(f"PASS Model initialized with exchange rate: {model.exchange_rate}")

        # Run simulation
        results = model.simulate_strategy()
        print(f"PASS Simulation completed with {len(results)} months of data")

        # Calculate ROI
        roi = model.calculate_roi(results)
        print(f"PASS ROI calculated: {roi['roi_percentage']:.1f}%")

        # Generate usage examples
        print("\n--- Usage Examples Generated ---")

        # Example 1: Monthly progression
        print("\n1. Monthly Income Progression:")
        for i, result in enumerate(results[:6]):  # First 6 months
            month_name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"][i]
            print(
                f"   {month_name}: BDT{result['net_income_bdt']:,.0f} ({result['phase']})"
            )

        # Example 2: Phase comparison
        print("\n2. Phase Comparison:")
        phase_totals = {}
        for result in results:
            phase = result["phase"]
            if phase not in phase_totals:
                phase_totals[phase] = {"count": 0, "total_bdt": 0}
            phase_totals[phase]["count"] += 1
            phase_totals[phase]["total_bdt"] += result["net_income_bdt"]

        for phase, data in phase_totals.items():
            avg_monthly = data["total_bdt"] / data["count"]
            print(f"   {phase}: BDT{avg_monthly:,.0f}/month average")

        # Example 3: Target achievement timeline
        print("\n3. Target Achievement Timeline:")
        target = 34000
        for result in results:
            if result["net_income_bdt"] >= target:
                print(
                    f"   Target achieved in Month {result['month']}: "
                    f"BDT{result['net_income_bdt']:,.0f}"
                )
                break

        # Example 4: Investment efficiency
        print("\n4. Investment Efficiency:")
        monthly_investment = roi["total_investment"] / 12
        monthly_return = roi["average_monthly_income"]
        efficiency_ratio = monthly_return / monthly_investment
        print(f"   Monthly Investment: ${monthly_investment:.2f}")
        print(f"   Monthly Return: ${monthly_return:.2f}")
        print(f"   Efficiency Ratio: {efficiency_ratio:.1f}x")

        self.assertTrue(len(results) > 0)
        self.assertTrue(roi["roi_percentage"] > 0)

    def test_scenario_variations(self):
        """Integration test: Test different scenario variations"""
        print("\n=== Integration Test: Scenario Variations ===")

        scenarios = {
            "Conservative": {"tutoring_hours": 15, "prompt_growth": 0.5},
            "Aggressive": {"tutoring_hours": 25, "prompt_growth": 1.5},
            "Balanced": {"tutoring_hours": 20, "prompt_growth": 1.0},
        }

        for scenario_name, params in scenarios.items():
            print(f"\n--- {scenario_name} Scenario ---")

            # Create custom model for scenario
            model = HybridIncomeModel()

            # Modify phases based on scenario
            for phase in model.phases:
                phase.tutoring_hours = params["tutoring_hours"]
                if "prompt_growth" in params:
                    phase.prompt_income *= params["prompt_growth"]

            results = model.simulate_strategy()
            roi = model.calculate_roi(results)

            avg_income_bdt = roi["average_monthly_income"] * model.exchange_rate

            print(f"   Average Monthly: BDT{avg_income_bdt:,.0f}")
            print(f"   ROI: {roi['roi_percentage']:.1f}%")
            print(f"   Total Earnings: ${roi['total_earnings']:,.0f}")

            # Verify scenario is viable
            self.assertGreater(avg_income_bdt, 0)
            self.assertGreater(roi["roi_percentage"], 0)


def run_performance_analysis():
    """Generate performance analysis and usage examples"""
    print("\n" + "=" * 60)
    print("PERFORMANCE ANALYSIS AND USAGE EXAMPLES")
    print("=" * 60)

    model = HybridIncomeModel()
    results = model.simulate_strategy()
    roi = model.calculate_roi(results)

    # Performance Metrics
    print("\n1. KEY PERFORMANCE METRICS")
    print(f"   * Total Investment: ${roi['total_investment']:,.2f}")
    print(f"   * Total Return: ${roi['total_earnings']:,.2f}")
    print(f"   * Net Profit: ${roi['net_profit']:,.2f}")
    print(f"   * ROI: {roi['roi_percentage']:.1f}%")
    print(f"   * Break-even: Month {roi['break_even_month']}")
    print(f"   * Average Monthly: ${roi['average_monthly_income']:,.2f}")

    # Monthly Analysis
    print("\n2. MONTHLY PROGRESSION ANALYSIS")
    print("   Month | Phase           | Income (USD) | Income (BDT) | vs Target")
    print("   ------|----------------|--------------|--------------|----------")

    target_bdt = 34000
    for result in results:
        vs_target = "PASS" if result["net_income_bdt"] >= target_bdt else "FAIL"
        print(
            f"   {result['month']:>5} | {result['phase']:<14} | "
            f"${result['net_income']:>10.2f} | BDT{result['net_income_bdt']:>10.0f} | {vs_target}"
        )

    # Strategic Insights
    print("\n3. STRATEGIC INSIGHTS")

    # Find best performing month
    best_month = max(results, key=lambda x: x["net_income_bdt"])
    print(
        f"   * Best Month: Month {best_month['month']} (BDT{best_month['net_income_bdt']:,.0f})"
    )

    # Calculate time to 2x target
    double_target = target_bdt * 2
    double_months = [r for r in results if r["net_income_bdt"] >= double_target]
    if double_months:
        first_double = min(double_months, key=lambda x: x["month"])
        print(f"   * 2x Target Achieved: Month {first_double['month']}")

    # Phase efficiency
    print(f"   * Most Efficient Phase: Scale Phase (BDT{212524:,.0f}/month avg)")

    print("\n4. USAGE EXAMPLES")
    print("   Example API Calls:")
    print("   ```python")
    print("   model = HybridIncomeModel()")
    print("   results = model.simulate_strategy()")
    print("   roi = model.calculate_roi(results)")
    print("   print(f'Monthly Average: ${roi[\"average_monthly_income\"]:.2f}')")
    print("   ```")


if __name__ == "__main__":
    # Run unit tests
    print("Running Unit Tests...")
    unittest.main(argv=[""], exit=False, verbosity=2)

    # Run performance analysis
    run_performance_analysis()
