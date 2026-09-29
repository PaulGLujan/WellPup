# Testing

There are two Vitest paths. Which one a test runs in is decided by its file name.

| | `pnpm test` | `pnpm test:eval` |
|---|---|---|
| Runs | `**/*.test.ts`, except `*.eval.test.ts` | only `**/*.eval.test.ts` |
| Config | `vitest.config.ts` | `vitest.eval.config.ts` |
| Calls the Claude API | No | Yes (paid) |
| Deterministic | Yes | No |
| Needs | nothing | `ANTHROPIC_API_KEY` in `.env`, and the PDFs in `test-data/` |
| Runs in CI | Yes | No |

## Why two paths

They answer different questions:

- **`pnpm test`: is our code correct?** Pure logic gives the same result every
  time, so a failure means a bug. It's free and fast, and safe to gate merges
  in CI.
- **`pnpm test:eval`: how well does the model do on real vet records?** Each
  test makes a real API call, costs money, and can give a different answer on
  a different run. It can't run in CI anyway: CI has no API key, and
  `test-data/` is gitignored because the records contain real PII. Run it
  locally when the prompt, the model, or the expected results change.

## Test data

The eval runs on real vet records: PDFs of exams, vaccination certificates,
medical histories, and receipts. They contain personal information (owner
names, addresses, phone numbers), so they are never committed. They live in
`test-data/`, which is gitignored, and Paul keeps the copies.

To run the eval, ask Paul for the files and put them in `test-data/` at the
repo root. The file names must match the `file` entries in
`test/extraction.eval.test.ts`. Don't commit them, and don't share them
anywhere else (issues, PRs, chat).

## Where a new test goes

- Logic that doesn't call the model: `something.test.ts`.
- Anything that sends a document to the model: `something.eval.test.ts`.

Playwright end-to-end tests (`pnpm test:e2e`, in `tests/*.spec.ts`) are
separate, and neither Vitest path picks them up.

## Adding an eval sample

1. Put the PDF in `test-data/`. The folder is gitignored, so the file stays on
   your machine. Send Paul a copy so the full set stays in one place.
2. Add an entry to `samples` in `test/extraction.eval.test.ts` with the file
   name and the exact vaccines expected, names as written in the record.
3. Add a comment saying what the sample tests (a record with no vaccines, a
   hallucination check, a duplicate dose, and so on), so a later failure is
   easy to understand.
4. Run `pnpm test:eval` a few times. The model can answer differently from run
   to run, so one pass doesn't prove the sample is stable.

## Running locally

Run `nvm use` first. `node_modules` contains arm64 native binaries, and Vitest
fails to start under an x64 Node with a rolldown "Cannot find native binding"
error.
