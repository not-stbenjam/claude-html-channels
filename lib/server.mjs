import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "node:http";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, extname } from "node:path";

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let sessionDir = null;
let httpPort = null;
const sseClients = new Set();

// ── Push to all connected browsers via SSE ──

function pushToSSE(msg) {
  const line = typeof msg === "string" ? msg : JSON.stringify(msg);
  for (const client of sseClients) {
    try {
      client.write(`data: ${line}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ── MCP Server (always runs, provides tools, optionally emits channel notifications) ──

const mcp = new Server(
  { name: "html-channel", version: "0.1.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: [
      "This MCP server connects you to interactive HTML tools in the user's browser.",
      "Use create_session to generate and serve an HTML page.",
      "Use send_to_browser to push status updates and data back to the page.",
      "Use receive_from_browser to read data the user sent from the page.",
      "With channels enabled, browser data also arrives automatically as channel messages.",
    ].join(" "),
  }
);

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_session",
      description:
        "Create an HTML channel session. Saves HTML content and serves it on localhost. Returns the URL.",
      inputSchema: {
        type: "object",
        properties: {
          html: { type: "string", description: "The full HTML page content to serve" },
        },
        required: ["html"],
      },
    },
    {
      name: "send_to_browser",
      description:
        'Push a message to the browser via SSE. Types: "status" (toast), "data" (re-render), "done" (completion), "refresh" (reload page after update_page).',
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["status", "data", "done", "refresh"] },
          message: { type: "string", description: "Text for status/done/refresh toasts" },
          payload: { description: "Data object for the page to re-render (type=data)" },
        },
        required: ["type"],
      },
    },
    {
      name: "receive_from_browser",
      description:
        "Read messages sent from the browser. Returns all pending messages and clears them. With channels enabled, data arrives automatically; this is a fallback.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "update_page",
      description: "Replace the HTML page content. Browser should refresh to see changes.",
      inputSchema: {
        type: "object",
        properties: {
          html: { type: "string", description: "The new HTML page content" },
        },
        required: ["html"],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "create_session") {
    sessionDir = join(process.cwd(), ".work", `channel-${Date.now()}`);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "index.html"), args.html);
    writeFileSync(join(sessionDir, "server.port"), String(httpPort));
    const url = `http://127.0.0.1:${httpPort}/`;
    return { content: [{ type: "text", text: JSON.stringify({ url, sessionDir }) }] };
  }

  if (name === "send_to_browser") {
    pushToSSE(args);
    return { content: [{ type: "text", text: `Sent to ${sseClients.size} browser(s)` }] };
  }

  if (name === "receive_from_browser") {
    if (!sessionDir) {
      return { content: [{ type: "text", text: "No active session" }], isError: true };
    }
    const messagesPath = join(sessionDir, "messages.jsonl");
    if (!existsSync(messagesPath)) {
      return { content: [{ type: "text", text: "No messages yet" }] };
    }
    const content = readFileSync(messagesPath, "utf-8");
    const messages = content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    // Clear the inbox
    writeFileSync(messagesPath, "");
    return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
  }

  if (name === "update_page") {
    if (!sessionDir) {
      return { content: [{ type: "text", text: "No active session" }], isError: true };
    }
    writeFileSync(join(sessionDir, "index.html"), args.html);
    return { content: [{ type: "text", text: "Page updated" }] };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

// ── HTTP Server (browser-facing) ──

const httpServer = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // SSE: Claude → Browser
  if (req.url === "/api/events" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  // POST: Browser → Claude
  if (req.url === "/api/send" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);

        // Persist to messages.jsonl (for receive_from_browser tool)
        if (sessionDir) {
          const line = JSON.stringify({ timestamp: Date.now() / 1000, data });
          appendFileSync(join(sessionDir, "messages.jsonl"), line + "\n");
        }

        // Also emit as channel notification (works if channels enabled)
        try {
          await mcp.notification({
            method: "notifications/claude/channel",
            params: {
              content: JSON.stringify(data, null, 2),
              meta: { source: "browser", timestamp: new Date().toISOString() },
            },
          });
        } catch {
          // Channels not available — that's fine, receive_from_browser is the fallback
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid JSON" }));
      }
    });
    return;
  }

  // Static files from session directory
  if (!sessionDir) {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("No session active yet");
    return;
  }

  const filePath = req.url === "/" ? "/index.html" : req.url;
  const fullPath = join(sessionDir, filePath);

  try {
    const content = readFileSync(fullPath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

// ── Start ──

httpServer.listen(0, "127.0.0.1", async () => {
  httpPort = httpServer.address().port;

  const workDir = join(process.cwd(), ".work");
  mkdirSync(workDir, { recursive: true });
  writeFileSync(join(workDir, "channel-server.port"), String(httpPort));

  const transport = new StdioServerTransport();
  await mcp.connect(transport);
});
