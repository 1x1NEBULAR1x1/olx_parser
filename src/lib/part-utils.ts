export function isPartEstimate(part: { title: string; is_estimate?: boolean }): boolean {
  return part.is_estimate === true || part.title.includes("★");
}
