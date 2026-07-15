const LINE_SORT_PRIORITY: Record<string, number> = {
  "galaxy s": 10,
  "galaxy note": 20,
  "galaxy z": 30,
  "galaxy a": 40,
  "galaxy m": 50,
  "iphone pro max": 10,
  "iphone pro": 20,
  "iphone plus": 30,
  "iphone": 40,
  "iphone mini": 50,
  "iphone se": 60,
  "pixel pro": 10,
  pixel: 20,
};

export function getModelLineSortKey(model_line: string): number {
  return LINE_SORT_PRIORITY[model_line.toLowerCase()] ?? 500;
}
