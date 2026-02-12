#!/usr/bin/env python3
"""CLI-friendly underwriting model for local testing and validation."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class Metrics:
    unlevered_irr: float
    levered_irr: float
    unlevered_equity_multiple: float
    levered_equity_multiple: float
    levered_profit: float
    terminal_value: float
    total_hold_costs: float


def _npv(cashflows: list[float], rate: float) -> float:
    total = 0.0
    for t, cf in enumerate(cashflows):
        total += cf / ((1.0 + rate) ** t)
    return total


def _irr(cashflows: list[float]) -> float:
    low, high = -0.95, 1.5
    f_low = _npv(cashflows, low)
    f_high = _npv(cashflows, high)

    expand_steps = 0
    while f_low * f_high > 0 and expand_steps < 20:
        high += 1.0
        f_high = _npv(cashflows, high)
        expand_steps += 1

    if f_low * f_high > 0:
        return 0.0

    for _ in range(120):
        mid = (low + high) / 2
        f_mid = _npv(cashflows, mid)
        if abs(f_mid) < 1e-8:
            return mid
        if f_low * f_mid < 0:
            high, f_high = mid, f_mid
        else:
            low, f_low = mid, f_mid
    return (low + high) / 2


def run_model(assumptions: dict[str, Any]) -> dict[str, Any]:
    hold_months = int(assumptions["holdMonths"])
    mlas = {m["name"]: m for m in assumptions.get("mlas", [])}
    tenants = assumptions.get("tenants", [])
    opex_ratio = float(assumptions.get("opexRatio", 0.0))
    reserves_monthly = float(assumptions.get("reservesMonthly", 0.0))
    capex_schedule = {int(k): float(v) for k, v in assumptions.get("capexSchedule", {}).items()}

    monthly = []
    for month in range(1, hold_months + 1):
        gross_rent = 0.0
        leasing_costs = 0.0

        for tenant in tenants:
            mla = mlas.get(tenant.get("mlaName"), None)
            rent_psf = float(tenant.get("currentRent", 0.0))

            if mla and month > int(tenant.get("expMonth", hold_months + 1)):
                post_exp = month - int(tenant["expMonth"])
                renewal = float(mla.get("renewalProbability", 0.0)) >= 0.5
                free_rent = int(mla.get("freeRentRenewal" if renewal else "freeRentNew", 0))

                if post_exp <= free_rent:
                    rent_psf = 0.0
                else:
                    growth = mla.get("growth", [0.0] * 10)
                    current_rent = float(mla.get("marketRent", rent_psf))
                    growth_years = min((month - 1) // 12, 9)
                    for y in range(1, growth_years + 1):
                        current_rent *= 1 + float(growth[y])
                    rent_psf = current_rent

                if post_exp == 1:
                    sf = float(tenant.get("sf", 0.0))
                    ti = float(mla.get("tiRenewal" if renewal else "tiNew", 0.0))
                    lc = float(mla.get("lcRenewal" if renewal else "lcNew", 0.0))
                    term = int(mla.get("leaseTerm", 60))
                    leasing_costs += sf * ti
                    leasing_costs += sf * rent_psf * term * lc

            gross_rent += rent_psf * float(tenant.get("sf", 0.0))

        opex = gross_rent * opex_ratio
        noi = gross_rent - opex
        capex = capex_schedule.get(month, 0.0)
        unlevered_cf = noi - leasing_costs - capex - reserves_monthly

        monthly.append(
            {
                "month": month,
                "gross_rent": gross_rent,
                "opex": opex,
                "noi": noi,
                "leasing_costs": leasing_costs,
                "capex": capex,
                "reserves": reserves_monthly,
                "unlevered_cf": unlevered_cf,
            }
        )

    debt = assumptions.get("debt", {})
    initial_ltv = float(debt.get("initialLtv", 0.0))
    initial_loan = float(assumptions.get("purchasePrice", 0.0)) * initial_ltv
    loan_balance = initial_loan
    monthly_rate = (float(debt.get("spread", 0.0)) + float(debt.get("indexRate", 0.0))) / 12.0
    orig_fee = float(debt.get("originationFee", 0.0))

    for row in monthly:
        debt_service = loan_balance * monthly_rate
        reimburse = 0.0
        if row["month"] <= int(debt.get("fundingEndMonth", 0)):
            reimburse = float(debt.get("futureTilcPct", 0.0)) * row["leasing_costs"] + float(debt.get("futureCapexPct", 0.0)) * row["capex"]
            loan_balance += reimburse
        row["levered_cf"] = row["unlevered_cf"] - debt_service + reimburse

    terminal_value = (monthly[-1]["noi"] * 12.0) / float(assumptions.get("exitCapRate", 0.065))
    net_sale = terminal_value * 0.99

    purchase_price = float(assumptions.get("purchasePrice", 0.0))
    closing_costs = float(assumptions.get("closingCosts", 0.0))

    unlevered_series = [-(purchase_price + closing_costs)] + [r["unlevered_cf"] for r in monthly]
    unlevered_series[-1] += net_sale

    levered_entry = -(purchase_price + closing_costs - initial_loan * (1.0 - orig_fee))
    levered_series = [levered_entry] + [r["levered_cf"] for r in monthly]
    levered_series[-1] += net_sale - loan_balance

    metrics = Metrics(
        unlevered_irr=_irr(unlevered_series),
        levered_irr=_irr(levered_series),
        unlevered_equity_multiple=(sum(unlevered_series[1:]) / -unlevered_series[0]) if unlevered_series[0] != 0 else 0.0,
        levered_equity_multiple=(sum(levered_series[1:]) / -levered_series[0]) if levered_series[0] != 0 else 0.0,
        levered_profit=sum(levered_series),
        terminal_value=terminal_value,
        total_hold_costs=closing_costs + sum(r["leasing_costs"] + r["capex"] + r["reserves"] for r in monthly),
    )

    annual = []
    for year in range(0, hold_months // 12):
        rows = monthly[year * 12 : (year + 1) * 12]
        annual.append(
            {
                "year": year + 1,
                "annual_noi": sum(r["noi"] for r in rows),
                "annual_unlevered_cf": sum(r["unlevered_cf"] for r in rows),
                "annual_levered_cf": sum(r["levered_cf"] for r in rows),
            }
        )

    return {
        "monthly": monthly,
        "annual": annual,
        "metrics": metrics.__dict__,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run underwriting model from assumptions JSON")
    parser.add_argument("--input", required=True, help="Assumptions JSON path")
    parser.add_argument("--output", required=True, help="Output JSON path")
    args = parser.parse_args()

    assumptions = json.loads(Path(args.input).read_text())
    result = run_model(assumptions)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
