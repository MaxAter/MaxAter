const http = require("http");

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  });
  res.end(body);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function callOpenAI(message, history) {
  const payload = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant for a comedian's website. Keep replies concise, friendly, and practical.",
      },
      ...(history || []),
      { role: "user", content: message },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return jsonResponse(res, 200, { ok: true });
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return jsonResponse(res, 200, { ok: true, model: OPENAI_MODEL });
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    try {
      const body = await readJson(req);
      const message = String(body.message || "").trim();
      const history = Array.isArray(body.history) ? body.history : [];

      if (!message) {
        return jsonResponse(res, 400, { reply: "Empty message." });
      }

      if (!OPENAI_API_KEY) {
        return jsonResponse(res, 200, {
          reply:
            "Local pipeline is running. Add OPENAI_API_KEY to enable real AI replies.",
        });
      }

      const reply = await callOpenAI(message, history);
      return jsonResponse(res, 200, { reply: reply || "No reply returned." });
    } catch (err) {
      return jsonResponse(res, 500, { reply: `Server error: ${err.message}` });
    }
  }

  return jsonResponse(res, 404, { reply: "Not found." });
});

server.listen(PORT, () => {
  console.log(`Chat server listening on http://localhost:${PORT}`);
});
