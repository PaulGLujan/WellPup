// vaccine_aliases.raw_name is stored in this form. Normalize any raw name
// with this before inserting or looking it up so matching is case-insensitive.
export function normalizeAliasName(rawName: string): string {
  return rawName.trim().toLowerCase()
}
