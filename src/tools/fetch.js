const axios = require("axios");
const dns = require("dns").promises;
const net = require("net");
const { URL } = require("url");

const MAX_REDIRECTS = 5;

function isPrivateIPv4(address) {
  const parts = String(address || "")
    .split(".")
    .map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(address) {
  const ip = String(address || "").toLowerCase();
  if (ip === "::" || ip === "::1") return true;
  if (ip.startsWith("fe80:")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  return false;
}

function isPrivateIP(address) {
  const family = net.isIP(String(address || ""));
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return false;
}

function isPrivateHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  if (h === "127.0.0.1" || h === "::1") return true;

  return isPrivateIP(h);
}

async function resolveHostAddresses(hostname) {
  try {
    const records = await dns.lookup(String(hostname || ""), {
      all: true,
      verbatim: true,
    });
    return records.map((row) => row.address).filter(Boolean);
  } catch {
    return [];
  }
}

async function assertSafeHost(hostname) {
  if (isPrivateHost(hostname)) {
    throw new Error("Blocked URL host (private/local address)");
  }

  const addresses = await resolveHostAddresses(hostname);
  if (!addresses.length) {
    throw new Error(`Unable to resolve host: ${hostname}`);
  }
  if (addresses.some((ip) => isPrivateIP(ip))) {
    throw new Error("Blocked URL host (resolved to private/local address)");
  }
}

function parseRedirectTarget(currentUrl, location) {
  const next = new URL(location, currentUrl);
  if (!["http:", "https:"].includes(next.protocol)) {
    throw new Error("Only http/https URLs are allowed");
  }
  return next;
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

      let currentUrl = new URL(rawUrl);
      if (!["http:", "https:"].includes(currentUrl.protocol)) {
        return {
          forLLM: "Only http/https URLs are allowed",
          forUser: "Only http/https URLs are allowed",
          isError: true,
        };
      }

      const maxChars = Math.max(500, Math.min(Number(args?.max_chars || 6000), 15000));
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        await assertSafeHost(currentUrl.hostname);

        const response = await axios.get(currentUrl.toString(), {
          timeout: 25000,
          maxRedirects: 0,
          responseType: "text",
          validateStatus: (status) =>
            (status >= 200 && status < 300) || (status >= 300 && status < 400),
          headers: {
            "User-Agent": "PurrClaw/1.0",
            Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
          },
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers?.location;
          if (!location) {
            throw new Error("Redirect without location header");
          }
          currentUrl = parseRedirectTarget(currentUrl, location);
          continue;
        }

        const text = normalizeText(response.data).slice(0, maxChars);
        const out = `URL: ${currentUrl.toString()}\n\n${text || "(no readable text)"}`;
        return { forLLM: out, forUser: out, isError: false };
      }

      throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
    } catch (err) {
      const msg = `read_url failed: ${err.message}`;
      return { forLLM: msg, forUser: msg, isError: true };
    }
  },
});

module.exports = { readUrlTool };
