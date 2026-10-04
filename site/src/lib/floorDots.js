// Scene 2's worker-dot layout for the assembly floor, shared so other pages
// (the Management page's pay comparison) draw exactly the same dots.

export const LINE_DOT_R = 4.6; // in production-line image px
const LINE_ROWS = 2; // workers sit on both sides of a line
const LINE_ROW_GAP = 15; // px between the two sides

export function seededRandom(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

// Exact counts, mixed in a fixed seeded order.
export function kinds({ insured, dispatch }, rng) {
  const out = [...Array(insured).fill('insured'), ...Array(dispatch).fill('dispatch')];
  for (let i = out.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [out[i], out[k]] = [out[k], out[i]];
  }
  return out;
}

// n workers along a line, split over its two sides (offset up and down from
// the line's centre), evenly spaced along it.
export function lineSeats(line, slope, n) {
  const perRow = Math.ceil(n / LINE_ROWS);
  const seats = [];
  for (let row = 0; row < LINE_ROWS; row++) {
    const off = (row - (LINE_ROWS - 1) / 2) * LINE_ROW_GAP;
    const m = Math.min(perRow, n - row * perRow);
    for (let i = 0; i < m; i++) {
      const x = line.x0 + ((i + 0.5) / m) * (line.x1 - line.x0);
      seats.push([x, slope * x + line.c + off]);
    }
  }
  return seats;
}

// Every worker on the floor: 120 per line along its workbench row, with the
// campus-wide insured / dispatch mix (scene2_floor.json's `line`).
export function lineFloorDots(line, rng) {
  return line.lines.flatMap((ln, li) => {
    const seats = lineSeats(ln, line.slope, line.workers_per_line);
    const k = kinds(line.per_line, rng);
    return seats.map(([x, y], i) => ({ x, y, kind: k[i], line: li }));
  });
}
