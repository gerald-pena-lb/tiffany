import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Patch @elevenlabs/client handleErrorEvent at build time
      config.module.rules.push({
        test: /[\\/]@elevenlabs[\\/]client[\\/]dist[\\/].*\.js$/,
        loader: "string-replace-loader",
        options: {
          multiple: [
            {
              search: /(\w+)\.error_event\.error_type/g,
              replace: "($1.error_event||$1).error_type",
            },
            {
              search: /(\w+)\.error_event\.message/g,
              replace: "($1.error_event||$1).message",
            },
            {
              search: /(\w+)\.error_event\.reason/g,
              replace: "($1.error_event||$1).reason",
            },
            {
              search: /(\w+)\.error_event\.code(?!\w)/g,
              replace: "($1.error_event||$1).code",
            },
            {
              search: /(\w+)\.error_event\.debug_message/g,
              replace: "($1.error_event||$1).debug_message",
            },
            {
              search: /(\w+)\.error_event\.details/g,
              replace: "($1.error_event||$1).details",
            },
          ],
        },
      });
    }
    return config;
  },
};

export default nextConfig;
