#!/usr/bin/env python3
"""
FastAPI Module for Hybrid Income Strategy
Demonstrates the flow and mapping of the income strategy
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
from hybrid_income_model import HybridIncomeModel

app = FastAPI(
    title="Hybrid Income Strategy API",
    description="API for modeling English Tutoring + 3D Graphics Prompt Engineering income strategy",
    version="1.0.0",
)


# Pydantic models for API
class MonthlyResult(BaseModel):
    month: int
    phase: str
    tutoring_income: float
    prompt_income: float
    tool_costs: float
    total_income: float
    net_income: float
    net_income_bdt: float


class ROIMetrics(BaseModel):
    total_investment: float
    total_earnings: float
    net_profit: float
    roi_percentage: float
    break_even_month: Optional[int]
    average_monthly_income: float


class StrategyRequest(BaseModel):
    exchange_rate: Optional[float] = 122.0
    target_monthly_bdt: Optional[float] = 34000.0


class ScenarioRequest(BaseModel):
    scenario_name: str
    tutoring_hours: float
    prompt_growth_multiplier: float
    exchange_rate: Optional[float] = 122.0


class StrategyResponse(BaseModel):
    strategy_parameters: Dict
    monthly_results: List[MonthlyResult]
    roi_metrics: ROIMetrics
    target_achievement: Dict
    recommendations: List[str]


# Initialize model
model = HybridIncomeModel()


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Hybrid Income Strategy API",
        "description": "Models income from English tutoring + 3D graphics prompt engineering",
        "endpoints": {
            "strategy": "/strategy - Full strategy simulation",
            "roi": "/roi - ROI analysis only",
            "scenarios": "/scenarios - Compare different scenarios",
            "monthly": "/monthly/{month} - Get specific month data",
            "target": "/target - Check target achievement",
        },
    }


@app.post("/strategy", response_model=StrategyResponse)
async def get_full_strategy(request: StrategyRequest = StrategyRequest()):
    """
    Get complete strategy simulation with analysis
    """
    try:
        # Update model if custom parameters provided
        if request.exchange_rate != 122.0:
            model.exchange_rate = request.exchange_rate

        # Run simulation
        results = model.simulate_strategy()
        roi_metrics = model.calculate_roi(results)

        # Convert to Pydantic models
        monthly_results = [MonthlyResult(**r) for r in results]
        roi_response = ROIMetrics(**roi_metrics)

        # Target achievement analysis
        target_bdt = request.target_monthly_bdt
        achievement_months = [r for r in results if r["net_income_bdt"] >= target_bdt]

        target_achievement = {
            "target_bdt": target_bdt,
            "achieved": len(achievement_months) > 0,
            "first_achievement_month": achievement_months[0]["month"]
            if achievement_months
            else None,
            "months_achieved": len(achievement_months),
            "achievement_percentage": (len(achievement_months) / len(results)) * 100,
        }

        # Generate recommendations
        recommendations = generate_recommendations(
            results, roi_metrics, target_achievement
        )

        return StrategyResponse(
            strategy_parameters={
                "exchange_rate": model.exchange_rate,
                "target_monthly_bdt": target_bdt,
                "simulation_months": len(results),
            },
            monthly_results=monthly_results,
            roi_metrics=roi_response,
            target_achievement=target_achievement,
            recommendations=recommendations,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Strategy simulation failed: {str(e)}"
        )


@app.get("/roi")
async def get_roi_analysis():
    """Get ROI analysis for the default strategy"""
    try:
        results = model.simulate_strategy()
        roi_metrics = model.calculate_roi(results)
        return ROIMetrics(**roi_metrics)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ROI analysis failed: {str(e)}")


@app.post("/scenarios")
async def compare_scenarios(scenarios: List[ScenarioRequest]):
    """
    Compare multiple scenarios side by side
    """
    try:
        scenario_results = {}

        for scenario in scenarios:
            # Create custom model for scenario
            custom_model = HybridIncomeModel()

            if scenario.exchange_rate != 122.0:
                custom_model.exchange_rate = scenario.exchange_rate

            # Modify phases based on scenario
            for phase in custom_model.phases:
                phase.tutoring_hours = scenario.tutoring_hours
                phase.prompt_income *= scenario.prompt_growth_multiplier

            # Run simulation
            results = custom_model.simulate_strategy()
            roi_metrics = custom_model.calculate_roi(results)

            scenario_results[scenario.scenario_name] = {
                "parameters": {
                    "tutoring_hours": scenario.tutoring_hours,
                    "prompt_growth_multiplier": scenario.prompt_growth_multiplier,
                    "exchange_rate": custom_model.exchange_rate,
                },
                "roi_metrics": roi_metrics,
                "monthly_average_bdt": roi_metrics["average_monthly_income"]
                * custom_model.exchange_rate,
                "target_achievement_months": len(
                    [r for r in results if r["net_income_bdt"] >= 34000]
                ),
            }

        return {"scenarios": scenario_results}

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Scenario comparison failed: {str(e)}"
        )


@app.get("/monthly/{month}")
async def get_monthly_data(month: int):
    """Get detailed data for a specific month"""
    try:
        if month < 1 or month > 12:
            raise HTTPException(
                status_code=400, detail="Month must be between 1 and 12"
            )

        results = model.simulate_strategy()
        month_data = results[month - 1]

        return MonthlyResult(**month_data)

    except IndexError:
        raise HTTPException(status_code=404, detail=f"Month {month} not found")
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Monthly data retrieval failed: {str(e)}"
        )


@app.get("/target")
async def check_target_achievement(target_bdt: float = 34000.0):
    """Check if and when the target income is achieved"""
    try:
        results = model.simulate_strategy()

        achievement_months = [r for r in results if r["net_income_bdt"] >= target_bdt]

        return {
            "target_bdt": target_bdt,
            "achieved": len(achievement_months) > 0,
            "first_achievement_month": achievement_months[0]["month"]
            if achievement_months
            else None,
            "months_achieved": len(achievement_months),
            "achievement_percentage": (len(achievement_months) / len(results)) * 100,
            "best_month": max(results, key=lambda x: x["net_income_bdt"]),
            "worst_month": min(results, key=lambda x: x["net_income_bdt"]),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Target analysis failed: {str(e)}")


def generate_recommendations(
    results: List[Dict], roi_metrics: Dict, target_achievement: Dict
) -> List[str]:
    """Generate strategic recommendations based on results"""
    recommendations = []

    # ROI-based recommendations
    if roi_metrics["roi_percentage"] > 1000:
        recommendations.append(
            "Excellent ROI! Consider scaling up 3D prompt engineering faster."
        )

    # Target achievement recommendations
    if target_achievement["achieved"]:
        if target_achievement["first_achievement_month"] == 1:
            recommendations.append(
                "Target achieved immediately - strategy is highly effective."
            )
        else:
            recommendations.append(
                f"Target achieved in month {target_achievement['first_achievement_month']} - consider front-loading skill development."
            )
    else:
        recommendations.append(
            "Target not achieved - increase tutoring hours or accelerate 3D skill development."
        )

    # Phase-specific recommendations
    phase_averages = {}
    for result in results:
        phase = result["phase"]
        if phase not in phase_averages:
            phase_averages[phase] = []
        phase_averages[phase].append(result["net_income_bdt"])

    for phase, incomes in phase_averages.items():
        avg_income = sum(incomes) / len(incomes)
        if avg_income < 50000:
            recommendations.append(
                f"Consider optimizing {phase} for better income generation."
            )

    # Investment efficiency
    monthly_investment = roi_metrics["total_investment"] / 12
    monthly_return = roi_metrics["average_monthly_income"]
    efficiency = monthly_return / monthly_investment

    if efficiency > 10:
        recommendations.append(
            "High investment efficiency - strategy is well-optimized."
        )
    elif efficiency < 5:
        recommendations.append(
            "Low efficiency - review tool costs and pricing strategy."
        )

    return recommendations


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "model_loaded": True}


if __name__ == "__main__":
    import uvicorn

    print("Starting Hybrid Income Strategy API...")
    print("Available endpoints:")
    print("  GET  /           - API information")
    print("  POST /strategy   - Full strategy simulation")
    print("  GET  /roi        - ROI analysis")
    print("  POST /scenarios  - Compare scenarios")
    print("  GET  /monthly/{month} - Monthly data")
    print("  GET  /target     - Target achievement")
    print("  GET  /health     - Health check")
    print("\nAPI will be available at: http://localhost:8000")
    print("Documentation at: http://localhost:8000/docs")

    uvicorn.run(app, host="0.0.0.0", port=8000)
