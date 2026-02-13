#!/usr/bin/env python3
"""Generate a multi-section underwriting summary from assumptions JSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def generate_summary(assumptions: dict) -> str:
    mlas = assumptions.get("mlas", [])
    tenants = assumptions.get("tenants", [])
    debt = assumptions.get("debt", {})
    refi = assumptions.get("refinance")

    lines = [
        "# Institutional Underwriting Memo",
        "",
        "## 1) Executive Snapshot",
        f"- Acquisition date: {assumptions.get('acquisitionDate')}",
        f"- Hold period: {assumptions.get('holdMonths')} months",
        f"- Gross SF: {assumptions.get('grossSf'):,}",
        f"- Purchase price: ${assumptions.get('purchasePrice', 0):,.0f}",
        f"- Closing costs: ${assumptions.get('closingCosts', 0):,.0f}",
        "",
        "## 2) Returns Framework",
        "- Model is monthly and annualized in reporting rollups.",
        "- Returns should be read from monthly cash-flow outputs: levered/unlevered IRR, equity multiples, and levered dollar profit.",
        "",
        "## 3) Rent Roll / MLA Structure",
        f"- Tenant count: {len(tenants)}",
        f"- MLA tranche count: {len(mlas)}",
        "- MLA template fields include market rent, TI/LC, renewal probability, lease term, free rent, and growth years 1-10.",
        "",
        "## 4) Capital Plan",
        f"- Monthly reserves: ${assumptions.get('reservesMonthly', 0):,.0f}",
        f"- Capex schedule entries: {len(assumptions.get('capexSchedule', {}))}",
        "",
        "## 5) Debt & Refinance",
        f"- Initial LTV: {debt.get('initialLtv', 0):.2%}",
        f"- Rate index: {debt.get('rateIndex', 'N/A')}",
        f"- Fixed/Floating: {debt.get('fixedFloating', 'N/A')}",
        f"- Refinance enabled: {'Yes' if refi else 'No'}",
        "",
        "## 6) Exit Assumptions",
        f"- Exit cap rate: {assumptions.get('exitCapRate', 0):.2%}",
        f"- Sale date: {assumptions.get('saleDate')}",
        "",
        "## 7) Notes",
        "- SOFR curve integration can be layered in by replacing static index-rate input with API values.",
        "- Export assumptions and workbook for analyst-side audit and updates in Excel.",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    assumptions = json.loads(Path(args.input).read_text())
    out = generate_summary(assumptions)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(out)


if __name__ == "__main__":
    main()
