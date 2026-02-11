const state = {
  mlaCount: 0,
  tenantCount: 0,
  capexCount: 0,
  lastResult: null,
  sourceFiles: [],
  rentStepsByTenant: {},
  activeTenantForSteps: null,
};

const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mainConfig = [
  ["acquisitionDate", "Acquisition Date", "2026-01-01", "date"],
  ["holdYears", "Hold Period (years)", 5, "number"],
  ["grossSf", "Square Footage", 100000, "number"],
  ["purchasePrice", "Purchase Price ($)", 25000000, "currency"],
  ["closingCosts", "Closing Costs ($)", 750000, "currency"],
  ["exitCapRate", "Exit Cap Rate", 0.065, "percent"],
  ["discountRate", "Discount Rate (annual)", 0.10, "percent"],
  ["opexRatio", "Operating Expense Ratio", 0.35, "percent"],
  ["vacancyOpexSlippage", "Vacancy Opex Slippage (% of in-place potential rent)", 0.08, "percent"],
];

const debtConfig = [
  ["initialLtv", "Initial LTV", 0.60, "percent"],
  ["origFee", "Origination Fee", 0.01, "percent"],
  ["extensionFee", "Extension Fee", 0.005, "percent"],
  ["futureTilcPct", "% TI/LC Reimbursed", 0.50, "percent"],
  ["futureCapexPct", "% Capex Reimbursed", 0.50, "percent"],
  ["fundingEndMonth", "Funding End Month", 36, "number"],
  ["spread", "Rate Spread", 0.025, "percent"],
  ["indexRate", "Rate Index", 0.045, "percent"],
];

function parseFormatted(value, formatType) {
  if (formatType === "text" || formatType === "date") return value;
  const cleaned = String(value || "").replace(/[$,%\s,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function displayFormatted(rawValue, formatType) {
  if (formatType === "text" || formatType === "date") return String(rawValue || "");
  const n = Number(rawValue || 0);
  if (formatType === "currency") return moneyFmt.format(n);
  if (formatType === "percent") return pctFmt.format(n);
  return numFmt.format(n);
}

function bindFormattedInput(input) {
  const f = input.dataset.format;
  if (!f || f === "date" || f === "text") return;
  input.addEventListener("focus", () => { input.value = input.dataset.raw || "0"; });
  input.addEventListener("blur", () => {
    const raw = parseFormatted(input.value, f);
    input.dataset.raw = String(raw);
    input.value = displayFormatted(raw, f);
    if (input.id.startsWith("capex_amount_") || input.id === "reservesMonthly") renderCapexSummary();
  });
}

function createInput(id, value, formatType = "number") {
  const input = document.createElement("input");
  input.id = id;
  input.type = formatType === "date" ? "date" : "text";
  input.dataset.format = formatType;
  input.dataset.raw = String(value ?? "");
  input.value = displayFormatted(value ?? "", formatType);
  bindFormattedInput(input);
  return input;
}

function getVal(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const formatType = el.dataset.format || "text";
  if (formatType === "date" || formatType === "text") return el.value;
  return parseFormatted(el.dataset.raw ?? el.value, formatType);
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const formatType = el.dataset.format || "text";
  if (formatType === "date" || formatType === "text") {
    el.value = String(value ?? "");
  } else {
    const n = Number(value || 0);
    el.dataset.raw = String(n);
    el.value = displayFormatted(n, formatType);
  }
}

function addLabeledInput(parent, id, label, value, formatType = "number") {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  wrapper.appendChild(createInput(id, value, formatType));
  parent.appendChild(wrapper);
}

function initForm() {
  const main = document.getElementById("mainInputs");
  mainConfig.forEach(([id, label, value, formatType]) => addLabeledInput(main, id, label, value, formatType));

  const debt = document.getElementById("debtInputs");
  debtConfig.forEach(([id, label, value, formatType]) => addLabeledInput(debt, id, label, value, formatType));
  const rateIndex = document.createElement("label");
  rateIndex.innerHTML = `Rate Index<select id="rateIndex"><option>SOFR</option><option>5Y Treasury</option></select>`;
  debt.appendChild(rateIndex);
  const fixedFloat = document.createElement("label");
  fixedFloat.innerHTML = `Fixed / Floating<select id="fixedFloating"><option>Floating</option><option>Fixed</option></select>`;
  debt.appendChild(fixedFloat);

  const refi = document.getElementById("refiInputs");
  debtConfig.forEach(([id, label, value, formatType]) => addLabeledInput(refi, `refi_${id}`, label, value, formatType));

  addMla();
  addTenant();
  addCapexLine(6, "Building Systems", 250000, 0.5, "HVAC replacements");
  addCapexLine(18, "Tenant Improvements", 500000, 0.5, "Major floor repositioning");
  renderCapexSummary();
}

function addMla() {
  state.mlaCount += 1;
  const i = state.mlaCount;
  const c = document.getElementById("mlaContainer");
  const card = document.createElement("div");
  card.className = "mla-card";
  card.innerHTML = `
    <div class="section-header">
      <strong>MLA-${i}</strong>
      <button class="btn btn-danger" type="button" onclick="this.closest('.mla-card').remove()">Remove</button>
    </div>
    <div class="mla-grid">
      <label>Name</label>
      <label>Market Rent ($/SF/mo)</label>
      <label>TI New ($/SF)</label>
      <label>TI Renewal ($/SF)</label>
      <label>Renewal Probability</label>
      <label>Lease Term (months)</label>
      <input id="mla_name_${i}" type="text" value="MLA-${i}" />
      <input id="mla_rent_${i}" data-format="currency" data-raw="4" type="text" value="$4" />
      <input id="mla_ti_new_${i}" data-format="currency" data-raw="30" type="text" value="$30" />
      <input id="mla_ti_ren_${i}" data-format="currency" data-raw="15" type="text" value="$15" />
      <input id="mla_renew_${i}" data-format="percent" data-raw="0.6" type="text" value="60.00%" />
      <input id="mla_term_${i}" data-format="number" data-raw="60" type="text" value="60" />
      <label>Free Rent New (mo)</label>
      <label>Free Rent Renewal (mo)</label>
      <label>LC New</label>
      <label>LC Renewal</label>
      <label style="grid-column: span 2;">Market Rent Growth (Y1-Y10, comma-separated)</label>
      <input id="mla_fr_new_${i}" data-format="number" data-raw="4" type="text" value="4" />
      <input id="mla_fr_ren_${i}" data-format="number" data-raw="2" type="text" value="2" />
      <input id="mla_lc_new_${i}" data-format="percent" data-raw="0.05" type="text" value="5.00%" />
      <input id="mla_lc_ren_${i}" data-format="percent" data-raw="0.03" type="text" value="3.00%" />
      <input id="mla_growth_${i}" style="grid-column: span 2;" type="text" value="0.03,0.03,0.03,0.03,0.03,0.025,0.025,0.02,0.02,0.02" />
    </div>
  `;
  c.appendChild(card);
  card.querySelectorAll("input[data-format]").forEach(bindFormattedInput);
}

function renderRentStepSummary(tenantIdx) {
  const el = document.getElementById(`tenant_steps_summary_${tenantIdx}`);
  if (!el) return;
  const steps = state.rentStepsByTenant[tenantIdx] || [];
  if (!steps.length) {
    el.textContent = "None";
    return;
  }
  const sorted = [...steps].sort((a, b) => a.date.localeCompare(b.date));
  el.textContent = sorted.map((s) => `${s.date}: ${moneyFmt.format(s.rent)}`).join(" | ");
}

function addTenant(prefill = {}) {
  state.tenantCount += 1;
  const i = state.tenantCount;

  state.rentStepsByTenant[i] = prefill.rentSteps || [];

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input id="tenant_name_${i}" value="${prefill.name || `Suite ${100 + i}`}" /></td>
    <td><input id="tenant_sf_${i}" data-format="number" data-raw="${prefill.sf || 25000}" value="${displayFormatted(prefill.sf || 25000, "number")}" /></td>
    <td><input id="tenant_commence_${i}" type="date" data-format="date" value="${prefill.commencementDate || "2026-01-01"}" /></td>
    <td><input id="tenant_expire_${i}" type="date" data-format="date" value="${prefill.expirationDate || "2028-01-01"}" /></td>
    <td><input id="tenant_rent_${i}" data-format="currency" data-raw="${prefill.currentRent || 3.75}" value="${displayFormatted(prefill.currentRent || 3.75, "currency")}" /></td>
    <td>
      <div id="tenant_steps_summary_${i}" class="muted">None</div>
      <button class="btn" type="button" onclick="openRentStepDialog(${i})">Rent Steps</button>
    </td>
    <td><button class="btn btn-danger" type="button" onclick="removeTenant(${i})">X</button></td>
  `;
  document.getElementById("tenantContainer").appendChild(tr);
  tr.querySelectorAll("input[data-format]").forEach(bindFormattedInput);
  renderRentStepSummary(i);
}

function removeTenant(idx) {
  const row = document.getElementById(`tenant_name_${idx}`)?.closest("tr");
  if (row) row.remove();
  delete state.rentStepsByTenant[idx];
}

function addCapexLine(month = 1, category = "General", amount = 0, reimb = 0.5, notes = "") {
  state.capexCount += 1;
  const i = state.capexCount;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input id="capex_month_${i}" data-format="number" data-raw="${month}" value="${month}" /></td>
    <td>
      <select id="capex_category_${i}">
        <option ${category === "General" ? "selected" : ""}>General</option>
        <option ${category === "Tenant Improvements" ? "selected" : ""}>Tenant Improvements</option>
        <option ${category === "Leasing" ? "selected" : ""}>Leasing</option>
        <option ${category === "Building Systems" ? "selected" : ""}>Building Systems</option>
        <option ${category === "Amenities" ? "selected" : ""}>Amenities</option>
      </select>
    </td>
    <td><input id="capex_amount_${i}" data-format="currency" data-raw="${amount}" value="${displayFormatted(amount, "currency")}" /></td>
    <td><input id="capex_reimb_${i}" data-format="percent" data-raw="${reimb}" value="${displayFormatted(reimb, "percent")}" /></td>
    <td><input id="capex_note_${i}" value="${notes}" /></td>
    <td><button class="btn btn-danger" type="button" onclick="this.closest('tr').remove(); renderCapexSummary();">X</button></td>
  `;
  document.getElementById("capexContainer").appendChild(tr);
  tr.querySelectorAll("input[data-format]").forEach(bindFormattedInput);
  renderCapexSummary();
}

function monthDiff(acqDateStr, dateStr) {
  const a = new Date(acqDateStr);
  const b = new Date(dateStr);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
}

function gatherAssumptions() {
  const acquisitionDate = getVal("acquisitionDate");
  const holdMonths = Math.round(getVal("holdYears") * 12);
  const saleDate = new Date(acquisitionDate);
  saleDate.setMonth(saleDate.getMonth() + holdMonths);

  const mlas = [];
  for (let i = 1; i <= state.mlaCount; i++) {
    if (!document.getElementById(`mla_name_${i}`)) continue;
    const growth = String(document.getElementById(`mla_growth_${i}`).value || "")
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x));
    while (growth.length < 10) growth.push(growth[growth.length - 1] ?? 0.02);
    mlas.push({
      name: document.getElementById(`mla_name_${i}`).value.trim() || `MLA-${i}`,
      marketRent: getVal(`mla_rent_${i}`),
      tiNew: getVal(`mla_ti_new_${i}`),
      tiRenewal: getVal(`mla_ti_ren_${i}`),
      renewalProbability: getVal(`mla_renew_${i}`),
      leaseTerm: getVal(`mla_term_${i}`),
      freeRentNew: getVal(`mla_fr_new_${i}`),
      freeRentRenewal: getVal(`mla_fr_ren_${i}`),
      lcNew: getVal(`mla_lc_new_${i}`),
      lcRenewal: getVal(`mla_lc_ren_${i}`),
      growth,
    });
  }

  const tenants = [];
  for (let i = 1; i <= state.tenantCount; i++) {
    if (!document.getElementById(`tenant_name_${i}`)) continue;
    const commencementDate = getVal(`tenant_commence_${i}`);
    const expirationDate = getVal(`tenant_expire_${i}`);
    tenants.push({
      name: document.getElementById(`tenant_name_${i}`).value.trim(),
      sf: getVal(`tenant_sf_${i}`),
      commencementDate,
      expirationDate,
      commencementMonth: monthDiff(acquisitionDate, commencementDate),
      expMonth: monthDiff(acquisitionDate, expirationDate),
      currentRent: getVal(`tenant_rent_${i}`),
      rentSteps: (state.rentStepsByTenant[i] || []).slice(),
    });
  }

  const capexLines = [];
  const capexSchedule = {};
  for (let i = 1; i <= state.capexCount; i++) {
    if (!document.getElementById(`capex_month_${i}`)) continue;
    const month = Math.round(getVal(`capex_month_${i}`));
    const amount = getVal(`capex_amount_${i}`);
    const category = document.getElementById(`capex_category_${i}`).value;
    const reimbPct = getVal(`capex_reimb_${i}`);
    const notes = document.getElementById(`capex_note_${i}`).value;
    capexLines.push({ month, category, amount, reimbPct, notes });
    capexSchedule[month] = (capexSchedule[month] || 0) + amount;
  }

  const debt = {
    initialLtv: getVal("initialLtv"),
    originationFee: getVal("origFee"),
    extensionFee: getVal("extensionFee"),
    futureTilcPct: getVal("futureTilcPct"),
    futureCapexPct: getVal("futureCapexPct"),
    fundingEndMonth: getVal("fundingEndMonth"),
    spread: getVal("spread"),
    indexRate: getVal("indexRate"),
    rateIndex: document.getElementById("rateIndex").value,
    fixedFloating: document.getElementById("fixedFloating").value,
  };

  const refi = document.getElementById("enableRefi").checked
    ? {
        initialLtv: getVal("refi_initialLtv"),
        originationFee: getVal("refi_origFee"),
        extensionFee: getVal("refi_extensionFee"),
        futureTilcPct: getVal("refi_futureTilcPct"),
        futureCapexPct: getVal("refi_futureCapexPct"),
        fundingEndMonth: getVal("refi_fundingEndMonth"),
        spread: getVal("refi_spread"),
        indexRate: getVal("refi_indexRate"),
      }
    : null;

  return {
    acquisitionDate,
    saleDate: saleDate.toISOString().slice(0, 10),
    holdMonths,
    grossSf: getVal("grossSf"),
    purchasePrice: getVal("purchasePrice"),
    closingCosts: getVal("closingCosts"),
    exitCapRate: getVal("exitCapRate"),
    discountRate: getVal("discountRate"),
    opexRatio: getVal("opexRatio"),
    vacancyOpexSlippage: getVal("vacancyOpexSlippage"),
    reservesMonthly: getVal("reservesMonthly"),
    capexSchedule,
    capexLines,
    mlas,
    tenants,
    debt,
    refinance: refi,
    sourceMaterials: state.sourceFiles.map((f) => ({ name: f.name, type: f.type, size: f.size })),
  };
}

function npv(cashflows, rate) {
  return cashflows.reduce((sum, cf, t) => sum + cf / ((1 + rate) ** t), 0);
}

function irr(series) {
  let low = -0.95;
  let high = 2.0;
  let fLow = npv(series, low);
  let fHigh = npv(series, high);
  let tries = 0;
  while (fLow * fHigh > 0 && tries < 20) {
    high += 1;
    fHigh = npv(series, high);
    tries += 1;
  }
  if (fLow * fHigh > 0) return 0;
  for (let i = 0; i < 120; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(series, mid);
    if (Math.abs(fMid) < 1e-8) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

function rentForMonth(tenant, month) {
  const sorted = [...(tenant.rentSteps || [])].sort((a, b) => a.date.localeCompare(b.date));
  let rent = tenant.currentRent;
  for (const step of sorted) {
    if (month >= monthDiff(state.lastAssumptions?.acquisitionDate || "2026-01-01", step.date)) {
      rent = step.rent;
    }
  }
  return rent;
}

function runModel(a) {
  state.lastAssumptions = a;
  const monthly = [];

  for (let m = 1; m <= a.holdMonths; m++) {
    let grossRent = 0;
    let leasingCosts = 0;
    let vacancySlippageExpense = 0;

    for (const t of a.tenants) {
      const commenced = m >= t.commencementMonth;
      const notExpired = m <= t.expMonth;
      const active = commenced && notExpired;

      if (active) {
        const rentPsf = rentForMonth(t, m);
        grossRent += rentPsf * t.sf;
      } else if (!commenced) {
        const inPlacePotential = t.currentRent * t.sf;
        vacancySlippageExpense += inPlacePotential * (a.vacancyOpexSlippage || 0);
      }

      // Keep leasing-cost logic tied to MLA at expiration, if mapped.
      if (m === t.expMonth + 1 && a.mlas.length > 0) {
        const mla = a.mlas[0];
        const renewal = mla.renewalProbability >= 0.5;
        const ti = renewal ? mla.tiRenewal : mla.tiNew;
        const lc = renewal ? mla.lcRenewal : mla.lcNew;
        leasingCosts += t.sf * ti;
        leasingCosts += t.sf * mla.marketRent * mla.leaseTerm * lc;
      }
    }

    const opex = grossRent * a.opexRatio + vacancySlippageExpense;
    const noi = grossRent - opex;
    const capex = a.capexSchedule[m] || 0;
    const reserves = a.reservesMonthly;
    const unlevered = noi - leasingCosts - capex - reserves;
    monthly.push({ month: m, grossRent, opex, vacancySlippageExpense, noi, leasingCosts, capex, reserves, unlevered });
  }

  const debt = a.debt || {};
  const loan = a.purchasePrice * (debt.initialLtv || 0);
  const rate = ((debt.spread || 0) + (debt.indexRate || 0)) / 12;
  let balance = loan;
  monthly.forEach((r) => {
    const debtService = balance * rate;
    const reimbursement = r.month <= (debt.fundingEndMonth || 0)
      ? (debt.futureTilcPct || 0) * r.leasingCosts + (debt.futureCapexPct || 0) * r.capex
      : 0;
    balance += reimbursement;
    r.debtService = debtService;
    r.reimbursement = reimbursement;
    r.levered = r.unlevered - debtService + reimbursement;
  });

  const terminal = (monthly[monthly.length - 1].noi * 12) / a.exitCapRate;
  const netSale = terminal * 0.99;
  const unlevSeries = [-(a.purchasePrice + a.closingCosts), ...monthly.map((r) => r.unlevered)];
  unlevSeries[unlevSeries.length - 1] += netSale;
  const levSeries = [-(a.purchasePrice + a.closingCosts - loan * (1 - (debt.originationFee || 0))), ...monthly.map((r) => r.levered)];
  levSeries[levSeries.length - 1] += netSale - balance;

  const annual = [];
  for (let y = 0; y < a.holdMonths / 12; y++) {
    const rows = monthly.slice(y * 12, y * 12 + 12);
    annual.push({
      year: y + 1,
      annualNoi: rows.reduce((s, r) => s + r.noi, 0),
      annualUnlevered: rows.reduce((s, r) => s + r.unlevered, 0),
      annualLevered: rows.reduce((s, r) => s + r.levered, 0),
    });
  }

  return {
    assumptions: a,
    monthly,
    annual,
    metrics: {
      unleveredIrr: irr(unlevSeries),
      leveredIrr: irr(levSeries),
      unleveredEqMult: unlevSeries.slice(1).reduce((s, x) => s + x, 0) / -unlevSeries[0],
      leveredEqMult: levSeries.slice(1).reduce((s, x) => s + x, 0) / -levSeries[0],
      leveredProfit: levSeries.reduce((s, x) => s + x, 0),
      totalHoldCosts: a.closingCosts + monthly.reduce((s, r) => s + r.leasingCosts + r.capex + r.reserves, 0),
      terminalValue: terminal,
    },
  };
}

function renderCapexSummary() {
  let total = 0;
  let reimb = 0;
  for (let i = 1; i <= state.capexCount; i++) {
    if (!document.getElementById(`capex_amount_${i}`)) continue;
    const amt = getVal(`capex_amount_${i}`);
    const pct = getVal(`capex_reimb_${i}`);
    total += amt;
    reimb += amt * pct;
  }
  document.getElementById("capexSummary").textContent = `Total Capex: ${moneyFmt.format(total)} | Potential Lender Reimbursement: ${moneyFmt.format(reimb)}`;
}

function toHtmlTable(columns, rows) {
  const head = `<tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("");
  return `<table class="table">${head}${body}</table>`;
}

function render(result) {
  const m = result.metrics;
  document.getElementById("kpiBar").innerHTML = [
    ["Unlevered IRR", pctFmt.format(m.unleveredIrr)],
    ["Levered IRR", pctFmt.format(m.leveredIrr)],
    ["Unlevered Eq. Mult", `${m.unleveredEqMult.toFixed(2)}x`],
    ["Levered Eq. Mult", `${m.leveredEqMult.toFixed(2)}x`],
    ["Levered Profit", moneyFmt.format(m.leveredProfit)],
  ].map(([k, v]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  document.getElementById("summary").textContent = `INVESTMENT SUMMARY\n\nReturns (from monthly cash flows)\n- Unlevered IRR: ${pctFmt.format(m.unleveredIrr)}\n- Levered IRR: ${pctFmt.format(m.leveredIrr)}\n- Unlevered Equity Multiple: ${m.unleveredEqMult.toFixed(2)}x\n- Levered Equity Multiple: ${m.leveredEqMult.toFixed(2)}x\n- Levered Profit: ${moneyFmt.format(m.leveredProfit)}\n\nVacancy handling\n- Vacant suites recognized from lease commencement date\n- Vacancy opex slippage included using configured slippage input\n`;

  const metricRows = Object.entries(m).map(([k, v]) => [k, typeof v === "number" ? numFmt.format(v) : v]);
  document.getElementById("metrics").innerHTML = toHtmlTable(["Metric", "Value"], metricRows);

  const annualRows = result.annual.map((r) => [
    r.year,
    moneyFmt.format(r.annualNoi),
    moneyFmt.format(r.annualUnlevered),
    moneyFmt.format(r.annualLevered),
  ]);
  document.getElementById("annual").innerHTML = toHtmlTable(["Year", "Annual NOI", "Annual Unlevered CF", "Annual Levered CF"], annualRows);
}

function download(name, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function xmlWorksheet(name, rows) {
  return `<Worksheet ss:Name="${name}"><Table>${rows.map((r) => `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${String(c).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]))}</Data></Cell>`).join("")}</Row>`).join("")}</Table></Worksheet>`;
}

function exportExcel(result, summaryOnly = false) {
  const sRows = [
    ["Item", "Value"],
    ["Purchase Price", result.assumptions.purchasePrice],
    ["Closing Costs", result.assumptions.closingCosts],
    ["Total Hold Costs", result.metrics.totalHoldCosts],
    ["Unlevered IRR", result.metrics.unleveredIrr],
    ["Levered IRR", result.metrics.leveredIrr],
    ["Unlevered Equity Multiple", result.metrics.unleveredEqMult],
    ["Levered Equity Multiple", result.metrics.leveredEqMult],
    ["Levered Profit", result.metrics.leveredProfit],
    ["Terminal Value", result.metrics.terminalValue],
  ];

  const worksheets = [xmlWorksheet("InvestmentSummary", sRows)];
  if (!summaryOnly) {
    worksheets.push(xmlWorksheet("Assumptions", Object.entries(result.assumptions).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : v])));
    worksheets.push(xmlWorksheet("MonthlyCF", [["month", "grossRent", "opex", "vacancySlippageExpense", "noi", "leasingCosts", "capex", "reserves", "unlevered", "debtService", "reimbursement", "levered"], ...result.monthly.map((r) => [r.month, r.grossRent, r.opex, r.vacancySlippageExpense, r.noi, r.leasingCosts, r.capex, r.reserves, r.unlevered, r.debtService, r.reimbursement, r.levered])]));
    worksheets.push(xmlWorksheet("AnnualCF", [["year", "annualNoi", "annualUnlevered", "annualLevered"], ...result.annual.map((r) => [r.year, r.annualNoi, r.annualUnlevered, r.annualLevered])]));
    worksheets.push(xmlWorksheet("RentRoll", [["name", "sf", "commencementDate", "expirationDate", "currentRent", "rentSteps"], ...result.assumptions.tenants.map((t) => [t.name, t.sf, t.commencementDate, t.expirationDate, t.currentRent, JSON.stringify(t.rentSteps || [])])]));
  }

  const xml = `<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n${worksheets.join("\n")}\n</Workbook>`;
  download(summaryOnly ? "investment_summary.xls" : "underwriting_model_output.xls", xml, "application/vnd.ms-excel");
}

function generateReportText(result) {
  return `# Institutional Underwriting Summary\n\n## Returns (Monthly Cash Flows)\n- Unlevered IRR: ${pctFmt.format(result.metrics.unleveredIrr)}\n- Levered IRR: ${pctFmt.format(result.metrics.leveredIrr)}\n- Unlevered Equity Multiple: ${result.metrics.unleveredEqMult.toFixed(2)}x\n- Levered Equity Multiple: ${result.metrics.leveredEqMult.toFixed(2)}x\n\n## Rent Roll\n- Tenant / Suite Count: ${result.assumptions.tenants.length}\n- Vacant suites handled by commencement date logic\n`;
}

function parseDateLike(token) {
  if (!token) return null;
  const cleaned = token.replace(/\./g, "/").trim();
  const m1 = cleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m1) {
    let y = Number(m1[3]);
    if (y < 100) y += 2000;
    return `${y.toString().padStart(4, "0")}-${String(m1[1]).padStart(2, "0")}-${String(m1[2]).padStart(2, "0")}`;
  }
  const m2 = cleaned.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, "0")}-${String(m2[3]).padStart(2, "0")}`;
  return null;
}

function extractPdfTextFromBytes(bytes) {
  // Keep work bounded to avoid browser freezes/timeouts on large OMs.
  const slice = bytes.slice(0, Math.min(bytes.length, 7_000_000));
  const latin = new TextDecoder("latin1").decode(slice);

  const textRuns = [];
  const literalMatches = latin.match(/\((?:\\.|[^\\)]){5,}\)/g) || [];
  for (let i = 0; i < literalMatches.length && i < 5000; i++) {
    textRuns.push(literalMatches[i].slice(1, -1));
  }
  const printable = latin.match(/[A-Za-z0-9$%,.\/()\-:\s]{30,}/g) || [];
  for (let i = 0; i < printable.length && i < 5000; i++) {
    textRuns.push(printable[i]);
  }

  return textRuns.join("\n");
}

function parseRentRollFromText(text) {
  const tenants = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.length < 12) continue;

    // Candidate style: "TenantName 25,000 01/01/2026 12/31/2030 3.75"
    const dateMatches = line.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/g) || [];
    const numMatches = line.match(/[\d,]+(?:\.\d+)?/g) || [];
    if (dateMatches.length < 2 || numMatches.length < 2) continue;

    const startDate = parseDateLike(dateMatches[0]);
    const expDate = parseDateLike(dateMatches[1]);
    if (!startDate || !expDate) continue;

    const sfCandidate = numMatches.find((n) => Number(n.replace(/,/g, "")) > 1000);
    const rentCandidate = [...numMatches].reverse().find((n) => Number(n) > 0 && Number(n) < 200);
    if (!sfCandidate || !rentCandidate) continue;

    let name = line;
    name = name.replace(dateMatches[0], "").replace(dateMatches[1], "");
    name = name.replace(sfCandidate, "").replace(rentCandidate, "").trim();
    if (!name || /^\d+$/.test(name)) name = `Suite ${tenants.length + 1}`;

    tenants.push({
      name: name.slice(0, 60),
      sf: Number(sfCandidate.replace(/,/g, "")),
      commencementDate: startDate,
      expirationDate: expDate,
      currentRent: Number(rentCandidate),
      rentSteps: [],
    });
  }

  const seen = new Set();
  return tenants.filter((t) => {
    const key = `${t.name.toLowerCase()}|${t.sf}|${t.commencementDate}|${t.expirationDate}|${t.currentRent}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clearExistingTenants() {
  document.getElementById("tenantContainer").innerHTML = "";
  state.tenantCount = 0;
  state.rentStepsByTenant = {};
}

function prefillRentRoll(tenants) {
  if (!tenants.length) return;
  clearExistingTenants();
  tenants.forEach((t) => addTenant(t));
}

async function analyzeSourceMaterials() {
  const status = document.getElementById("sourceStatus");
  if (!state.sourceFiles.length) {
    status.textContent = "No files selected. Upload source materials first.";
    return;
  }

  status.textContent = `Analyzing ${state.sourceFiles.length} file(s) for rent-roll rows...`;
  const allTenants = [];

  for (const file of state.sourceFiles) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "txt", "md", "csv"].includes(ext)) continue;

    try {
      const text = ext === "pdf"
        ? extractPdfTextFromBytes(new Uint8Array(await file.arrayBuffer()))
        : await file.text();

      if (ext === "csv") {
        const rows = text.split(/\r?\n/).slice(1);
        rows.forEach((r, i) => {
          const cols = r.split(",").map((x) => x.trim());
          if (cols.length < 5) return;
          const tenant = {
            name: cols[0] || `Suite ${i + 1}`,
            sf: Number((cols[1] || "0").replace(/,/g, "")),
            commencementDate: parseDateLike(cols[2]) || "2026-01-01",
            expirationDate: parseDateLike(cols[3]) || "2028-01-01",
            currentRent: Number(cols[4] || 0),
            rentSteps: [],
          };
          if (tenant.sf > 0 && tenant.currentRent > 0) allTenants.push(tenant);
        });
      } else {
        allTenants.push(...parseRentRollFromText(text));
      }
    } catch (err) {
      console.error("Failed to parse", file.name, err);
    }
  }

  prefillRentRoll(allTenants);
  status.textContent = `Analyzed ${state.sourceFiles.length} files. Prefilled ${allTenants.length} rent-roll row(s).`;
}

function openRentStepDialog(tenantIdx) {
  state.activeTenantForSteps = tenantIdx;
  const dialog = document.getElementById("rentStepDialog");
  const title = document.getElementById("stepDialogTitle");
  title.textContent = `Rent Steps: ${document.getElementById(`tenant_name_${tenantIdx}`)?.value || `Tenant ${tenantIdx}`}`;

  const body = document.getElementById("stepTableBody");
  body.innerHTML = "";
  const steps = state.rentStepsByTenant[tenantIdx] || [];
  steps.forEach((s) => addStepRowToDialog(s.date, s.rent));

  dialog.showModal();
}

function addStepRowToDialog(date = "", rent = 0) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="date" value="${date}" /></td>
    <td><input data-format="currency" data-raw="${rent}" value="${displayFormatted(rent, "currency")}" /></td>
    <td><button class="btn btn-danger" type="button" onclick="this.closest('tr').remove()">X</button></td>
  `;
  document.getElementById("stepTableBody").appendChild(tr);
  tr.querySelectorAll("input[data-format]").forEach(bindFormattedInput);
}

function saveRentStepsFromDialog() {
  const idx = state.activeTenantForSteps;
  if (!idx) return;
  const rows = [...document.querySelectorAll("#stepTableBody tr")];
  const steps = rows.map((row) => {
    const date = row.querySelector('input[type="date"]').value;
    const rentInput = row.querySelector('input[data-format="currency"]');
    const rent = parseFormatted(rentInput.dataset.raw ?? rentInput.value, "currency");
    return { date, rent };
  }).filter((x) => x.date && x.rent > 0);

  state.rentStepsByTenant[idx] = steps;
  renderRentStepSummary(idx);
}

document.getElementById("addMla").onclick = addMla;
document.getElementById("addTenant").onclick = () => addTenant();
document.getElementById("addCapex").onclick = () => addCapexLine();
document.getElementById("analyzeSources").onclick = analyzeSourceMaterials;

document.getElementById("addStepRow").onclick = () => addStepRowToDialog();
document.getElementById("closeStepDialog").onclick = () => {
  saveRentStepsFromDialog();
  document.getElementById("rentStepDialog").close();
};

document.getElementById("runModel").onclick = () => {
  const assumptions = gatherAssumptions();
  state.lastResult = runModel(assumptions);
  render(state.lastResult);
};

document.getElementById("exportSummaryExcel").onclick = () => state.lastResult && exportExcel(state.lastResult, true);
document.getElementById("exportModelExcel").onclick = () => state.lastResult && exportExcel(state.lastResult, false);
document.getElementById("exportJson").onclick = () => download("assumptions.json", JSON.stringify(gatherAssumptions(), null, 2), "application/json");
document.getElementById("exportReport").onclick = () => state.lastResult && download("investment_summary.md", generateReportText(state.lastResult), "text/markdown");

document.getElementById("fileDrop").addEventListener("change", (e) => {
  state.sourceFiles = [...e.target.files];
  document.getElementById("fileList").innerHTML = state.sourceFiles.map((f) => `<span class="chip">${f.name}</span>`).join("");
  document.getElementById("sourceStatus").textContent = `${state.sourceFiles.length} file(s) ready for rent-roll analysis.`;
});

initForm();
