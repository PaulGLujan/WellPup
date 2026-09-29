import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Sends a vet record (PDF or image) to Claude and returns the raw text of the
// response. The response is not parsed or validated here.
export async function extractVaccines(filePath: string): Promise<string> {
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

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
