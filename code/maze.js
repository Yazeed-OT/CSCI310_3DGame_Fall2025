// ES module export consumed by main.js
// Procedural perfect maze generator (randomized DFS / recursive backtracker)
// Usage: import { generateMaze } from './maze.js'
//        export const mazeGrid = generateMaze(21, 21, { seed: 1234, braid: 0.0 })

export function generateMaze(width, height, opts = {}) {
  const { seed = Date.now(), braid = 0.0 } = opts;
  if (width % 2 === 0 || height % 2 === 0) {
    throw new Error('Use odd dimensions so walls/corridors line up (e.g., 21x21).');
  }

  // deterministic PRNG so seeds reproduce mazes
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  const rand = mulberry32(typeof seed === 'number' ? seed : hash(seed));
  const randi = (n) => Math.floor(rand() * n);

  // grid: 1 = wall, 0 = passage
  const g = Array.from({ length: height }, () => Array(width).fill(1));

  // carve starting cell on odd coords
  const start = { x: 1, y: 1 };
  g[start.y][start.x] = 0;
  const stack = [start];

  while (stack.length) {
    const { x, y } = stack[stack.length - 1];
    const candidates = [];
    if (y - 2 > 0 && g[y - 2][x] === 1) candidates.push({ x, y: y - 2, wall: { x, y: y - 1 } });
    if (y + 2 < height - 1 && g[y + 2][x] === 1) candidates.push({ x, y: y + 2, wall: { x, y: y + 1 } });
    if (x - 2 > 0 && g[y][x - 2] === 1) candidates.push({ x: x - 2, y, wall: { x: x - 1, y } });
    if (x + 2 < width - 1 && g[y][x + 2] === 1) candidates.push({ x: x + 2, y, wall: { x: x + 1, y } });

    if (candidates.length) {
      const n = candidates[randi(candidates.length)];
      g[n.wall.y][n.wall.x] = 0;
      g[n.y][n.x] = 0;
      stack.push({ x: n.x, y: n.y });
    } else {
      stack.pop();
    }
  }

  // Optional braiding: remove some dead ends to add loops
  if (braid > 0) {
    for (let y = 1; y < height; y += 2) {
      for (let x = 1; x < width; x += 2) {
        if (deadEnd(g, x, y) && rand() < braid) {
          const walled = neighbors4(x, y).filter(([nx, ny]) => g[ny]?.[nx] === 1);
          if (walled.length) {
            const [wx, wy] = walled[randi(walled.length)];
            const ox = x + (wx - x) * 2;
            const oy = y + (wy - y) * 2;
            if (g[wy]?.[wx] === 1) g[wy][wx] = 0;
            if (g[oy]?.[ox] !== undefined) g[oy][ox] = 0;
          }
        }
      }
    }
  }

  // enforce entrance and exit openings
  g[0][1] = 0;                    // entrance at top row (x=1)
  g[height - 1][width - 2] = 0;   // exit at bottom row (x=width-2)

  return g;

  // helpers
  function neighbors4(x, y) {
    return [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ];
  }
  function deadEnd(grid, x, y) {
    let open = 0;
    for (const [nx, ny] of neighbors4(x, y)) if (grid[ny]?.[nx] === 0) open++;
    return open === 1;
  }
}

// Export a default grid so existing imports keep working
export const mazeGrid = generateMaze(21, 21, { seed: 310, braid: 0.0 });

