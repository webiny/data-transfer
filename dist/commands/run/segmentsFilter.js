export function parseSegmentsFilter(input) {
  const parts = input
    .split(",")
    .map(part => part.trim())
    .filter(part => part.length > 0);
  if (parts.length === 0) {
    throw new Error(`--segments must contain at least one index (got "${input}")`);
  }
  const parsed = parts.map(part => {
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        `--segments must be a comma-separated list of non-negative integers ` +
          `(offending value: "${part}")`
      );
    }
    return value;
  });
  return [...new Set(parsed)].sort((a, b) => a - b);
}
export function resolveSegmentsToRun(totalSegments, filter) {
  if (!filter) {
    return [...Array(totalSegments).keys()];
  }
  const invalid = filter.filter(segment => segment >= totalSegments);
  if (invalid.length > 0) {
    throw new Error(
      `--segments contains out-of-range values [${invalid.join(", ")}]; ` +
        `valid range for this config is 0..${totalSegments - 1}`
    );
  }
  return filter;
}
//# sourceMappingURL=segmentsFilter.js.map
