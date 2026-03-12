#!/usr/bin/env python3
"""
Hybrid Income Strategy Model
English Tutoring + 3D Graphics Prompt Engineering

This module models the financial progression of the hybrid income strategy,
calculating monthly revenue, costs, and ROI over a 12-month period.
"""

from dataclasses import dataclass
from typing import Dict, List
import json


@dataclass
class IncomeStream:
    """Represents a single income stream with rates and hours"""

    name: str
    hourly_rate: float
    weekly_hours: float
    monthly_costs: float = 0.0
    growth_rate: float = 0.0


@dataclass
class PhaseConfig:
    """Configuration for each phase of the strategy"""

    name: str
    duration_months: int
    tutoring_hours: float
    tutoring_rate: float
    prompt_income: float
    tool_costs: float


class HybridIncomeModel:
    """Models the hybrid income strategy progression"""

    def __init__(self):
        self.exchange_rate = 122  # BDT to USD
        self.phases = self._initialize_phases()

    def _initialize_phases(self) -> List[PhaseConfig]:
        """Initialize the three phases of the strategy"""
        return [
            PhaseConfig(
                name="Foundation Phase",
                duration_months=3,
                tutoring_hours=20.0,
                tutoring_rate=10.20,
                prompt_income=0.0,
                tool_costs=50.0,
            ),
            PhaseConfig(
                name="Growth Phase",
                duration_months=3,
                tutoring_hours=20.0,
                tutoring_rate=10.20,
                prompt_income=400.0,
                tool_costs=50.0,
            ),
            PhaseConfig(
                name="Scale Phase",
                duration_months=6,
                tutoring_hours=15.0,
                tutoring_rate=10.20,
                prompt_income=1200.0,
                tool_costs=70.0,
            ),
        ]

    def calculate_monthly_income(
        self,
        tutoring_hours: float,
        tutoring_rate: float,
        prompt_income: float,
        tool_costs: float,
    ) -> Dict[str, float]:
        """Calculate income for a single month"""
        tutoring_income = tutoring_hours * 4 * tutoring_rate  # 4 weeks per month
        total_income = tutoring_income + prompt_income
        net_income = total_income - tool_costs
        net_income_bdt = net_income * self.exchange_rate

        return {
            "tutoring_income": tutoring_income,
            "prompt_income": prompt_income,
            "tool_costs": tool_costs,
            "total_income": total_income,
            "net_income": net_income,
            "net_income_bdt": net_income_bdt,
        }

    def simulate_strategy(self) -> List[Dict]:
        """Simulate the entire 12-month strategy"""
        results = []
        current_month = 1

        for phase in self.phases:
            for month_in_phase in range(phase.duration_months):
                monthly_calc = self.calculate_monthly_income(
                    phase.tutoring_hours,
                    phase.tutoring_rate,
                    phase.prompt_income,
                    phase.tool_costs,
                )

                result = {"month": current_month, "phase": phase.name, **monthly_calc}

                results.append(result)
                current_month += 1

        return results

    def calculate_roi(self, results: List[Dict]) -> Dict[str, float]:
        """Calculate ROI metrics for the strategy"""
        total_investment = sum(r["tool_costs"] for r in results)
        total_earnings = sum(r["net_income"] for r in results)
        net_profit = total_earnings - total_investment
        roi_percentage = (
            (net_profit / total_investment * 100) if total_investment > 0 else 0
        )

        # Find break-even month
        cumulative_income = 0
        break_even_month = None
        for i, result in enumerate(results):
            cumulative_income += result["net_income"]
            if cumulative_income > total_investment and break_even_month is None:
                break_even_month = i + 1

        return {
            "total_investment": total_investment,
            "total_earnings": total_earnings,
            "net_profit": net_profit,
            "roi_percentage": roi_percentage,
            "break_even_month": break_even_month,
            "average_monthly_income": total_earnings / len(results),
        }


def main():
    """Main execution function"""
    model = HybridIncomeModel()
    results = model.simulate_strategy()
    roi_metrics = model.calculate_roi(results)

    print("=== Hybrid Income Strategy Simulation ===\n")

    # Print monthly results
    print("Monthly Breakdown:")
    print(
        f"{'Month':<6} {'Phase':<15} {'Tutoring':<10} {'3D Prompts':<10} {'Net (USD)':<12} {'Net (BDT)':<12}"
    )
    print("-" * 75)

    for result in results:
        print(
            f"{result['month']:<6} {result['phase']:<15} "
            f"${result['tutoring_income']:<9.2f} ${result['prompt_income']:<9.2f} "
            f"${result['net_income']:<11.2f} ৳{result['net_income_bdt']:<11.0f}"
        )

    print("\n" + "=" * 75)
    print("ROI Analysis:")
    for key, value in roi_metrics.items():
        if key == "roi_percentage":
            print(f"{key.replace('_', ' ').title()}: {value:.1f}%")
        elif key == "break_even_month":
            print(f"{key.replace('_', ' ').title()}: Month {value}")
        else:
            print(f"{key.replace('_', ' ').title()}: ${value:,.2f}")

    # Export to JSON
    export_data = {
        "simulation_results": results,
        "roi_metrics": roi_metrics,
        "strategy_parameters": {
            "exchange_rate": model.exchange_rate,
            "target_monthly_bdt": 34000,
        },
    }

    with open("hybrid_income_results.json", "w") as f:
        json.dump(export_data, f, indent=2)

    print("\nResults exported to: hybrid_income_results.json")


if __name__ == "__main__":
    main()
