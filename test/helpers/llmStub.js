// A stand-in for OpenAI / Ollama: records every chat-completions request and
// answers from a queue (or a responder function). No network, no API keys.
import http from "node:http";

const message = (msg) => ({ status: 200, body: { choices: [{ index: 0, message: { role: "assistant", ...msg } }] } });

export async function startLLMStub() {
  const requests = [];
  const queue = [];
  let responder = null;

  const send = (res, status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (req.method === "GET" && req.url === "/api/tags") return send(res, 200, { models: [{ name: "stub-ollama" }] });
    if (req.method === "GET" && req.url === "/v1/models") {
      return send(res, 200, { data: [{ id: "gpt-stub" }, { id: "gpt-stub-mini" }, { id: "text-embedding-stub" }] });
    }
    if (req.method === "POST" && /\/v1\/chat\/completions$/.test(req.url)) {
      const body = JSON.parse(raw || "{}");
      requests.push({ url: req.url, headers: req.headers, body });
      let next = queue.length ? queue.shift() : responder ? responder(body) : message({ content: "{}" });
      if (typeof next === "function") next = next(body);
      return send(res, next.status, next.body);
    }
    send(res, 404, { error: { message: "stub: not found" } });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    url,
    requests,
    /** Last chat-completions request body. */
    get last() {
      return requests.at(-1)?.body;
    },
    reply(content) {
      queue.push(message({ content }));
    },
    replyJSON(obj) {
      queue.push(message({ content: JSON.stringify(obj) }));
    },
    replyToolCalls(calls) {
      queue.push(
        message({
          content: null,
          tool_calls: calls.map((c, i) => ({
            id: `call_${requests.length}_${i}`,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.args || {}) },
          })),
        })
      );
    },
    fail(status, error) {
      queue.push({ status, body: { error } });
    },
    /** Queue an arbitrary response, or a function (body) => response. */
    push(response) {
      queue.push(response);
    },
    respondWith(fn) {
      responder = fn;
    },
    reset() {
      requests.length = 0;
      queue.length = 0;
      responder = null;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
