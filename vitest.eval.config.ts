import fs from 'fs';
import { parseEnv } from 'util';
import { configDefaults, defineConfig } from 'vitest/config';

// Pass only the Anthropic key through from .env, not the database URLs.
const dotenv = fs.existsSync('.env')
  ? parseEnv(fs.readFileSync('.env', 'utf8'))
  : {};

export default defineConfig({
  test: {
    include: ['**/*.eval.test.ts'],
    exclude: configDefaults.exclude,
    env: {
      ANTHROPIC_API_KEY:
        process.env.ANTHROPIC_API_KEY ?? dotenv.ANTHROPIC_API_KEY,
    },
  },
});
