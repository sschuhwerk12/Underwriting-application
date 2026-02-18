export class FileUpload {
  constructor(rootSelector) {
    this.root = document.querySelector(rootSelector);
    if (!this.root) return;
    this.render();
    this.bind();
  }

  render() {
    this.root.innerHTML = `
      <div class="file-upload-shell">
        <h3>AI Ingestion (Phase II)</h3>
        <p class="muted">Upload PDF / CSV / XLSX to extract structured underwriting data.</p>
        <form id="aiIngestForm" class="file-upload-form">
          <input id="aiIngestFiles" type="file" multiple accept=".pdf,.csv,.xlsx,.xls" />
          <input id="aiIngestDealId" type="text" placeholder="Deal ID (optional)" />
          <label class="inline-label"><input id="aiIngestOverwrite" type="checkbox" /> Overwrite existing deal version</label>
          <button type="submit" class="btn btn-primary">Run AI Ingestion</button>
        </form>
        <div id="aiIngestStatus" class="muted"></div>
      </div>
    `;
  }

  bind() {
    const form = this.root.querySelector('#aiIngestForm');
    const fileInput = this.root.querySelector('#aiIngestFiles');
    const dealIdInput = this.root.querySelector('#aiIngestDealId');
    const overwriteInput = this.root.querySelector('#aiIngestOverwrite');
    const statusEl = this.root.querySelector('#aiIngestStatus');

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const files = fileInput.files;
      if (!files || !files.length) {
        statusEl.textContent = 'Please select at least one file.';
        return;
      }

      const fd = new FormData();
      for (const file of files) fd.append('files', file);
      if (dealIdInput.value.trim()) fd.append('dealId', dealIdInput.value.trim());
      fd.append('overwrite', String(overwriteInput.checked));

      statusEl.textContent = 'Ingestion running...';
      try {
        const res = await fetch('/api/ai/ingest', { method: 'POST', body: fd });
        const payload = await res.json();
        if (!res.ok) {
          statusEl.textContent = `${payload.error || 'Ingestion failed.'}`;
          return;
        }

        statusEl.textContent = `Ingestion complete: ${payload.ingestion.filesProcessed} file(s), ${payload.ingestion.chunkCount} chunks, deal ${payload.dealId} v${payload.version}.`;
        window.dispatchEvent(new CustomEvent('ai-ingestion-complete', { detail: payload }));
      } catch (err) {
        statusEl.textContent = `Ingestion error: ${err.message}`;
      }
    });
  }
}
