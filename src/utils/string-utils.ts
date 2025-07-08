export function normalizeEmptyToNull(value?: string | null | number | undefined): string | number | null {
  if (typeof value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }
  return value ?? null;
}
