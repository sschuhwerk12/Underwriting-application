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

function formatCurrencySmart(value) {
  const n = Number(value || 0);
  if (Math.abs(n) < 100) return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const mainConfig = [
  ["acquisitionDate", "Acquisition Date", "2026-01-01", "date"],
  ["holdMonths", "Hold Period (months)", 60, "number"],
  ["holdYearsAuto", "Hold Period (years)", 5, "number"],
  ["grossSf", "Square Footage", 100000, "number"],
  ["purchasePrice", "Purchase Price ($)", 25000000, "currency"],
  ["closingCosts", "Closing Costs ($)", 750000, "currency"],
];

const debtConfig = [
  ["loanOriginationDate", "Loan Origination Date", "2026-01-01", "date"],
  ["loanMaturityDate", "Loan Maturity Date", "2031-01-01", "date"],
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
  if (formatType === "currency") return formatCurrencySmart(n);
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
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
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


function syncDateAndHoldDefaults() {
  const acquisitionDate = getVal("acquisitionDate") || "2026-01-01";
  const holdMonths = Math.max(1, Math.round(getVal("holdMonths") || 0));
  setVal("holdMonths", holdMonths);
  setVal("holdYearsAuto", holdMonths / 12);

  const dispositionDate = addMonths(acquisitionDate, holdMonths);
  setVal("loanOriginationDate", acquisitionDate);
  setVal("loanMaturityDate", dispositionDate);
  setVal("refi_loanOriginationDate", acquisitionDate);
  setVal("refi_loanMaturityDate", dispositionDate);
}


function closingCostOutputCell(id) {
  return `<div class="closing-cost-output" id="${id}">$0.00</div>`;
}

function renderClosingCostBreakdown(main) {
  const block = document.createElement("div");
  block.className = "closing-costs-block";
  block.innerHTML = `
    <div class="closing-costs-title">Closing Cost Breakdown</div>
    <div class="closing-cost-line">
      <label>Legal Fees ($)
        <input id="cc_legal" data-format="currency" data-raw="75000" type="text" value="${displayFormatted(75000, "currency")}" />
      </label>
      ${closingCostOutputCell("cc_legal_out")}
    </div>
    <div class="closing-cost-line">
      <label>Due Diligence Fees ($)
        <input id="cc_due_diligence" data-format="currency" data-raw="50000" type="text" value="${displayFormatted(50000, "currency")}" />
      </label>
      ${closingCostOutputCell("cc_due_diligence_out")}
    </div>
    <div class="closing-cost-line">
      <label>Seyon Acquisition Fee (%)
        <input id="cc_seyon_pct" data-format="percent" data-raw="0.01" type="text" value="${displayFormatted(0.01, "percent")}" />
      </label>
      ${closingCostOutputCell("cc_seyon_out")}
    </div>
    <div class="closing-cost-line">
      <label>Broker Fee Type
        <select id="cc_broker_type"><option value="percent" selected>% of Purchase Price</option><option value="amount">$ Amount</option></select>
      </label>
      <div></div>
    </div>
    <div class="closing-cost-line">
      <label>Broker Fee %
        <input id="cc_broker_pct" data-format="percent" data-raw="0.01" type="text" value="${displayFormatted(0.01, "percent")}" />
      </label>
      ${closingCostOutputCell("cc_broker_out")}
    </div>
    <div class="closing-cost-line">
      <label>Broker Fee $ Amount
        <input id="cc_broker_amt" data-format="currency" data-raw="0" type="text" value="${displayFormatted(0, "currency")}" />
      </label>
      <div class="closing-cost-hint">Used when Broker Fee Type is $ Amount</div>
    </div>
    <div class="closing-cost-line">
      <label>Transfer Taxes (%)
        <input id="cc_transfer_pct" data-format="percent" data-raw="0.005" type="text" value="${displayFormatted(0.005, "percent")}" />
      </label>
      ${closingCostOutputCell("cc_transfer_out")}
    </div>
    <div class="closing-cost-line">
      <label>Title Insurance ($)
        <input id="cc_title" data-format="currency" data-raw="30000" type="text" value="${displayFormatted(30000, "currency")}" />
      </label>
      ${closingCostOutputCell("cc_title_out")}
    </div>
    <div class="closing-cost-line">
      <label>Contingency ($)
        <input id="cc_contingency" data-format="currency" data-raw="45000" type="text" value="${displayFormatted(45000, "currency")}" />
      </label>
      ${closingCostOutputCell("cc_contingency_out")}
    </div>
  `;
  main.appendChild(block);
  block.querySelectorAll("input[data-format]").forEach(bindFormattedInput);
}

function syncClosingCostsBreakdown() {
  const purchasePrice = getVal("purchasePrice");
  const legal = getVal("cc_legal");
  const dd = getVal("cc_due_diligence");
  const seyon = purchasePrice * getVal("cc_seyon_pct");
  const brokerType = document.getElementById("cc_broker_type")?.value || "percent";
  const brokerPct = getVal("cc_broker_pct");
  const brokerAmt = getVal("cc_broker_amt");
  const broker = brokerType === "percent" ? purchasePrice * brokerPct : brokerAmt;
  const transfer = purchasePrice * getVal("cc_transfer_pct");
  const title = getVal("cc_title");
  const contingency = getVal("cc_contingency");

  const brokerPctInput = document.getElementById("cc_broker_pct");
  const brokerAmtInput = document.getElementById("cc_broker_amt");
  if (brokerPctInput) brokerPctInput.disabled = brokerType !== "percent";
  if (brokerAmtInput) brokerAmtInput.disabled = brokerType !== "amount";

  const outputs = {
    cc_legal_out: legal,
    cc_due_diligence_out: dd,
    cc_seyon_out: seyon,
    cc_broker_out: broker,
    cc_transfer_out: transfer,
    cc_title_out: title,
    cc_contingency_out: contingency,
  };
  Object.entries(outputs).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatCurrencySmart(value);
  });

  const total = legal + dd + seyon + broker + transfer + title + contingency;
  setVal("closingCosts", total);
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

  const holdYearsEl = document.getElementById("holdYearsAuto");
  if (holdYearsEl) {
    holdYearsEl.readOnly = true;
    holdYearsEl.classList.add("readonly-input");
  }

  const closingCostsEl = document.getElementById("closingCosts");
  if (closingCostsEl) {
    closingCostsEl.readOnly = true;
    closingCostsEl.classList.add("readonly-input");
  }

  renderClosingCostBreakdown(main);

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

  syncDateAndHoldDefaults();

  const acquisitionInput = document.getElementById("acquisitionDate");
  const holdMonthsInput = document.getElementById("holdMonths");
  const purchasePriceInput = document.getElementById("purchasePrice");
  acquisitionInput?.addEventListener("change", syncDateAndHoldDefaults);
  holdMonthsInput?.addEventListener("blur", syncDateAndHoldDefaults);
  purchasePriceInput?.addEventListener("blur", syncClosingCostsBreakdown);

  ["cc_legal", "cc_due_diligence", "cc_seyon_pct", "cc_broker_pct", "cc_broker_amt", "cc_transfer_pct", "cc_title", "cc_contingency"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("blur", syncClosingCostsBreakdown);
  });
  document.getElementById("cc_broker_type")?.addEventListener("change", syncClosingCostsBreakdown);
  syncClosingCostsBreakdown();

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
    <div class="mla-grid mla-grid-row">
      <label>Name<input id="mla_name_${i}" type="text" value="MLA-${i}" onblur="refreshTenantMlaOptions()" /></label>
      <label>Market Rent<input id="mla_rent_${i}" data-format="currency" data-raw="4" type="text" value="$4" /></label>
      <label>Market Rent Format<select id="mla_rent_type_${i}"><option>$/SF/Mo</option><option>$/SF/Year</option><option>$/Year</option></select></label>
      <label>TI New ($/SF)<input id="mla_ti_new_${i}" data-format="currency" data-raw="30" type="text" value="$30" /></label>
      <label>TI Renewal ($/SF)<input id="mla_ti_ren_${i}" data-format="currency" data-raw="15" type="text" value="$15" /></label>
      <label>Renewal Probability<input id="mla_renew_${i}" data-format="percent" data-raw="0.6" type="text" value="60.00%" /></label>
      <label>Lease Term (months)<input id="mla_term_${i}" data-format="number" data-raw="60" type="text" value="60" /></label>
      <label>Downtime (months)<input id="mla_downtime_${i}" data-format="number" data-raw="3" type="text" value="3" /></label>
      <label>Free Rent New (mo)<input id="mla_fr_new_${i}" data-format="number" data-raw="4" type="text" value="4" /></label>
      <label>Free Rent Renewal (mo)<input id="mla_fr_ren_${i}" data-format="number" data-raw="2" type="text" value="2" /></label>
      <label>LC New<input id="mla_lc_new_${i}" data-format="percent" data-raw="0.05" type="text" value="5.00%" /></label>
      <label>LC Renewal<input id="mla_lc_ren_${i}" data-format="percent" data-raw="0.03" type="text" value="3.00%" /></label>
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
    <td><input id="tenant_name_${i}" value="${prefill.name || `Tenant ${i}`}" /></td>
    <td><input id="tenant_suite_${i}" value="${prefill.suite || ""}" placeholder="A/B" /></td>
    <td><input id="tenant_sf_${i}" data-format="number" data-raw="${prefill.sf || 25000}" value="${displayFormatted(prefill.sf || 25000, "number")}" /></td>
    <td><input id="tenant_commence_${i}" type="date" data-format="date" value="${prefill.commencementDate || "2026-01-01"}" /></td>
    <td><input id="tenant_expire_${i}" type="date" data-format="date" value="${prefill.expirationDate || "2028-01-01"}" /></td>
    <td>
      <select id="tenant_upon_exp_${i}">
        <option ${(prefill.uponExpiration || "Market") === "Market" ? "selected" : ""}>Market</option>
        <option ${prefill.uponExpiration === "Vacate" ? "selected" : ""}>Vacate</option>
      </select>
    </td>
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

function endOfMonth(dateStr, monthsToAdd = 0) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + monthsToAdd + 1, 0);
  return d;
}

function formatMonthYear(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", "-");
}


function formatDateMDY(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function normalizeMonthlyRent(rentValue, rentType, sf) {
  if (rentType === "$/SF/Mo") return rentValue;
  if (rentType === "$/SF/Year") return rentValue / 12;
  if (rentType === "$/Year") return sf > 0 ? (rentValue / 12) / sf : 0;
  return rentValue;
}

function gatherAssumptions() {
  const acquisitionDate = getVal("acquisitionDate");
  const holdMonths = Math.max(1, Math.round(getVal("holdMonths")));
  const saleDate = new Date(acquisitionDate);
  saleDate.setMonth(saleDate.getMonth() + holdMonths);

  const mlas = [];
  for (let i = 1; i <= state.mlaCount; i++) {
    if (!document.getElementById(`mla_name_${i}`)) continue;
    mlas.push({
      name: document.getElementById(`mla_name_${i}`).value.trim() || `MLA-${i}`,
      marketRent: getVal(`mla_rent_${i}`),
      marketRentType: document.getElementById(`mla_rent_type_${i}`)?.value || "$/SF/Mo",
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
      suite: getVal(`tenant_suite_${i}`),
      sf,
      commencementDate: getVal(`tenant_commence_${i}`),
      expirationDate: getVal(`tenant_expire_${i}`),
      uponExpiration: document.getElementById(`tenant_upon_exp_${i}`)?.value || "Market",
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
    loanOriginationDate: getVal("loanOriginationDate"),
    loanMaturityDate: getVal("loanMaturityDate"),
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
        loanOriginationDate: getVal("refi_loanOriginationDate"),
        loanMaturityDate: getVal("refi_loanMaturityDate"),
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
    closingCostBreakdown: {
      legalFees: getVal("cc_legal"),
      dueDiligenceFees: getVal("cc_due_diligence"),
      seyonAcquisitionFeePct: getVal("cc_seyon_pct"),
      seyonAcquisitionFeeAmount: (getVal("purchasePrice") * getVal("cc_seyon_pct")),
      brokerFeeType: document.getElementById("cc_broker_type")?.value || "percent",
      brokerFeePct: getVal("cc_broker_pct"),
      brokerFeeAmountInput: getVal("cc_broker_amt"),
      brokerFeeAmount: (document.getElementById("cc_broker_type")?.value === "percent" ? getVal("purchasePrice") * getVal("cc_broker_pct") : getVal("cc_broker_amt")),
      transferTaxesPct: getVal("cc_transfer_pct"),
      transferTaxesAmount: (getVal("purchasePrice") * getVal("cc_transfer_pct")),
      titleInsurance: getVal("cc_title"),
      contingency: getVal("cc_contingency"),
    },
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

function daysBetween(startDate, endDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return (endDate.getTime() - startDate.getTime()) / msPerDay;
}

function xnpv(cashflows, dates, rate) {
  const baseDate = new Date(dates[0]);
  if (Number.isNaN(baseDate.getTime())) return 0;
  return cashflows.reduce((sum, cf, i) => {
    const d = new Date(dates[i]);
    if (Number.isNaN(d.getTime())) return sum;
    const years = daysBetween(baseDate, d) / 365;
    return sum + (cf / ((1 + rate) ** years));
  }, 0);
}

function xirr(cashflows, dates) {
  if (!cashflows.length || cashflows.length !== dates.length) return 0;
  const hasPositive = cashflows.some((cf) => cf > 0);
  const hasNegative = cashflows.some((cf) => cf < 0);
  if (!hasPositive || !hasNegative) return 0;

  let low = -0.95;
  let high = 2.0;
  let fLow = xnpv(cashflows, dates, low);
  let fHigh = xnpv(cashflows, dates, high);
  let tries = 0;

  while (fLow * fHigh > 0 && tries < 30) {
    high += 1;
    fHigh = xnpv(cashflows, dates, high);
    tries += 1;
  }

  if (fLow * fHigh > 0) return 0;

  for (let i = 0; i < 140; i++) {
    const mid = (low + high) / 2;
    const fMid = xnpv(cashflows, dates, mid);
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

function getMlaMap(mlas) {
  return Object.fromEntries(mlas.map((m) => [m.name, m]));
}

function getTenantRenewalProbability(tenant, mla) {
  if ((tenant.uponExpiration || 'Market') === 'Vacate') return 0;
  return Math.max(0, Math.min(1, mla?.renewalProbability || 0));
}

function rentForMonth(assumptions, tenant, month) {
  const steps = [...(tenant.rentSteps || [])]
    .map((step) => ({ ...step, month: monthDiff(assumptions.acquisitionDate, step.date) }))
    .filter((step) => step.date)
    .sort((a, b) => a.month - b.month);

  let rent = tenant.currentRent;
  for (const step of steps) {
    if (month < step.month) continue;
    const calcType = step.calcType || 'Rent Value';
    if (calcType === '% Increase') {
      const pct = Number(step.value ?? step.rent ?? 0);
      rent *= (1 + pct);
    } else {
      const val = Number(step.value ?? step.rent ?? 0);
      const type = step.rentType || tenant.rentType;
      rent = normalizeMonthlyRent(val, type, tenant.sf);
    }
  }
  return rent;
}

function marketRentPsfAtMonth(assumptions, mla, month, sf = 1) {
  const basePsf = normalizeMonthlyRent(mla.marketRent || 0, mla.marketRentType || '$/SF/Mo', sf);
  let rent = basePsf;
  const yearIdx = Math.min(Math.floor((month - 1) / 12), 9);
  for (let y = 0; y <= yearIdx; y++) rent *= (1 + (assumptions.growthByYear[y] || 0));
  return rent;
}

function marketRentAtMonth(assumptions, baseRent, month) {
  let rent = baseRent;
  const yearIdx = Math.min(Math.floor((month - 1) / 12), 9);
  for (let y = 0; y <= yearIdx; y++) rent *= (1 + (assumptions.growthByYear[y] || 0));
  return rent;
}

function opexMonthlyAndReimbursement(assumptions, activeTenantSfMap, activeSf, totalSf) {
  let opexExpense = 0;
  let reimbursements = 0;

  for (const line of assumptions.opexLines) {
    const annual = line.amountType === "$/SF/Year" ? line.amount * assumptions.grossSf : line.amount;
    const monthly = annual / 12;
    opexExpense += monthly;

    if (!line.reimbursable) continue;

    const selected = String(line.reimbursingTenants || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const selectedSf = selected.length
      ? selected.reduce((sum, tenantName) => sum + (activeTenantSfMap[tenantName] || 0), 0)
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
    const activeTenantSfMap = {};

    for (const t of a.tenants) {
      const mla = mlaMap[t.mlaName] || a.mlas[0];
      const inCurrentLease = m >= t.commencementMonth && m <= t.expMonth;
      const baseRentPsf = rentForMonth(a, t, m);
      const potentialForTenant = baseRentPsf * t.sf;
      const tenantKey = (t.name || '').trim().toLowerCase();

      if (m < t.commencementMonth) {
        potentialBaseRent += potentialForTenant;
        absorptionTurnoverVacancy += potentialForTenant;
      } else if (inCurrentLease) {
        potentialBaseRent += potentialForTenant;
        scheduledBaseRent += potentialForTenant;
        activeTenantSfMap[tenantKey] = (activeTenantSfMap[tenantKey] || 0) + t.sf;
      } else if (mla) {
        const post = m - t.expMonth;
        const renewProb = getTenantRenewalProbability(t, mla);
        const newProb = 1 - renewProb;
        const marketRent = marketRentPsfAtMonth(a, mla, m, t.sf) * t.sf;

        potentialBaseRent += marketRent;

        const weightedDowntimeMonths = (newProb * (mla.downtimeMonths || 0));
        const secondGenStartOffset = Math.max(0, Math.round(weightedDowntimeMonths));
        const weightedFreeRentMonths = (renewProb * (mla.freeRentRenewal || 0)) + (newProb * (mla.freeRentNew || 0));
        const weightedFreeRentDuration = Math.max(0, Math.round(weightedFreeRentMonths));
        const secondGenStartPost = secondGenStartOffset + 1;

        if (post < secondGenStartPost) {
          absorptionTurnoverVacancy += marketRent;
        } else if (post < secondGenStartPost + weightedFreeRentDuration) {
          freeRent += marketRent;
        } else {
          scheduledBaseRent += marketRent;
          activeTenantSfMap[tenantKey] = (activeTenantSfMap[tenantKey] || 0) + t.sf;
        }

        if (post === secondGenStartPost) {
          const weightedTi = (renewProb * (mla.tiRenewal || 0)) + (newProb * (mla.tiNew || 0));
          const weightedLc = (renewProb * (mla.lcRenewal || 0)) + (newProb * (mla.lcNew || 0));
          tiCosts += t.sf * weightedTi;
          const leaseStartPsf = marketRentPsfAtMonth(a, mla, m, t.sf);
          lcCosts += t.sf * leaseStartPsf * mla.leaseTerm * weightedLc;
        }
      }
    }

    scheduledBaseRent = Math.max(0, potentialBaseRent - absorptionTurnoverVacancy - freeRent);

    const activeSf = Object.values(activeTenantSfMap).reduce((s, x) => s + x, 0);
    const { opexExpense, reimbursements } = opexMonthlyAndReimbursement(a, activeTenantSfMap, activeSf, a.grossSf);
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
  const irrDates = [a.acquisitionDate, ...monthly.map((r) => addMonths(a.acquisitionDate, r.month))];

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
      unleveredIrr: xirr(unlevSeries, irrDates),
      leveredIrr: xirr(levSeries, irrDates),
      unleveredEqMult: unlevSeries.slice(1).reduce((s, x) => s + x, 0) / -unlevSeries[0],
      leveredEqMult: levSeries.slice(1).reduce((s, x) => s + x, 0) / -levSeries[0],
      leveredProfit: levSeries.reduce((s, x) => s + x, 0),
      totalHoldCosts: a.closingCosts + monthly.reduce((s, r) => s + r.leasingCosts + r.capex + r.reserves, 0),
      terminalValue: terminal,
    },
  };
}

function getCashFlowLineDefs(result) {
  const opexLineNames = result.assumptions.opexLines.map((o) => o.name).filter(Boolean);
  return [
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
}

function renderStatementTable(result, containerId, periodSeries) {
  const lineDefs = getCashFlowLineDefs(result);
  const getLineValue = (row, def, periodsPerYear) => {
    if (def.formula) return def.formula(row);
    if (def.opexLineName) {
      if (row.period === 0) return 0;
      const line = result.assumptions.opexLines.find((o) => o.name === def.opexLineName);
      if (!line) return 0;
      const annual = line.amountType === '$/SF/Year' ? line.amount * result.assumptions.grossSf : line.amount;
      return (def.sign || 1) * (annual / periodsPerYear);
    }
    return (def.sign || 1) * (row[def.key] || 0);
  };

  const rows = lineDefs.map((def) => {
    if (def.section) return `<tr class="statement-section"><td>${def.section}</td><td colspan="${periodSeries.length}"></td></tr>`;
    const cls = def.subtotal ? 'statement-subtotal' : '';
    const vals = periodSeries.map((r) => `<td>${formatCurrencySmart(getLineValue(r, def, r.periodsPerYear || 12))}</td>`).join('');
    return `<tr class="${cls}"><td>${def.label}</td>${vals}</tr>`;
  }).join('');

  const monthRow = `<tr><th>Month</th>${periodSeries.map((r) => `<th>${r.periodIndex ?? r.period ?? "-"}</th>`).join('')}</tr>`;
  const dateRow = `<tr><th>Date</th>${periodSeries.map((r) => `<th>${r.label}</th>`).join('')}</tr>`;
  document.getElementById(containerId).innerHTML = `<div class="statement-wrap"><table class="statement-table">${monthRow}${dateRow}${rows}</table></div>`;
}

function buildCashFlowSeries(result) {
  const purchasePrice = result.assumptions.purchasePrice;
  const acquisitionClosingCosts = result.assumptions.closingCosts;
  const totalInvestmentCosts = purchasePrice + acquisitionClosingCosts;
  const initialDebtInflow = purchasePrice * (result.assumptions.debt?.initialLtv || 0);
  const initialOrigFee = initialDebtInflow * (result.assumptions.debt?.originationFee || 0);
  const netEquityOutflow = totalInvestmentCosts - initialDebtInflow + initialOrigFee;

  const monthSeries = [
    {
      period: 0,
      periodIndex: 0,
      label: formatMonthYear(endOfMonth(result.assumptions.acquisitionDate, 0)),
      excelDate: endOfMonth(result.assumptions.acquisitionDate, 0)?.toISOString().slice(0, 10),
      periodsPerYear: 12,
      purchasePrice,
      acquisitionClosingCosts,
      totalInvestmentCosts,
      initialDebtInflow,
      initialOrigFee,
      netEquityOutflow,
      unleveredCF: -totalInvestmentCosts,
      leveredCF: -netEquityOutflow,
    },
    ...result.monthly.map((r) => ({
      ...r,
      period: r.month,
      periodIndex: r.month,
      label: formatMonthYear(endOfMonth(result.assumptions.acquisitionDate, r.month)),
      excelDate: endOfMonth(result.assumptions.acquisitionDate, r.month)?.toISOString().slice(0, 10),
      periodsPerYear: 12,
    })),
  ];

  const annualSeries = [
    {
      period: 0,
      periodIndex: 0,
      label: formatMonthYear(endOfMonth(result.assumptions.acquisitionDate, 0)),
      excelDate: endOfMonth(result.assumptions.acquisitionDate, 0)?.toISOString().slice(0, 10),
      periodsPerYear: 1,
      purchasePrice,
      acquisitionClosingCosts,
      totalInvestmentCosts,
      initialDebtInflow,
      initialOrigFee,
      netEquityOutflow,
      unleveredCF: -totalInvestmentCosts,
      leveredCF: -netEquityOutflow,
    },
  ];

  const years = Math.floor(result.assumptions.holdMonths / 12);
  for (let y = 1; y <= years; y++) {
    const slice = result.monthly.slice((y - 1) * 12, y * 12);
    const agg = { period: y, periodIndex: y * 12, label: formatMonthYear(endOfMonth(result.assumptions.acquisitionDate, y * 12 - 1)), excelDate: endOfMonth(result.assumptions.acquisitionDate, y * 12 - 1)?.toISOString().slice(0, 10), periodsPerYear: 1 };
    const keys = [
      'potentialBaseRent', 'absorptionTurnoverVacancy', 'freeRent', 'scheduledBaseRent', 'expenseRecoveries', 'opexExpense', 'noi',
      'tiCosts', 'lcCosts', 'leasingCosts', 'capex', 'reserves', 'totalCapitalExpenditures', 'unlevered', 'grossSaleProceeds',
      'saleClosingCosts', 'netSaleProceeds', 'debtPayoff', 'unleveredCF', 'interestExpense', 'principalAmortization', 'debtService', 'reimbursement', 'levered', 'leveredCF'
    ];
    keys.forEach((k) => { agg[k] = slice.reduce((s, r) => s + (r[k] || 0), 0); });
    agg.debtBeginningBalance = slice[0]?.debtBeginningBalance || 0;
    agg.debtEndingBalance = slice[slice.length - 1]?.debtEndingBalance || 0;
    annualSeries.push(agg);
  }

  return { monthSeries, annualSeries };
}

function buildStatementRowsForExport(result, periodSeries) {
  const lineDefs = getCashFlowLineDefs(result);
  const getLineValue = (row, def, periodsPerYear) => {
    if (def.formula) return def.formula(row);
    if (def.opexLineName) {
      if (row.period === 0) return 0;
      const line = result.assumptions.opexLines.find((o) => o.name === def.opexLineName);
      if (!line) return 0;
      const annual = line.amountType === '$/SF/Year' ? line.amount * result.assumptions.grossSf : line.amount;
      return (def.sign || 1) * (annual / periodsPerYear);
    }
    return (def.sign || 1) * (row[def.key] || 0);
  };

  const rows = [];
  rows.push(['Month', ...periodSeries.map((r) => r.periodIndex ?? r.period ?? '-')]);
  rows.push(['Date', ...periodSeries.map((r) => r.label)]);

  lineDefs.forEach((def) => {
    if (def.section) {
      rows.push([def.section, ...periodSeries.map(() => '')]);
      return;
    }
    rows.push([def.label, ...periodSeries.map((r) => getLineValue(r, def, r.periodsPerYear || 12))]);
  });

  return rows;
}

function renderCashFlowStatement(result) {
  const { monthSeries, annualSeries } = buildCashFlowSeries(result);
  renderStatementTable(result, 'cashFlowStatement', monthSeries);
  renderStatementTable(result, 'annualCashFlowStatement', annualSeries);
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
  document.getElementById("capexSummary").textContent = `Total Capex: ${formatCurrencySmart(total)} | Potential Lender Reimbursement: ${formatCurrencySmart(reimb)}`;
}

function toHtmlTable(columns, rows) {
  const head = `<tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("");
  return `<table class="table">${head}${body}</table>`;
}

function activateTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
}

function yearsBetween(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '-';
  return `${((e - s) / (365.25 * 24 * 3600 * 1000)).toFixed(1)} yrs.`;
}

function renderRentRollOutput(assumptions) {
  if (!assumptions) return;
  const rows = assumptions.tenants || [];
  const totalSf = rows.reduce((sum, t) => sum + (t.sf || 0), 0);
  const mlaMap = getMlaMap(assumptions.mlas || []);

  const baseBody = rows.map((t) => {
    const ledMonth = Math.max(1, t.expMonth || monthDiff(assumptions.acquisitionDate, t.expirationDate));
    const ledRent = rentForMonth(assumptions, t, ledMonth);
    const pctBldg = assumptions.grossSf > 0 ? ((t.sf || 0) / assumptions.grossSf) : 0;
    return `<tr>
      <td>${t.name || ''}</td>
      <td>${t.suite || '-'}</td>
      <td>${numFmt.format(t.sf || 0)}</td>
      <td>${pctFmt.format(pctBldg)}</td>
      <td>${formatDateMDY(t.expirationDate)}</td>
      <td>${yearsBetween(assumptions.acquisitionDate, t.expirationDate)}</td>
      <td>${formatCurrencySmart((t.currentRent || 0) * 12)}</td>
      <td>${formatCurrencySmart((ledRent || 0) * 12)}</td>
      <td>Net</td>
    </tr>`;
  }).join('');

  const waTerm = rows.length ? (rows.reduce((sum, t) => sum + ((t.sf || 0) * (parseFloat(yearsBetween(assumptions.acquisitionDate, t.expirationDate)) || 0)), 0) / (totalSf || 1)) : 0;
  const waCurrent = rows.length ? rows.reduce((sum, t) => sum + ((t.sf || 0) * (t.currentRent || 0)), 0) / (totalSf || 1) : 0;
  const waLed = rows.length ? rows.reduce((sum, t) => sum + ((t.sf || 0) * rentForMonth(assumptions, t, Math.max(1, t.expMonth || 1))), 0) / (totalSf || 1) : 0;

  const assumptionRows = rows.map((t) => {
    const mla = mlaMap[t.mlaName] || assumptions.mlas?.[0] || {};
    const renewProb = getTenantRenewalProbability(t, mla);
    const newProb = 1 - renewProb;
    const ledMonth = Math.max(1, t.expMonth || monthDiff(assumptions.acquisitionDate, t.expirationDate));
    const ledRentAnnual = rentForMonth(assumptions, t, ledMonth) * 12;
    const mlaRentAnnual = marketRentPsfAtMonth(assumptions, mla, 1, t.sf) * 12;
    const strikeRenew = marketRentPsfAtMonth(assumptions, mla, ledMonth, t.sf) * 12;
    const strikeNew = marketRentPsfAtMonth(assumptions, mla, ledMonth + Math.round(mla.downtimeMonths || 0), t.sf) * 12;
    const strikeRent = (renewProb * strikeRenew) + (newProb * strikeNew);
    const weightedDowntime = newProb * (mla.downtimeMonths || 0);
    const lcdDate = addMonths(t.expirationDate || assumptions.acquisitionDate, Math.round(weightedDowntime));
    const termYears = (mla.leaseTerm || 0) / 12;
    const bumps = assumptions.growthByYear?.[Math.min(9, Math.floor((ledMonth - 1) / 12))] || 0;
    const tiPsf = (renewProb * (mla.tiRenewal || 0)) + (newProb * (mla.tiNew || 0));
    const incVsLed = ledRentAnnual > 0 ? ((strikeRent / ledRentAnnual) - 1) : 0;
    return {
      sf: t.sf || 0,
      assumptionAtLed: renewProb >= 0.5 ? 'Renew' : 'New',
      downtime: weightedDowntime,
      lcd: lcdDate,
      termYears,
      mlaRentAnnual,
      strikeRent,
      incVsLed,
      bumps,
      tiPsf,
    };
  });

  const wAvg = (key) => {
    const denom = totalSf || 1;
    return assumptionRows.reduce((sum, r) => sum + ((r.sf || 0) * (r[key] || 0)), 0) / denom;
  };

  const secondGenBody = assumptionRows.map((r) => `<tr>
    <td>${r.assumptionAtLed}</td>
    <td>${numFmt.format(r.downtime)} mos.</td>
    <td>${formatDateMDY(r.lcd)}</td>
    <td>${numFmt.format(r.termYears)} yrs.</td>
    <td>${formatCurrencySmart(r.mlaRentAnnual)}</td>
    <td>${formatCurrencySmart(r.strikeRent)}</td>
    <td>${pctFmt.format(r.incVsLed)}</td>
    <td>${pctFmt.format(r.bumps)}</td>
    <td>${formatCurrencySmart(r.tiPsf)}</td>
  </tr>`).join('');

  const secondGenFooter = `<tr>
    <td></td>
    <td>${numFmt.format(wAvg('downtime'))} mos.</td>
    <td></td>
    <td>${numFmt.format(wAvg('termYears'))} yrs.</td>
    <td>${formatCurrencySmart(wAvg('mlaRentAnnual'))}</td>
    <td>${formatCurrencySmart(wAvg('strikeRent'))}</td>
    <td>${pctFmt.format(wAvg('incVsLed'))}</td>
    <td>${pctFmt.format(wAvg('bumps'))}</td>
    <td>${formatCurrencySmart(wAvg('tiPsf'))}</td>
  </tr>`;

  document.getElementById('rentRollOutput').innerHTML = `
    <div class="rent-roll-row">
      <div class="rent-roll-preview">
        <table>
          <thead><tr><th>Tenant</th><th>Suite</th><th>SF</th><th>% of Bldg</th><th>LED</th><th>Rem. Term</th><th>Rent PSF (Current)</th><th>Rent PSF @ LED</th><th>Gross/Net</th></tr></thead>
          <tbody>${baseBody}</tbody>
          <tfoot><tr><td>TOTAL / W.A.</td><td></td><td>${numFmt.format(totalSf)}</td><td>${pctFmt.format(assumptions.grossSf > 0 ? (totalSf / assumptions.grossSf) : 0)}</td><td></td><td>${waTerm.toFixed(1)} yrs.</td><td>${formatCurrencySmart(waCurrent * 12)}</td><td>${formatCurrencySmart(waLed * 12)}</td><td></td></tr></tfoot>
        </table>
      </div>
      <div class="rent-roll-preview">
        <div class="rent-roll-subtitle"><em><u>2nd Gen Assumptions</u></em></div>
        <table>
          <thead>
            <tr><th>Assumption @ LED</th><th>Downtime</th><th>LCD</th><th>Term</th><th>MLA Rent</th><th>Strike Rent</th><th>% Inc. vs. LED Rent</th><th>Bumps</th><th>TI PSF</th></tr>
          </thead>
          <tbody>${secondGenBody}</tbody>
          <tfoot>${secondGenFooter}</tfoot>
        </table>
      </div>
    </div>`;
}

function render(result) {
  const m = result.metrics;
  document.getElementById("kpiBar").innerHTML = [
    ["Unlevered IRR", pctFmt.format(m.unleveredIrr)],
    ["Levered IRR", pctFmt.format(m.leveredIrr)],
    ["Unlevered Eq. Mult", `${m.unleveredEqMult.toFixed(2)}x`],
    ["Levered Eq. Mult", `${m.leveredEqMult.toFixed(2)}x`],
    ["Levered Profit", formatCurrencySmart(m.leveredProfit)],
  ].map(([k, v]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

  document.getElementById("summary").textContent = `INVESTMENT SUMMARY\n\nReturns (from monthly cash flows)\n- Unlevered IRR: ${pctFmt.format(m.unleveredIrr)}\n- Levered IRR: ${pctFmt.format(m.leveredIrr)}\n- Unlevered Equity Multiple: ${m.unleveredEqMult.toFixed(2)}x\n- Levered Equity Multiple: ${m.leveredEqMult.toFixed(2)}x\n- Levered Profit: ${formatCurrencySmart(m.leveredProfit)}\n`;

  const metricRows = Object.entries(m).map(([k, v]) => [k, typeof v === "number" ? numFmt.format(v) : v]);
  document.getElementById("metrics").innerHTML = toHtmlTable(["Metric", "Value"], metricRows);

  renderCashFlowStatement(result);
  renderRentRollOutput(result.assumptions);
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



function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function workbookStylesXml() {
  return `<Styles>
    <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Borders/><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#000000"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><NumberFormat/><Protection/></Style>
    <Style ss:ID="TopHdrLabel"><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#000000"/><Interior ss:Color="#D1D5DB" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B5BECF"/></Borders></Style>
    <Style ss:ID="TopHdrVal"><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#000000"/><Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B5BECF"/></Borders></Style>
    <Style ss:ID="DateHdrLabel"><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#000000"/><Interior ss:Color="#D1D5DB" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B5BECF"/></Borders></Style>
    <Style ss:ID="DateHdrVal"><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#0F1F3D"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B5BECF"/></Borders><NumberFormat ss:Format="mm/dd/yyyy"/></Style>
    <Style ss:ID="Label"><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#000000"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center"/></Style>
    <Style ss:ID="Currency"><Font ss:FontName="Calibri" ss:Size="9" ss:Color="#000000"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><NumberFormat ss:Format="\&quot;$\&quot;#,##0.00_);[Red](\&quot;$\&quot;#,##0.00)"/></Style>
    <Style ss:ID="Section"><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F1F3D" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center"/></Style>
    <Style ss:ID="SubtotalLabel"><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#000000"/><Interior ss:Color="#F3F4F6" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#6F95D9"/></Borders></Style>
    <Style ss:ID="SubtotalCurrency"><Font ss:FontName="Calibri" ss:Size="9" ss:Bold="1" ss:Color="#000000"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#6F95D9"/></Borders><NumberFormat ss:Format="\&quot;$\&quot;#,##0.00_);[Red](\&quot;$\&quot;#,##0.00)"/></Style>
  </Styles>`;
}

function statementWorksheetXml(result, sheetName, periodSeries) {
  const lineDefs = getCashFlowLineDefs(result);
  const getLineValue = (row, def, periodsPerYear) => {
    if (def.formula) return def.formula(row);
    if (def.opexLineName) {
      if (row.period === 0) return 0;
      const line = result.assumptions.opexLines.find((o) => o.name === def.opexLineName);
      if (!line) return 0;
      const annual = line.amountType === '$/SF/Year' ? line.amount * result.assumptions.grossSf : line.amount;
      return (def.sign || 1) * (annual / periodsPerYear);
    }
    return (def.sign || 1) * (row[def.key] || 0);
  };

  const colDefs = ['<Column ss:Width="260"/>', ...periodSeries.map(() => '<Column ss:Width="96"/>')].join('');
  const rowXml = [];

  const monthCells = [`<Cell ss:StyleID="TopHdrLabel"><Data ss:Type="String">Month</Data></Cell>`];
  periodSeries.forEach((p) => monthCells.push(`<Cell ss:StyleID="TopHdrVal"><Data ss:Type="Number">${Number(p.periodIndex ?? p.period ?? 0)}</Data></Cell>`));
  rowXml.push(`<Row ss:AutoFitHeight="0" ss:Height="20">${monthCells.join('')}</Row>`);

  const dateCells = [`<Cell ss:StyleID="DateHdrLabel"><Data ss:Type="String">Date</Data></Cell>`];
  periodSeries.forEach((p) => {
    const iso = p.excelDate || result.assumptions.acquisitionDate;
    dateCells.push(`<Cell ss:StyleID="DateHdrVal"><Data ss:Type="DateTime">${iso}T00:00:00.000</Data></Cell>`);
  });
  rowXml.push(`<Row ss:AutoFitHeight="0" ss:Height="20">${dateCells.join('')}</Row>`);

  lineDefs.forEach((def) => {
    if (def.section) {
      const cells = [`<Cell ss:StyleID="Section"><Data ss:Type="String">${escapeXml(def.section)}</Data></Cell>`, ...periodSeries.map(() => '<Cell ss:StyleID="Section"><Data ss:Type="String"></Data></Cell>')];
      rowXml.push(`<Row>${cells.join('')}</Row>`);
      return;
    }

    const labelStyle = def.subtotal ? 'SubtotalLabel' : 'Label';
    const valStyle = def.subtotal ? 'SubtotalCurrency' : 'Currency';
    const cells = [`<Cell ss:StyleID="${labelStyle}"><Data ss:Type="String">${escapeXml(def.label)}</Data></Cell>`];
    periodSeries.forEach((p) => cells.push(`<Cell ss:StyleID="${valStyle}"><Data ss:Type="Number">${Number(getLineValue(p, def, p.periodsPerYear || 12) || 0)}</Data></Cell>`));
    rowXml.push(`<Row>${cells.join('')}</Row>`);
  });

  return `<Worksheet ss:Name="${sheetName}"><Table>${colDefs}${rowXml.join('')}</Table></Worksheet>`;
}

function exportCashFlowExcel(result) {
  const { monthSeries, annualSeries } = buildCashFlowSeries(result);
  const worksheets = [
    statementWorksheetXml(result, "MonthlyStatement", monthSeries),
    statementWorksheetXml(result, "AnnualStatement", annualSeries),
  ];
  const xml = `<?xml version="1.0"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n${workbookStylesXml()}\n${worksheets.join("\n")}\n</Workbook>`;
  download("cash_flow_statement.xls", xml, "application/vnd.ms-excel");
}

function exportExcel(result, summaryOnly = false) {
  const sRows = [["Item", "Value"], ["Purchase Price", result.assumptions.purchasePrice], ["Closing Costs", result.assumptions.closingCosts], ["Total Hold Costs", result.metrics.totalHoldCosts], ["Unlevered IRR", result.metrics.unleveredIrr], ["Levered IRR", result.metrics.leveredIrr], ["Unlevered Equity Multiple", result.metrics.unleveredEqMult], ["Levered Equity Multiple", result.metrics.leveredEqMult], ["Levered Profit", result.metrics.leveredProfit], ["Terminal Value", result.metrics.terminalValue]];
  const worksheets = [xmlWorksheet("InvestmentSummary", sRows)];
  if (!summaryOnly) {
    worksheets.push(xmlWorksheet("Assumptions", Object.entries(result.assumptions).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : v])));
    worksheets.push(xmlWorksheet("MonthlyCF", [["month", "date", "potentialBaseRent", "absorptionTurnoverVacancy", "freeRent", "scheduledBaseRent", "expenseRecoveries", "opexExpense", "netOpex", "noi", "tiCosts", "lcCosts", "leasingCosts", "capex", "reserves", "unlevered", "grossSaleProceeds", "saleClosingCosts", "netSaleProceeds", "debtPayoff", "unleveredCF", "debtBeginningBalance", "interestExpense", "principalAmortization", "debtService", "reimbursement", "debtEndingBalance", "levered", "leveredCF"], ...result.monthly.map((r) => [r.month, addMonths(result.assumptions.acquisitionDate, r.month), r.potentialBaseRent, r.absorptionTurnoverVacancy, r.freeRent, r.scheduledBaseRent, r.expenseRecoveries, r.opexExpense, r.netOpex, r.noi, r.tiCosts, r.lcCosts, r.leasingCosts, r.capex, r.reserves, r.unlevered, r.grossSaleProceeds, r.saleClosingCosts, r.netSaleProceeds, r.debtPayoff, r.unleveredCF, r.debtBeginningBalance, r.interestExpense, r.principalAmortization, r.debtService, r.reimbursement, r.debtEndingBalance, r.levered, r.leveredCF])]));
    const { monthSeries, annualSeries } = buildCashFlowSeries(result);
    worksheets.push(xmlWorksheet("MonthlyStatement", buildStatementRowsForExport(result, monthSeries)));
    worksheets.push(xmlWorksheet("AnnualStatement", buildStatementRowsForExport(result, annualSeries)));
    worksheets.push(xmlWorksheet("RentRoll", [["name", "sf", "commencementDate", "expirationDate", "currentRentMonthlyPSF", "rentType", "mlaName", "rentSteps"], ...result.assumptions.tenants.map((t) => [t.name, t.sf, t.commencementDate, t.expirationDate, t.currentRent, t.rentType, t.mlaName, JSON.stringify(t.rentSteps || [])])]));
    worksheets.push(xmlWorksheet("OperatingExpenses", [["name", "amount", "amountType", "reimbursable", "reimbursingTenants"], ...result.assumptions.opexLines.map((x) => [x.name, x.amount, x.amountType, x.reimbursable, x.reimbursingTenants])]));
  }
  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheets.join("\n")}
</Workbook>`;
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
  const literalMatches = latin.match(/\((?:\.|[^\)]){5,}\)/g) || [];
  for (let i = 0; i < literalMatches.length && i < 5000; i++) textRuns.push(literalMatches[i].slice(1, -1));
  const printable = latin.match(/[A-Za-z0-9$%,.\/()\-:\s]{30,}/g) || [];
  for (let i = 0; i < printable.length && i < 5000; i++) textRuns.push(printable[i]);
  return textRuns.join("\n");
}

function parseRentRollFromText(text) {
  const tenants = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Heuristic 1: generic line parser with 2 dates + numeric tokens.
  for (const line of lines) {
    const dateMatches = line.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/g) || [];
    const numMatches = line.match(/[\d,]+(?:\.\d+)?/g) || [];
    if (dateMatches.length < 2 || numMatches.length < 2) continue;

    const commencementDate = parseDateLike(dateMatches[0]);
    const expirationDate = parseDateLike(dateMatches[1]);
    if (!commencementDate || !expirationDate) continue;

    const sfCandidate = numMatches.find((n) => Number(n.replace(/,/g, "")) > 1000);
    const rentCandidate = [...numMatches].reverse().find((n) => Number(n) > 0 && Number(n) < 500);
    if (!sfCandidate || !rentCandidate) continue;

    let name = line.replace(dateMatches[0], "").replace(dateMatches[1], "").replace(sfCandidate, "").replace(rentCandidate, "").trim();
    if (!name || /^\d+$/.test(name)) name = `Suite ${tenants.length + 1}`;

    tenants.push({
      name: name.slice(0, 60),
      suite: "",
      sf: Number(sfCandidate.replace(/,/g, "")),
      commencementDate,
      expirationDate,
      currentRent: Number(rentCandidate),
      rentType: "$/SF/Mo",
      mlaName: "MLA-1",
      rentSteps: [],
    });
  }

  // Heuristic 2: OCR table-like row parser (tenant/suite/sf/start/end/rent pattern).
  const ocrRows = [];
  const rowRegex = /([A-Za-z][A-Za-z0-9&.()\-\/,\s]{2,})\s+([A-Za-z0-9\-/]+)\s+[\d,]{3,}\s+[\d,]{3,}\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})[\s\S]{0,100}?\$\s*([\d.]{1,8})/g;
  let m;
  while ((m = rowRegex.exec(text)) !== null) {
    const commencementDate = parseDateLike(m[3]);
    const expirationDate = parseDateLike(m[4]);
    if (!commencementDate || !expirationDate) continue;
    const sfNearby = text.slice(Math.max(0, m.index - 80), m.index + 180).match(/[\d,]{3,}/g) || [];
    const sf = Number((sfNearby[0] || "0").replace(/,/g, ""));
    if (!sf) continue;

    // Build rent steps if repeated Date + $Amount pairs exist on the row chunk.
    const chunk = text.slice(m.index, m.index + 450);
    const stepMatches = [...chunk.matchAll(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})[^$]{0,25}\$\s*([\d,]+(?:\.\d+)?)/g)];
    const rentSteps = stepMatches.slice(1).map((x) => ({
      date: parseDateLike(x[1]),
      rent: Number(String(x[2]).replace(/,/g, "")),
    })).filter((x) => x.date && x.rent > 0);

    ocrRows.push({
      name: m[1].trim().slice(0, 60),
      suite: m[2].trim(),
      sf,
      commencementDate,
      expirationDate,
      currentRent: Number(String(m[5]).replace(/,/g, "")) || 0,
      rentType: "$/SF/Mo",
      mlaName: "MLA-1",
      rentSteps,
    });
  }
  tenants.push(...ocrRows);

  // De-dupe parsed rows.
  const seen = new Set();
  return tenants.filter((t) => {
    const key = `${(t.name || "").toLowerCase()}|${t.suite || ""}|${t.sf}|${t.commencementDate}|${t.expirationDate}|${t.currentRent}`;
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

function parseValueFromText(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const n = Number(String(m[1]).replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function applyPrefillFromText(rawText) {
  const text = String(rawText || "");
  const updates = [];
  const mappings = [
    ["purchasePrice", [/purchase\s*price[^\d]{0,20}([\d,]+(?:\.\d+)?)/i]],
    ["closingCosts", [/(?:closing|acquisition)\s*costs?[^\d]{0,20}([\d,]+(?:\.\d+)?)/i]],
    ["grossSf", [/(?:gross|building|rentable)\s*(?:sf|square\s*feet|square\s*footage)[^\d]{0,20}([\d,]+(?:\.\d+)?)/i]],
    ["exitCapRate", [/exit\s*cap\s*rate[^\d]{0,20}([\d.]+)\s*%?/i]],
    ["holdMonths", [/hold\s*(?:period)?\s*(?:months|month|mo|mos)[^\d]{0,20}([\d.]+)/i]],
    ["holdMonths", [/hold\s*(?:period)?\s*(?:years|year|yr|yrs)[^\d]{0,20}([\d.]+)/i]],
  ];

  mappings.forEach(([id, patterns]) => {
    const v = parseValueFromText(text, patterns);
    if (v == null) return;
    let normalized = id === "exitCapRate" && v > 1 ? v / 100 : v;
    if (id === "holdMonths" && /years|year|yr|yrs/i.test(patterns[0].source || "")) normalized = v * 12;
    setVal(id, normalized);
    updates.push(id);
  });

  let jsonObj = null;
  try {
    jsonObj = JSON.parse(text);
  } catch (_) {
    jsonObj = null;
  }

  if (jsonObj && typeof jsonObj === "object") {
    if (Array.isArray(jsonObj.tenants) && jsonObj.tenants.length) prefillRentRoll(jsonObj.tenants);
    if (typeof jsonObj.purchasePrice === "number") setVal("purchasePrice", jsonObj.purchasePrice);
    if (typeof jsonObj.grossSf === "number") setVal("grossSf", jsonObj.grossSf);
    if (typeof jsonObj.exitCapRate === "number") setVal("exitCapRate", jsonObj.exitCapRate);
  }

  syncClosingCostsBreakdown();
  return updates;
}

function detectFileType(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();
  if (ext === 'json' || mime.includes('json')) return 'json';
  if (ext === 'csv' || mime.includes('csv')) return 'csv';
  if (ext === 'pdf' || mime.includes('pdf')) return 'pdf';
  if (["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff", "gif"].includes(ext) || mime.startsWith('image/')) return 'image';
  if (["txt", "md", "yaml", "yml", "xml", "html", "htm", "rtf", "log", "ini"].includes(ext) || mime.startsWith('text/')) return 'text';
  return 'other';
}

function parseCsvRows(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((x) => x.trim());
  const rows = lines.slice(1).map((line) => line.split(',').map((x) => x.trim()));
  return { headers, rows };
}

function applyPrefillFromObject(obj) {
  if (!obj || typeof obj !== 'object') return { updates: 0, tenants: [] };
  let updates = 0;
  const numMap = [
    ['purchasePrice', ['purchasePrice', 'purchase_price', 'price']],
    ['closingCosts', ['closingCosts', 'closing_costs']],
    ['grossSf', ['grossSf', 'gross_sf', 'building_sf', 'square_footage']],
    ['holdMonths', ['holdMonths', 'hold_months']],
    ['holdMonths', ['holdYears', 'hold_years']],
  ];
  numMap.forEach(([id, keys]) => {
    const key = keys.find((k) => typeof obj[k] === 'number');
    if (!key) return;
    const raw = obj[key];
    const normalized = id === 'holdMonths' && /holdYears|hold_years/.test(key) ? raw * 12 : raw;
    setVal(id, normalized);
    updates += 1;
  });
  if (typeof obj.exitCapRate === 'number') { setVal('exitCapRate', obj.exitCapRate); updates += 1; }
  if (typeof obj.exit_cap_rate === 'number') { setVal('exitCapRate', obj.exit_cap_rate); updates += 1; }
  syncClosingCostsBreakdown();
  const tenants = Array.isArray(obj.tenants) ? obj.tenants : [];
  return { updates, tenants };
}

// Extract machine text from PDF pages using PDF.js.
async function extractPdfTextWithPdfJs(file) {
  if (!(window.pdfjsLib && window.pdfjsLib.getDocument)) return '';
  const bytes = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const chunks = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(' ');
    chunks.push(pageText);
  }
  return chunks.join('\n');
}

// If PDF has little/no extractable text, render pages and OCR via Tesseract.
async function ocrPdfWithTesseract(file) {
  if (!(window.pdfjsLib && window.pdfjsLib.getDocument && window.Tesseract)) return '';
  const bytes = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const ocrChunks = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const { data } = await window.Tesseract.recognize(canvas, 'eng', { logger: () => {} });
    ocrChunks.push(data?.text || '');
  }
  return ocrChunks.join('\n');
}

// Parse tenant rows from header-driven table blocks in PDF text.
function parseTenantsFromPdfTableText(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => /tenant\s*name/i.test(line) && /suite/i.test(line) && /(lease\s*start|commencement)/i.test(line));
  if (headerIndex < 0) return [];

  const parsed = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^(total|grand\s*total)/i.test(line)) break;
    const dateMatches = line.match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g) || [];
    if (dateMatches.length < 2) continue;

    const start = parseDateLike(dateMatches[0]);
    const end = parseDateLike(dateMatches[1]);
    if (!start || !end) continue;

    const suiteMatch = line.match(/\s([A-Za-z0-9\-\/]+)\s+/);
    const suite = suiteMatch ? suiteMatch[1] : '';
    const sfMatch = line.match(/[\s,](\d{1,3}(?:,\d{3})+|\d{4,})[\s,]/);
    const sf = sfMatch ? Number(sfMatch[1].replace(/,/g, '')) : 0;

    const annualRentMatch = line.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:annual|\/yr|yr)?/i);
    const monthlyRentMatch = line.match(/monthly[^$]{0,20}\$\s*([\d,]+(?:\.\d+)?)/i);
    const psfMatch = line.match(/psf[^$\d]{0,10}\$?\s*([\d]+(?:\.\d+)?)/i);

    let currentRent = 0;
    if (psfMatch) currentRent = Number(psfMatch[1]) / 12;
    else if (annualRentMatch && sf > 0) currentRent = Number(annualRentMatch[1].replace(/,/g, '')) / sf / 12;
    else if (monthlyRentMatch && sf > 0) currentRent = Number(monthlyRentMatch[1].replace(/,/g, '')) / sf;

    const namePart = line.split(dateMatches[0])[0].replace(/\$[^\s]+/g, '').trim();
    const name = namePart || `Tenant ${parsed.length + 1}`;

    // Pull possible rent-step series: repeated DATE + $ amount patterns.
    const stepMatches = [...line.matchAll(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})[^$]{0,30}\$\s*([\d,]+(?:\.\d+)?)/g)];
    const rentSteps = stepMatches.slice(1).map((x) => ({
      date: parseDateLike(x[1]),
      rent: sf > 0 ? (Number(String(x[2]).replace(/,/g, '')) / sf / 12) : Number(String(x[2]).replace(/,/g, '')),
    })).filter((x) => x.date && x.rent > 0);

    parsed.push({
      name: name.slice(0, 60),
      suite,
      sf,
      commencementDate: start,
      expirationDate: end,
      currentRent: currentRent || 0,
      rentType: '$/SF/Mo',
      mlaName: 'MLA-1',
      rentSteps,
    });
  }

  return parsed.filter((t) => t.name && (t.sf > 0 || t.currentRent > 0));
}

async function extractTextFromFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (ext === "pdf") {
    // 1) Try PDF.js text extraction first.
    let text = '';
    try {
      text = await extractPdfTextWithPdfJs(file);
    } catch (err) {
      console.warn('PDF.js extraction failed, falling back to raw extraction.', err);
      text = '';
    }

    // 2) Fallback to legacy byte-based extraction for resilience.
    if (!String(text || '').trim()) text = extractPdfTextFromBytes(bytes);

    // 3) If still empty and OCR is available, OCR the PDF pages.
    if (!String(text || '').trim()) {
      try {
        text = await ocrPdfWithTesseract(file);
      } catch (err) {
        console.warn('PDF OCR failed.', err);
      }
    }

    return text;
  }

  if (["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff", "gif"].includes(ext)) {
    if (typeof window !== "undefined" && window.Tesseract) {
      const { data } = await window.Tesseract.recognize(file, "eng", { logger: () => {} });
      return data?.text || "";
    }
  }

  if (["txt", "md", "csv", "json", "yaml", "yml", "xml", "html", "htm", "rtf", "log", "ini"].includes(ext)) {
    return await file.text();
  }

  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const latin = new TextDecoder("latin1").decode(bytes);
  return `${utf8}
${latin}`;
}

// Main upload analyzer with typed branches, validation, and progress feedback.
async function analyzeSourceMaterials() {
  const status = document.getElementById("sourceStatus");
  if (!state.sourceFiles.length) {
    status.textContent = "No files selected. Upload source materials first.";
    return;
  }

  const allTenants = [];
  let assumptionHits = 0;
  let unsupported = 0;
  const failed = [];

  status.textContent = `Analyzing 0 / ${state.sourceFiles.length} file(s)...`;

  for (let idx = 0; idx < state.sourceFiles.length; idx++) {
    const file = state.sourceFiles[idx];
    const detectedType = detectFileType(file);
    status.textContent = `Analyzing ${idx + 1} / ${state.sourceFiles.length}: ${file.name} (${detectedType})...`;

    try {
      if (detectedType === 'json') {
        try {
          const obj = JSON.parse(await file.text());
          const { updates, tenants } = applyPrefillFromObject(obj);
          assumptionHits += updates;
          if (tenants.length) allTenants.push(...tenants);
          const txtHits = applyPrefillFromText(JSON.stringify(obj)) || [];
          assumptionHits += txtHits.length;
        } catch (err) {
          failed.push(`${file.name} (malformed JSON)`);
          continue;
        }
      } else if (detectedType === 'csv') {
        const text = await file.text();
        const txtHits = applyPrefillFromText(text) || [];
        assumptionHits += txtHits.length;

        const { headers, rows } = parseCsvRows(text);
        const h = headers.map((x) => x.toLowerCase());
        const idxName = h.findIndex((x) => x.includes('tenant') || x.includes('name'));
        const idxSuite = h.findIndex((x) => x.includes('suite'));
        const idxSf = h.findIndex((x) => x === 'sf' || x.includes('square'));
        const idxCommence = h.findIndex((x) => x.includes('commence') || x.includes('lease start'));
        const idxExpire = h.findIndex((x) => x.includes('expir') || x.includes('lease end'));
        const idxRent = h.findIndex((x) => x.includes('rent'));

        rows.forEach((cols, i) => {
          const t = {
            name: cols[idxName >= 0 ? idxName : 0] || `Suite ${i + 1}`,
            suite: idxSuite >= 0 ? (cols[idxSuite] || "") : "",
            sf: Number((cols[idxSf >= 0 ? idxSf : 1] || "0").replace(/,/g, "")),
            commencementDate: parseDateLike(cols[idxCommence >= 0 ? idxCommence : 2]) || "2026-01-01",
            expirationDate: parseDateLike(cols[idxExpire >= 0 ? idxExpire : 3]) || "2028-01-01",
            currentRent: Number(String(cols[idxRent >= 0 ? idxRent : 4] || 0).replace(/,/g, "")) || 0,
            rentType: "$/SF/Mo",
            mlaName: "MLA-1",
            rentSteps: [],
          };
          if (t.sf > 0 || t.currentRent > 0) allTenants.push(t);
        });
      } else if (detectedType === 'pdf') {
        const text = await extractTextFromFile(file);
        if (!String(text || '').trim()) {
          failed.push(`${file.name} (PDF text extraction failed)`);
          continue;
        }

        // 1) assumptions from text
        const hits = applyPrefillFromText(text) || [];
        assumptionHits += hits.length;

        // 2) structured table parsing from PDF headers/rows
        const pdfTableTenants = parseTenantsFromPdfTableText(text);
        // 3) fallback generic parsers
        const fallbackTenants = parseRentRollFromText(text);
        const combined = [...pdfTableTenants, ...fallbackTenants];
        if (!combined.length) unsupported += 1;
        allTenants.push(...combined);

        // Debug logging requested by user.
        console.log('PDF extracted text preview:', text.slice(0, 2000));
        console.log('PDF parsed tenants:', combined);
      } else {
        const text = await extractTextFromFile(file);
        if (!String(text || '').trim()) {
          unsupported += 1;
          continue;
        }
        const hits = applyPrefillFromText(text) || [];
        assumptionHits += hits.length;
        allTenants.push(...parseRentRollFromText(text));
      }
    } catch (err) {
      failed.push(file.name);
      console.error('Failed to parse', file.name, err);
    }
  }

  if (allTenants.length) {
    prefillRentRoll(allTenants);
    console.log('All extracted tenant objects:', allTenants);
  }

  renderRentRollOutput(gatherAssumptions());

  const failMsg = failed.length ? ` Failed: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '...' : ''}.` : '';
  const unsupportedMsg = unsupported ? ` ${unsupported} file(s) had no extractable structured text.` : '';
  status.textContent = `Analyzed ${state.sourceFiles.length} file(s). Prefilled ${allTenants.length} rent-roll row(s) and ${assumptionHits} assumption field(s).${unsupportedMsg}${failMsg}`;
}

function getTenantBaseMonthlyRentPsf(tenantIdx) {
  const sf = getVal(`tenant_sf_${tenantIdx}`);
  const rentType = document.getElementById(`tenant_rent_type_${tenantIdx}`)?.value || "$/SF/Mo";
  const rentValue = getVal(`tenant_rent_${tenantIdx}`);
  return normalizeMonthlyRent(rentValue, rentType, sf);
}

function renderStepCalculationsForDialog(tenantIdx) {
  const sf = Math.max(0, getVal(`tenant_sf_${tenantIdx}`));
  const rows = [...document.querySelectorAll("#stepTableBody tr")].sort((a, b) => {
    const ad = new Date(a.querySelector('input[type="date"]')?.value || '');
    const bd = new Date(b.querySelector('input[type="date"]')?.value || '');
    return ad - bd;
  });

  let priorMonthlyPsf = getTenantBaseMonthlyRentPsf(tenantIdx);

  rows.forEach((row) => {
    const selects = row.querySelectorAll('select');
    const calcType = selects[0]?.value || "Rent Value";
    const rentType = selects[1]?.value || "$/SF/Mo";
    const valueInput = row.querySelector('input[data-format]');
    const fmt = valueInput?.dataset.format || (calcType === "% Increase" ? "percent" : "currency");
    const rawValue = parseFormatted(valueInput?.dataset.raw ?? valueInput?.value, fmt);

    let monthlyPsf = priorMonthlyPsf;
    if (calcType === "% Increase") {
      monthlyPsf = priorMonthlyPsf * (1 + rawValue);
    } else {
      monthlyPsf = normalizeMonthlyRent(rawValue, rentType, sf);
    }

    row.querySelector('.step-rent-psf').textContent = formatCurrencySmart(monthlyPsf * 12);
    row.querySelector('.step-annual-rent').textContent = formatCurrencySmart(monthlyPsf * sf * 12);
    priorMonthlyPsf = monthlyPsf;
  });
}

function openRentStepDialog(tenantIdx) {
  state.activeTenantForSteps = tenantIdx;
  const dialog = document.getElementById("rentStepDialog");
  document.getElementById("stepDialogTitle").textContent = `Rent Steps: ${document.getElementById(`tenant_name_${tenantIdx}`)?.value || `Tenant ${tenantIdx}`}`;
  const body = document.getElementById("stepTableBody");
  body.innerHTML = "";
  (state.rentStepsByTenant[tenantIdx] || []).forEach((step) => addStepRowToDialog(step));
  renderStepCalculationsForDialog(tenantIdx);
  dialog.showModal();
}

function addStepRowToDialog(step = {}) {
  const date = step.date || "";
  const value = Number(step.value ?? step.rent ?? 0);
  const calcType = step.calcType || "Rent Value";
  const rentType = step.rentType || "$/SF/Mo";
  const valueFormat = calcType === "% Increase" ? "percent" : "currency";
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="date" value="${date}" /></td>
    <td><select><option ${calcType === "Rent Value" ? "selected" : ""}>Rent Value</option><option ${calcType === "% Increase" ? "selected" : ""}>% Increase</option></select></td>
    <td><select><option ${rentType === "$/SF/Mo" ? "selected" : ""}>$/SF/Mo</option><option ${rentType === "$/SF/Year" ? "selected" : ""}>$/SF/Year</option><option ${rentType === "$/Year" ? "selected" : ""}>$/Year</option></select></td>
    <td><input data-format="${valueFormat}" data-raw="${value}" value="${displayFormatted(value, valueFormat)}" /></td>
    <td class="step-rent-psf">-</td>
    <td class="step-annual-rent">-</td>
    <td><button class="btn btn-danger" type="button" onclick="this.closest('tr').remove(); renderStepCalculationsForDialog(state.activeTenantForSteps);">X</button></td>
  `;
  document.getElementById("stepTableBody").appendChild(tr);
  tr.querySelectorAll("input[data-format]").forEach(bindFormattedInput);

  const calcSel = tr.querySelectorAll('select')[0];
  const valInput = tr.querySelector('input[data-format]');
  const rentTypeSel = tr.querySelectorAll('select')[1];
  const dateInput = tr.querySelector('input[type="date"]');

  let lastCalcType = calcSel.value;
  const sync = () => {
    if (calcSel.value === '% Increase') {
      valInput.dataset.format = 'percent';
      if (lastCalcType !== '% Increase') {
        valInput.dataset.raw = '0';
        valInput.value = '';
      } else {
        const raw = parseFormatted(valInput.dataset.raw ?? valInput.value, 'percent');
        valInput.dataset.raw = String(raw);
        valInput.value = raw > 0 ? displayFormatted(raw, 'percent') : '';
      }
      valInput.placeholder = 'e.g. 3.00%';
    } else {
      valInput.dataset.format = 'currency';
      const raw = parseFormatted(valInput.dataset.raw ?? valInput.value, 'currency');
      valInput.dataset.raw = String(raw);
      valInput.value = displayFormatted(raw, 'currency');
      valInput.placeholder = '';
    }
    rentTypeSel.disabled = calcSel.value === '% Increase';
    lastCalcType = calcSel.value;
    renderStepCalculationsForDialog(state.activeTenantForSteps);
  };

  calcSel.addEventListener('change', sync);
  rentTypeSel.addEventListener('change', () => renderStepCalculationsForDialog(state.activeTenantForSteps));
  dateInput.addEventListener('change', () => renderStepCalculationsForDialog(state.activeTenantForSteps));
  valInput.addEventListener('input', () => renderStepCalculationsForDialog(state.activeTenantForSteps));
  sync();
}

function saveRentStepsFromDialog() {
  const idx = state.activeTenantForSteps;
  if (!idx) return;
  const rows = [...document.querySelectorAll("#stepTableBody tr")];
  state.rentStepsByTenant[idx] = rows
    .map((row) => {
      const date = row.querySelector('input[type="date"]').value;
      const selects = row.querySelectorAll('select');
      const calcType = selects[0]?.value || "Rent Value";
      const rentType = selects[1]?.value || "$/SF/Mo";
      const valueInput = row.querySelector('input[data-format]');
      const fmt = valueInput?.dataset.format || (calcType === "% Increase" ? "percent" : "currency");
      const value = parseFormatted(valueInput?.dataset.raw ?? valueInput?.value, fmt);
      return { date, value, calcType, rentType };
    })
    .filter((x) => x.date && x.value > 0);
  renderRentStepSummary(idx);
}

document.getElementById("addMla").onclick = addMla;
document.getElementById("addTenant").onclick = () => addTenant();
document.getElementById("addOpex").onclick = () => addOpexLine();
document.getElementById("addCapex").onclick = () => addCapexLine();
document.getElementById("analyzeSources").onclick = analyzeSourceMaterials;

document.getElementById("addStepRow").onclick = () => addStepRowToDialog({});
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
document.getElementById("exportCashFlowExcel").onclick = () => state.lastResult && exportCashFlowExcel(state.lastResult);
document.getElementById("exportJson").onclick = () => download("assumptions.json", JSON.stringify(gatherAssumptions(), null, 2), "application/json");
document.getElementById("exportReport").onclick = () => state.lastResult && download("investment_summary.md", generateReportText(state.lastResult), "text/markdown");

document.getElementById("fileDrop").addEventListener("change", async (e) => {
  state.sourceFiles = [...e.target.files];
  document.getElementById("fileList").innerHTML = state.sourceFiles.map((f) => `<span class="chip">${f.name}</span>`).join("");
  document.getElementById("sourceStatus").textContent = `${state.sourceFiles.length} file(s) uploaded. Starting autofill...`;
  if (state.sourceFiles.length) await analyzeSourceMaterials();
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const target = e.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
  if (target.closest("#stepTableBody")) return;
  e.preventDefault();
  target.blur();
});

if (typeof window !== "undefined" && window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.js";
}

initForm();
renderRentRollOutput(gatherAssumptions());
