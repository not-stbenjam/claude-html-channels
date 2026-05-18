# html-channel

Bidirectional live channel between Claude and interactive HTML tools in the browser.

## What it does

This plugin lets Claude generate interactive HTML tools (screeners, planners, curators, editors) that can send data back to Claude and receive live updates. When you click "Send to Claude" in the browser, your changes flow into the conversation. Claude processes them, pushes updates back, and the page re-renders live.

## Skills

- `/html-channel:channel-start` - Create an interactive HTML tool based on your request

## MCP Tools

| Tool | Description |
|------|-------------|
| `create_session` | Saves HTML content and serves it on localhost |
| `send_to_browser` | Pushes status/data/done messages to the browser via SSE |
| `receive_from_browser` | Reads messages sent from the browser (fallback for non-channel mode) |
| `update_page` | Replaces the HTML page content |

## Requirements

- Node.js 18+
- Claude Code v2.1.80+ (for channels support)
