export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  return Response.json(
    { status: "ok", endpoint: "/api/llm", runtime: "edge" },
    { headers: CORS_HEADERS }
  );
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIRequest {
  model?: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

function convertMessages(messages: OpenAIMessage[]): {
  system: string;
  messages: AnthropicMessage[];
} {
  let system = "";
  const converted: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system += (system ? "\n\n" : "") + msg.content;
    } else {
      converted.push({ role: msg.role, content: msg.content });
    }
  }

  // Merge consecutive same-role messages
  const merged: AnthropicMessage[] = [];
  for (const msg of converted) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += "\n\n" + msg.content;
    } else {
      merged.push({ ...msg });
    }
  }

  // Anthropic requires messages to start with user role
  if (merged.length === 0 || merged[0].role !== "user") {
    merged.unshift({ role: "user", content: "." });
  }

  return { system, messages: merged };
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  let body: OpenAIRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { system, messages } = convertMessages(body.messages || []);

  const anthropicBody = {
    model: "claude-opus-4-6",
    max_tokens: body.max_tokens || 300,
    temperature: body.temperature ?? 0.7,
    stream: true,
    ...(system ? { system } : {}),
    messages,
  };

  const anthropicResponse = await fetch(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    }
  );

  if (!anthropicResponse.ok) {
    const errorText = await anthropicResponse.text();
    return Response.json(
      { error: "Anthropic API error", details: errorText },
      { status: anthropicResponse.status, headers: CORS_HEADERS }
    );
  }

  const chatId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial role chunk
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: chatId,
            object: "chat.completion.chunk",
            created,
            model: "claude-opus-4-6",
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "" },
                finish_reason: null,
              },
            ],
          })}\n\n`
        )
      );

      const reader = anthropicResponse.body!.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            let event;
            try {
              event = JSON.parse(data);
            } catch {
              continue;
            }

            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta"
            ) {
              const chunk = {
                id: chatId,
                object: "chat.completion.chunk",
                created,
                model: "claude-opus-4-6",
                choices: [
                  {
                    index: 0,
                    delta: { content: event.delta.text },
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
              );
            }

            if (event.type === "message_stop") {
              // Send final chunk with finish_reason
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    id: chatId,
                    object: "chat.completion.chunk",
                    created,
                    model: "claude-opus-4-6",
                    choices: [
                      { index: 0, delta: {}, finish_reason: "stop" },
                    ],
                  })}\n\n`
                )
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            }
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
