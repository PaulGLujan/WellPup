import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/extract-test.ts <path-to-pdf-or-image>");
  process.exit(1);
}

const client = new Anthropic();

const fileData = fs.readFileSync(filePath).toString("base64");
const mediaType = path.extname(filePath).toLowerCase() === ".pdf"
  ? "application/pdf"
  : "image/png";

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  messages: [
    {
      role: "user",
      content: [
        mediaType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: mediaType, data: fileData } }
          : { type: "image", source: { type: "base64", media_type: mediaType, data: fileData } },
        {
          type: "text",
          text: `Extract every vaccine from this record as JSON: vaccine name and date given.

Only include actual vaccines, matched against this list of core and non-core canine vaccines (a record may use a brand name - map it to the vaccine it protects against):
Core: Rabies, Distemper (DHPP/DAPP), Adenovirus/Canine Hepatitis (DHPP/DAPP), Parvovirus (DHPP/DAPP)
Non-core: Bordetella (Kennel Cough), Leptospirosis, Parainfluenza, Canine Influenza (H3N8/H3N2), Lyme Disease (Borrelia burgdorferi)

Do not include dewormers, parasiticides, or other non-vaccine medications. Ignore SKU, invoice, and line-item numbers - do not include them in the vaccine name. If a combination vaccine (e.g. DHPP) covers multiple items on this list, return it as one entry using its combination name rather than splitting it out.

Return only JSON, nothing else.`,
        },
      ],
    },
  ],
});

for (const block of response.content) {
  if (block.type === "text") {
    console.log(block.text);
  }
}
