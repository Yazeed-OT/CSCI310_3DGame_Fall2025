// code/main.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { mazeGrid } from './maze.js';

let scene, camera, renderer, clock;
let walls = [];
let timer = 60;
let timerInterval;
let gameOver = false;
let keys = { forward: false, backward: false, left: false, right: false };
let pov = 'overhead';
// Chase camera state
let facingDir = new THREE.Vector3(0, 0, 1); // smoothed heading
let chaseCamPos = new THREE.Vector3();
const CHASE_DISTANCE_SCALE = 2.4;   // in tiles (behind the ball)
const CHASE_HEIGHT_SCALE = 1.2;     // in tiles (raise camera a bit)
const CHASE_LOOKAHEAD_SCALE = 2.0;  // look further ahead to see where you're going
const CHASE_LERP = 0.12;            // camera position smoothing
const HEADING_LERP = 0.18;          // smoothing for facing direction
const LOOK_LERP = 0.18;             // smoothing for look-at target
let lookAtPos = new THREE.Vector3();
let doors = [];
let overheadOffset = null;
let tileSize = 3.5; // slightly bigger tiles for scale
let overheadCenter = new THREE.Vector3(0, 0, 0);
let playerStart = new THREE.Vector3(0, 1.6, 0);
let player, playerPos;
let playerVel = new THREE.Vector3(0, 0, 0);
let coins = [];
let score = 0;
let mapsCleared = 0;
let celebrating = false;
let exitWorld = null;
let fireworks = [];
// Player collision radius (must be < tileSize/2)
const PLAYER_RADIUS = 0.3; // as a fraction of tileSize; actual radius = tileSize * PLAYER_RADIUS

// Movement tuning (scaled by tile size)
const MAX_SPEED_TILES = 5.2;   // increased top speed
const ACCEL_TILES = 18.0;      // snappier acceleration
const DECEL_TILES = 9.0;       // slightly stronger friction when no input (tiles/s^2)
let MAX_SPEED_W = 0, ACCEL_W = 0, DECEL_W = 0; // computed in init()

// Camera tuning
const FOV_DEGREES = 60; // was 75 (narrower FOV = closer look)
const OVERHEAD_HEIGHT_SCALE = 0.9; // was 1.2 (closer)
const OVERHEAD_DEPTH_SCALE = 0.5; // was 0.65 (closer)
const OVERHEAD_LOOK_AT_Y = -10.0; // aim lower to move maze further up in frame

// (movement constants defined above)

// Enable console diagnostics only when URL has ?debug
const DEBUG = new URLSearchParams(window.location.search).has('debug');
// Coin tuning
const COIN_COUNT = 12;
const COIN_MIN_DIST_TILES = 2; // exclude near start/entrance/exit
// Visual tuning (background + floor theme)
const SKY_TOP = 0x0a0b1a;
const SKY_BOTTOM = 0x000000;
const GRID_EMISSIVE = 0x0b1433; // subtle blue glow
const GRID_LINE_COLOR = '#1e3a8a';
const GRID_GLOW_COLOR = '#5da9ff';
// ---------- Debug + analytics: Maze info ----------
function logMazeInfo(grid, opts = {}) {
  try {
    const h = grid.length;
    const w = grid[0]?.length ?? 0;
    const cellSize = opts.cellSize ?? tileSize;
    const wallHeight = opts.wallHeight ?? 3.2;
    const wallThickness = opts.wallThickness ?? cellSize;
    const seed = opts.seed ?? 'n/a';

    // Detect entrance/exit on boundaries if not provided
    const boundaryOpens = [];
    for (let x = 0; x < w; x++) {
      if (grid[0][x] === 0) boundaryOpens.push({ x, z: 0 });
      if (grid[h - 1][x] === 0) boundaryOpens.push({ x, z: h - 1 });
    }
    for (let z = 0; z < h; z++) {
      if (grid[z][0] === 0) boundaryOpens.push({ x: 0, z });
      if (grid[z][w - 1] === 0) boundaryOpens.push({ x: w - 1, z });
    }
    const entrance = opts.entrance ?? boundaryOpens[0] ?? { x: 1, z: 0 };
    const exit = opts.exit ?? boundaryOpens[1] ?? { x: w - 2, z: h - 1 };

    // Counts
    let walls = 0, passages = 0;
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        if (grid[z][x] === 1) walls++; else passages++;
      }
    }
    
    // Dead-ends (4-neighborhood)
    const inBounds = (x, z) => x >= 0 && z >= 0 && x < w && z < h;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    let deadEnds = 0;
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        if (grid[z][x] === 0) {
          let openN = 0;
          for (const [dx, dz] of dirs) if (inBounds(x+dx, z+dz) && grid[z+dz][x+dx] === 0) openN++;
          if (openN === 1) deadEnds++;
        }
      }
    }

    // Shortest path using BFS
    console.time('maze:bfs');
    const q = [];
    const dist = Array.from({ length: h }, () => Array(w).fill(-1));
    const push = (x, z, d) => { dist[z][x] = d; q.push([x,z]); };
    if (inBounds(entrance.x, entrance.z) && grid[entrance.z][entrance.x] === 0) push(entrance.x, entrance.z, 0);
    while (q.length) {
      const [cx, cz] = q.shift();
      if (cx === exit.x && cz === exit.z) break;
      for (const [dx, dz] of dirs) {
        const nx = cx + dx, nz = cz + dz;
        if (!inBounds(nx, nz)) continue;
        if (grid[nz][nx] !== 0) continue;
        if (dist[nz][nx] !== -1) continue;
        push(nx, nz, dist[cz][cx] + 1);
      }
    }
    const shortest = (inBounds(exit.x, exit.z) ? dist[exit.z][exit.x] : -1);
    console.timeEnd('maze:bfs');

    // ASCII preview
    let ascii = '';
    for (let z = 0; z < h; z++) {
      let line = '';
      for (let x = 0; x < w; x++) {
        if (x === entrance.x && z === entrance.z) line += 'S';
        else if (x === exit.x && z === exit.z) line += 'E';
        else line += (grid[z][x] === 1 ? '#' : ' ');
      }
      ascii += line + '\n';
    }

    // Output
    console.groupCollapsed('Maze Info');
    console.table([{ 
      width: w, height: h, seed, cellSize, wallHeight, wallThickness,
      entrance: `(${entrance.x},${entrance.z})`, exit: `(${exit.x},${exit.z})`,
      walls, passages, deadEnds, shortestPath: shortest
    }]);
    console.groupCollapsed('ASCII Preview');
    console.log(`\n${ascii}`);
    console.groupEnd();
    console.groupEnd();
  } catch (err) {
    console.warn('logMazeInfo failed:', err);
  }
}


// Debug overlay elements and helpers
let _debugEl = null;
function ensureDebugOverlay() {
  if (!DEBUG) return;
  if (_debugEl) return _debugEl;
  _debugEl = document.createElement('div');
  _debugEl.id = 'debug-overlay';
  document.body.appendChild(_debugEl);
  return _debugEl;
}
function fmtVec3(v) { return Array.isArray(v) ? v.map(n=>Number(n).toFixed(1)).join(',') : v.toArray().map(n=>n.toFixed(1)).join(','); }
function updateDebugOverlay(ctx) {
  if (!DEBUG) return;
  ensureDebugOverlay();
  const { mazeWidth, mazeDepth, tileSize, wallsCount, FOV, camPos, ovhH, ovhD } = ctx;
  _debugEl.textContent = [
    `Maze: ${mazeWidth} x ${mazeDepth}`,
    `Tile: ${tileSize}`,
    `Walls: ${wallsCount}`,
    `FOV: ${FOV}`,
    `Cam: [${fmtVec3(camPos)}]`,
    `Overhead H:${ovhH.toFixed(1)} D:${ovhD.toFixed(1)} lookY:${OVERHEAD_LOOK_AT_Y}`
  ].join('\n');
}

const timerDisplay = document.getElementById('timer');
const scoreDisplay = document.getElementById('score-value');
const mapsDisplay = document.getElementById('maps-value');
const gameOverText = document.getElementById('game-over');
const restartBtn = document.getElementById('restart');

init();
animate();

function init() {
  scene = new THREE.Scene();
  // Subtle depth fog for a game-like atmosphere
  scene.fog = new THREE.FogExp2(0x05060e, 0.006);

  const mazeWidth = mazeGrid[0].length;
  const mazeDepth = mazeGrid.length;

  const worldCenterX = (mazeWidth * tileSize) / 2;
  const worldCenterZ = (mazeDepth * tileSize) / 2;
  const mazeMax = Math.max(mazeWidth, mazeDepth) * tileSize;
  const overheadHeight = mazeMax * OVERHEAD_HEIGHT_SCALE;
  const overheadDepth = mazeMax * OVERHEAD_DEPTH_SCALE;

  camera = new THREE.PerspectiveCamera(FOV_DEGREES, window.innerWidth / window.innerHeight, 0.1, 1500);
  camera.position.set(worldCenterX, overheadHeight, worldCenterZ + overheadDepth);
  camera.lookAt(new THREE.Vector3(worldCenterX, OVERHEAD_LOOK_AT_Y, worldCenterZ));

  playerStart.set(1.5 * tileSize, 1.6, 1.5 * tileSize);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  // Create a vertical gradient background texture
  scene.background = createVerticalGradientTexture(SKY_TOP, SKY_BOTTOM);
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  // Compute world-unit movement constants using current tile size
  MAX_SPEED_W = MAX_SPEED_TILES * tileSize;
  ACCEL_W = ACCEL_TILES * tileSize;
  DECEL_W = DECEL_TILES * tileSize;

  // Lighting
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  const ambient = new THREE.AmbientLight(0x303040, 1.0);
  scene.add(ambient);

  // Floor (match maze bounds exactly) with a subtle neon grid
  const floorGeo = new THREE.PlaneGeometry(mazeWidth * tileSize, mazeDepth * tileSize);
  const gridTex = createGridTexture(64, 2, GRID_LINE_COLOR, GRID_GLOW_COLOR);
  gridTex.wrapS = THREE.RepeatWrapping;
  gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.repeat.set(mazeWidth, mazeDepth);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0b0b0f,
    roughness: 0.9,
    metalness: 0.1,
    map: gridTex,
    emissive: GRID_EMISSIVE,
    emissiveMap: gridTex,
    emissiveIntensity: 0.35,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((mazeWidth * tileSize) / 2, -0.5, (mazeDepth * tileSize) / 2);
  scene.add(floor);

  // Walls (higher)
  const wallGeo = new THREE.BoxGeometry(tileSize, 3.2, tileSize);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x5da9ff,
    roughness: 0.4,
    metalness: 0.1,
  });

  const entranceTile = { x: 1, z: 0 };
  const exitTile = { x: mazeWidth - 2, z: mazeDepth - 1 };
  if (mazeGrid[entranceTile.z]) mazeGrid[entranceTile.z][entranceTile.x] = 0;
  if (mazeGrid[exitTile.z]) mazeGrid[exitTile.z][exitTile.x] = 0;
  // Save exit world position for completion detection and add a visual marker
  exitWorld = new THREE.Vector3((exitTile.x + 0.5) * tileSize, 1.0, (exitTile.z + 0.5) * tileSize);
  addExitMarker(exitWorld);

  for (let z = 0; z < mazeGrid.length; z++) {
    for (let x = 0; x < mazeGrid[z].length; x++) {
      if (mazeGrid[z][x] === 1) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set((x + 0.5) * tileSize, 1.6, (z + 0.5) * tileSize);
        scene.add(wall);
        walls.push(wall);
      }
    }
  }

  // Create player sphere and place at start cell center
  const sphereGeo = new THREE.SphereGeometry(tileSize * PLAYER_RADIUS, 24, 16);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
  player = new THREE.Mesh(sphereGeo, sphereMat);
  // Start near entrance (1,1) cell center
  const startCell = { x: 1, z: 1 };
  const toWorld = (cx, cz) => new THREE.Vector3((cx + 0.5) * tileSize, 1.0, (cz + 0.5) * tileSize);
  playerPos = toWorld(startCell.x, startCell.z);
  player.position.copy(playerPos);
  scene.add(player);

  // No doors: entrance and exit remain open passages

  // Print maze stats to console on load (dev utility)
  logMazeInfo(mazeGrid, {
    cellSize: tileSize,
    wallHeight: 3.2,
    wallThickness: tileSize,
    entrance: entranceTile,
    exit: exitTile,
  });

  // Removed door interaction (no doors present)

  startTimer();
  // Load score/maps from URL so progression persists across maps
  try {
    const params = new URLSearchParams(window.location.search);
    score = Number(params.get('score') ?? 0);
    mapsCleared = Number(params.get('maps') ?? 0);
  } catch {}
  if (scoreDisplay) scoreDisplay.textContent = String(score);
  if (mapsDisplay) mapsDisplay.textContent = String(mapsCleared);

  // Spawn collectibles
  spawnCoins();

  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (gameOver) {
      // Only allow restart while game over
      if (k === 'r') {
        const newSeed = (Math.random() * 1e9) | 0;
        const url = new URL(location.href);
        url.searchParams.set('seed', String(newSeed));
        url.searchParams.set('braid', '0');
        location.href = url.toString();
      }
      return;
    }
    // Movement: WASD
    if (k === 'w') keys.forward = true;
    if (k === 's') keys.backward = true;
    if (k === 'a') keys.left = true;
    if (k === 'd') keys.right = true;
    // Movement: Arrow Keys
    if (k === 'arrowup') { keys.forward = true; e.preventDefault(); }
    if (k === 'arrowdown') { keys.backward = true; e.preventDefault(); }
    if (k === 'arrowleft') { keys.left = true; e.preventDefault(); }
    if (k === 'arrowright') { keys.right = true; e.preventDefault(); }
    // POV toggle
    if (k === 'p') togglePOV();
    // Reset (reload with new seed for a fresh maze)
    if (k === 'r') {
      const newSeed = (Math.random() * 1e9) | 0;
      const url = new URL(location.href);
      url.searchParams.set('seed', String(newSeed));
      url.searchParams.set('braid', '0'); // keep perfect maze
      location.href = url.toString();
    }
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (gameOver) return;
    if (k === 'w' || k === 'arrowup') keys.forward = false;
    if (k === 's' || k === 'arrowdown') keys.backward = false;
    if (k === 'a' || k === 'arrowleft') keys.left = false;
    if (k === 'd' || k === 'arrowright') keys.right = false;
  });

  window.addEventListener('resize', onWindowResize);

  // Removed decorative grid to keep the map clean and aligned

  overheadCenter.set((mazeWidth * tileSize) / 2, 0, (mazeDepth * tileSize) / 2);
  overheadOffset = new THREE.Vector3(0, overheadHeight, overheadDepth);

  if (DEBUG) {
    console.log('[Maze]', {
      mazeWidth,
      mazeDepth,
      tileSize,
      worldCenterX,
      worldCenterZ,
      mazeMax,
    });
    console.log('[Camera:init]', {
      FOV_DEGREES,
      overheadHeight,
      overheadDepth,
      position: camera.position.toArray(),
      lookAt: [worldCenterX, 0, worldCenterZ],
    });
    ensureDebugOverlay();
    updateDebugOverlay({
      mazeWidth,
      mazeDepth,
      tileSize,
      wallsCount: walls.length,
      FOV: FOV_DEGREES,
      camPos: camera.position,
      ovhH: overheadHeight,
      ovhD: overheadDepth,
    });
    // Periodic refresh (1s) so position is current during movement
    setInterval(() => updateDebugOverlay({
      mazeWidth,
      mazeDepth,
      tileSize,
      wallsCount: walls.length,
      FOV: FOV_DEGREES,
      camPos: camera.position,
      ovhH: overheadHeight,
      ovhD: overheadDepth,
    }), 1000);
  }
}

function togglePOV() {
  const mazeWidth = mazeGrid[0].length;
  const mazeDepth = mazeGrid.length;
  const mazeMaxLocal = Math.max(mazeWidth, mazeDepth) * tileSize;
  const height = mazeMaxLocal * OVERHEAD_HEIGHT_SCALE;
  const depth = mazeMaxLocal * OVERHEAD_DEPTH_SCALE;

  if (pov === 'overhead') {
    // Enter chase camera: behind-and-above the ball, ball visible in frame
    pov = 'chase';
    const chaseDist = tileSize * CHASE_DISTANCE_SCALE;
    const chaseHeight = tileSize * CHASE_HEIGHT_SCALE;
    const behind = playerPos.clone().addScaledVector(new THREE.Vector3(facingDir.x, 0, facingDir.z), -chaseDist);
    behind.y = chaseHeight;
    chaseCamPos.copy(behind);
    camera.position.copy(chaseCamPos);
    lookAtPos.copy(playerPos.clone().addScaledVector(facingDir, tileSize * CHASE_LOOKAHEAD_SCALE));
    camera.lookAt(lookAtPos);
  } else {
    pov = 'overhead';
    overheadOffset = new THREE.Vector3(0, height, depth);
    // Keep camera fixed over the maze center (do NOT follow the player)
    const center = overheadCenter.clone();
    const camPos = center.clone().add(overheadOffset);
    camera.position.copy(camPos);
    camera.lookAt(new THREE.Vector3(center.x, OVERHEAD_LOOK_AT_Y, center.z));
  }
  if (DEBUG) {
    console.log('[POV]', pov, 'cam', camera.position.toArray());
    updateDebugOverlay({
      mazeWidth: mazeGrid[0].length,
      mazeDepth: mazeGrid.length,
      tileSize,
      wallsCount: walls.length,
      FOV: FOV_DEGREES,
      camPos: camera.position,
      ovhH: Math.max(mazeGrid[0].length, mazeGrid.length) * tileSize * OVERHEAD_HEIGHT_SCALE,
      ovhD: Math.max(mazeGrid[0].length, mazeGrid.length) * tileSize * OVERHEAD_DEPTH_SCALE,
    });
  }
}

// ---- Collectibles ----
function gridToWorld(cx, cz) { return new THREE.Vector3((cx + 0.5) * tileSize, 0.6, (cz + 0.5) * tileSize); }
function spawnCoins() {
  // gather open cells
  const openCells = [];
  const h = mazeGrid.length, w = mazeGrid[0].length;
  const start = { x: 1, z: 1 };
  const entrance = { x: 1, z: 0 };
  const exit = { x: w - 2, z: h - 1 };
  const minDist = COIN_MIN_DIST_TILES;
  const farEnough = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) >= minDist;
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (mazeGrid[z][x] === 0) {
        const cell = { x, z };
        if (farEnough(cell, start) && farEnough(cell, entrance) && farEnough(cell, exit)) openCells.push(cell);
      }
    }
  }
  // pick random subset
  const rng = Math.random;
  for (let i = 0; i < COIN_COUNT && openCells.length; i++) {
    const idx = Math.floor(rng() * openCells.length);
    const cell = openCells.splice(idx, 1)[0];
    const pos = gridToWorld(cell.x, cell.z);
    // coin group (mesh + soft light) with hover animation data
    const geo = new THREE.TorusGeometry(tileSize * 0.22, tileSize * 0.06, 12, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd54a,
      emissive: 0x7a5200,
      emissiveIntensity: 0.9,
      metalness: 0.65,
      roughness: 0.25,
    });
    const coinMesh = new THREE.Mesh(geo, mat);
    coinMesh.rotation.x = Math.PI / 2; // stand up
    const light = new THREE.PointLight(0xffdd77, 0.7, tileSize * 4, 2);
    light.position.set(0, 0.2, 0);
    const group = new THREE.Group();
    group.add(coinMesh);
    group.add(light);
    group.position.copy(pos);
    group.userData = {
      cell,
      baseY: pos.y,
      t: Math.random() * Math.PI * 2,
      mesh: coinMesh,
      pulseSpeed: 2.2 + Math.random()*0.8,
      floatSpeed: 1.2 + Math.random()*0.6,
    };
    scene.add(group);
    coins.push(group);
  }
}

function updateCoins(delta) {
  for (const g of coins) {
    const u = g.userData;
    u.t += delta;
    // slow spin and hover in place
    u.mesh.rotation.z += delta * 1.5;
    g.position.y = u.baseY + Math.sin(u.t * u.floatSpeed) * (tileSize * 0.08);
    // emissive pulse for shininess
    const pulse = 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(u.t * u.pulseSpeed));
    u.mesh.material.emissiveIntensity = pulse;
  }
}

function checkCoinPickup() {
  if (!coins.length) return;
  const pickupRadius = tileSize * 0.35;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    const dx = c.position.x - playerPos.x;
    const dz = c.position.z - playerPos.z;
    if ((dx*dx + dz*dz) <= pickupRadius * pickupRadius) {
      // collect
      scene.remove(c);
      coins.splice(i, 1);
      score += 1;
      if (scoreDisplay) scoreDisplay.textContent = String(score);
    }
  }
}

// ---- First-person collision helpers ----
function aabbCircleOverlap(cx, cz, minX, maxX, minZ, maxZ, radius) {
  const closestX = Math.max(minX, Math.min(cx, maxX));
  const closestZ = Math.max(minZ, Math.min(cz, maxZ));
  const dx = cx - closestX;
  const dz = cz - closestZ;
  return (dx * dx + dz * dz) < (radius * radius);
}

function collidesWithMazeWalls(x, z) {
  const radius = tileSize * PLAYER_RADIUS;
  const minCellX = Math.floor((x - radius) / tileSize);
  const maxCellX = Math.floor((x + radius) / tileSize);
  const minCellZ = Math.floor((z - radius) / tileSize);
  const maxCellZ = Math.floor((z + radius) / tileSize);
  for (let cz = minCellZ; cz <= maxCellZ; cz++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      if (mazeGrid[cz]?.[cx] === 1) {
        const minX = cx * tileSize;
        const maxX = (cx + 1) * tileSize;
        const minZ = cz * tileSize;
        const maxZ = (cz + 1) * tileSize;
        if (aabbCircleOverlap(x, z, minX, maxX, minZ, maxZ, radius)) return true;
      }
    }
  }
  return false;
}

function hasCollisionAt(x, z) {
  // Out of bounds is treated as walls
  const w = mazeGrid[0].length * tileSize;
  const h = mazeGrid.length * tileSize;
  const margin = tileSize * PLAYER_RADIUS;
  if (x < margin || z < margin || x > w - margin || z > h - margin) return true;
  return collidesWithMazeWalls(x, z);
}

// (legacy wall-mesh proximity check removed; grid-based collision is used)

function startTimer() {
  timerInterval = setInterval(() => {
    timer--;
    timerDisplay.textContent = timer;
    if (timer <= 0) endGame();
  }, 1000);
}

function endGame() {
  gameOver = true;
  clearInterval(timerInterval);
  gameOverText.style.display = 'block';
  restartBtn.style.display = 'block';
  // Clear any held movement keys so nothing keeps moving
  keys.forward = false;
  keys.backward = false;
  keys.left = false;
  keys.right = false;
}

restartBtn.addEventListener('click', () => {
  const newSeed = (Math.random() * 1e9) | 0;
  const url = new URL(location.href);
  url.searchParams.set('seed', String(newSeed));
  url.searchParams.set('braid', '0');
  location.href = url.toString();
});

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (DEBUG) {
    console.log('[Resize]', { width: window.innerWidth, height: window.innerHeight, aspect: camera.aspect });
    updateDebugOverlay({
      mazeWidth: mazeGrid[0].length,
      mazeDepth: mazeGrid.length,
      tileSize,
      wallsCount: walls.length,
      FOV: FOV_DEGREES,
      camPos: camera.position,
      ovhH: Math.max(mazeGrid[0].length, mazeGrid.length) * tileSize * OVERHEAD_HEIGHT_SCALE,
      ovhD: Math.max(mazeGrid[0].length, mazeGrid.length) * tileSize * OVERHEAD_DEPTH_SCALE,
    });
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  // Intent from keys (camera does not react directly to keys – only follows the ball)
  const intent = new THREE.Vector3();
  if (!gameOver) {
    if (keys.forward) intent.z -= 1;
    if (keys.backward) intent.z += 1;
    if (keys.left) intent.x -= 1;
    if (keys.right) intent.x += 1;
  }
  if (intent.lengthSq() > 1e-6) intent.normalize();

  // Velocity integration with acceleration/friction
  if (!gameOver && intent.lengthSq() > 0) {
    playerVel.addScaledVector(intent, ACCEL_W * delta);
    // Clamp to max speed
    const sp = playerVel.length();
    if (sp > MAX_SPEED_W) playerVel.multiplyScalar(MAX_SPEED_W / sp);
  } else {
    // Decelerate when no input
    const sp = playerVel.length();
    if (sp > 0) {
      const newSp = Math.max(0, sp - DECEL_W * delta);
      if (newSp === 0) playerVel.set(0,0,0); else playerVel.multiplyScalar(newSp / sp);
    }
  }

  // Move player with axis-resolved collisions
  if (!gameOver) {
    const disp = playerVel.clone().multiplyScalar(delta);
    const current = playerPos.clone();
    // X axis
    let newX = current.x + disp.x;
    if (hasCollisionAt(newX, current.z)) {
      newX = current.x;
      playerVel.x = 0;
    }
    // Z axis
    let newZ = current.z + disp.z;
    if (hasCollisionAt(newX, newZ)) {
      newZ = current.z;
      playerVel.z = 0;
    }
    playerPos.set(newX, current.y, newZ);
    player.position.copy(playerPos);

    // Update smoothed facing from velocity (do not snap on key presses)
    const horizV = new THREE.Vector3(playerVel.x, 0, playerVel.z);
    if (horizV.lengthSq() > 0.00001) {
      const targetDir = horizV.normalize();
      // Smoothly blend facing toward velocity direction
      facingDir.lerp(targetDir, HEADING_LERP).normalize();
    }
  }

  // Check for reaching the exit (while not already celebrating)
  if (!gameOver && !celebrating && exitWorld) {
    const dx = playerPos.x - exitWorld.x;
    const dz = playerPos.z - exitWorld.z;
    const r = tileSize * 0.6;
    if ((dx*dx + dz*dz) <= r*r) {
      onLevelComplete();
    }
  }

  // Update camera based on POV, following the player
  if (pov === 'overhead') {
    // Fixed overhead camera: keep at maze center so the maze doesn't move
    const center = overheadCenter; // already set in init()
    const camPos = new THREE.Vector3(center.x, 0, center.z).add(overheadOffset);
    camera.position.copy(camPos);
    camera.lookAt(new THREE.Vector3(center.x, OVERHEAD_LOOK_AT_Y, center.z));
  } else if (pov === 'chase') {
    const chaseDist = tileSize * CHASE_DISTANCE_SCALE;
    const chaseHeight = tileSize * CHASE_HEIGHT_SCALE;
    const desired = playerPos.clone().addScaledVector(new THREE.Vector3(facingDir.x, 0, facingDir.z), -chaseDist);
    desired.y = chaseHeight;
    // Smooth follow
    chaseCamPos.lerp(desired, CHASE_LERP);
    camera.position.copy(chaseCamPos);
    const desiredLook = playerPos.clone().addScaledVector(facingDir, tileSize * CHASE_LOOKAHEAD_SCALE);
    lookAtPos.lerp(desiredLook, LOOK_LERP);
    camera.lookAt(lookAtPos);
  }

  // No door animation (doors removed)
  // Update collectibles
  updateCoins(delta);
  updateFireworks(delta);
  checkCoinPickup();

  renderer.render(scene, camera);
}

// ---------- Level/Exit helpers ----------
function addExitMarker(pos) {
  try {
    const ringGeo = new THREE.TorusGeometry(tileSize * 0.45, tileSize * 0.08, 12, 36);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x6aa3ff, emissive: 0x112244, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2; // stand it up
    ring.position.copy(pos).add(new THREE.Vector3(0, 0.2, 0));
    const glow = new THREE.PointLight(0x6aa3ff, 0.9, tileSize * 6, 2);
    glow.position.copy(ring.position).add(new THREE.Vector3(0, 0.2, 0));
    scene.add(ring);
    scene.add(glow);
    return ring;
  } catch { /* noop */ }
}

function onLevelComplete() {
  celebrating = true;
  // stop movement and inputs during celebration
  keys.forward = keys.backward = keys.left = keys.right = false;
  playerVel.set(0,0,0);
  // pause timer during celebration window
  if (timerInterval) clearInterval(timerInterval);
  triggerFireworks(exitWorld.clone());
  // After ~1.6s, load next map with new seed and increment maps
  setTimeout(() => {
    const url = new URL(location.href);
    const newSeed = (Math.random() * 1e9) | 0;
    mapsCleared += 1;
    url.searchParams.set('seed', String(newSeed));
    url.searchParams.set('braid', '0');
    url.searchParams.set('maps', String(mapsCleared));
    url.searchParams.set('score', String(score));
    location.href = url.toString();
  }, 1600);
}

// ---------- Fireworks ----------
function triggerFireworks(center) {
  const bursts = 3;
  for (let b = 0; b < bursts; b++) {
    const geom = new THREE.BufferGeometry();
    const count = 160;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color().setHSL(Math.random(), 0.85, 0.55);
    for (let i = 0; i < count; i++) {
      positions[i*3+0] = center.x;
      positions[i*3+1] = center.y + 0.3;
      positions[i*3+2] = center.z;
      // random spherical velocity
      const theta = Math.acos(2*Math.random()-1);
      const phi = Math.random() * Math.PI * 2;
      const speed = tileSize * (1.8 + Math.random()*1.2);
      velocities[i*3+0] = Math.sin(theta) * Math.cos(phi) * speed;
      velocities[i*3+1] = Math.cos(theta) * speed * 1.1;
      velocities[i*3+2] = Math.sin(theta) * Math.sin(phi) * speed;
      colors[i*3+0] = color.r;
      colors[i*3+1] = color.g;
      colors[i*3+2] = color.b;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.08 * tileSize, vertexColors: true, transparent: true, opacity: 1.0, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geom, mat);
    scene.add(points);
    fireworks.push({ points, velocities, life: 0, ttl: 1.5 });
  }
}

function updateFireworks(delta) {
  if (!fireworks.length) return;
  const gravity = -9.8 * 0.6; // mild gravity
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const f = fireworks[i];
    f.life += delta;
    const pos = f.points.geometry.getAttribute('position');
    for (let j = 0; j < pos.count; j++) {
      const vx = f.velocities[j*3+0];
      const vy = f.velocities[j*3+1];
      const vz = f.velocities[j*3+2];
      // integrate
      f.velocities[j*3+1] = vy + gravity * delta;
      pos.array[j*3+0] += vx * delta;
      pos.array[j*3+1] += f.velocities[j*3+1] * delta;
      pos.array[j*3+2] += vz * delta;
    }
    pos.needsUpdate = true;
    const mat = f.points.material;
    mat.opacity = Math.max(0, 1 - (f.life / f.ttl));
    if (f.life >= f.ttl) {
      scene.remove(f.points);
      if (mat.dispose) mat.dispose();
      if (f.points.geometry.dispose) f.points.geometry.dispose();
      fireworks.splice(i, 1);
    }
  }
}

// ---------- Visual helpers ----------
function createVerticalGradientTexture(topHex, bottomHex) {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512; // tall vertical for smooth grad
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  const top = `#${topHex.toString(16).padStart(6,'0')}`;
  const bottom = `#${bottomHex.toString(16).padStart(6,'0')}`;
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  return tex;
}

function createGridTexture(cellSize = 64, line = 2, color = '#1e3a8a', glow = '#5da9ff') {
  const c = document.createElement('canvas');
  c.width = c.height = cellSize;
  const ctx = c.getContext('2d');
  // background transparent so it tints via material color
  ctx.clearRect(0,0,c.width,c.height);
  // glow underlay
  ctx.strokeStyle = glow;
  ctx.lineWidth = line * 2.2;
  ctx.globalAlpha = 0.12;
  // vertical
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, c.height);
  ctx.moveTo(c.width, 0); ctx.lineTo(c.width, c.height);
  ctx.stroke();
  // horizontal
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(c.width, 0);
  ctx.moveTo(0, c.height); ctx.lineTo(c.width, c.height);
  ctx.stroke();
  // crisp core lines
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, c.height);
  ctx.moveTo(c.width, 0); ctx.lineTo(c.width, c.height);
  ctx.moveTo(0, 0); ctx.lineTo(c.width, 0);
  ctx.moveTo(0, c.height); ctx.lineTo(c.width, c.height);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}