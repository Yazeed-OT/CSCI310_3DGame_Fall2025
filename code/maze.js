// code/maze.js — perfect maze generator (single solution by default)
export function generateMaze(width, height, opts = {}) {
  const { seed = Date.now(), braid = 0 } = opts;
  if (width % 2 === 0 || height % 2 === 0)
    throw new Error("Use odd dimensions (e.g., 21x21).");

  // PRNG
  function mulberry32(a){return function(){let t=(a+=0x6D2B79F5);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  const seedNum = typeof seed === "number" ? seed :
    [...String(seed)].reduce((h,c)=>(h^c.charCodeAt(0))*16777619>>>0,2166136261);
  const rand = mulberry32(seedNum);
  const randi = (n) => Math.floor(rand() * n);

  // 1=wall, 0=passage
  const g = Array.from({ length: height }, () => Array(width).fill(1));

  // carve from (1,1)
  const stack = [{ x: 1, y: 1 }];
  g[1][1] = 0;

  while (stack.length) {
    const { x, y } = stack[stack.length - 1];
    const next = [];
    if (y - 2 > 0 && g[y - 2][x] === 1) next.push({ x, y: y - 2, wx: x,     wy: y - 1 });
    if (y + 2 < height - 1 && g[y + 2][x] === 1) next.push({ x, y: y + 2, wx: x,     wy: y + 1 });
    if (x - 2 > 0 && g[y][x - 2] === 1) next.push({ x: x - 2, y, wx: x - 1, wy: y     });
    if (x + 2 < width  - 1 && g[y][x + 2] === 1) next.push({ x: x + 2, y, wx: x + 1, wy: y     });

    if (next.length) {
      const n = next[randi(next.length)];
      g[n.wy][n.wx] = 0; // knock wall
      g[n.y][n.x] = 0;   // carve
      stack.push({ x: n.x, y: n.y });
    } else {
      stack.pop();
    }
  }

  // optional: braid (add a few loops). keep at 0 for perfect maze.
  if (braid > 0) {
    const open = (x,y)=>g[y]?.[x]===0;
    const n4 = (x,y)=>[[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
    for (let y=1;y<height;y+=2){
      for (let x=1;x<width;x+=2){
        let openN = n4(x,y).filter(([nx,ny])=>open(nx,ny)).length;
        if (openN===1 && rand()<braid){ // dead end
          const walls = n4(x,y).filter(([nx,ny])=>g[ny]?.[nx]===1);
          if (walls.length){
            const [wx,wy]=walls[randi(walls.length)];
            const ox=x+(wx-x)*2, oy=y+(wy-y)*2;
            if (g[wy]?.[wx]===1) g[wy][wx]=0;
            if (g[oy]?.[ox]!==undefined) g[oy][ox]=0;
          }
        }
      }
    }
  }

  // entrance/exit openings
  g[0][1] = 0;                 // entrance top edge
  g[height-1][width-2] = 0;    // exit bottom edge
  return g;
}

// default export for your current import pattern
const params = new URLSearchParams(location.search);
const W = 21, H = 21;
const seed = params.get("seed") ?? (Math.random()*1e9|0);
const braid = Number(params.get("braid") ?? 0); // keep 0 for single-solution
export const mazeGrid = generateMaze(W, H, { seed, braid });
