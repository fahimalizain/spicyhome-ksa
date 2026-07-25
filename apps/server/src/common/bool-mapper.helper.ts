export function mapBools<T extends Record<string, unknown>>(row: T, fields: readonly string[]): T {
  for (const field of fields) {
    if (typeof row[field] === 'number') {
      (row as Record<string, unknown>)[field] = row[field] === 1;
    }
  }
  return row;
}
