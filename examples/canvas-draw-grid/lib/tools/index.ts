export type DrawTool = "pen" | "bucket";
export type DrawMode = "paint" | "erase" | null;
export type PaintedCells = Record<string, string>;
export const TRANSPARENT_SWATCH = "transparent";

export interface GridCoordinate {
  x: number;
  y: number;
}

interface PenStrokeInput {
  cells: PaintedCells;
  from: GridCoordinate | null;
  to: GridCoordinate;
  mode: Exclude<DrawMode, null>;
  paintColor: string;
  brushSize: number;
  columns: number;
  rows: number;
}

interface BucketFillInput {
  cells: PaintedCells;
  start: GridCoordinate;
  mode: Exclude<DrawMode, null>;
  paintColor: string;
  columns: number;
  rows: number;
}

export function applyPenStroke({
  cells,
  from,
  to,
  mode,
  paintColor,
  brushSize,
  columns,
  rows,
}: PenStrokeInput): PaintedCells {
  const nextCells = { ...cells };
  const coordinatesToApply = from ? interpolateGridLine(from, to) : [to];
  const footprint = new Set<string>();

  for (const coordinate of coordinatesToApply) {
    for (const brushCoordinate of getSquareBrushCoordinates({
      center: coordinate,
      size: brushSize,
      columns,
      rows,
    })) {
      footprint.add(toCellKey(brushCoordinate.x, brushCoordinate.y));
    }
  }

  for (const key of footprint) {
    if (mode === "paint") {
      nextCells[key] = paintColor;
      continue;
    }

    delete nextCells[key];
  }

  return nextCells;
}

export function applyBucketFill({
  cells,
  start,
  mode,
  paintColor,
  columns,
  rows,
}: BucketFillInput): PaintedCells {
  const nextCells = { ...cells };
  const nextColor = mode === "paint" ? paintColor : null;
  const startColor = getCellColor(start, nextCells);

  if (startColor === nextColor) {
    return cells;
  }

  const pending: GridCoordinate[] = [start];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const current = pending.pop()!;
    const key = toCellKey(current.x, current.y);

    if (visited.has(key)) {
      continue;
    }

    visited.add(key);

    if (getCellColor(current, nextCells) !== startColor) {
      continue;
    }

    if (nextColor) {
      nextCells[key] = nextColor;
    } else {
      delete nextCells[key];
    }

    for (const neighbor of getOrthogonalNeighbors(current, columns, rows)) {
      const neighborKey = toCellKey(neighbor.x, neighbor.y);

      if (!visited.has(neighborKey)) {
        pending.push(neighbor);
      }
    }
  }

  return nextCells;
}

export function toCellKey(x: number, y: number) {
  return `${x},${y}`;
}

export function parseCellKey(key: string): GridCoordinate {
  const [x, y] = key.split(",").map((value) => Number.parseInt(value, 10));

  return {
    x: x!,
    y: y!,
  };
}

export function getSquareBrushCoordinates({
  center,
  size,
  columns,
  rows,
}: {
  center: GridCoordinate;
  size: number;
  columns: number;
  rows: number;
}) {
  const clampedSize = Math.max(1, Math.floor(size));
  const startOffset = -Math.floor(clampedSize / 2);
  const endOffset = startOffset + clampedSize - 1;
  const coordinates: GridCoordinate[] = [];

  for (let offsetY = startOffset; offsetY <= endOffset; offsetY += 1) {
    for (let offsetX = startOffset; offsetX <= endOffset; offsetX += 1) {
      const nextCoordinate = {
        x: center.x + offsetX,
        y: center.y + offsetY,
      };

      if (isWithinGridBounds(nextCoordinate, columns, rows)) {
        coordinates.push(nextCoordinate);
      }
    }
  }

  return coordinates;
}

function interpolateGridLine(from: GridCoordinate, to: GridCoordinate) {
  const coordinates: GridCoordinate[] = [];
  const deltaX = Math.abs(to.x - from.x);
  const deltaY = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;

  let currentX = from.x;
  let currentY = from.y;
  let error = deltaX - deltaY;

  while (true) {
    coordinates.push({ x: currentX, y: currentY });

    if (currentX === to.x && currentY === to.y) {
      break;
    }

    const doubledError = error * 2;

    if (doubledError > -deltaY) {
      error -= deltaY;
      currentX += stepX;
    }

    if (doubledError < deltaX) {
      error += deltaX;
      currentY += stepY;
    }
  }

  return coordinates;
}

function getCellColor(
  { x, y }: GridCoordinate,
  cells: PaintedCells,
) {
  return cells[toCellKey(x, y)] ?? null;
}

function getOrthogonalNeighbors(
  { x, y }: GridCoordinate,
  columns: number,
  rows: number,
) {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].filter((coordinate) => isWithinGridBounds(coordinate, columns, rows));
}

function isWithinGridBounds(
  { x, y }: GridCoordinate,
  columns: number,
  rows: number,
) {
  return x >= 0 && y >= 0 && x < columns && y < rows;
}
