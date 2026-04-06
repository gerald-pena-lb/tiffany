"use client";

import { useEffect, useRef } from "react";

export interface TranscriptMessage {
  role: "user" | "ai";
  message: string;
}

interface TranscriptProps {
  messages: TranscriptMessage[];
}

export default function Transcript({ messages }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="text-gray-500 text-sm text-center py-4">
        Conversation will appear here...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto max-h-80 px-2 py-3 scrollbar-thin">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`flex flex-col ${
            msg.role === "user" ? "items-end" : "items-start"
          }`}
        >
          <span className="text-xs text-gray-500 mb-1">
            {msg.role === "ai" ? "Tiffany" : "You"}
          </span>
          <div
            className={`rounded-2xl px-4 py-2 max-w-[85%] text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-accent/20 text-gray-200"
                : "bg-white/10 text-gray-200"
            }`}
          >
            {msg.message}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
