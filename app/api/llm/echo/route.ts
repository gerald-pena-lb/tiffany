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
    { status: "ok", endpoint: "/api/llm/echo" },
    { headers: CORS_HEADERS }
  );
}

// Returns a hardcoded SSE response without calling any external API.
// Use this to test if ElevenLabs can parse our SSE format.
export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  // Log what ElevenLabs sends
  console.log("ECHO endpoint received:", JSON.stringify(body).slice(0, 1000));

  const chatId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();

  const responseText = "I hear you. Let me think about that for a moment.";
  const words = responseText.split(" ");

  const stream = new ReadableStream({
    async start(controller) {
      // Initial role chunk
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: chatId,
            object: "chat.completion.chunk",
            created,
            model: "echo",
            choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
          })}\n\n`
        )
      );

      // Stream word by word
      for (const word of words) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              id: chatId,
              object: "chat.completion.chunk",
              created,
              model: "echo",
              choices: [{ index: 0, delta: { content: word + " " }, finish_reason: null }],
            })}\n\n`
          )
        );
      }

      // Final stop chunk
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: chatId,
            object: "chat.completion.chunk",
            created,
            model: "echo",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          })}\n\n`
        )
      );

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
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
