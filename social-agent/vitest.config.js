import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      remoteBindings: false,
      miniflare: {
        bindings: {
          TELEGRAM_BOT_TOKEN: '123456:TEST-TOKEN',
          GEMINI_API_KEY: 'test-gemini-key',
          GEMINI_MODELS: 'gemini-test',
          IG_POLL_MS: '1',
        },
      },
    }),
  ],
});
