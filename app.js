const state = {
  mlaCount: 0,
  tenantCount: 0,
  capexCount: 0,
  opexCount: 0,
  lastResult: null,
  sourceFiles: [],
  rentStepsByTenant: {},
  activeTenantForSteps: null,
  lastAssumptions: null,
};

const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mainConfig = [
  ["acquisitionDate", "Acquisition Date", "2026-01-01", "date"],
  ["holdYears", "Hold Period (years)", 10, "number"],
  ["grossSf", "Square Footage", 100000, "number"],
  ["purchasePrice", "Purchase Price ($)", 25000000, "currency"],
  ["closingCosts", "Closing Costs ($)", 750000, "currency"],
  ];

const debtConfig = [
  ["initialLtv", "Initial LTV", 0.60, "percent"],
  ["origFee", "Origination Fee", 0.01, "percent"],
  ["extensionFee", "Extension Fee", 0.005, "percent"],
  ["futureTilcPct", "% TI/LC Reimbursed", 0.50, "percent"],
  ["futureCapexPct", "% Capex Reimbursed", 0.50, "percent"],
  ["fundingEndMonth", "Funding End Month", 36, "number"],
  ["spread", "Rate Spread", 0.025, "percent"],
  ["indexRate", "Fixed Rate", 0.065, "percent"],
  ["interestOnlyMonths", "Interest Only Period (months)", 12, "number"],
  ["amortizationMonths", "Amortization Period (months)", 360, "number"],
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
    if (input.id.startsWith("capex_amount_")) renderCapexSummary();
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
  const f = el.dataset.format || "text";
  if (f === "date" || f === "text") return el.value;
  return parseFormatted(el.dataset.raw ?? el.value, f);
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const f = el.dataset.format || "text";
  if (f === "date" || f === "text") {
    el.value = String(value ?? "");
  } else {
    const n = Number(value || 0);
    el.dataset.raw = String(n);
    el.value = displayFormatted(n, f);
  }
}

function addLabeledInput(parent, id, label, value, formatType = "number") {
  const wrapper = document.createElement("label");
  wrapper.textContent = label;
  wrapper.appendChild(createInput(id, value, formatType));
  parent.appendChild(wrapper);
}

function initGrowthInputs() {
  const c = document.getElementById("growthInputs");
  c.innerHTML = "";
  for (let y = 1; y <= 10; y++) {
    const label = document.createElement("label");
    label.textContent = `Year ${y}`;
    label.appendChild(createInput(`growth_year_${y}`, 0.03, "percent"));
    c.appendChild(label);
  }
}

function getGrowthArray() {
  const arr = [];
  for (let y = 1; y <= 10; y++) arr.push(getVal(`growth_year_${y}`));
  return arr;
}

function getMlaNames() {
  const names = [];
  for (let i = 1; i <= state.mlaCount; i++) {
    const el = document.getElementById(`mla_name_${i}`);
    if (el) names.push(el.value.trim() || `MLA-${i}`);
  }
  return names.length ? names : ["MLA-1"];
}

function refreshTenantMlaOptions() {
  const names = getMlaNames();
  for (let i = 1; i <= state.tenantCount; i++) {
    const sel = document.getElementById(`tenant_mla_${i}`);
    if (!sel) continue;
    const current = sel.value;
    sel.innerHTML = names.map((n) => `<option ${n === current ? "selected" : ""}>${n}</option>`).join("");
  }
}

function initForm() {
  const main = document.getElementById("mainInputs");
  mainConfig.forEach(([id, label, value, formatType]) => addLabeledInput(main, id, label, value, formatType));

  const debt = document.getElementById("debtInputs");
  debtConfig.forEach(([id, label, value, formatType]) => addLabeledInput(debt, id, label, value, formatType));
  const rateIndex = document.createElement("label");
  rateIndex.innerHTML = `Floating Index Source<select id="rateIndex"><option>SOFR</option><option>5Y Treasury</option></select>`;
  debt.appendChild(rateIndex);
  const fixedFloat = document.createElement("label");
  fixedFloat.innerHTML = `Fixed / Floating<select id="fixedFloating"><option>Floating</option><option>Fixed</option></select>`;
  debt.appendChild(fixedFloat);

  const refi = document.getElementById("refiInputs");
  debtConfig.forEach(([id, label, value, formatType]) => addLabeledInput(refi, `refi_${id}`, label, value, formatType));

  const exit = document.getElementById("exitInputs");
  addLabeledInput(exit, "exitCapRate", "Exit Cap Rate", 0.065, "percent");
  addLabeledInput(exit, "saleCostPct", "Sale Cost (% of gross sale)", 0.01, "percent");

  initGrowthInputs();
  addMla();
  addTenant();
  addOpexLine("Taxes", 300000, "$/Year", true, "");
  addCapexLine(6, "Building Systems", 250000, 0.5, "HVAC replacements");
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
      <button class="btn btn-danger" type="button" onclick="this.closest('.mla-card').remove(); refreshTenantMlaOptions();">Remove</button>
    </div>
    <div class="mla-grid">
      <label>Name</label>
      <label>Market Rent ($/SF/Mo)</label>
      <label>TI New ($/SF)</label>
      <label>TI Renewal ($/SF)</label>
      <label>Renewal Probability</label>
      <label>Lease Term (months)</label>
      <input id="mla_name_${i}" type="text" value="MLA-${i}" onblur="refreshTenantMlaOptions()" />
      <input id="mla_rent_${i}" data-format="currency" data-raw="4" type="text" value="$4" />
      <input id="mla_ti_new_${i}" data-format="currency" data-raw="30" type="text" value="$30" />
      <input id="mla_ti_ren_${i}" data-format="currency" data-raw="15" type="text" value="$15" />
      <input id="mla_renew_${i}" data-format="percent" data-raw="0.6" type="text" value="60.00%" />
      <input id="mla_term_${i}" data-format="number" data-raw="60" type="text" value="60" />
      <label>Downtime (months)</label>
      <label>Free Rent New (mo)</label>
      <label>Free Rent Renewal (mo)</label>
      <label>LC New</label>
      <label>LC Renewal</label>
      <div></div>
      <input id="mla_downtime_${i}" data-format="number" data-raw="3" type="text" value="3" />
      <input id="mla_fr_new_${i}" data-format="number" data-raw="4" type="text" value="4" />
      <input id="mla_fr_ren_${i}" data-format="number" data-raw="2" type="text" value="2" />
      <input id="mla_lc_new_${i}" data-format="percent" data-raw="0.05" type="text" value="5.00%" />
      <input id="mla_lc_ren_${i}" data-format="percent" data-raw="0.03" type="text" value="3.00%" />
    </div>
  `;
  c.appendChild(card);
  card.querySelectorAll("input[data-format]").forEach(bindFormattedInput);
  refreshTenantMlaOptions();
}

function renderRentStepSummary(tenantIdx) {
  const el = document.getElementById(`tenant_steps_summary_${tenantIdx}`);
  if (!el) return;
  const steps = state.rentStepsByTenant[tenantIdx] || [];
  el.textContent = steps.length ? `${steps.length} step(s)` : "None";
}

function addTenant(prefill = {}) {
  state.tenantCount += 1;
  const i = state.tenantCount;
  state.rentStepsByTenant[i] = prefill.rentSteps || [];

  const mlaOptions = getMlaNames().map((n) => `<option ${n === (prefill.mlaName || "MLA-1") ? "selected" : ""}>${n}</option>`).join("");
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input id="tenant_name_${i}" value="${prefill.name || `Suite ${100 + i}`}" /></td>
    <td><input id="tenant_sf_${i}" data-format="number" data-raw="${prefill.sf || 25000}" value="${displayFormatted(prefill.sf || 25000, "number")}" /></td>
    <td><input id="tenant_commence_${i}" type="date" data-format="date" value="${prefill.commencementDate || "2026-01-01"}" /></td>
    <td><input id="tenant_expire_${i}" type="date" data-format="date" value="${prefill.expirationDate || "2028-01-01"}" /></td>
    <td><input id="tenant_rent_${i}" data-format="currency" data-raw="${prefill.currentRent || 3.75}" value="${displayFormatted(prefill.currentRent || 3.75, "currency")}" /></td>
    <td>
      <select id="tenant_rent_type_${i}">
        <option ${prefill.rentType === "$/SF/Year" ? "selected" : ""}>$/SF/Year</option>
        <option ${prefill.rentType === "$/Year" ? "selected" : ""}>$/Year</option>
        <option ${(prefill.rentType || "$/SF/Mo") === "$/SF/Mo" ? "selected" : ""}>$/SF/Mo</option>
      </select>
    </td>
    <td><select id="tenant_mla_${i}">${mlaOptions}</select></td>
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

function addOpexLine(name = "", amount = 0, amountType = "$/Year", reimb = true, tenants = "") {
  state.opexCount += 1;
  const i = state.opexCount;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input id="opex_name_${i}" value="${name}" /></td>
    <td><input id="opex_amount_${i}" data-format="currency" data-raw="${amount}" value="${displayFormatted(amount, "currency")}" /></td>
    <td>
      <select id="opex_type_${i}">
        <option ${amountType === "$/Year" ? "selected" : ""}>$/Year</option>
        <option ${amountType === "$/SF/Year" ? "selected" : ""}>$/SF/Year</option>
      </select>
    </td>
    <td><input id="opex_reimb_${i}" type="checkbox" ${reimb ? "checked" : ""} /></td>
    <td><input id="opex_tenants_${i}" placeholder="blank = all tenants" value="${tenants}" /></td>
    <td><button class="btn btn-danger" type="button" onclick="this.closest('tr').remove()">X</button></td>
  `;
  document.getElementById("opexContainer").appendChild(tr);
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

function monthDiff(acqDateStr, dateStr) {
  const a = new Date(acqDateStr);
  const b = new Date(dateStr);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
}

function addMonths(dateStr, monthsToAdd) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + monthsToAdd);
  return d.toISOString().slice(0, 10);
}

function normalizeMonthlyRent(rentValue, rentType, sf) {
  if (rentType === "$/SF/Mo") return rentValue;
  if (rentType === "$/SF/Year") return rentValue / 12;
  if (rentType === "$/Year") return sf > 0 ? (rentValue / 12) / sf : 0;
  return rentValue;
}

function gatherAssumptions() {
  const acquisitionDate = getVal("acquisitionDate");
  const holdMonths = Math.round(getVal("holdYears") * 12);
  const saleDate = new Date(acquisitionDate);
  saleDate.setMonth(saleDate.getMonth() + holdMonths);

  const mlas = [];
  for (let i = 1; i <= state.mlaCount; i++) {
    if (!document.getElementById(`mla_name_${i}`)) continue;
    mlas.push({
      name: document.getElementById(`mla_name_${i}`).value.trim() || `MLA-${i}`,
      marketRent: getVal(`mla_rent_${i}`),
      tiNew: getVal(`mla_ti_new_${i}`),
      tiRenewal: getVal(`mla_ti_ren_${i}`),
      renewalProbability: getVal(`mla_renew_${i}`),
      leaseTerm: getVal(`mla_term_${i}`),
      downtimeMonths: getVal(`mla_downtime_${i}`),
      freeRentNew: getVal(`mla_fr_new_${i}`),
      freeRentRenewal: getVal(`mla_fr_ren_${i}`),
      lcNew: getVal(`mla_lc_new_${i}`),
      lcRenewal: getVal(`mla_lc_ren_${i}`),
    });
  }

  const tenants = [];
  for (let i = 1; i <= state.tenantCount; i++) {
    if (!document.getElementById(`tenant_name_${i}`)) continue;
    const sf = getVal(`tenant_sf_${i}`);
    const rentType = document.getElementById(`tenant_rent_type_${i}`).value;
    const monthlyRentPsf = normalizeMonthlyRent(getVal(`tenant_rent_${i}`), rentType, sf);

    tenants.push({
      name: document.getElementById(`tenant_name_${i}`).value.trim(),
      sf,
      commencementDate: getVal(`tenant_commence_${i}`),
      expirationDate: getVal(`tenant_expire_${i}`),
      commencementMonth: monthDiff(acquisitionDate, getVal(`tenant_commence_${i}`)),
      expMonth: monthDiff(acquisitionDate, getVal(`tenant_expire_${i}`)),
      currentRent: monthlyRentPsf,
      rentType,
      mlaName: document.getElementById(`tenant_mla_${i}`).value,
      rentSteps: (state.rentStepsByTenant[i] || []).slice(),
    });
  }

  const opexLines = [];
  for (let i = 1; i <= state.opexCount; i++) {
    if (!document.getElementById(`opex_name_${i}`)) continue;
    opexLines.push({
      name: document.getElementById(`opex_name_${i}`).value,
      amount: getVal(`opex_amount_${i}`),
      amountType: document.getElementById(`opex_type_${i}`).value,
      reimbursable: document.getElementById(`opex_reimb_${i}`).checked,
      reimbursingTenants: document.getElementById(`opex_tenants_${i}`).value,
    });
  }

  const capexLines = [];
  const capexSchedule = {};
  for (let i = 1; i <= state.capexCount; i++) {
    if (!document.getElementById(`capex_month_${i}`)) continue;
    const month = Math.round(getVal(`capex_month_${i}`));
    const amount = getVal(`capex_amount_${i}`);
    capexLines.push({
      month,
      category: document.getElementById(`capex_category_${i}`).value,
      amount,
      reimbPct: getVal(`capex_reimb_${i}`),
      notes: document.getElementById(`capex_note_${i}`).value,
    });
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
    interestOnlyMonths: getVal("interestOnlyMonths"),
    amortizationMonths: getVal("amortizationMonths"),
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
        interestOnlyMonths: getVal("refi_interestOnlyMonths"),
        amortizationMonths: getVal("refi_amortizationMonths"),
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
    saleCostPct: getVal("saleCostPct"),
    reservesMonthly: getVal("reservesMonthly"),
    growthByYear: getGrowthArray(),
    mlas,
    tenants,
    opexLines,
    capexSchedule,
    capexLines,
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
    if (fLow * fMid < 0) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

function getMlaMap(mlas) {
  return Object.fromEntries(mlas.map((m) => [m.name, m]));
}

function rentForMonth(assumptions, tenant, month) {
  const steps = [...(tenant.rentSteps || [])]
    .map((s) => ({ date: s.date, rent: normalizeMonthlyRent(s.rent, tenant.rentType, tenant.sf), month: monthDiff(assumptions.acquisitionDate, s.date) }))
    .filter((s) => s.date)
    .sort((a, b) => a.month - b.month);

  let rent = tenant.currentRent;
  for (const step of steps) if (month >= step.month) rent = step.rent;
  return rent;
}

function marketRentAtMonth(assumptions, baseRent, month) {
  let rent = baseRent;
  const yearIdx = Math.min(Math.floor((month - 1) / 12), 9);
  for (let y = 0; y <= yearIdx; y++) rent *= (1 + (assumptions.growthByYear[y] || 0));
  return rent;
}

function opexMonthlyAndReimbursement(assumptions, activeTenants, activeSf, totalSf) {
  let opexExpense = 0;
  let reimbursements = 0;

  for (const line of assumptions.opexLines) {
    const annual = line.amountType === "$/SF/Year" ? line.amount * assumptions.grossSf : line.amount;
    const monthly = annual / 12;
    opexExpense += monthly;

    if (!line.reimbursable) continue;

    const selected = String(line.reimbursingTenants || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const selectedSf = selected.length
      ? activeTenants.filter((t) => selected.includes(t.name.toLowerCase())).reduce((s, t) => s + t.sf, 0)
      : activeSf;

    const reimbRatio = totalSf > 0 ? Math.min(1, Math.max(0, selectedSf / totalSf)) : 0;
    reimbursements += monthly * reimbRatio;
  }

  return { opexExpense, reimbursements };
}

function getFloatingBenchmarkRate(rateIndex) {
  // Placeholder for SOFR API wiring; defaults conservatively when floating.
  if (rateIndex === 'SOFR') return 0.045;
  return 0.04;
}

function runModel(a) {
  state.lastAssumptions = a;
  const monthly = [];
  const mlaMap = getMlaMap(a.mlas);

  for (let m = 1; m <= a.holdMonths; m++) {
    let potentialBaseRent = 0;
    let absorptionTurnoverVacancy = 0;
    let freeRent = 0;
    let scheduledBaseRent = 0;
    let tiCosts = 0;
    let lcCosts = 0;
    const activeTenants = [];

    for (const t of a.tenants) {
      const mla = mlaMap[t.mlaName] || a.mlas[0];
      const inCurrentLease = m >= t.commencementMonth && m <= t.expMonth;
      const baseRentPsf = rentForMonth(a, t, m);
      const potentialForTenant = baseRentPsf * t.sf;

      if (m < t.commencementMonth) {
        potentialBaseRent += potentialForTenant;
        absorptionTurnoverVacancy += potentialForTenant;
      } else if (inCurrentLease) {
        potentialBaseRent += potentialForTenant;
        scheduledBaseRent += potentialForTenant;
        activeTenants.push(t);
      } else if (mla) {
        const post = m - t.expMonth;
        const renewal = mla.renewalProbability >= 0.5;
        const downtime = mla.downtimeMonths || 0;
        const free = renewal ? mla.freeRentRenewal : mla.freeRentNew;
        const marketRent = marketRentAtMonth(a, mla.marketRent, m) * t.sf;

        potentialBaseRent += marketRent;
        if (post <= downtime) {
          absorptionTurnoverVacancy += marketRent;
        } else if (post <= downtime + free) {
          freeRent += marketRent;
        } else {
          scheduledBaseRent += marketRent;
          activeTenants.push(t);
        }

        if (post === 1) {
          const ti = renewal ? mla.tiRenewal : mla.tiNew;
          const lc = renewal ? mla.lcRenewal : mla.lcNew;
          tiCosts += t.sf * ti;
          lcCosts += t.sf * mla.marketRent * mla.leaseTerm * lc;
        }
      }
    }

    const activeSf = activeTenants.reduce((s, t) => s + t.sf, 0);
    const { opexExpense, reimbursements } = opexMonthlyAndReimbursement(a, activeTenants, activeSf, a.grossSf);
    const netOpex = opexExpense - reimbursements;

    const capex = a.capexSchedule[m] || 0;
    const reserves = a.reservesMonthly;
    const leasingCosts = tiCosts + lcCosts;
    const noi = scheduledBaseRent + reimbursements - opexExpense;
    const unlevered = noi - leasingCosts - capex - reserves;

    monthly.push({
      month: m,
      potentialBaseRent,
      absorptionTurnoverVacancy,
      freeRent,
      scheduledBaseRent,
      expenseRecoveries: reimbursements,
      opexExpense,
      netOpex,
      noi,
      tiCosts,
      lcCosts,
      leasingCosts,
      capex,
      reserves,
      totalCapitalExpenditures: capex + reserves,
      unlevered,
    });
  }

  const debt = a.debt || {};
  const loan = a.purchasePrice * (debt.initialLtv || 0);
  const annualRate = debt.fixedFloating === 'Floating'
    ? ((debt.spread || 0) + getFloatingBenchmarkRate(debt.rateIndex || 'SOFR'))
    : (debt.indexRate || 0);
  const rate = annualRate / 12;
  const ioMonths = Math.max(0, Math.round(debt.interestOnlyMonths || 0));
  const amortMonths = Math.max(1, Math.round(debt.amortizationMonths || 360));
  let balance = loan;

  monthly.forEach((r) => {
    const beginningBalance = balance;
    const interestExpense = beginningBalance * rate;

    const reimbursement = r.month <= (debt.fundingEndMonth || 0)
      ? (debt.futureTilcPct || 0) * r.leasingCosts + (debt.futureCapexPct || 0) * r.capex
      : 0;

    balance += reimbursement;

    let principalAmortization = 0;
    if (r.month > ioMonths && balance > 0 && rate > 0) {
      const monthsIntoAmort = r.month - ioMonths;
      const remAmort = Math.max(1, amortMonths - monthsIntoAmort + 1);
      const payment = balance * (rate / (1 - ((1 + rate) ** (-remAmort))));
      principalAmortization = Math.max(0, Math.min(balance, payment - interestExpense));
      balance -= principalAmortization;
    }

    const debtService = interestExpense + principalAmortization;
    r.debtBeginningBalance = beginningBalance;
    r.interestExpense = interestExpense;
    r.principalAmortization = principalAmortization;
    r.debtEndingBalance = balance;
    r.debtService = debtService;
    r.reimbursement = reimbursement;
    r.levered = r.unlevered - debtService + reimbursement;
  });

  const terminal = (monthly[monthly.length - 1].noi * 12) / a.exitCapRate;
  const saleCost = terminal * (a.saleCostPct || 0);
  const netSale = terminal - saleCost;
  const debtPayoff = balance;

  monthly.forEach((r) => {
    const isFinal = r.month === a.holdMonths;
    r.grossSaleProceeds = isFinal ? terminal : 0;
    r.saleClosingCosts = isFinal ? saleCost : 0;
    r.netSaleProceeds = isFinal ? netSale : 0;
    r.debtPayoff = isFinal ? debtPayoff : 0;
    r.unleveredCF = r.unlevered + r.netSaleProceeds;
    r.leveredCF = r.levered + r.netSaleProceeds - r.debtPayoff;
  });

  const initialOutflow = a.purchasePrice + a.closingCosts;
  const initialDebtInflow = loan;
  const initialOrigFee = loan * (debt.originationFee || 0);
  const netEquityOutflow = initialOutflow - initialDebtInflow + initialOrigFee;

  const unlevSeries = [-initialOutflow, ...monthly.map((r) => r.unleveredCF)];
  const levSeries = [-netEquityOutflow, ...monthly.map((r) => r.leveredCF)];

  const annual = [];
  for (let y = 0; y < a.holdMonths / 12; y++) {
    const rows = monthly.slice(y * 12, y * 12 + 12);
    annual.push({
      year: y + 1,
      annualNoi: rows.reduce((s, r) => s + r.noi, 0),
      annualUnlevered: rows.reduce((s, r) => s + r.unleveredCF, 0),
      annualLevered: rows.reduce((s, r) => s + r.leveredCF, 0),
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

function renderCashFlowStatement(result) {
  const purchasePrice = result.assumptions.purchasePrice;
  const acquisitionClosingCosts = result.assumptions.closingCosts;
  const totalInvestmentCosts = purchasePrice + acquisitionClosingCosts;
  const initialDebtInflow = purchasePrice * (result.assumptions.debt?.initialLtv || 0);
  const initialOrigFee = initialDebtInflow * (result.assumptions.debt?.originationFee || 0);
  const netEquityOutflow = totalInvestmentCosts - initialDebtInflow + initialOrigFee;

  const monthSeries = [
    {
      month: 0,
      date: result.assumptions.acquisitionDate,
      purchasePrice,
      acquisitionClosingCosts,
      totalInvestmentCosts,
      initialDebtInflow,
      initialOrigFee,
      netEquityOutflow,
      unleveredCF: -totalInvestmentCosts,
      leveredCF: -netEquityOutflow,
    },
    ...result.monthly.map((r) => ({ ...r, date: addMonths(result.assumptions.acquisitionDate, r.month) })),
  ];

  const opexLineNames = result.assumptions.opexLines.map((o) => o.name).filter(Boolean);
  const lineDefs = [
    { section: 'Rental Revenue' },
    { label: 'Potential Base Rent', key: 'potentialBaseRent' },
    { label: 'Absorption & Turnover Vacancy', key: 'absorptionTurnoverVacancy', sign: -1 },
    { label: 'Free Rent', key: 'freeRent', sign: -1 },
    { label: 'Scheduled Base Rent', key: 'scheduledBaseRent', subtotal: true },
    { section: 'Other Tenant Revenue' },
    { label: 'Expense Recoveries', key: 'expenseRecoveries' },
    { label: 'Total Other Tenant Revenue', key: 'expenseRecoveries', subtotal: true },
    { section: 'Effective Gross Revenue' },
    { label: 'Effective Gross Revenue', formula: (row) => (row.scheduledBaseRent || 0) + (row.expenseRecoveries || 0), subtotal: true },
    { section: 'Operating Expenses' },
    ...opexLineNames.map((name) => ({ label: name, opexLineName: name, sign: -1 })),
    { label: 'NET OPERATING INCOME', key: 'noi', subtotal: true },
    { section: 'Leasing Costs' },
    { label: 'Tenant Improvements', key: 'tiCosts', sign: -1 },
    { label: 'Leasing Commissions', key: 'lcCosts', sign: -1 },
    { section: 'Capital Expenditures' },
    { label: 'Capital Reserves', key: 'reserves', sign: -1 },
    { label: 'Capital Expenditures', key: 'capex', sign: -1 },
    { label: 'Total Capital Expenditures', key: 'totalCapitalExpenditures', sign: -1, subtotal: true },
    { section: 'INVESTMENT & SALE CASH FLOW' },
    { label: 'Purchase Price', key: 'purchasePrice', sign: -1 },
    { label: 'Acquisition Closing Costs', key: 'acquisitionClosingCosts', sign: -1 },
    { label: 'Total Investment Costs', key: 'totalInvestmentCosts', sign: -1, subtotal: true },
    { label: 'Gross Sale Proceeds', key: 'grossSaleProceeds' },
    { label: 'Sale Closing Costs', key: 'saleClosingCosts', sign: -1 },
    { label: 'Net Sale Proceeds', key: 'netSaleProceeds', subtotal: true },
    { section: 'CONSOLIDATED CASH FLOW' },
    { label: 'Unlevered Cash Flow', key: 'unleveredCF', subtotal: true },
    { section: 'DEBT ASSUMPTIONS & AMORTIZATION' },
    { label: 'Initial Debt Inflow', key: 'initialDebtInflow' },
    { label: 'Origination Fee', key: 'initialOrigFee', sign: -1 },
    { label: 'Net Equity Outflow', key: 'netEquityOutflow', sign: -1, subtotal: true },
    { label: 'Beginning Loan Balance', key: 'debtBeginningBalance' },
    { label: 'Interest Expense', key: 'interestExpense', sign: -1 },
    { label: 'Principal Amortization', key: 'principalAmortization', sign: -1 },
    { label: 'Debt Service', key: 'debtService', sign: -1, subtotal: true },
    { label: 'Debt Reimbursements', key: 'reimbursement' },
    { label: 'Ending Loan Balance', key: 'debtEndingBalance' },
    { label: 'Debt Payoff at Sale', key: 'debtPayoff', sign: -1 },
    { section: 'LEVERAGED CASH FLOW' },
    { label: 'Levered Cash Flow', key: 'leveredCF', subtotal: true },
  ];

  const getLineValue = (row, def) => {
    if (def.formula) return def.formula(row);
    if (def.opexLineName) {
      if (row.month === 0) return 0;
      const line = result.assumptions.opexLines.find((o) => o.name === def.opexLineName);
      if (!line) return 0;
      const annual = line.amountType === '$/SF/Year' ? line.amount * result.assumptions.grossSf : line.amount;
      return (def.sign || 1) * (annual / 12);
    }
    return (def.sign || 1) * (row[def.key] || 0);
  };

  const rows = lineDefs.map((def) => {
    if (def.section) return `<tr class="statement-section"><td>${def.section}</td><td colspan="${monthSeries.length}"></td></tr>`;
    const cls = def.subtotal ? 'statement-subtotal' : '';
    const vals = monthSeries.map((r) => `<td>${moneyFmt.format(getLineValue(r, def))}</td>`).join('');
    return `<tr class="${cls}"><td>${def.label}</td>${vals}</tr>`;
  }).join('');

  const header = `<tr><th>Line Item</th>${monthSeries.map((r) => `<th>${r.month === 0 ? 'Acq ' : ''}${r.date}</th>`).join('')}</tr>`;
  document.getElementById('cashFlowStatement').innerHTML = `<div class="statement-wrap"><table class="statement-table">${header}${rows}</table></div>`;
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

  document.getElementById("summary").textContent = `INVESTMENT SUMMARY\n\nReturns (from monthly cash flows)\n- Unlevered IRR: ${pctFmt.format(m.unleveredIrr)}\n- Levered IRR: ${pctFmt.format(m.leveredIrr)}\n- Unlevered Equity Multiple: ${m.unleveredEqMult.toFixed(2)}x\n- Levered Equity Multiple: ${m.leveredEqMult.toFixed(2)}x\n- Levered Profit: ${moneyFmt.format(m.leveredProfit)}\n`;

  const metricRows = Object.entries(m).map(([k, v]) => [k, typeof v === "number" ? numFmt.format(v) : v]);
  document.getElementById("metrics").innerHTML = toHtmlTable(["Metric", "Value"], metricRows);

  const annualRows = result.annual.map((r) => [r.year, moneyFmt.format(r.annualNoi), moneyFmt.format(r.annualUnlevered), moneyFmt.format(r.annualLevered)]);
  document.getElementById("annual").innerHTML = toHtmlTable(["Year", "Annual NOI", "Annual Unlevered CF", "Annual Levered CF"], annualRows);
  renderCashFlowStatement(result);
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
  const sRows = [["Item", "Value"], ["Purchase Price", result.assumptions.purchasePrice], ["Closing Costs", result.assumptions.closingCosts], ["Total Hold Costs", result.metrics.totalHoldCosts], ["Unlevered IRR", result.metrics.unleveredIrr], ["Levered IRR", result.metrics.leveredIrr], ["Unlevered Equity Multiple", result.metrics.unleveredEqMult], ["Levered Equity Multiple", result.metrics.leveredEqMult], ["Levered Profit", result.metrics.leveredProfit], ["Terminal Value", result.metrics.terminalValue]];
  const worksheets = [xmlWorksheet("InvestmentSummary", sRows)];
  if (!summaryOnly) {
    worksheets.push(xmlWorksheet("Assumptions", Object.entries(result.assumptions).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : v])));
    worksheets.push(xmlWorksheet("MonthlyCF", [["month", "date", "potentialBaseRent", "absorptionTurnoverVacancy", "freeRent", "scheduledBaseRent", "expenseRecoveries", "opexExpense", "netOpex", "noi", "tiCosts", "lcCosts", "leasingCosts", "capex", "reserves", "unlevered", "grossSaleProceeds", "saleClosingCosts", "netSaleProceeds", "debtPayoff", "unleveredCF", "debtBeginningBalance", "interestExpense", "principalAmortization", "debtService", "reimbursement", "debtEndingBalance", "levered", "leveredCF"], ...result.monthly.map((r) => [r.month, addMonths(result.assumptions.acquisitionDate, r.month), r.potentialBaseRent, r.absorptionTurnoverVacancy, r.freeRent, r.scheduledBaseRent, r.expenseRecoveries, r.opexExpense, r.netOpex, r.noi, r.tiCosts, r.lcCosts, r.leasingCosts, r.capex, r.reserves, r.unlevered, r.grossSaleProceeds, r.saleClosingCosts, r.netSaleProceeds, r.debtPayoff, r.unleveredCF, r.debtBeginningBalance, r.interestExpense, r.principalAmortization, r.debtService, r.reimbursement, r.debtEndingBalance, r.levered, r.leveredCF])]));
    worksheets.push(xmlWorksheet("RentRoll", [["name", "sf", "commencementDate", "expirationDate", "currentRentMonthlyPSF", "rentType", "mlaName", "rentSteps"], ...result.assumptions.tenants.map((t) => [t.name, t.sf, t.commencementDate, t.expirationDate, t.currentRent, t.rentType, t.mlaName, JSON.stringify(t.rentSteps || [])])]));
    worksheets.push(xmlWorksheet("OperatingExpenses", [["name", "amount", "amountType", "reimbursable", "reimbursingTenants"], ...result.assumptions.opexLines.map((x) => [x.name, x.amount, x.amountType, x.reimbursable, x.reimbursingTenants])]));
  }
  const xml = `<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n${worksheets.join("\n")}\n</Workbook>`;
  download(summaryOnly ? "investment_summary.xls" : "underwriting_model_output.xls", xml, "application/vnd.ms-excel");
}

function generateReportText(result) {
  return `# Institutional Underwriting Summary\n\n## Returns (Monthly Cash Flows)\n- Unlevered IRR: ${pctFmt.format(result.metrics.unleveredIrr)}\n- Levered IRR: ${pctFmt.format(result.metrics.leveredIrr)}\n- Unlevered Equity Multiple: ${result.metrics.unleveredEqMult.toFixed(2)}x\n- Levered Equity Multiple: ${result.metrics.leveredEqMult.toFixed(2)}x\n`;
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
  const slice = bytes.slice(0, Math.min(bytes.length, 7_000_000));
  const latin = new TextDecoder("latin1").decode(slice);
  const textRuns = [];
  const literalMatches = latin.match(/\((?:\\.|[^\\)]){5,}\)/g) || [];
  for (let i = 0; i < literalMatches.length && i < 5000; i++) textRuns.push(literalMatches[i].slice(1, -1));
  const printable = latin.match(/[A-Za-z0-9$%,.\/()\-:\s]{30,}/g) || [];
  for (let i = 0; i < printable.length && i < 5000; i++) textRuns.push(printable[i]);
  return textRuns.join("\n");
}

function parseRentRollFromText(text) {
  const tenants = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const dateMatches = line.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/g) || [];
    const numMatches = line.match(/[\d,]+(?:\.\d+)?/g) || [];
    if (dateMatches.length < 2 || numMatches.length < 2) continue;

    const commencementDate = parseDateLike(dateMatches[0]);
    const expirationDate = parseDateLike(dateMatches[1]);
    if (!commencementDate || !expirationDate) continue;

    const sfCandidate = numMatches.find((n) => Number(n.replace(/,/g, "")) > 1000);
    const rentCandidate = [...numMatches].reverse().find((n) => Number(n) > 0 && Number(n) < 200);
    if (!sfCandidate || !rentCandidate) continue;

    let name = line.replace(dateMatches[0], "").replace(dateMatches[1], "").replace(sfCandidate, "").replace(rentCandidate, "").trim();
    if (!name || /^\d+$/.test(name)) name = `Suite ${tenants.length + 1}`;

    tenants.push({ name: name.slice(0, 60), sf: Number(sfCandidate.replace(/,/g, "")), commencementDate, expirationDate, currentRent: Number(rentCandidate), rentType: "$/SF/Mo", mlaName: "MLA-1", rentSteps: [] });
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
      const text = ext === "pdf" ? extractPdfTextFromBytes(new Uint8Array(await file.arrayBuffer())) : await file.text();
      if (ext === "csv") {
        const rows = text.split(/\r?\n/).slice(1);
        rows.forEach((r, i) => {
          const cols = r.split(",").map((x) => x.trim());
          if (cols.length < 5) return;
          const t = { name: cols[0] || `Suite ${i + 1}`, sf: Number((cols[1] || "0").replace(/,/g, "")), commencementDate: parseDateLike(cols[2]) || "2026-01-01", expirationDate: parseDateLike(cols[3]) || "2028-01-01", currentRent: Number(cols[4] || 0), rentType: "$/SF/Mo", mlaName: "MLA-1", rentSteps: [] };
          if (t.sf > 0) allTenants.push(t);
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
  document.getElementById("stepDialogTitle").textContent = `Rent Steps: ${document.getElementById(`tenant_name_${tenantIdx}`)?.value || `Tenant ${tenantIdx}`}`;
  const body = document.getElementById("stepTableBody");
  body.innerHTML = "";
  (state.rentStepsByTenant[tenantIdx] || []).forEach((s) => addStepRowToDialog(s.date, s.rent));
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
  state.rentStepsByTenant[idx] = rows
    .map((row) => {
      const date = row.querySelector('input[type="date"]').value;
      const rentInput = row.querySelector('input[data-format="currency"]');
      const rent = parseFormatted(rentInput.dataset.raw ?? rentInput.value, "currency");
      return { date, rent };
    })
    .filter((x) => x.date && x.rent > 0);
  renderRentStepSummary(idx);
}

document.getElementById("addMla").onclick = addMla;
document.getElementById("addTenant").onclick = () => addTenant();
document.getElementById("addOpex").onclick = () => addOpexLine();
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
