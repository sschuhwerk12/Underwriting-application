# Institutional Real Estate Underwriting Application

A clean, institutional front-end prototype for office/retail/industrial underwriting with:

- File-drop intake (OMs, rent rolls, comps) with manual completion of missing fields
- Monthly DCF modeling with annual rollups
- Returns calculated from monthly cash flows (levered/unlevered IRR, equity multiple, levered profit)
- Capex timing bucket and general reserves input
- MLA (market leasing assumption) tranches that can be applied to multiple tenants
- Acquisition, debt, refinance, and exit assumption panels
- Multi-section summary report generation
- Excel-compatible workbook export (SpreadsheetML XML that opens in Excel and remains editable)

## 1) Run the UI locally

```bash
python -m http.server 8000
```

Then open: `http://localhost:8000`


## Source material ingestion (multi-file prefill)

- Upload multiple files at once in **Source Materials** (currently supports `.txt`, `.md`, `.csv`, and `.json`).
- Click **Analyze & Prefill Assumptions** to parse all uploaded files and auto-populate what can be inferred (top-level assumptions, rent-roll rows, and capex lines when present).
- Review and override any inferred assumptions before running the model.

## 2) Run the underwriting model locally (CLI)

```bash
python underwriting_model.py --input examples/sample_assumptions.json --output artifacts/model_output.json
```

This produces a JSON payload with monthly cash flows, annual rollups, and return metrics.

## 3) Generate the underwriting memo from assumptions

```bash
python generate_report.py --input examples/sample_assumptions.json --output artifacts/investment_summary.md
```

## 4) Run local tests

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

## Files

- `index.html`: institutional UX layout
- `styles.css`: visual system
- `app.js`: underwriting engine + exports + report generation in-browser
- `underwriting_model.py`: CLI underwriting engine for local testing/automation
- `generate_report.py`: CLI summary generator
- `examples/sample_assumptions.json`: sample assumptions payload
- `tests/test_local.py`: local smoke/integration tests
