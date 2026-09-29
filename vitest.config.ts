import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Eval tests make real (paid) API calls. Run them with `pnpm test:eval`.
    exclude: [...configDefaults.exclude, '**/*.eval.test.ts'],
  },
});
