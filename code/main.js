import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { mazeGrid } from './maze.js';

let scene, camera, renderer, clock, playerVelocity;
let walls = [];
let timer = 60;
let timerInterval;
let gameOver = false;
// global key state (so animate can read it)
let keys = {
  forward: false,      // ArrowUp
  backward: false,     // ArrowDown
  turnLeft: false,     // ArrowLeft
  turnRight: false,    // ArrowRight
};

// POV mode: 'overhead' or 'first'
let pov = 'overhead';

// Simple Roblox-like character
let player;            // THREE.Group character root
let playerYaw = 0;     // rotation around Y (radians)
const playerSize = {   // half-extents for collision box
  x: 0.45, // world units; scaled later by tileSize in create
  y: 0.9,
  z: 0.45
};
let headHeight = 1.6;  // approximate camera eye level

// doors array is global so animate() can update them
let doors = [];
// overhead look offset (camera position - lookAt target) preserved while panning
let overheadOffset = null;
// world tile size (scale)
let tileSize = 3.0;
// Player speed in tiles per second (tweak this to change movement speed)
const PLAYER_SPEED_TPS = 3.5;
// overhead center in world coords
let overheadCenter = new THREE.Vector3(0,0,0);
// player start in world coords
let playerStart = new THREE.Vector3(0,1.6,0);

// UI elements
const timerDisplay = document.getElementById('timer');
const gameOverText = document.getElementById('game-over');
const restartBtn = document.getElementById('restart');

init();
animate();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  // Compute maze size and tile size (scale) to make the maze larger
  const mazeWidth = mazeGrid[0].length;
  const mazeDepth = mazeGrid.length;
  tileSize = 3.0; // bigger tiles -> bigger maze

  // Default to an overhead camera using world units (tileSize)
  const worldCenterX = (mazeWidth * tileSize) / 2;
  const worldCenterZ = (mazeDepth * tileSize) / 2;
  const mazeMax = Math.max(mazeWidth, mazeDepth) * tileSize;
  // Increase the overhead distance for a wider view
  const overheadHeight = mazeMax * 1.4; // previously ~1.1x
  const overheadDepth = mazeMax * 0.7;  // previously ~0.3x
  camera.position.set(worldCenterX, overheadHeight, worldCenterZ + overheadDepth);
  camera.lookAt(new THREE.Vector3(worldCenterX, 0, worldCenterZ));

  // Player start (first-person) coordinates (in world coords)
  playerStart.set(1.5 * tileSize, 1.1, 1.5 * tileSize);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000);
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();
  playerVelocity = new THREE.Vector3();

  // Lighting
  // Better lighting: directional + ambient for contrast
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  const ambient = new THREE.AmbientLight(0x303040, 0.9);
  scene.add(ambient);

  // Floor scaled to maze size
  const floorGeo = new THREE.PlaneGeometry(mazeWidth * tileSize * 1.5, mazeDepth * tileSize * 1.5);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((mazeWidth * tileSize) / 2, 0, (mazeDepth * tileSize) / 2);
  scene.add(floor);

  // Maze walls
  // Make a slightly taller wall and a professional light-blue material
  const wallGeo = new THREE.BoxGeometry(tileSize, 2.2, tileSize);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x68b0ff, // light blue
    roughness: 0.5,
    metalness: 0.05,
  });

  // Prepare doors: choose two tile coordinates (entrance top, exit right)
  // We'll clear those cells in the grid so the wall loop doesn't create a blocking wall, then create door meshes there.
  const entranceTile = { x: 1, z: 0 };
  const exitTile = { x: mazeWidth - 2, z: mazeDepth - 1 };
  // modify the imported mazeGrid in-memory to remove the blocking wall where doors will be placed
  if (mazeGrid[entranceTile.z] && typeof mazeGrid[entranceTile.z][entranceTile.x] !== 'undefined') {
    mazeGrid[entranceTile.z][entranceTile.x] = 0;
  }
  if (mazeGrid[exitTile.z] && typeof mazeGrid[exitTile.z][exitTile.x] !== 'undefined') {
    mazeGrid[exitTile.z][exitTile.x] = 0;
  }

  for (let z = 0; z < mazeGrid.length; z++) {
    for (let x = 0; x < mazeGrid[z].length; x++) {
      if (mazeGrid[z][x] === 1) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        // center walls on tile centers and scale by tileSize
        wall.position.set((x + 0.5) * tileSize, 1.1, (z + 0.5) * tileSize);
        scene.add(wall);
        walls.push(wall);
      }
    }
  }

  // Create player character (blocky Roblox-style)
  createPlayer();

  // Door definitions
  // doors array (global) already declared; clear and reuse
  doors = [];
  const doorHeight = 2.0;
  const doorThickness = tileSize * 0.2;
  const doorWidth = tileSize * 0.9;

  function makeDoor(tileX, tileZ, orientation = 'ns') {
    const geom = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
    const mat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6 });
    const door = new THREE.Mesh(geom, mat);
    // place at tile center
    door.position.set((tileX + 0.5) * tileSize, doorHeight / 2, (tileZ + 0.5) * tileSize);
    if (orientation === 'ew') door.rotation.y = Math.PI / 2;
    door.userData = { opening: false, opened: false };
    scene.add(door);
    doors.push(door);
    walls.push(door); // treat door as blocking until opened
    return door;
  }

  // create entrance and exit doors
  const entranceDoor = makeDoor(entranceTile.x, entranceTile.z, 'ns');
  const exitDoor = makeDoor(exitTile.x, exitTile.z, 'ns');

  // Interaction: press 'E' to open nearby door
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e') {
      // find nearest door within interaction distance
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
        // start opening animation
        closest.userData.opening = true;
      }
    }
  });

  // Debug: log how many walls were created
  console.log('Maze size:', mazeWidth, 'x', mazeDepth, '- walls:', walls.length);

  // Timer
  startTimer();

  // Controls: use continuous movement (key state + per-frame) instead of single keydown
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowUp') keys.forward = true;
    if (k === 'ArrowDown') keys.backward = true;
    if (k === 'ArrowLeft') keys.turnLeft = true;
    if (k === 'ArrowRight') keys.turnRight = true;
    if (k === 'p') {
      // toggle POV
      if (pov === 'overhead') {
        pov = 'first';
        // snap camera to player's head
        if (!player) return;
        camera.position.set(player.position.x, player.position.y + headHeight - 0.1, player.position.z);
        const f = forwardFromYaw();
        camera.lookAt(new THREE.Vector3().addVectors(camera.position, f));
      } else {
        pov = 'overhead';
        // Re-establish overhead offset using world units and increased distance
        const mazeMaxLocal = Math.max(mazeWidth, mazeDepth) * tileSize;
        const height = mazeMaxLocal * 1.4;
        const depth = mazeMaxLocal * 0.7;
        overheadOffset = new THREE.Vector3(0, height, depth);
        const camPos = overheadCenter.clone().add(overheadOffset);
        camera.position.copy(camPos);
        camera.lookAt(new THREE.Vector3(overheadCenter.x, 0, overheadCenter.z));
      }
    }
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowUp') keys.forward = false;
    if (k === 'ArrowDown') keys.backward = false;
    if (k === 'ArrowLeft') keys.turnLeft = false;
    if (k === 'ArrowRight') keys.turnRight = false;
  });


  window.addEventListener('resize', onWindowResize);

  // Add a subtle grid helper for orientation (scaled to tileSize)
  const gridSize = Math.max(mazeWidth, mazeDepth) * tileSize * 1.5;
  const gridDivisions = Math.max(mazeWidth, mazeDepth);
  const grid = new THREE.GridHelper(gridSize, gridDivisions);
  grid.material.opacity = 0.15;
  grid.material.transparent = true;
  // Center the grid on the maze/floor and lift slightly to avoid z-fighting
  grid.position.set(worldCenterX, 0.01, worldCenterZ);
  grid.material.depthWrite = false;
  scene.add(grid);

  // set overhead center and offset for panning (use simple world-unit offset)
  overheadCenter.set((mazeWidth * tileSize) / 2, 0, (mazeDepth * tileSize) / 2);
  // Keep a fixed offset so camera = overheadCenter + overheadOffset
  overheadOffset = new THREE.Vector3(0, overheadHeight, overheadDepth);
}

  // Movement is handled per-frame in animate using keys state

function getPlayerBoxAt(pos) {
  const halfX = playerSize.x * tileSize;
  const halfZ = playerSize.z * tileSize;
  const halfY = playerSize.y; // height not scaled by tileSize (world units already)
  const min = new THREE.Vector3(pos.x - halfX, pos.y - halfY, pos.z - halfZ);
  const max = new THREE.Vector3(pos.x + halfX, pos.y + halfY, pos.z + halfZ);
  return new THREE.Box3(min, max);
}

function collidesAt(pos) {
  const pBox = getPlayerBoxAt(pos);
  const wallBox = new THREE.Box3();
  for (const w of walls) {
    wallBox.setFromObject(w);
    if (pBox.intersectsBox(wallBox)) return true;
  }
  return false;
}

function movePlayer(delta) {
  // rotate with arrow keys
  const turnSpeed = 2.2; // rad/sec
  if (keys.turnLeft) playerYaw += turnSpeed * delta;   // left arrow turns left
  if (keys.turnRight) playerYaw -= turnSpeed * delta;  // right arrow turns right
  player.rotation.y = playerYaw;

  // movement: forward/back only (no strafing)
  const moveSpeed = tileSize * PLAYER_SPEED_TPS; // tiles/sec -> world units/sec
  let world = new THREE.Vector3();
  if (keys.forward) {
    world.x -= Math.sin(playerYaw) * moveSpeed * delta;
    world.z -= Math.cos(playerYaw) * moveSpeed * delta;
  }
  if (keys.backward) {
    world.x += Math.sin(playerYaw) * moveSpeed * delta;
    world.z += Math.cos(playerYaw) * moveSpeed * delta;
  }
  if (world.lengthSq() === 0) return;

  const next = player.position.clone();
  // axis-separated resolution
  next.x += world.x;
  if (collidesAt(new THREE.Vector3(next.x, player.position.y, next.z))) {
    next.x = player.position.x;
  }
  next.z += world.z;
  if (collidesAt(new THREE.Vector3(next.x, player.position.y, next.z))) {
    next.z = player.position.z;
  }
  player.position.copy(next);
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

restartBtn.addEventListener('click', () => {
  window.location.reload();
});

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  // update movement based on key state
  const delta = clock.getDelta();
  // Move the player (Arrow keys). Camera behavior differs by POV.
  movePlayer(delta);

  // overhead panning: when in overhead mode, pan the overheadCenter and update camera position
  // Overhead view no longer pans the map with keys; it stays centered on the board

  // Update camera position in first-person to follow player's head
  if (pov === 'first') {
    camera.position.set(player.position.x, player.position.y + headHeight - 0.1, player.position.z);
    const f = forwardFromYaw();
    const lookTarget = new THREE.Vector3().addVectors(camera.position, f);
    camera.lookAt(lookTarget);
  }

  // update doors (animate opening)
  for (const d of doors) {
    if (d.userData.opening && !d.userData.opened) {
      // slide upward
      d.position.y += 1.2 * delta; // open speed
      if (d.position.y > 3.5) {
        d.userData.opened = true;
        d.userData.opening = false;
        // remove from walls list so collision no longer checks it
        const idx = walls.indexOf(d);
        if (idx !== -1) walls.splice(idx, 1);
      }
    }
  }

  renderer.render(scene, camera);
}

// Helpers
function forwardFromYaw() {
  return new THREE.Vector3(Math.sin(playerYaw), 0, Math.cos(playerYaw)).normalize();
}

// removed mouse-look pitch helper

function createPlayer() {
  const group = new THREE.Group();
  // scale dimensions by tile size for width/depth
  const torsoW = tileSize * 0.6, torsoH = 0.9, torsoD = tileSize * 0.35;
  const limbW = tileSize * 0.22, limbD = tileSize * 0.22, limbH = 0.8;
  const headSize = tileSize * 0.35;

  const matTorso = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const matLimb  = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const matHead  = new THREE.MeshStandardMaterial({ color: 0xdeb887, roughness: 0.7 });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), matTorso);
  torso.position.y = torsoH / 2 + 0.2;
  group.add(torso);
  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(headSize, headSize, headSize), matHead);
  head.position.y = torso.position.y + torsoH / 2 + headSize / 2 + 0.05;
  group.add(head);
  // Arms
  const armL = new THREE.Mesh(new THREE.BoxGeometry(limbW, limbH, limbD), matTorso);
  const armR = armL.clone();
  armL.position.set(-torsoW / 2 - limbW / 2, torso.position.y + 0.05, 0);
  armR.position.set( torsoW / 2 + limbW / 2, torso.position.y + 0.05, 0);
  group.add(armL, armR);
  // Legs
  const legL = new THREE.Mesh(new THREE.BoxGeometry(limbW, limbH, limbD), matLimb);
  const legR = legL.clone();
  legL.position.set(-limbW * 0.6, limbH / 2, 0);
  legR.position.set( limbW * 0.6, limbH / 2, 0);
  group.add(legL, legR);

  group.position.copy(playerStart);
  scene.add(group);
  player = group;
  // collision box tuning
  headHeight = head.position.y; // eye height roughly
  playerYaw = 0; // face +Z initially
}