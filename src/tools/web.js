const axios = require("axios");

async function searchWithBrave(query, limit, apiKey) {
  const response = await axios.get("https://api.search.brave.com/res/v1/web/search", {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    params: {
      q: query,
      count: limit,
      safesearch: "moderate",
    },
    timeout: 20000,
  });

  const results = response.data?.web?.results || [];
  return results.slice(0, limit).map((item) => ({
    title: item.title || "(no title)",
    url: item.url || "",
    snippet: item.description || "",
  }));
}

async function searchWithDuckDuckGo(query, limit) {
  const response = await axios.get("https://api.duckduckgo.com/", {
    params: {
      q: query,
      format: "json",
      no_html: 1,
      skip_disambig: 1,
      no_redirect: 1,
    },
    timeout: 20000,
  });

  const out = [];

  if (response.data?.AbstractURL || response.data?.AbstractText) {
    out.push({
      title: response.data?.Heading || query,
      url: response.data?.AbstractURL || "",
      snippet: response.data?.AbstractText || "",
    });
  }

  const related = response.data?.RelatedTopics || [];
  for (const topic of related) {
    if (out.length >= limit) break;
    if (topic?.Text && topic?.FirstURL) {
      out.push({
        title: topic.Text.split(" - ")[0],
        url: topic.FirstURL,
        snippet: topic.Text,
      });
      continue;
    }

    if (Array.isArray(topic?.Topics)) {
      for (const sub of topic.Topics) {
        if (out.length >= limit) break;
        if (sub?.Text && sub?.FirstURL) {
          out.push({
            title: sub.Text.split(" - ")[0],
            url: sub.FirstURL,
            snippet: sub.Text,
          });
        }
      }
    }
  }

  return out.slice(0, limit);
}

const webSearchTool = () => ({
  name: "web_search",
  description:
    "Search the web for recent/public information. Returns title, URL, and snippet.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query text",
      },
      limit: {
        type: "integer",
        description: "Number of results to return (default: 5, max: 10)",
      },
    },
    required: ["query"],
  },
  async execute(args) {
    const query = String(args?.query || "").trim();
    const limit = Math.max(1, Math.min(Number(args?.limit || 5), 10));

    if (!query) {
      return { forLLM: "query is required", forUser: "query is required", isError: true };
    }

    try {
      const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
      const results = braveApiKey
        ? await searchWithBrave(query, limit, braveApiKey)
        : await searchWithDuckDuckGo(query, limit);

      if (!results.length) {
        return {
          forLLM: `No web results found for: ${query}`,
          forUser: `No web results found for: ${query}`,
          isError: false,
        };
      }

      const formatted = results
        .map((r, i) => `${i + 1}. ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`)
        .join("\n\n");

      return {
        forLLM: formatted,
        forUser: formatted,
        isError: false,
      };
    } catch (err) {
      const msg = `web_search failed: ${err.message}`;
      return { forLLM: msg, forUser: msg, isError: true };
    }
  },
});

module.exports = { webSearchTool };
