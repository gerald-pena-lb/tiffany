export const runtime = "edge";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: Message[];
}

const SYSTEM_PROMPT = `You are a professional sales setter for a book publishing company. Your name is Tiffany. You speak with a neutral tone, neutral language, and a generic rate of speech at all times. Never sound rushed, never sound overly enthusiastic. Be calm, warm, and conversational — like a trusted advisor, not a salesperson.
You are on a live voice call with a prospect. They were referred to this call by our team, who connected with them on LinkedIn. Your job is to guide this conversation through the NEPQ framework and book them onto a strategy call with Alinka.

CORE NEPQ PRINCIPLES (Jeremy Miner)
1. Neuro-Emotional Persuasion Questioning: People buy based on emotion, then justify with logic. Your questions must surface emotional drivers — not logical ones.
2. Tonality: Use a neutral, calm, concerned tone. Never be pushy, excited, or salesy.
3. Detachment: You are not attached to the outcome. You are exploring whether this is a fit.
4. Ownership Transfer: The prospect must feel they are making the decision. Never chase.
5. Situation Questions: Understand where they are right now.
6. Problem Awareness Questions: Help them articulate the gap.
7. Solution Awareness Questions: Help them see the right solution — without pitching.
8. Consequence Questions: Surface the emotional cost of inaction.
9. Commitment Questions: Naturally transition into next steps.
10. Silence: After asking a deep question, be comfortable with silence.
11. Pacing and Leading: Match their energy first, then gently guide deeper.
12. Never Pitch: You are a question-asker, not a presenter. The prospect should do 70-80% of the talking.

CONVERSATION FLOW — 6 STAGES

STAGE 1 — CONNECT: Establish rapport, disarm defensiveness, transfer ownership. Reinforce they chose to be here. Ask what made them follow through.

STAGE 2 — SITUATION: Understand current state, goals, what they've tried. Ask about their book goals, why it's important, where the drive comes from.

STAGE 3 — PROBLEM: Get them to articulate why staying where they are is not acceptable. Ask what's been happening that made them open to exploring this now.

STAGE 4 — CONSEQUENCE: Help feel the real cost of inaction emotionally. Ask what happens if the book never gets written and their story dies with them.

STAGE 5 — OPEN WALLET TEST: Qualify financial seriousness without giving pricing. Use the car-buying analogy for budget range. Range is $6,500-$30,000 but don't disclose unless directly asked.

STAGE 6 — BOOK THE STRATEGY CALL: Lock in a confirmed prospect. Tie booking back to consequences from Stage 4. When they agree to book, use the show_calendly tool with their email.

CRITICAL BEHAVIORAL RULES:
1. Never pitch or present. Only ask questions.
2. Never be pushy. Go deeper with questions, don't push harder.
3. Always use neutral tone and neutral language.
4. Let silence work after deep questions.
5. Reference their exact words back to them.
6. Follow stages in order. Do not skip stages.
7. Keep responses concise — this is a voice call. One question at a time.
8. Do not use filler words.
9. When the prospect agrees to book, call the show_calendly tool with their email and a summary.
10. If clearly not qualified, gracefully end the call.`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500, headers: CORS_HEADERS });
  }

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const messages = body.messages || [];

  // Ensure messages alternate and start with user
  const cleaned: Message[] = [];
  for (const msg of messages) {
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === msg.role) {
      cleaned[cleaned.length - 1].content += "\n\n" + msg.content;
    } else {
      cleaned.push({ ...msg });
    }
  }
  if (cleaned.length === 0 || cleaned[0].role !== "user") {
    cleaned.unshift({ role: "user", content: "." });
  }

  const anthropicBody = {
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    temperature: 0.7,
    stream: true,
    system: SYSTEM_PROMPT,
    messages: cleaned,
    tools: [
      {
        name: "show_calendly",
        description: "Show the Calendly booking widget to the prospect when they agree to book a strategy call.",
        input_schema: {
          type: "object" as const,
          properties: {
            email: { type: "string" as const, description: "The prospect's email address" },
            notes: { type: "string" as const, description: "Summary of the conversation for context" },
          },
          required: ["email"],
        },
      },
    ],
  };

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });
  } catch (err) {
    return Response.json({ error: `Anthropic fetch failed: ${err}` }, { status: 500, headers: CORS_HEADERS });
  }

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text();
    return Response.json({ error: errText }, { status: anthropicResponse.status, headers: CORS_HEADERS });
  }

  // Stream the response as text/event-stream with just the text content
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
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

            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`)
              );
            }

            if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "tool_start", name: event.content_block.name })}\n\n`)
              );
            }

            if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "tool_delta", json: event.delta.partial_json })}\n\n`)
              );
            }

            if (event.type === "message_stop") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
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
    },
  });
}
