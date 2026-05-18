# claude-html-channels

A Claude Code plugin marketplace for building interactive HTML tools with a live bidirectional channel back to Claude.

**The pattern:** You ask Claude to build an interactive HTML tool (a screener, planner, curator, editor). You work in it — edit, annotate, prioritize, comment. When you're done, click "Send to Claude" and your changes flow back into the conversation. Claude processes them, pushes updates back to the browser, and the page re-renders live. No manual JSON export/import.

## Installation

### Step 1: Add the marketplace

```bash
# From GitHub
claude plugin marketplace add stbenjam/claude-html-channels

# Or from a local clone
git clone https://github.com/stbenjam/claude-html-channels.git
claude plugin marketplace add ./claude-html-channels
```

### Step 2: Install the plugin

```bash
claude plugin install html-channel@claude-html-channels
```

## Usage

There are two ways to use this plugin depending on your Claude Code setup.

---

### Anthropic-Hosted (with Channels)

If you're using Claude Code with an Anthropic account (claude.ai Pro/Max or Console API key), you can use **channels** for the best experience — browser data arrives in your conversation automatically.

**Start Claude with the channel enabled:**

```bash
claude --dangerously-load-development-channels plugin:html-channel@claude-html-channels
```

**Then invoke the skill:**

```
/html-channel:channel-start build me a trip itinerary planner for 4 days in Tokyo
```

Claude will:
1. Generate an interactive HTML page
2. Serve it on localhost and open your browser
3. When you click "Send to Claude", your data arrives instantly in the conversation
4. Claude can push live updates back — the page re-renders without refreshing

---

### Third-Party Providers (without Channels)

If you're using Claude Code with a third-party API provider, channels aren't available. The plugin still works — you just use an MCP tool to receive browser data instead of it arriving automatically.

**Start Claude with the plugin enabled:**

```bash
claude
```

**Invoke the skill:**

```
/html-channel:channel-start build me a trip itinerary planner for 4 days in Tokyo
```

**When you're ready to send your changes:**

1. Click "Send to Claude" in the browser (bottom-right corner)
2. Tell Claude: "check what I sent" or "process my changes"
3. Claude will use the `receive_from_browser` tool to read your data

Claude can still push live updates back to the browser — the `send_to_browser` tool works the same in both modes.

---

## MCP Tools

The `html-channel` MCP server provides these tools:

| Tool | Description |
|------|-------------|
| `create_session` | Saves HTML content and serves it on localhost. Returns the URL. |
| `send_to_browser` | Pushes a message to the browser via SSE. Types: `status` (toast), `data` (re-render), `done` (completion toast). |
| `receive_from_browser` | Reads messages sent from the browser. Returns all pending messages and clears them. |
| `update_page` | Replaces the HTML page content. Browser should refresh to see changes. |

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Your Interactive HTML Tool                  │   │
│  │                                                          │   │
│  │   [Edit]  [Annotate]  [Prioritize]  [Comment]           │   │
│  │                                                          │   │
│  │                              ┌──────────────────────┐   │   │
│  │                              │ ● Send to Claude     │   │   │
│  │                              └──────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │                    ▲
                    POST /api/send           SSE /api/events
                              │                    │
                              ▼                    │
┌─────────────────────────────────────────────────────────────────┐
│                    html-channel MCP Server                      │
│                                                                 │
│   HTTP Server (localhost)          MCP Tools                    │
│   ├── Serves index.html            ├── create_session           │
│   ├── POST /api/send → messages    ├── send_to_browser → SSE    │
│   └── GET /api/events → SSE        ├── receive_from_browser     │
│                                    └── update_page              │
│                                                                 │
│   With channels: also emits notifications/claude/channel        │
└─────────────────────────────────────────────────────────────────┘
                              │                    ▲
                     MCP stdio                MCP stdio
                              │                    │
                              ▼                    │
┌─────────────────────────────────────────────────────────────────┐
│                         CLAUDE CODE                             │
│                                                                 │
│   With channels:     Data arrives automatically as <channel>    │
│   Without channels:  Use receive_from_browser tool to poll      │
│                                                                 │
│   Either way:        Use send_to_browser to push updates back   │
└─────────────────────────────────────────────────────────────────┘
```

## Example Use Cases

- **Jira/ticket screener** — Classify, prioritize, and annotate tickets. Claude applies your decisions across the backlog.
- **Trip itinerary planner** — Edit a travel schedule, swap activities, add notes. Claude regenerates and optimizes.
- **Dependency audit** — Review outdated packages, mark for upgrade/ignore. Claude generates PRs.
- **Log classifier** — Review LLM-classified logs, correct mistakes. Claude generalizes your corrections.
- **Resume editor** — Reorder bullets, flag weak points, add notes. Claude rewrites and strengthens.

## Building HTML Tools

When you invoke `/html-channel:channel-start`, Claude generates an HTML page following these patterns:

### Data Architecture

```javascript
// All data as a JS constant
const DATA = {
  items: [...],
  settings: {...}
};

// Render function that rebuilds UI from data
function render(data) {
  document.getElementById('app').innerHTML = buildUI(data);
  attachEventListeners();
}

// Called on page load
render(DATA);

// Returns current state for sending to Claude
window.getChannelData = () => {
  return {
    items: getCurrentItems(),
    userNotes: getNotes(),
    selections: getSelections()
  };
};
```

### Bridge Integration

```html
<script>
  // channel-bridge.js is embedded here by Claude
</script>
<script>
  ClaudeChannel.init();  // auto-detects port from window.location
  ClaudeChannel.onData(payload => render(payload));
</script>
```

The bridge provides:
- Floating "Send to Claude" button (bottom-right)
- Connection status indicator
- Toast notifications for status/done messages
- Auto re-render when Claude pushes new data

## Session Files

Sessions are stored in `.work/channel-<timestamp>/`:

```
.work/channel-1234567890/
├── index.html        # The generated HTML tool
├── messages.jsonl    # Browser → Claude messages
├── server.port       # HTTP server port
```

## Requirements

- Node.js 18+
- Claude Code v2.1.80+ (for channels support)

## License

MIT
