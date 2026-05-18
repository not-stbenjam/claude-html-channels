/**
 * ClaudeChannel — browser-side bridge for Claude HTML Channels.
 *
 * Usage:
 *   ClaudeChannel.init();  // auto-detects port from window.location
 *   ClaudeChannel.onData(payload => renderUI(payload));
 *   // Define window.getChannelData() to enable the "Send to Claude" button
 */
const ClaudeChannel = (() => {
  let serverUrl = null;
  let eventSource = null;
  let dataHandlers = [];
  let statusHandlers = [];
  let connected = false;

  // ── UI: floating toolbar + toast container ──

  function injectStyles() {
    const css = document.createElement('style');
    css.textContent = `
      #claude-channel-toolbar {
        position: fixed; bottom: 20px; right: 20px; z-index: 99999;
        display: flex; align-items: center; gap: 10px;
        background: #1a1a2e; color: #e0e0e0;
        padding: 10px 16px; border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      }
      #claude-channel-toolbar button {
        background: #d4a843; color: #1a1a2e; border: none;
        padding: 8px 16px; border-radius: 8px; cursor: pointer;
        font-weight: 600; font-size: 14px; transition: background 0.2s;
      }
      #claude-channel-toolbar button:hover { background: #e0bc5f; }
      #claude-channel-toolbar button:active { transform: scale(0.97); }
      #claude-channel-dot {
        width: 10px; height: 10px; border-radius: 50%;
        transition: background 0.3s;
      }
      #claude-channel-dot.connected { background: #4caf50; }
      #claude-channel-dot.disconnected { background: #f44336; }
      #claude-toast-container {
        position: fixed; top: 20px; right: 20px; z-index: 100000;
        display: flex; flex-direction: column; gap: 8px;
        pointer-events: none;
      }
      .claude-toast {
        background: #1a1a2e; color: #e0e0e0;
        padding: 12px 20px; border-radius: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        animation: claude-toast-in 0.3s ease-out;
        max-width: 360px;
      }
      .claude-toast.done { border-left: 4px solid #4caf50; }
      .claude-toast.status { border-left: 4px solid #d4a843; }
      .claude-toast.error { border-left: 4px solid #f44336; }
      .claude-toast.sent { border-left: 4px solid #64b5f6; }
      @keyframes claude-toast-in {
        from { opacity: 0; transform: translateX(40px); }
        to   { opacity: 1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(css);
  }

  function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'claude-channel-toolbar';
    toolbar.innerHTML = `
      <div id="claude-channel-dot" class="disconnected"></div>
      <span id="claude-channel-label">Claude Channel</span>
      <button id="claude-channel-send">Send to Claude</button>
    `;
    document.body.appendChild(toolbar);

    const toasts = document.createElement('div');
    toasts.id = 'claude-toast-container';
    document.body.appendChild(toasts);

    document.getElementById('claude-channel-send').onclick = () => {
      if (typeof window.getChannelData === 'function') {
        send(window.getChannelData());
      } else {
        showToast('Define window.getChannelData() to use Send', 'error');
      }
    };
  }

  function updateDot() {
    const dot = document.getElementById('claude-channel-dot');
    if (dot) {
      dot.className = connected ? 'connected' : 'disconnected';
    }
  }

  function showToast(message, type = 'status') {
    const container = document.getElementById('claude-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `claude-toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
    statusHandlers.forEach(fn => fn(message, type));
  }

  // ── SSE: listen for Claude → browser messages ──

  function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`${serverUrl}/api/events`);

    eventSource.onopen = () => {
      connected = true;
      updateDot();
    };

    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status') {
          showToast(msg.message, 'status');
        } else if (msg.type === 'done') {
          showToast(msg.message, 'done');
        } else if (msg.type === 'data') {
          dataHandlers.forEach(fn => fn(msg.payload));
        } else if (msg.type === 'refresh') {
          showToast(msg.message || 'Page updated, reloading...', 'status');
          setTimeout(() => location.reload(), 500);
        }
      } catch (e) {
        console.error('ClaudeChannel: bad SSE message', e);
      }
    };

    eventSource.onerror = () => {
      connected = false;
      updateDot();
    };
  }

  // ── Public API ──

  function init(port) {
    // Auto-detect from window.location if served by the channel server
    serverUrl = port ? `http://127.0.0.1:${port}` : window.location.origin;
    injectStyles();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        createToolbar();
        connectSSE();
      });
    } else {
      createToolbar();
      connectSSE();
    }
  }

  async function send(data) {
    if (!serverUrl) {
      showToast('Channel not initialized', 'error');
      return;
    }
    try {
      const res = await fetch(`${serverUrl}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        showToast('Sent to Claude', 'sent');
      } else {
        showToast('Send failed: ' + res.status, 'error');
      }
    } catch (e) {
      showToast('Send failed: connection error', 'error');
    }
  }

  function onData(fn) { dataHandlers.push(fn); }
  function onStatus(fn) { statusHandlers.push(fn); }

  return { init, send, onData, onStatus };
})();
