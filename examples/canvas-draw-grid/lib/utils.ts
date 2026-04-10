export type GridCoordinate = {
  x: number;
  y: number;
};

export function interpolateGridLine(
  from: GridCoordinate,
  to: GridCoordinate,
): GridCoordinate[] {
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

export function drawGridLines(
  ctx: CanvasRenderingContext2D,
  blockSize: number,
) {
  const { width, height } = ctx.canvas;

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  for (let x = 0; x <= width; x += blockSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += blockSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.strokeStyle = "#000";
  ctx.stroke();
}

export function drawPixelCheckerboard(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;

  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      const v = (x + y) % 2 === 0 ? 0 : 255;

      data[i] = v; // R
      data[i + 1] = v; // G
      data[i + 2] = v; // B
      data[i + 3] = 255; // A
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

let imageData: ImageData | null = null;
export function drawCells(
  canvas: HTMLCanvasElement,
  cells: { [key: string]: string },
) {
  const ctx = canvas.getContext("2d")!;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let xy in cells) {
    const color = cells[xy]!;
    const { x, y } = parseCellKey(xy);
    if (x < 0 || y < 0 || x >= width || y >= height) {
      continue;
    }

    const r = parseInt(color.substring(1, 3), 16);
    const g = parseInt(color.substring(3, 5), 16);
    const b = parseInt(color.substring(5, 7), 16);

    const i = (y * width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
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

export function floodFill(
  cells: { [key: string]: string },
  p: GridCoordinate,
  bounds: { columns: number; rows: number },
): GridCoordinate[] {
  const coordinates: GridCoordinate[] = [];
  const pending: GridCoordinate[] = [p];
  const visited = new Set<string>();
  const startColor = getCellColor(cells, p);

  while (pending.length > 0) {
    const current = pending.pop()!;
    const key = toCellKey(current.x, current.y);

    if (visited.has(key) || !isWithinGridBounds(current, bounds)) {
      continue;
    }

    visited.add(key);

    if (getCellColor(cells, current) !== startColor) {
      continue;
    }

    coordinates.push(current);

    for (const neighbor of getOrthogonalNeighbors(current, bounds)) {
      const neighborKey = toCellKey(neighbor.x, neighbor.y);

      if (!visited.has(neighborKey)) {
        pending.push(neighbor);
      }
    }
  }

  return coordinates;
}

function getCellColor(
  cells: { [key: string]: string },
  coordinate: GridCoordinate,
) {
  return cells[toCellKey(coordinate.x, coordinate.y)] ?? null;
}

function getOrthogonalNeighbors(
  coordinate: GridCoordinate,
  bounds: { columns: number; rows: number },
) {
  const { x, y } = coordinate;

  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].filter((neighbor) => isWithinGridBounds(neighbor, bounds));
}

function isWithinGridBounds(
  coordinate: GridCoordinate,
  bounds: { columns: number; rows: number },
) {
  return (
    coordinate.x >= 0 &&
    coordinate.y >= 0 &&
    coordinate.x < bounds.columns &&
    coordinate.y < bounds.rows
  );
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
