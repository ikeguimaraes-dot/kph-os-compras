/** Optional diagnostics may fail without concealing the core margin data.
 * Missing rows remain unknown; callers must show the returned warning.
 */
export async function optionalPrismaQuery<T>(
  load: () => Promise<T[]>,
  warning: string,
  report: (error: unknown) => void = (error) =>
    console.error("[prisma:optional-query]", error),
): Promise<{ rows: T[]; warning: string | null }> {
  try {
    return { rows: await load(), warning: null };
  } catch (error) {
    report(error);
    return { rows: [], warning };
  }
}
