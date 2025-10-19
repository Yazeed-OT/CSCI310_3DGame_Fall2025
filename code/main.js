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
let doors = [];
let overheadOffset = null;
let tileSize = 3.5; // slightly bigger tiles for scale
let overheadCenter = new THREE.Vector3(0, 0, 0);
let playerStart = new THREE.Vector3(0, 1.6, 0);

// Camera tuning
const FOV_DEGREES = 60; // was 75 (narrower FOV = closer look)
const OVERHEAD_HEIGHT_SCALE = 0.9; // was 1.2 (closer)
const OVERHEAD_DEPTH_SCALE = 0.5; // was 0.65 (closer)
const OVERHEAD_LOOK_AT_Y = -10.0; // aim lower to move maze further up in frame

// Enable console diagnostics only when URL has ?debug
const DEBUG = new URLSearchParams(window.location.search).has('debug');

// Debug overlay elements and helpers
let _debugEl = null;
function ensureDebugOverlay() {
  if (!DEBUG) return;
  if (_debugEl) return _debugEl;
  _debugEl = document.createElement('div');
  _debugEl.id = 'debug-overlay';
  _debugEl.style.cssText = [
    'position:fixed',
    'top:60px',
    'left:12px',
    'z-index:9999',
    'font:12px/1.4 monospace',
    'background:rgba(10,10,16,0.7)',
    'border:1px solid rgba(120,160,255,0.35)',
    'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
    'border-radius:8px',
    'padding:8px 10px',
    'color:#cfe1ff',
    'max-width:38ch',
    'white-space:pre-wrap'
  ].join(';');
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
const gameOverText = document.getElementById('game-over');
const restartBtn = document.getElementById('restart');

init();
animate();

function init() {
  scene = new THREE.Scene();

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
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  // Lighting
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  const ambient = new THREE.AmbientLight(0x303040, 0.9);
  scene.add(ambient);

  // Floor (match maze bounds exactly)
  const floorGeo = new THREE.PlaneGeometry(mazeWidth * tileSize, mazeDepth * tileSize);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0f });
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

  // Doors
  const doorHeight = 2.8;
  const doorThickness = tileSize * 0.2;
  const doorWidth = tileSize * 0.9;

  function makeDoor(tileX, tileZ, orientation = 'ns') {
    const geom = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
    const mat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6 });
    const door = new THREE.Mesh(geom, mat);
    door.position.set((tileX + 0.5) * tileSize, doorHeight / 2, (tileZ + 0.5) * tileSize);
    if (orientation === 'ew') door.rotation.y = Math.PI / 2;
    door.userData = { opening: false, opened: false };
    scene.add(door);
    doors.push(door);
    walls.push(door);
    return door;
  }

  makeDoor(entranceTile.x, entranceTile.z, 'ns');
  makeDoor(exitTile.x, exitTile.z, 'ns');

  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e') {
      const pos = camera.position;
      let closest = null;
      let closestDist = Infinity;
      for (const d of doors) {
        if (d.userData.opened) continue;
        const dist = d.position.distanceTo(pos);
        if (dist < closestDist) {
          closestDist = dist;
          closest = d;
        }
      }
      if (closest && closestDist < tileSize * 1.4) {
        closest.userData.opening = true;
      }
    }
  });

  startTimer();

  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
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
    // Reset (reload)
    if (k === 'r') window.location.reload();
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
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
    pov = 'first';
    camera.position.set(playerStart.x, playerStart.y, playerStart.z);
    camera.lookAt(new THREE.Vector3(playerStart.x, 0, playerStart.z + 1));
  } else {
    pov = 'overhead';
    overheadOffset = new THREE.Vector3(0, height, depth);
    const camPos = overheadCenter.clone().add(overheadOffset);
    camera.position.copy(camPos);
    camera.lookAt(new THREE.Vector3(overheadCenter.x, OVERHEAD_LOOK_AT_Y, overheadCenter.z));
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

function checkCollision(pos) {
  const radius = 0.7;
  for (let wall of walls) {
    const dist = wall.position.distanceTo(pos);
    if (dist < radius) return true;
  }
  return false;
}

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
}

restartBtn.addEventListener('click', () => window.location.reload());

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
  const moveSpeed = 3.2;
  const move = new THREE.Vector3();
  if (keys.forward) move.z -= moveSpeed * delta;
  if (keys.backward) move.z += moveSpeed * delta;
  if (keys.left) move.x -= moveSpeed * delta;
  if (keys.right) move.x += moveSpeed * delta;

  if (move.lengthSq() > 0) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const right = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
    const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const worldMove = new THREE.Vector3();
    worldMove.addScaledVector(forward, -move.z);
    worldMove.addScaledVector(right, move.x);
    const newPos = camera.position.clone().add(worldMove);
    if (!checkCollision(newPos)) camera.position.copy(newPos);
  }

  if (pov === 'overhead') {
    const panSpeed = tileSize * 1.8;
    const pan = new THREE.Vector3();
    if (keys.forward) pan.z -= panSpeed * delta;
    if (keys.backward) pan.z += panSpeed * delta;
    if (keys.left) pan.x -= panSpeed * delta;
    if (keys.right) pan.x += panSpeed * delta;
    if (pan.lengthSq() > 0) {
      overheadCenter.add(pan);
      const newCamPos = overheadCenter.clone().add(overheadOffset);
      camera.position.copy(newCamPos);
      camera.lookAt(new THREE.Vector3(overheadCenter.x, 0, overheadCenter.z));
    }
  }

  for (const d of doors) {
    if (d.userData.opening && !d.userData.opened) {
      d.position.y += 1.4 * delta;
      if (d.position.y > 4.0) {
        d.userData.opened = true;
        d.userData.opening = false;
        const idx = walls.indexOf(d);
        if (idx !== -1) walls.splice(idx, 1);
      }
    }
  }

  renderer.render(scene, camera);
}