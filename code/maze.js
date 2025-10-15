// code/maze.js

// A slightly larger and more complex maze grid:
// 1 = wall, 0 = open path
// Only one real exit, multiple false paths for difficulty
const mazeGrid = [
  [1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,1,0,0,0,1,0,0,1],
  [1,0,1,1,0,1,0,1,0,1,1],
  [1,0,1,0,0,1,0,0,0,0,1],
  [1,0,1,0,1,1,1,0,1,0,1],
  [1,0,0,0,0,0,1,0,1,0,1],
  [1,1,1,1,1,0,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,1],
  [1,0,1,0,1,1,1,1,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1],
];

// ✅ Export it so main.js can import it
export { mazeGrid };