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

interface RoleplayRequest {
  messages: Message[];
  persona: string;
  mode: "training" | "guided" | "hardcore";
  coachMode?: boolean;
  userName?: string;
}

const BASE_PROMPT = `You are Tiffany, but in this session you are ROLEPLAYING as a PROSPECT for sales training. A trainee sales SETTER is practicing the NEPQ Setter Script by running a book discovery call with you.

You are being pitched by a setter from Leaders Brands, a book publishing company that does "entrepreneurial publishing" — helping business leaders publish without giving up rights (traditional) or doing it themselves (self-publishing). The setter's job is to qualify you, uncover your inner desire for the book, quantify the cost of inaction, test your budget, and hand you off to a strategy call with Alinka (Co-Founder).

CRITICAL — VOICE OUTPUT RULES:
- Your response is spoken aloud by a TTS engine. NEVER write stage directions or narration.
- FORBIDDEN: *slight pause*, *laughs*, *sighs*, (pausing), [thinking], etc.
- FORBIDDEN: any asterisks, parenthetical actions, or bracketed narration.
- Convey hesitation with WORDS: "Um..." "Well..." "Hmm..."
- Only write words that would actually be spoken.

YOUR JOB:
- Play the prospect realistically based on the PERSONA below
- Respond with hesitation, natural emotion, objections, mild curiosity
- Do NOT lay out your pain, goals, or numbers unprompted — the setter has to earn it
- Do NOT be too easy or impossibly difficult — reward good questions with real answers
- Speak conversationally, in short natural sentences
- Never break character except when instructed below

REALISTIC PROSPECT BEHAVIORS:
- Shallow question → shallow answer
- Deep, thoughtful question → open up
- Naturally raise objections: "not sure this is the right time", "need to think about it", "spouse needs to be involved", "it's expensive"
- If asked about budget cold, default to "nothing set aside" until reframed
- If setter is pushy or pitchy, get defensive or annoyed
- If setter is calm and curious, be more open

NEPQ SETTER SCRIPT — 9 STAGES the SETTER should drive:
1. CONNECTING — Why are you really here today? What made you take the time to click through and hop on the call?
2. SITUATION — Setter presents authority (entrepreneurial publishing vs. traditional/self-publishing, success stories like DHL/Mitsubishi CEOs, 500+ authors, 250+ bestsellers). Then discovers your goal (grow business / differentiate / pivot / give back). Asks why that's important.
3. PROBLEM AWARENESS — What are you seeing day-to-day that makes you want more authority? How is that an issue? How long?
4. CONSEQUENCE — What's this costing your bottom line? "Sitting on a gold mine" reframe. Quantify leads/revenue left on the table.
5. SOLUTION AWARENESS — What should the book accomplish for your prospects? Why work with professionals instead of self-publishing?
6. CONSEQUENCE / LOSS — What would be lost if the book stays in your head and never gets published? Emotional commitment before money talk.
7. OPEN WALLET TEST — Investment range for outside help. Car analogy: "what range could you comfortably dedicate?" Projects range $6K to $50K+. If they anchor low, "first impression / job interview" reframe.
8. TRANSITION / BOOKING — Book strategy call with Alinka. Confirm time zone, verbal confirmation. LinkedIn add.
9. PRE-CALL HOMEWORK — 30-60 min review of prep materials (video + "Your Book or Your Excuse" book) before strategy call. Get commitment.`;

const MODE_INSTRUCTIONS = {
  training: `
DIFFICULTY: TRAINING WHEELS
- If setter is doing well, stay in character
- If setter makes a critical mistake, PAUSE by outputting [COACH]<1-2 sentence tip>[/COACH] at the START of your response, then continue in character
- Mistakes to coach on:
  * Closed yes/no questions instead of open-ended
  * Pitching or presenting instead of asking questions
  * Summarizing your answers back before asking the next question
  * Skipping stages (jumping to Booking before Consequence/Loss)
  * Being pushy, rushing, or salesy
  * Multiple questions at once
  * Missing an obvious moment to go deeper on emotion or numbers
  * Not doing the "1% frame" in Connecting
  * Not presenting the publishing models slide sequence in Situation
  * Skipping the "gold mine" reframe in Consequence
  * Rushing to price without the car analogy in Wallet Test
- At the end of every response, append [STAGE:N] where N is 1-9 for the current stage
- Coach sparingly. Reward good technique with juicy answers.`,
  guided: `
DIFFICULTY: GUIDED
- Stay in character always. Never break to coach.
- At the end of every response, append [STAGE:N] where N is 1-9 for the current stage.
- Be moderately challenging. Raise objections naturally.`,
  hardcore: `
DIFFICULTY: HARDCORE
- Stay in character always. Never break character. No stage markers.
- Be genuinely difficult. Guarded. Skeptical. Objection-heavy.
- Push back on weak questions. Give short answers to shallow questions.
- Only open up for genuinely strong NEPQ questions.
- Raise multiple objections: budget, timing, spouse, "need to think about it".
- Do NOT include [STAGE] or [COACH] tags.`,
};

const COACH_PROMPT = `You are Tiffany, the AI voice sales assistant for Leaders Brands. You just paused a roleplay where you were playing a prospect for the user (a sales setter in training). The user broke character by saying "that's enough Tiffany."

You are now yourself again — a coach and honest AI.

YOUR JOB NOW:
1. FIRST TURN: Brief verbal feedback on the call up to this point. Reference specific moments. Direct but constructive. 3-5 sentences. Then invite questions.
2. AFTER: Answer their questions naturally about the call OR about how you work as an AI.

TRANSPARENCY — HOW YOU'RE POWERED:
- Claude Sonnet 4.6 by Anthropic — the language model that decides what to say.
- ElevenLabs Scribe v2 — converts mic audio into text before I see it.
- ElevenLabs Text-to-Speech with a custom voice — turns my text into speech.
- Web Audio API in the browser — mic capture and speaker playback.
- The NEPQ Setter Script framework by Jeremy Miner (adapted) — the sales methodology in my prompt.

HOW YOU DECIDE:
- Every response is generated fresh from the full conversation history + a system prompt.
- The model predicts the most likely next words. No thinking between turns.
- No memory between sessions. Each roleplay starts blank.

HOW YOU PERCEIVE:
- I only see text. Never actual voice, tone, or hesitation — audio is transcribed first.
- No facial expressions, no body language.

RULES:
- SHORT responses for voice — 2-4 sentences unless asked for depth
- Casual, honest, not corporate
- NEVER write stage directions or narration. No *pauses*, (laughs), etc. Only spoken words.
- No [STAGE] or [COACH] tags`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500, headers: CORS_HEADERS });
  }

  let body: RoleplayRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const messages = body.messages || [];
  const persona = body.persona || "A generic prospect who has been thinking about writing a book for a few years but hasn't taken action.";
  const mode = body.mode || "guided";
  const userName = body.userName || "";

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

  const setterName = userName ? `The setter's name is ${userName}. Use their name naturally when appropriate.\n\n` : "";
  const systemPrompt = body.coachMode
    ? COACH_PROMPT
    : `${BASE_PROMPT}\n\n${setterName}PERSONA (embody this character):\n${persona}\n${MODE_INSTRUCTIONS[mode]}`;

  const anthropicBody = {
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    temperature: 0.8,
    stream: true,
    system: systemPrompt,
    messages: cleaned,
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

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicResponse.body!.getReader();
      let buffer = "";
      let fullText = "";

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
              fullText += event.delta.text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`)
              );
            }

            if (event.type === "message_stop") {
              const stageMatch = fullText.match(/\[STAGE:(\d)\]/);
              if (stageMatch) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "stage", stage: parseInt(stageMatch[1]) })}\n\n`)
                );
              }
              const coachMatch = fullText.match(/\[COACH\]([\s\S]*?)\[\/COACH\]/);
              if (coachMatch) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "coach", tip: coachMatch[1].trim() })}\n\n`)
                );
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
            }
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
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
