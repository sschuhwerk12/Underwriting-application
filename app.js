const state = {
  mlaCount: 0,
  tenantCount: 0,
  lastResult: null,
};

const mainConfig = [
  ["acquisitionDate", "Acquisition Date", "date", "2026-01-01"],
  ["holdYears", "Hold Period (years)", "number", 5],
  ["grossSf", "Square Footage", "number", 100000],
  ["purchasePrice", "Purchase Price", "number", 25000000],
  ["closingCosts", "Closing Costs", "number", 750000],
  ["exitCapRate", "Exit Cap Rate", "number", 0.065],
  ["discountRate", "Discount Rate (annual)", "number", 0.1],
  ["opexRatio", "Operating Expense Ratio", "number", 0.35],
];

const debtConfig = [
  ["initialLtv", "Initial LTV", 0.6], ["origFee", "Origination Fee", 0.01], ["extensionFee", "Extension Fee", 0.005],
  ["futureTilcPct", "% TI/LC Reimbursed", 0.5], ["futureCapexPct", "% Capex Reimbursed", 0.5],
  ["fundingEndMonth", "Funding End Month", 36], ["spread", "Rate Spread", 0.025], ["indexRate", "Index Rate (SOFR/5Y)", 0.045],
];

function addLabeledInput(parent, id, label, type = "number", value = "") {
  const el = document.createElement("label");
  el.innerHTML = `${label}<input id="${id}" type="${type}" value="${value}" />`;
  parent.appendChild(el);
}

function initForm() {
  const main = document.getElementById("mainInputs");
  mainConfig.forEach(([id, label, type, value]) => addLabeledInput(main, id, label, type, value));

  const debt = document.getElementById("debtInputs");
  debtConfig.forEach(([id, label, value]) => addLabeledInput(debt, id, label, "number", value));
  const rateIndexWrap = document.createElement("label");
  rateIndexWrap.innerHTML = `Rate Index<select id="rateIndex"><option>SOFR</option><option>5Y Treasury</option></select>`;
  debt.appendChild(rateIndexWrap);
  const fixedFloatWrap = document.createElement("label");
  fixedFloatWrap.innerHTML = `Fixed or Floating<select id="fixedFloating"><option>Floating</option><option>Fixed</option></select>`;
  debt.appendChild(fixedFloatWrap);

  const refi = document.getElementById("refiInputs");
  debtConfig.forEach(([id, label, value]) => addLabeledInput(refi, `refi_${id}`, label, "number", value));
  addMla();
  addTenant();
}

function addMla() {
  state.mlaCount += 1;
  const idx = state.mlaCount;
  const c = document.getElementById("mlaContainer");
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input class="wide" id="mla_name_${idx}" placeholder="MLA Name" value="MLA-${idx}" />
    <input id="mla_rent_${idx}" type="number" value="4" placeholder="Market Rent" />
    <input id="mla_ti_new_${idx}" type="number" value="30" placeholder="TI New" />
    <input id="mla_ti_ren_${idx}" type="number" value="15" placeholder="TI Renewal" />
    <input id="mla_renew_${idx}" type="number" value="0.6" placeholder="Renewal Prob" />
    <input id="mla_term_${idx}" type="number" value="60" placeholder="Lease Term" />
    <input id="mla_fr_new_${idx}" type="number" value="4" placeholder="Free Rent New" />
    <input id="mla_fr_ren_${idx}" type="number" value="2" placeholder="Free Rent Renewal" />
    <input id="mla_lc_new_${idx}" type="number" value="0.05" placeholder="LC New" />
    <input id="mla_lc_ren_${idx}" type="number" value="0.03" placeholder="LC Renewal" />
    <input class="wide" id="mla_growth_${idx}" value="0.03,0.03,0.03,0.03,0.03,0.025,0.025,0.02,0.02,0.02" placeholder="Growth Y1-Y10" />
  `;
  c.appendChild(row);
}

function addTenant() {
  state.tenantCount += 1;
  const idx = state.tenantCount;
  const c = document.getElementById("tenantContainer");
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input id="tenant_name_${idx}" placeholder="Tenant Name" value="Tenant ${idx}" />
    <input id="tenant_sf_${idx}" type="number" value="25000" placeholder="SF" />
    <input id="tenant_rent_${idx}" type="number" value="3.75" placeholder="Current Rent" />
    <input id="tenant_exp_${idx}" type="number" value="24" placeholder="Exp Month" />
    <input id="tenant_mla_${idx}" placeholder="MLA Name" value="MLA-1" />
  `;
  c.appendChild(row);
}

function num(id) { return Number(document.getElementById(id).value || 0); }
function txt(id) { return (document.getElementById(id).value || "").trim(); }

function gatherAssumptions() {
  const holdMonths = num("holdYears") * 12;
  const saleDate = new Date(txt("acquisitionDate"));
  saleDate.setMonth(saleDate.getMonth() + holdMonths);

  const mlas = [];
  for (let i = 1; i <= state.mlaCount; i++) {
    const growth = txt(`mla_growth_${i}`).split(",").map(s => Number(s.trim())).filter(v => !Number.isNaN(v));
    while (growth.length < 10) growth.push(growth[growth.length - 1] || 0.02);
    mlas.push({
      name: txt(`mla_name_${i}`), marketRent: num(`mla_rent_${i}`), tiNew: num(`mla_ti_new_${i}`), tiRenewal: num(`mla_ti_ren_${i}`),
      renewalProbability: num(`mla_renew_${i}`), leaseTerm: num(`mla_term_${i}`), freeRentNew: num(`mla_fr_new_${i}`), freeRentRenewal: num(`mla_fr_ren_${i}`),
      lcNew: num(`mla_lc_new_${i}`), lcRenewal: num(`mla_lc_ren_${i}`), growth,
    });
  }

  const tenants = [];
  for (let i = 1; i <= state.tenantCount; i++) {
    tenants.push({ name: txt(`tenant_name_${i}`), sf: num(`tenant_sf_${i}`), currentRent: num(`tenant_rent_${i}`), expMonth: num(`tenant_exp_${i}`), mlaName: txt(`tenant_mla_${i}`) });
  }

  const capexSchedule = {};
  document.getElementById("capexSchedule").value.split("\n").forEach(line => {
    const [m, a] = line.split(":");
    if (m && a) capexSchedule[Number(m.trim())] = Number(a.trim());
  });

  const debt = {
    initialLtv: num("initialLtv"), originationFee: num("origFee"), extensionFee: num("extensionFee"), futureTilcPct: num("futureTilcPct"), futureCapexPct: num("futureCapexPct"),
    fundingEndMonth: num("fundingEndMonth"), spread: num("spread"), indexRate: num("indexRate"), rateIndex: txt("rateIndex"), fixedFloating: txt("fixedFloating"),
  };
  const refiEnabled = document.getElementById("enableRefi").checked;
  const refinance = refiEnabled ? {
    initialLtv: num("refi_initialLtv"), originationFee: num("refi_origFee"), extensionFee: num("refi_extensionFee"), futureTilcPct: num("refi_futureTilcPct"),
    futureCapexPct: num("refi_futureCapexPct"), fundingEndMonth: num("refi_fundingEndMonth"), spread: num("refi_spread"), indexRate: num("refi_indexRate"),
  } : null;

  return {
    acquisitionDate: txt("acquisitionDate"), saleDate: saleDate.toISOString().slice(0, 10), holdMonths,
    grossSf: num("grossSf"), purchasePrice: num("purchasePrice"), closingCosts: num("closingCosts"), exitCapRate: num("exitCapRate"),
    discountRate: num("discountRate"), opexRatio: num("opexRatio"), reservesMonthly: Number(document.getElementById("reservesMonthly").value),
    mlas, tenants, capexSchedule, debt, refinance,
  };
}

function irr(cashflows) {
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    let f = 0, df = 0;
    cashflows.forEach((cf, t) => {
      f += cf / ((1 + rate) ** t);
      df += -t * cf / ((1 + rate) ** (t + 1));
    });
    const next = rate - f / (df || 1e-9);
    if (Math.abs(next - rate) < 1e-7) return rate;
    rate = next;
  }
  return rate;
}

function runModel(a) {
  const monthly = [];
  const mlaMap = Object.fromEntries(a.mlas.map(m => [m.name, m]));
  for (let m = 1; m <= a.holdMonths; m++) {
    let gpr = 0, leasing = 0;
    for (const t of a.tenants) {
      const mla = mlaMap[t.mlaName];
      let rentPsf = t.currentRent;
      if (m > t.expMonth && mla) {
        const post = m - t.expMonth;
        const renewal = mla.renewalProbability >= 0.5;
        const free = renewal ? mla.freeRentRenewal : mla.freeRentNew;
        if (post <= free) rentPsf = 0;
        else {
          const yearIdx = Math.min(Math.floor((m - 1) / 12), 9);
          let mr = mla.marketRent;
          for (let y = 1; y <= yearIdx; y++) mr *= (1 + mla.growth[y]);
          rentPsf = mr;
        }
        if (post === 1) {
          leasing += t.sf * (renewal ? mla.tiRenewal : mla.tiNew);
          leasing += t.sf * rentPsf * mla.leaseTerm * (renewal ? mla.lcRenewal : mla.lcNew);
        }
      }
      gpr += rentPsf * t.sf;
    }
    const opex = gpr * a.opexRatio;
    const noi = gpr - opex;
    const capex = a.capexSchedule[m] || 0;
    const reserves = a.reservesMonthly;
    const unlev = noi - leasing - capex - reserves;
    monthly.push({ month: m, gpr, opex, noi, leasing, capex, reserves, unlev });
  }

  const loan = a.purchasePrice * a.debt.initialLtv;
  const monthlyRate = (a.debt.spread + a.debt.indexRate) / 12;
  let balance = loan;
  monthly.forEach(r => {
    const debtSvc = balance * monthlyRate;
    const reimb = r.month <= a.debt.fundingEndMonth ? (a.debt.futureTilcPct * r.leasing + a.debt.futureCapexPct * r.capex) : 0;
    balance += reimb;
    r.lev = r.unlev - debtSvc + reimb;
  });

  const terminalNoiAnnual = monthly[monthly.length - 1].noi * 12;
  const sale = terminalNoiAnnual / a.exitCapRate;
  const netSale = sale * 0.99;
  const unlevCF = [-(a.purchasePrice + a.closingCosts), ...monthly.map(r => r.unlev)];
  unlevCF[unlevCF.length - 1] += netSale;
  const levCF = [-(a.purchasePrice + a.closingCosts - loan * (1 - a.debt.originationFee)), ...monthly.map(r => r.lev)];
  levCF[levCF.length - 1] += netSale - balance;

  const ann = [];
  for (let y = 0; y < a.holdMonths / 12; y++) {
    const rows = monthly.slice(y * 12, y * 12 + 12);
    ann.push({ year: y + 1, annualNoi: rows.reduce((s, r) => s + r.noi, 0), annualUnlev: rows.reduce((s, r) => s + r.unlev, 0), annualLev: rows.reduce((s, r) => s + r.lev, 0) });
  }

  return {
    monthly,
    annual: ann,
    metrics: {
      unleveredIrr: irr(unlevCF), leveredIrr: irr(levCF),
      unleveredEqMult: unlevCF.slice(1).reduce((s, x) => s + x, 0) / -unlevCF[0],
      leveredEqMult: levCF.slice(1).reduce((s, x) => s + x, 0) / -levCF[0],
      leveredProfit: levCF.reduce((s, x) => s + x, 0),
      totalHoldCosts: monthly.reduce((s, r) => s + r.leasing + r.capex + r.reserves, a.closingCosts),
      sale,
    }, assumptions: a
  };
}

function render(result) {
  const m = result.metrics;
  document.getElementById("summary").textContent =
`INVESTMENT SUMMARY

Investment Costs
- Purchase Price: $${result.assumptions.purchasePrice.toLocaleString()}
- Closing Costs: $${result.assumptions.closingCosts.toLocaleString()}
- Total Hold Costs: $${Math.round(m.totalHoldCosts).toLocaleString()}

Returns (calculated on monthly cash flows)
- Unlevered IRR: ${(m.unleveredIrr * 100).toFixed(2)}%
- Levered IRR: ${(m.leveredIrr * 100).toFixed(2)}%
- Unlevered Equity Multiple: ${m.unleveredEqMult.toFixed(2)}x
- Levered Equity Multiple: ${m.leveredEqMult.toFixed(2)}x
- Levered Profit: $${Math.round(m.leveredProfit).toLocaleString()}

Exit
- Exit Cap: ${(result.assumptions.exitCapRate*100).toFixed(2)}%
- Terminal Value: $${Math.round(m.sale).toLocaleString()}
`;

  document.getElementById("metrics").innerHTML = `<table class="table"><tr><th>Metric</th><th>Value</th></tr>${Object.entries(m).map(([k,v]) => `<tr><td>${k}</td><td>${typeof v === 'number' ? v.toFixed(4) : v}</td></tr>`).join('')}</table>`;
  document.getElementById("annual").innerHTML = `<table class="table"><tr><th>Year</th><th>NOI</th><th>Unlevered CF</th><th>Levered CF</th></tr>${result.annual.map(r => `<tr><td>${r.year}</td><td>${Math.round(r.annualNoi).toLocaleString()}</td><td>${Math.round(r.annualUnlev).toLocaleString()}</td><td>${Math.round(r.annualLev).toLocaleString()}</td></tr>`).join('')}</table>`;
}

function download(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportExcelXml(result) {
  const esc = s => String(s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
  const rowsMonthly = result.monthly.map(r => `<Row>${Object.values(r).map(v => `<Cell><Data ss:Type="Number">${v}</Data></Cell>`).join('')}</Row>`).join('');
  const rowsAnnual = result.annual.map(r => `<Row><Cell><Data ss:Type="Number">${r.year}</Data></Cell><Cell><Data ss:Type="Number">${r.annualNoi}</Data></Cell><Cell><Data ss:Type="Number">${r.annualUnlev}</Data></Cell><Cell><Data ss:Type="Number">${r.annualLev}</Data></Cell></Row>`).join('');
  const rowsAssume = Object.entries(result.assumptions).map(([k,v]) => `<Row><Cell><Data ss:Type="String">${esc(k)}</Data></Cell><Cell><Data ss:Type="String">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</Data></Cell></Row>`).join('');

  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Assumptions"><Table>${rowsAssume}</Table></Worksheet>
<Worksheet ss:Name="MonthlyCF"><Table>${rowsMonthly}</Table></Worksheet>
<Worksheet ss:Name="AnnualCF"><Table>${rowsAnnual}</Table></Worksheet>
</Workbook>`;
  download("underwriting_workbook.xml", xml, "application/xml");
}

function generateReportText(result) {
  return `# Institutional Underwriting Summary

## Total Investment Costs
- Purchase price: $${Math.round(result.assumptions.purchasePrice).toLocaleString()}
- Closing costs: $${Math.round(result.assumptions.closingCosts).toLocaleString()}
- Hold-period costs (leasing + capex + reserves): $${Math.round(result.metrics.totalHoldCosts).toLocaleString()}

## Returns
- Unleveraged IRR: ${(result.metrics.unleveredIrr*100).toFixed(2)}%
- Leveraged IRR: ${(result.metrics.leveredIrr*100).toFixed(2)}%
- Unleveraged equity multiple: ${result.metrics.unleveredEqMult.toFixed(2)}x
- Leveraged equity multiple: ${result.metrics.leveredEqMult.toFixed(2)}x
- Leveraged whole-dollar profit: $${Math.round(result.metrics.leveredProfit).toLocaleString()}

## Rent Roll and Rollover Assumptions
- Tenants: ${result.assumptions.tenants.length}
- MLA tranches: ${result.assumptions.mlas.length}

## Capital Budget and Reserves
- Capex lines: ${Object.keys(result.assumptions.capexSchedule).length}
- Reserves per month: $${Math.round(result.assumptions.reservesMonthly).toLocaleString()}

## Loan and Exit
- Initial LTV: ${(result.assumptions.debt.initialLtv*100).toFixed(1)}%
- Rate index: ${result.assumptions.debt.rateIndex}
- Fixed/Floating: ${result.assumptions.debt.fixedFloating}
- Exit cap rate: ${(result.assumptions.exitCapRate*100).toFixed(2)}%
- Terminal value: $${Math.round(result.metrics.sale).toLocaleString()}
`;
}

document.getElementById("runModel").onclick = () => {
  const assumptions = gatherAssumptions();
  state.lastResult = runModel(assumptions);
  render(state.lastResult);
};
document.getElementById("exportExcel").onclick = () => state.lastResult && exportExcelXml(state.lastResult);
document.getElementById("exportJson").onclick = () => download("assumptions.json", JSON.stringify(gatherAssumptions(), null, 2), "application/json");
document.getElementById("exportReport").onclick = () => state.lastResult && download("investment_summary.md", generateReportText(state.lastResult), "text/markdown");
document.getElementById("addMla").onclick = addMla;
document.getElementById("addTenant").onclick = addTenant;
document.getElementById("fileDrop").addEventListener("change", e => {
  const names = [...e.target.files].map(f => f.name);
  document.getElementById("fileList").textContent = names.length ? `Loaded files: ${names.join(", ")}` : "";
});

initForm();
