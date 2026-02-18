export class AIChat {
  constructor(rootSelector) {
    this.root = document.querySelector(rootSelector);
    this.messages = [];
    if (!this.root) return;
    this.render();
    this.bind();
  }

  render() {
    this.root.innerHTML = `
      <div class="ai-chat-shell">
        <h3>AI Chat (Phase 1 Shell)</h3>
        <div id="aiChatHistory" class="ai-chat-history"></div>
        <form id="aiChatForm" class="ai-chat-form">
          <input id="aiChatInput" type="text" placeholder="Ask anything (Phase 1 echo/infra test)..." maxlength="4000" />
          <button type="submit" class="btn btn-primary">Send</button>
        </form>
      </div>
    `;
  }

  bind() {
    const form = this.root.querySelector('#aiChatForm');
    const input = this.root.querySelector('#aiChatInput');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this.push('user', text);
      await this.streamReply(text);
    });
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

  async streamReply(message) {
    this.push('assistant', '');
    const idx = this.messages.length - 1;

    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: this.messages.slice(0, -1) }),
    });

    if (!response.ok || !response.body) {
      this.messages[idx].content = `Request failed (${response.status}).`;
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
        if (payload.done) continue;
        if (payload.delta) {
          this.messages[idx].content += payload.delta;
          this.draw();
        }
      }
    }
  }
}

function escapeHtml(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
