const axios = require("axios");
const net = require("net");
const { URL } = require("url");

function isPrivateHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (h === "127.0.0.1" || h === "::1") return true;

  if (!net.isIP(h)) return false;

  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (h.startsWith("172.")) {
    const second = Number(h.split(".")[1] || 0);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}

function normalizeText(htmlOrText) {
  return String(htmlOrText || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const readUrlTool = () => ({
  name: "read_url",
  description: "Fetch and extract readable text from a specific URL",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Absolute URL to read" },
      max_chars: {
        type: "integer",
        description: "Maximum number of characters to return (default: 6000, max: 15000)",
      },
    },
    required: ["url"],
  },
  async execute(args) {
    try {
      const rawUrl = String(args?.url || "").trim();
      if (!rawUrl) {
        return { forLLM: "url is required", forUser: "url is required", isError: true };
      }

      const parsed = new URL(rawUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return {
          forLLM: "Only http/https URLs are allowed",
          forUser: "Only http/https URLs are allowed",
          isError: true,
        };
      }

      if (isPrivateHost(parsed.hostname)) {
        return {
          forLLM: "Blocked URL host (private/local address)",
          forUser: "Blocked URL host (private/local address)",
          isError: true,
        };
      }

      const maxChars = Math.max(500, Math.min(Number(args?.max_chars || 6000), 15000));
      const response = await axios.get(parsed.toString(), {
        timeout: 25000,
        maxRedirects: 5,
        responseType: "text",
        headers: {
          "User-Agent": "PurrClaw/1.0",
          Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
        },
      });

      const text = normalizeText(response.data).slice(0, maxChars);
      const out = `URL: ${parsed.toString()}\n\n${text || "(no readable text)"}`;
      return { forLLM: out, forUser: out, isError: false };
    } catch (err) {
      const msg = `read_url failed: ${err.message}`;
      return { forLLM: msg, forUser: msg, isError: true };
    }
  },
});

module.exports = { readUrlTool };
