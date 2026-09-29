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

Only include actual vaccines. Use this list of core and non-core canine vaccines to recognize them; a record may name one by brand, product code, or as a combination (for example DHPP-BORD):
Core: Rabies, Distemper (DHPP/DAPP), Adenovirus/Canine Hepatitis (DHPP/DAPP), Parvovirus (DHPP/DAPP)
Non-core: Bordetella (Kennel Cough), Leptospirosis, Parainfluenza, Canine Influenza (H3N8/H3N2), Lyme Disease (Borrelia burgdorferi)

Only report an item if it is one of the vaccines listed above. Exclude everything else, including dewormers, flea and tick treatments, pain medications, anesthetics, microchips, and procedures.

For "vaccine_name", copy the vaccine's name exactly as written in the record, including brand names, codes, and combination names. Do not expand, translate, split, or clean it up.

If the same vaccine dose appears more than once in the record, return it once. If one mention is a brand name (for example "IMRAB3" on a vaccination certificate) and another is an internal inventory or billing code for the same dose (for example "DRABIES12695"), use the brand name, as written.

Return only a JSON array, nothing else. Each item must be an object with exactly two keys: "vaccine_name" and "date_given". "date_given" must be in YYYY-MM-DD format. If there are no vaccines, return [].`,
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
