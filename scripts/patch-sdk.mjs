/**
 * Patches @elevenlabs/client to fix handleErrorEvent crash.
 *
 * The ElevenLabs server sends error events as {type: "error", error_type: "...", message: "..."}
 * but the SDK expects {type: "error", error_event: {error_type: "...", message: "..."}}.
 * This causes: TypeError: Cannot read properties of undefined (reading 'error_type')
 *
 * This patch adds null-safe access so the handler works with both formats.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const patches = [
  // Non-minified (v1.x client)
  {
    file: join("node_modules", "@elevenlabs", "client", "dist", "BaseConversation.js"),
    find: `const errorType = event.error_event.error_type;
        const message = event.error_event.message || event.error_event.reason || "Unknown error";`,
    replace: `const errorEvent = event.error_event || event;
        const errorType = errorEvent.error_type || "unknown";
        const message = errorEvent.message || errorEvent.reason || "Unknown error";`,
  },
  // Bundled iife (v1.x client)
  {
    file: join("node_modules", "@elevenlabs", "client", "dist", "lib.iife.js"),
    find: `const errorType = event.error_event.error_type;
			const message = event.error_event.message || event.error_event.reason || "Unknown error";`,
    replace: `const errorEvent = event.error_event || event;
			const errorType = errorEvent.error_type || "unknown";
			const message = errorEvent.message || errorEvent.reason || "Unknown error";`,
  },
];

let patched = 0;

for (const { file, find, replace } of patches) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, "utf-8");
  if (content.includes(find)) {
    writeFileSync(file, content.replace(find, replace));
    console.log(`✓ Patched: ${file}`);
    patched++;
  } else if (content.includes("errorEvent = event.error_event || event")) {
    console.log(`• Already patched: ${file}`);
  } else {
    console.log(`⚠ Pattern not found in: ${file}`);
  }
}

if (patched > 0) {
  console.log(`\nSDK patch complete (${patched} file(s) patched).`);
} else {
  console.log("\nNo files needed patching.");
}
