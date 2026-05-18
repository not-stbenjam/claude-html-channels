---
name: channel-start
description: >
  Start a bidirectional HTML channel. Use when the user wants to create an
  interactive HTML tool (screener, planner, curator, editor, reviewer) that
  can send data back to Claude and receive live updates.
allowed-tools: Read
---

You are setting up a **Claude HTML Channel** — a live, bidirectional link between
an interactive HTML page in the user's browser and this Claude session.

The `html-channel` MCP server provides these tools:

- **`create_session`** — saves HTML and starts serving it, returns the URL
- **`send_to_browser`** — pushes status/data/done messages to the browser
- **`receive_from_browser`** — reads messages the browser sent (fallback if channels not enabled)
- **`update_page`** — replaces the HTML page content

## Steps

### 1. Read the bridge library

Read the channel bridge JavaScript library from:
`${CLAUDE_PLUGIN_ROOT}/lib/channel-bridge.js`

You will embed this verbatim in a `<script>` tag in the HTML page.

### 2. Generate the HTML page

Build a **single self-contained HTML file** for whatever the user asked for.

#### Data architecture
- Embed all initial data as a JavaScript constant: `const DATA = { ... };`
- Write a `render(data)` function that builds/rebuilds the entire UI from a data object
- Call `render(DATA)` on page load
- Define `window.getChannelData = () => { ... }` returning the current state (edits, selections, notes)

#### Bridge integration
Include the channel-bridge.js contents in a `<script>` tag, then:
```html
<script>
  ClaudeChannel.init();  // auto-detects port from window.location
  ClaudeChannel.onData(payload => render(payload));
</script>
```

#### UI guidelines
- Make the page visually polished — clean, modern design
- The floating toolbar (Send button, connection dot) is injected automatically
- Use `localStorage` to persist the user's work across page refreshes
- **Always include a feedback box** — a textarea where the user can type freeform
  comments or instructions (e.g., "make it more budget-friendly", "add more outdoor
  activities"). Include this in `getChannelData()` so it's sent along with the
  structured data.

### 3. Create and open the session

Call the `create_session` tool with the HTML content. It returns the URL.
Open the URL in the browser (use `xdg-open` on Linux, `open` on macOS).

### 4. Tell the user

- Share the URL
- Explain they can click **Send to Claude** when ready
- Let them know you're listening for their input

### 5. Start listening for input

Start a polling loop to receive browser input:

```
/loop 30s receive and process browser input from the HTML channel
```

This checks `receive_from_browser` every 30 seconds. If channels are enabled,
data may also arrive directly as `<channel source="html-channel">` messages.

When data arrives (either way):
1. Call `send_to_browser` with `type: "status"` to acknowledge receipt
2. Process the data based on conversation context
3. Call `update_page` to persist the changes, then `send_to_browser` with `type: "refresh"`
4. Call `send_to_browser` with `type: "done"` to signal completion

**Important**: If multiple messages arrive, update the page after completing each task
before continuing to the next. The user should see their changes applied incrementally,
not all at once at the end.

## Updating the page

There are two ways to send data back to the browser:

**`send_to_browser` with `type: "data"`** — real-time push via SSE
- Good for: status toasts, transient previews, live feedback while working
- Caveat: if the user refreshes the page, SSE data is lost. The page reloads
  from its initial `DATA` constant (or localStorage), not from what you pushed.

**`update_page`** — regenerate the HTML with new data baked in
- Good for: persistent changes that should survive page refresh
- The new `DATA` constant contains the updated values
- More robust for final results; the user can refresh and still see your changes
- After calling `update_page`, send `type: "refresh"` to auto-reload the browser
- **Keep the same page structure** — only update the `DATA` constant and any
  necessary logic changes. Do NOT redesign the layout, colors, or UI on updates.
  The user is familiar with the current design; preserve it.

**Rule of thumb**: Use `send_to_browser` for progress updates and previews. Use
`update_page` when you're done processing and want the changes to stick.

## Important

- The HTML page must be able to **re-render from a data payload**
- Keep the HTML in a single file — no external dependencies beyond the embedded bridge
