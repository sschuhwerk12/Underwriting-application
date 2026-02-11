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

## Run the app

```bash
python -m http.server 8000
```

Then open: `http://localhost:8000`

## Generate a summary from assumptions JSON

```bash
python generate_report.py --input examples/sample_assumptions.json --output artifacts/investment_summary.md
```

## Files

- `index.html`: institutional UX layout
- `styles.css`: visual system
- `app.js`: underwriting engine + exports + report generation in-browser
- `generate_report.py`: CLI summary generator
- `examples/sample_assumptions.json`: sample assumptions payload
