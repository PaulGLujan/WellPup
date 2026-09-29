import { extractVaccines } from "../lib/extraction/extract-vaccines";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: pnpm extract:test <path-to-file>");
  process.exit(1);
}

console.log(await extractVaccines(filePath));
