export interface RelativePoint {
  x: number;
  y: number;
}

export interface VectorPolygon {
  id: string;
  label: string;
  points: RelativePoint[];
}

export const VECTOR_POLYGONS_STORAGE_KEY = "manzana-vector-polygons";

export function loadVectorPolygons(): VectorPolygon[] {
  const storedValue = localStorage.getItem(VECTOR_POLYGONS_STORAGE_KEY);

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(storedValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((polygon) => normalizeVectorPolygon(polygon))
      .filter((polygon): polygon is VectorPolygon => polygon !== undefined);
  } catch {
    return [];
  }
}

export function saveVectorPolygons(polygons: VectorPolygon[]) {
  localStorage.setItem(VECTOR_POLYGONS_STORAGE_KEY, JSON.stringify(polygons));
}

export function createVectorPolygon(points: RelativePoint[]): VectorPolygon {
  return {
    id: crypto.randomUUID(),
    label: "",
    points,
  };
}

function normalizeVectorPolygon(value: unknown): VectorPolygon | undefined {
  if (Array.isArray(value)) {
    const points = normalizeRelativePoints(value);

    if (points.length < 3) {
      return undefined;
    }

    return createVectorPolygon(points);
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const polygon = value as {
    id?: unknown;
    label?: unknown;
    points?: unknown;
  };
  const points = normalizeRelativePoints(polygon.points);

  if (points.length < 3) {
    return undefined;
  }

  return {
    id:
      typeof polygon.id === "string" && polygon.id.length > 0
        ? polygon.id
        : crypto.randomUUID(),
    label: typeof polygon.label === "string" ? polygon.label : "",
    points,
  };
}

function normalizeRelativePoints(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (point): point is RelativePoint =>
      !!point &&
      typeof point === "object" &&
      typeof point.x === "number" &&
      typeof point.y === "number",
  );
}
