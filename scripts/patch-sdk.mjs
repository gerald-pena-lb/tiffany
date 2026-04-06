/**
 * Patches @elevenlabs/client to fix handleErrorEvent crash.
 *
 * The ElevenLabs server sends error events as {type: "error", error_type: "...", message: "..."}
 * but the SDK expects {type: "error", error_event: {error_type: "...", message: "..."}}.
 * This causes: TypeError: Cannot read properties of undefined (reading 'error_type')
 *
 * This patch replaces ALL references to event.error_event with safe access.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const filesToPatch = [
  join("node_modules", "@elevenlabs", "client", "dist", "BaseConversation.js"),
  join("node_modules", "@elevenlabs", "client", "dist", "lib.iife.js"),
];

let patched = 0;

for (const file of filesToPatch) {
  if (!existsSync(file)) continue;
  let content = readFileSync(file, "utf-8");

  if (content.includes("errorEvent = event.error_event || event")) {
    console.log(`• Already patched: ${file}`);
    continue;
  }

  // Replace the entire handleErrorEvent method body
  // Match both minified and non-minified variants

  // Non-minified: replace the whole method
  const nonMinified = content.includes("handleErrorEvent(event) {");
  if (nonMinified) {
    content = content.replace(
      /handleErrorEvent\(event\) \{[\s\S]*?const errorType = event\.error_event\.error_type;[\s\S]*?const message = event\.error_event\.message \|\| event\.error_event\.reason \|\| "Unknown error";[\s\S]*?this\.onError\(`Server error: \$\{message\}`[^}]*?code: event\.error_event\.code,[\s\S]*?debugMessage: event\.error_event\.debug_message,[\s\S]*?details: event\.error_event\.details,[\s\S]*?\}\);[\s\S]*?\}/,
      `handleErrorEvent(event) {
        const errorEvent = event.error_event || event;
        const errorType = errorEvent.error_type || "unknown";
        const message = errorEvent.message || errorEvent.reason || "Unknown error";
        if (errorType === "max_duration_exceeded") {
            this.endSessionWithDetails({
                reason: "error",
                message: message,
                context: new Event("max_duration_exceeded"),
            });
            return;
        }
        this.onError(\`Server error: \${message}\`, {
            errorType,
            code: errorEvent.code,
            debugMessage: errorEvent.debug_message,
            details: errorEvent.details,
        });
    }`
    );
  }

  // Minified: do global replacement of event.error_event references
  // Replace "e.error_event.error_type" with "(e.error_event||e).error_type"
  // and similar patterns
  content = content.replace(
    /(\w+)\.error_event\.error_type/g,
    "($1.error_event||$1).error_type"
  );
  content = content.replace(
    /(\w+)\.error_event\.message/g,
    "($1.error_event||$1).message"
  );
  content = content.replace(
    /(\w+)\.error_event\.reason/g,
    "($1.error_event||$1).reason"
  );
  content = content.replace(
    /(\w+)\.error_event\.code/g,
    "($1.error_event||$1).code"
  );
  content = content.replace(
    /(\w+)\.error_event\.debug_message/g,
    "($1.error_event||$1).debug_message"
  );
  content = content.replace(
    /(\w+)\.error_event\.details/g,
    "($1.error_event||$1).details"
  );

  writeFileSync(file, content);
  console.log(`✓ Patched: ${file}`);
  patched++;
}

if (patched > 0) {
  console.log(`\nSDK patch complete (${patched} file(s) patched).`);
} else {
  console.log("\nNo files needed patching.");
}
