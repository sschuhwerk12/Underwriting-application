const state = {
  mlaCount: 0,
  tenantCount: 0,
  capexCount: 0,
  lastResult: null,
};

const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mainConfig = [
  ["acquisitionDate", "Acquisition Date", "date", "2026-01-01", "text"],
  ["holdYears", "Hold Period (years)", 5, "number", "number"],
  ["grossSf", "Square Footage", 100000, "number", "number"],
  ["purchasePrice", "Purchase Price ($)", 25000000, "currency", "currency"],
  ["closingCosts", "Closing Costs ($)", 750000, "currency", "currency"],
  ["exitCapRate", "Exit Cap Rate", 0.065, "percent", "percent"],
  ["discountRate", "Discount Rate (annual)", 0.1, "percent", "percent"],
  ["opexRatio", "Operating Expense Ratio", 0.35, "percent", "percent"],
];

const debtConfig = [
  ["initialLtv", "Initial LTV", 0.60, "percent"],
  ["origFee", "Origination Fee", 0.01, "percent"],
  ["extensionFee", "Extension Fee", 0.005, "percent"],
  ["futureTilcPct", "% TI/LC Reimbursed", 0.50, "percent"],
  ["futureCapexPct", "% Capex Reimbursed", 0.50, "percent"],
  ["fundingEndMonth", "Funding End Month", 36, "number"],
  ["spread", "Rate Spread", 0.025, "percent"],
  ["indexRate", "Index Rate", 0.045, "percent"],
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

function createInput(id, value, formatType = "number") {
  const input = document.createElement("input");
  input.id = id;
  input.type = formatType === "date" ? "date" : "text";
  input.dataset.format = formatType;
  input.dataset.raw = String(value);
  input.value = displayFormatted(value, formatType);

  if (formatType !== "date" && formatType !== "text") {
    input.addEventListener("focus", () => {
      input.value = input.dataset.raw || "0";
    });
    input.addEventListener("blur", () => {
      const raw = parseFormatted(input.value, formatType);
      input.dataset.raw = String(raw);
      input.value = displayFormatted(raw, formatType);
      if (id.startsWith("capex_amount_") || id === "reservesMonthly") renderCapexSummary();
    });
  }
  return input;
}

function getVal(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const formatType = el.dataset.format || "number";
  if (formatType === "date" || formatType === "text") return el.value;
  return parseFormatted(el.dataset.raw ?? el.value, formatType);
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
  addCapexLine(30, "Amenities", 750000, 0.25, "Lobby and conference center");
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

function bindFormattedInput(input) {
  const f = input.dataset.format;
  input.addEventListener("focus", () => { input.value = input.dataset.raw || "0"; });
  input.addEventListener("blur", () => {
    const raw = parseFormatted(input.value, f);
    input.dataset.raw = String(raw);
    input.value = displayFormatted(raw, f);
    if (input.id.startsWith("capex_amount_")) renderCapexSummary();
  });
}

function addTenant() {
  state.tenantCount += 1;
  const i = state.tenantCount;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input id="tenant_name_${i}" value="Tenant ${i}" /></td>
    <td><input id="tenant_sf_${i}" data-format="number" data-raw="25000" value="25,000" /></td>
    <td><input id="tenant_suite_${i}" value="Suite ${100 + i}" /></td>
    <td><input id="tenant_start_${i}" data-format="number" data-raw="1" value="1" /></td>
    <td><input id="tenant_exp_${i}" data-format="number" data-raw="24" value="24" /></td>
    <td><input id="tenant_rent_${i}" data-format="currency" data-raw="3.75" value="$4" /></td>
    <td><input id="tenant_bump_${i}" data-format="percent" data-raw="0.03" value="3.00%" /></td>
    <td><input id="tenant_downtime_${i}" data-format="number" data-raw="3" value="3" /></td>
    <td><input id="tenant_recovery_${i}" data-format="percent" data-raw="0.85" value="85.00%" /></td>
    <td><input id="tenant_credit_${i}" data-format="percent" data-raw="0.01" value="1.00%" /></td>
    <td><input id="tenant_mla_${i}" value="MLA-1" /></td>
    <td><input id="tenant_renew_override_${i}" data-format="percent" data-raw="" placeholder="use MLA" /></td>
    <td><input id="tenant_fr_new_override_${i}" data-format="number" data-raw="" placeholder="use MLA" /></td>
    <td><input id="tenant_fr_ren_override_${i}" data-format="number" data-raw="" placeholder="use MLA" /></td>
    <td><input id="tenant_ti_new_override_${i}" data-format="currency" data-raw="" placeholder="use MLA" /></td>
    <td><input id="tenant_ti_ren_override_${i}" data-format="currency" data-raw="" placeholder="use MLA" /></td>
    <td><input id="tenant_lc_new_override_${i}" data-format="percent" data-raw="" placeholder="use MLA" /></td>
    <td><input id="tenant_lc_ren_override_${i}" data-format="percent" data-raw="" placeholder="use MLA" /></td>
    <td><button class="btn btn-danger" type="button" onclick="this.closest('tr').remove()">X</button></td>
  `;
  document.getElementById("tenantContainer").appendChild(tr);
  tr.querySelectorAll("input[data-format]").forEach(bindFormattedInput);
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

function gatherAssumptions() {
  const holdMonths = Math.round(getVal("holdYears") * 12);
  const saleDate = new Date(getVal("acquisitionDate"));
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
    tenants.push({
      name: document.getElementById(`tenant_name_${i}`).value.trim(),
      sf: getVal(`tenant_sf_${i}`),
      suite: document.getElementById(`tenant_suite_${i}`).value.trim(),
      startMonth: getVal(`tenant_start_${i}`),
      expMonth: getVal(`tenant_exp_${i}`),
      currentRent: getVal(`tenant_rent_${i}`),
      annualBump: getVal(`tenant_bump_${i}`),
      downtimeMonths: getVal(`tenant_downtime_${i}`),
      recoveryPct: getVal(`tenant_recovery_${i}`),
      creditLossPct: getVal(`tenant_credit_${i}`),
      mlaName: document.getElementById(`tenant_mla_${i}`).value.trim(),
      renewalOverride: getVal(`tenant_renew_override_${i}`),
      freeRentNewOverride: getVal(`tenant_fr_new_override_${i}`),
      freeRentRenewalOverride: getVal(`tenant_fr_ren_override_${i}`),
      tiNewOverride: getVal(`tenant_ti_new_override_${i}`),
      tiRenewalOverride: getVal(`tenant_ti_ren_override_${i}`),
      lcNewOverride: getVal(`tenant_lc_new_override_${i}`),
      lcRenewalOverride: getVal(`tenant_lc_ren_override_${i}`),
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
    acquisitionDate: getVal("acquisitionDate"),
    saleDate: saleDate.toISOString().slice(0, 10),
    holdMonths,
    grossSf: getVal("grossSf"),
    purchasePrice: getVal("purchasePrice"),
    closingCosts: getVal("closingCosts"),
    exitCapRate: getVal("exitCapRate"),
    discountRate: getVal("discountRate"),
    opexRatio: getVal("opexRatio"),
    reservesMonthly: getVal("reservesMonthly"),
    capexSchedule,
    capexLines,
    mlas,
    tenants,
    debt,
    refinance: refi,
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

function runModel(a) {
  const monthly = [];
  const mlaMap = Object.fromEntries(a.mlas.map((m) => [m.name, m]));

  for (let m = 1; m <= a.holdMonths; m++) {
    let grossRent = 0;
    let leasingCosts = 0;

    for (const t of a.tenants) {
      const mla = mlaMap[t.mlaName];
      let rentPsf = t.currentRent * ((1 + (t.annualBump || 0)) ** Math.max(0, (m - (t.startMonth || 1)) / 12));

      if (mla && m > t.expMonth) {
        const post = m - t.expMonth;
        const renewP = t.renewalOverride > 0 ? t.renewalOverride : mla.renewalProbability;
        const renewal = renewP >= 0.5;

        const frNew = t.freeRentNewOverride > 0 ? t.freeRentNewOverride : mla.freeRentNew;
        const frRen = t.freeRentRenewalOverride > 0 ? t.freeRentRenewalOverride : mla.freeRentRenewal;

        const downtime = t.downtimeMonths || 0;
        const totalNoRent = downtime + (renewal ? frRen : frNew);

        if (post <= totalNoRent) {
          rentPsf = 0;
        } else {
          const yIdx = Math.min(Math.floor((m - 1) / 12), 9);
          let marketRent = mla.marketRent;
          for (let y = 1; y <= yIdx; y++) marketRent *= (1 + mla.growth[y]);
          rentPsf = marketRent;
        }

        if (post === 1) {
          const tiNew = t.tiNewOverride > 0 ? t.tiNewOverride : mla.tiNew;
          const tiRen = t.tiRenewalOverride > 0 ? t.tiRenewalOverride : mla.tiRenewal;
          const lcNew = t.lcNewOverride > 0 ? t.lcNewOverride : mla.lcNew;
          const lcRen = t.lcRenewalOverride > 0 ? t.lcRenewalOverride : mla.lcRenewal;

          leasingCosts += t.sf * (renewal ? tiRen : tiNew);
          leasingCosts += t.sf * rentPsf * mla.leaseTerm * (renewal ? lcRen : lcNew);
        }
      }

      let tenantIncome = rentPsf * t.sf;
      tenantIncome *= (t.recoveryPct || 0);
      tenantIncome *= (1 - (t.creditLossPct || 0));
      grossRent += tenantIncome;
    }

    const opex = grossRent * a.opexRatio;
    const noi = grossRent - opex;
    const capex = a.capexSchedule[m] || 0;
    const reserves = a.reservesMonthly;
    const unlevered = noi - leasingCosts - capex - reserves;

    monthly.push({ month: m, grossRent, opex, noi, leasingCosts, capex, reserves, unlevered });
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

  document.getElementById("summary").textContent = `INVESTMENT SUMMARY

Total Investment Costs
- Purchase Price: ${moneyFmt.format(result.assumptions.purchasePrice)}
- Closing Costs: ${moneyFmt.format(result.assumptions.closingCosts)}
- Hold Period Costs: ${moneyFmt.format(m.totalHoldCosts)}

Returns (from monthly cash flows)
- Unlevered IRR: ${pctFmt.format(m.unleveredIrr)}
- Levered IRR: ${pctFmt.format(m.leveredIrr)}
- Unlevered Equity Multiple: ${m.unleveredEqMult.toFixed(2)}x
- Levered Equity Multiple: ${m.leveredEqMult.toFixed(2)}x
- Levered Profit: ${moneyFmt.format(m.leveredProfit)}

Rent Roll / Rollover
- Tenants: ${result.assumptions.tenants.length}
- MLA Tranches: ${result.assumptions.mlas.length}

Exit Assumptions
- Exit Cap Rate: ${pctFmt.format(result.assumptions.exitCapRate)}
- Terminal Value: ${moneyFmt.format(m.terminalValue)}
`;

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
    worksheets.push(xmlWorksheet("MonthlyCF", [["month", "grossRent", "opex", "noi", "leasingCosts", "capex", "reserves", "unlevered", "debtService", "reimbursement", "levered"], ...result.monthly.map((r) => [r.month, r.grossRent, r.opex, r.noi, r.leasingCosts, r.capex, r.reserves, r.unlevered, r.debtService, r.reimbursement, r.levered])]));
    worksheets.push(xmlWorksheet("AnnualCF", [["year", "annualNoi", "annualUnlevered", "annualLevered"], ...result.annual.map((r) => [r.year, r.annualNoi, r.annualUnlevered, r.annualLevered])]));
    worksheets.push(xmlWorksheet("RentRoll", [["name", "sf", "suite", "startMonth", "expMonth", "currentRent", "annualBump", "downtimeMonths", "recoveryPct", "creditLossPct", "mlaName"], ...result.assumptions.tenants.map((t) => [t.name, t.sf, t.suite, t.startMonth, t.expMonth, t.currentRent, t.annualBump, t.downtimeMonths, t.recoveryPct, t.creditLossPct, t.mlaName])]));
    worksheets.push(xmlWorksheet("CapitalBudget", [["month", "category", "amount", "reimbPct", "notes"], ...result.assumptions.capexLines.map((x) => [x.month, x.category, x.amount, x.reimbPct, x.notes])]));
    worksheets.push(xmlWorksheet("MLAs", [["name", "marketRent", "tiNew", "tiRenewal", "renewalProbability", "leaseTerm", "freeRentNew", "freeRentRenewal", "lcNew", "lcRenewal", "growth"], ...result.assumptions.mlas.map((m) => [m.name, m.marketRent, m.tiNew, m.tiRenewal, m.renewalProbability, m.leaseTerm, m.freeRentNew, m.freeRentRenewal, m.lcNew, m.lcRenewal, m.growth.join(",")])]));
  }

  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheets.join("\n")}
</Workbook>`;

  download(summaryOnly ? "investment_summary.xls" : "underwriting_model_output.xls", xml, "application/vnd.ms-excel");
}

function generateReportText(result) {
  return `# Institutional Underwriting Summary

## Total Investment Costs
- Purchase Price: ${moneyFmt.format(result.assumptions.purchasePrice)}
- Closing Costs: ${moneyFmt.format(result.assumptions.closingCosts)}
- Total Hold Costs: ${moneyFmt.format(result.metrics.totalHoldCosts)}

## Returns (Monthly Cash Flows)
- Unlevered IRR: ${pctFmt.format(result.metrics.unleveredIrr)}
- Levered IRR: ${pctFmt.format(result.metrics.leveredIrr)}
- Unlevered Equity Multiple: ${result.metrics.unleveredEqMult.toFixed(2)}x
- Levered Equity Multiple: ${result.metrics.leveredEqMult.toFixed(2)}x
- Levered Whole-Dollar Profit: ${moneyFmt.format(result.metrics.leveredProfit)}

## Rent Roll & Rollover Assumptions
- Tenant Count: ${result.assumptions.tenants.length}
- MLA Tranches: ${result.assumptions.mlas.length}

## Capital Budget
- Capex Lines: ${result.assumptions.capexLines.length}
- Monthly Reserves: ${moneyFmt.format(result.assumptions.reservesMonthly)}

## Loan / Exit
- Initial LTV: ${pctFmt.format(result.assumptions.debt.initialLtv)}
- Rate Index: ${result.assumptions.debt.rateIndex}
- Fixed/Floating: ${result.assumptions.debt.fixedFloating}
- Exit Cap: ${pctFmt.format(result.assumptions.exitCapRate)}
- Terminal Value: ${moneyFmt.format(result.metrics.terminalValue)}
`;
}

document.getElementById("addMla").onclick = addMla;
document.getElementById("addTenant").onclick = addTenant;
document.getElementById("addCapex").onclick = () => addCapexLine();

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
  const names = [...e.target.files].map((f) => f.name);
  document.getElementById("fileList").innerHTML = names.map((n) => `<span class="chip">${n}</span>`).join("");
});

initForm();
