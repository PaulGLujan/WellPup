import { neon } from "@neondatabase/serverless";

type Target = { label: string; envVar: string };

const targets: Target[] = [
  { label: "direct", envVar: "DATABASE_URL" },
  { label: "pooled", envVar: "DATABASE_URL_POOLED" },
];

function redactSecrets(text: string): string {
  let redacted = text;
  for (const { envVar } of targets) {
    const value = process.env[envVar];
    if (value) {
      redacted = redacted.split(value).join("[redacted]");
    }
  }
  return redacted;
}

async function checkConnection(label: string, envVar: string): Promise<boolean> {
  const connectionString = process.env[envVar];
  if (!connectionString) {
    console.log(`FAIL  ${label} (${envVar}): missing environment variable`);
    return false;
  }

  try {
    const sql = neon(connectionString);
    const rows = await sql`select 1 as ok`;
    if (rows[0]?.ok === 1) {
      console.log(`PASS  ${label} (${envVar})`);
      return true;
    }
    console.log(`FAIL  ${label} (${envVar}): unexpected query result`);
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL  ${label} (${envVar}): ${redactSecrets(message)}`);
    return false;
  }
}

async function main(): Promise<void> {
  const results = await Promise.all(
    targets.map((target) => checkConnection(target.label, target.envVar)),
  );

  if (results.some((ok) => !ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unexpected error: ${redactSecrets(message)}`);
  process.exit(1);
});
