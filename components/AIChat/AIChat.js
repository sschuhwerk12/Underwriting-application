export class AIChat {
  constructor(rootSelector) {
    this.root = document.querySelector(rootSelector);
    this.messages = [];
    this.lastAdvisorResult = null;
    this.lastConfirmationToken = null;
    if (!this.root) return;
    this.render();
    this.bind();
  }

  render() {
    this.root.innerHTML = `
      <div class="ai-chat-shell">
        <h3>AI Advisor (Phase III)</h3>
        <div class="ai-mode-row">
          <button class="btn ai-mode active" data-mode="advisor">Advisor</button>
          <button class="btn ai-mode" data-mode="audit">Audit</button>
          <button class="btn ai-mode" data-mode="scenarios">Scenarios</button>
        </div>
        <div id="aiChatHistory" class="ai-chat-history"></div>
        <form id="aiChatForm" class="ai-chat-form">
          <input id="aiChatInput" type="text" placeholder="Ask valuation, risk, scenario, or audit questions..." maxlength="4000" />
          <button type="submit" class="btn btn-primary">Run</button>
        </form>
        <div id="aiChatStatus" class="muted"></div>
        <div id="aiAuditPanel" class="ai-panel"></div>
        <div id="aiScenarioPanel" class="ai-panel"></div>
        <div id="aiProposedChanges" class="ai-panel"></div>
      </div>

      <dialog id="aiApplyDialog" class="ai-apply-dialog">
        <h4>Apply AI-proposed changes?</h4>
        <p class="muted">This will update model fields and run a fresh audit report.</p>
        <div class="file-row">
          <button id="aiApplyConfirm" class="btn btn-primary" type="button">Apply changes</button>
          <button id="aiApplyCancel" class="btn" type="button">Cancel</button>
        </div>
      </dialog>
    `;
  }

  bind() {
    this.mode = 'advisor';
    const form = this.root.querySelector('#aiChatForm');
    const input = this.root.querySelector('#aiChatInput');
    const status = this.root.querySelector('#aiChatStatus');

    this.root.querySelectorAll('.ai-mode').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.mode;
        this.root.querySelectorAll('.ai-mode').forEach((b) => b.classList.toggle('active', b === btn));
        status.textContent = `Mode: ${this.mode}`;
      });
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim() || this.defaultPromptForMode(this.mode);
      input.value = '';
      if (this.mode === 'advisor') {
        this.push('user', text);
        await this.runAdvisor(text);
      } else if (this.mode === 'audit') {
        await this.runAudit();
      } else {
        await this.runScenarios();
      }
    });

    const applyDialog = this.root.querySelector('#aiApplyDialog');
    this.root.querySelector('#aiApplyCancel')?.addEventListener('click', () => applyDialog?.close());
    this.root.querySelector('#aiApplyConfirm')?.addEventListener('click', async () => {
      applyDialog?.close();
      await this.applyChanges();
    });
  }

  defaultPromptForMode(mode) {
    if (mode === 'audit') return 'audit my assumptions';
    if (mode === 'scenarios') return 'generate scenario set';
    return 'give me underwriting advice';
  }

  getSnapshot() {
    const modelFields = typeof window.getCurrentModelSnapshot === 'function' ? window.getCurrentModelSnapshot() : {};
    const dealId = typeof window.getActiveDealId === 'function' ? window.getActiveDealId() : 'active-ui-deal';
    return { dealId, modelFields };
  }

  push(role, content) {
    this.messages.push({ role, content });
    this.draw();
  }

  draw() {
    const box = this.root.querySelector('#aiChatHistory');
    box.innerHTML = this.messages
      .map((m) => `<div class="ai-msg ${m.role}"><strong>${m.role}:</strong> ${escapeHtml(m.content)}</div>`)
      .join('');
    box.scrollTop = box.scrollHeight;
  }

  async runAdvisor(prompt) {
    this.push('assistant', '');
    const idx = this.messages.length - 1;
    const status = this.root.querySelector('#aiChatStatus');
    const { dealId, modelFields } = this.getSnapshot();

    const response = await fetch('/api/ai/advisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deal_id: dealId,
        prompt,
        mode: /scenario/i.test(prompt) ? 'scenario' : (/recommend|suggest/i.test(prompt) ? 'recommendation' : 'chat'),
        model_fields: modelFields,
        history: this.messages.slice(0, -1),
      }),
    });

    if (!response.ok || !response.body) {
      this.messages[idx].content = `Advisor request failed (${response.status}).`;
      this.draw();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const chunk of events) {
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.stage) status.textContent = `Advisor ${payload.stage}...`;
        if (payload.result) {
          const advisor = payload.result.advisor;
          this.lastAdvisorResult = payload.result;
          this.lastConfirmationToken = payload.result.confirmation?.confirmationToken || null;
          this.messages[idx].content = this.renderAdvisorText(advisor);
          this.draw();
          this.renderProposedChanges(advisor.proposed_model_changes || [], payload.result.confirmation);
        }
      }
    }
  }

  renderAdvisorText(advisor) {
    const lines = [];
    lines.push('Summary:');
    for (const s of advisor.summary || []) lines.push(`- ${s}`);
    lines.push('Analysis:');
    for (const [k, arr] of Object.entries(advisor.analysis || {})) {
      if (!arr?.length) continue;
      lines.push(`- ${k}: ${arr.join(' ')}`);
    }
    if (advisor.unknowns?.length) lines.push(`Unknowns: ${advisor.unknowns.join('; ')}`);
    if (advisor.risks?.length) lines.push(`Risks: ${advisor.risks.join('; ')}`);
    if (advisor.recommended_actions?.length) lines.push(`Actions: ${advisor.recommended_actions.map((a) => a.title).join('; ')}`);
    return lines.join('\n');
  }

  renderProposedChanges(changes, confirmation) {
    const panel = this.root.querySelector('#aiProposedChanges');
    if (!changes.length) {
      panel.innerHTML = '';
      return;
    }

    panel.innerHTML = `
      <h4>Proposed Changes</h4>
      <div class="ai-change-list">
        ${changes.map((c) => `
          <div class="ai-change-item">
            <div><strong>${escapeHtml(c.field)}</strong></div>
            <div>${escapeHtml(String(c.current_value))} → ${escapeHtml(String(c.proposed_value))}</div>
            <div class="muted">${escapeHtml(c.rationale)} (${c.confidence})</div>
          </div>
        `).join('')}
      </div>
      <button id="aiOpenApplyModal" class="btn btn-primary">Apply changes</button>
      <div class="muted">Token expires at ${escapeHtml(confirmation?.expires_at || 'unknown')}.</div>
    `;

    panel.querySelector('#aiOpenApplyModal')?.addEventListener('click', () => {
      this.root.querySelector('#aiApplyDialog')?.showModal();
    });
  }

  async runAudit() {
    const status = this.root.querySelector('#aiChatStatus');
    const panel = this.root.querySelector('#aiAuditPanel');
    const { dealId, modelFields } = this.getSnapshot();
    status.textContent = 'Running audit...';
    const res = await fetch('/api/ai/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId, model_fields: modelFields }),
    });
    const payload = await res.json();
    if (!res.ok) {
      panel.innerHTML = `<div class="ai-error">Audit failed: ${escapeHtml(payload.error || 'Unknown error')}</div>`;
      return;
    }
    status.textContent = 'Audit complete.';
    const r = payload.report;
    panel.innerHTML = `
      <h4>Audit Report</h4>
      ${renderAuditSection('Errors', r.errors, (x) => `${x.field}: ${x.issue} — ${x.fix}`)}
      ${renderAuditSection('Warnings', r.warnings, (x) => `${x.field}: ${x.issue} (${x.range_or_rule})`)}
      ${renderAuditSection('Questions', r.questions, (x) => `${x.question} (${x.needed_for})`)}
      ${renderAuditSection('Suggestions', r.improvement_suggestions, (x) => `${x.title}: ${x.details}`)}
    `;
  }

  async runScenarios() {
    const status = this.root.querySelector('#aiChatStatus');
    const panel = this.root.querySelector('#aiScenarioPanel');
    const { dealId, modelFields } = this.getSnapshot();
    status.textContent = 'Generating scenarios...';
    const res = await fetch('/api/ai/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId, model_fields: modelFields }),
    });
    const payload = await res.json();
    if (!res.ok) {
      panel.innerHTML = `<div class="ai-error">Scenarios failed: ${escapeHtml(payload.error || 'Unknown error')}</div>`;
      return;
    }
    status.textContent = 'Scenario generation complete.';
    const s = payload.scenarios;
    panel.innerHTML = `
      <h4>Scenario Set (Deltas)</h4>
      ${renderDeltaBlock('Base', s.scenarios.base.deltas)}
      ${renderDeltaBlock('Upside', s.scenarios.upside.deltas)}
      ${renderDeltaBlock('Downside', s.scenarios.downside.deltas)}
      <h5>Sensitivities</h5>
      <ul>${s.sensitivities.map((x) => `<li>${escapeHtml(x.name)} (${escapeHtml(x.field)}): ${escapeHtml(JSON.stringify(x.grid))}</li>`).join('')}</ul>
    `;
  }

  async applyChanges() {
    const status = this.root.querySelector('#aiChatStatus');
    if (!this.lastConfirmationToken) {
      status.textContent = 'No pending proposed changes found.';
      return;
    }
    const { dealId } = this.getSnapshot();
    status.textContent = 'Applying changes...';
    const res = await fetch('/api/ai/apply-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: dealId, confirm: true, confirmationToken: this.lastConfirmationToken }),
    });
    const payload = await res.json();
    if (!res.ok) {
      status.textContent = `Apply failed: ${payload.error || 'Unknown error'}`;
      return;
    }

    if (typeof window.applyAiModelChanges === 'function') {
      window.applyAiModelChanges(this.lastAdvisorResult?.advisor?.proposed_model_changes || []);
    }

    status.textContent = `Applied ${payload.applied_count} changes and refreshed audit.`;
    await this.runAudit();
  }
}

function renderDeltaBlock(name, deltas = []) {
  return `
    <h5>${name}</h5>
    <ul>${deltas.map((d) => `<li>${escapeHtml(d.field)}: Δ ${escapeHtml(String(d.delta))} (${escapeHtml(d.note)})</li>`).join('')}</ul>
  `;
}

function renderAuditSection(title, items = [], renderLine) {
  return `
    <h5>${title}</h5>
    <ul>${(items || []).map((x) => `<li>${escapeHtml(renderLine(x))}</li>`).join('') || '<li>None</li>'}</ul>
  `;
}

function escapeHtml(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
