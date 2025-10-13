import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { mazeGrid } from './maze.js';

let scene, camera, renderer, clock, playerVelocity;
let walls = [];
let timer = 60;
let timerInterval;
let gameOver = false;
// global key state (so animate can read it)
let keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

// POV mode: 'overhead' or 'first'
let pov = 'overhead';

// doors array is global so animate() can update them
let doors = [];
// overhead look offset (camera position - lookAt target) preserved while panning
let overheadOffset = null;
// world tile size (scale)
let tileSize = 2.0;
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
  tileSize = 2.0; // bigger tiles -> bigger maze

  // Default to an overhead camera so the map is visible after Enter
  camera.position.set(mazeWidth / 2, Math.max(mazeWidth, mazeDepth) * 0.9, mazeDepth * 1.2);
  camera.lookAt(new THREE.Vector3(mazeWidth / 2, 0, mazeDepth / 2));

  // Player start (first-person) coordinates (in world coords)
  playerStart.set(1.5 * tileSize, 1.6, 1.5 * tileSize);

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
    const k = e.key.toLowerCase();
    if (k === 'w') keys.forward = true;
    if (k === 's') keys.backward = true;
    if (k === 'a') keys.left = true;
    if (k === 'd') keys.right = true;
    if (k === 'p') {
      // toggle POV
      if (pov === 'overhead') {
        pov = 'first';
        camera.position.set(playerStartX, 1.6, playerStartZ);
        camera.lookAt(new THREE.Vector3(playerStartX, 0, playerStartZ + 1));
      } else {
        pov = 'overhead';
        camera.position.set(mazeWidth / 2, Math.max(mazeWidth, mazeDepth) * 0.9, mazeDepth * 1.2);
        camera.lookAt(new THREE.Vector3(mazeWidth / 2, 0, mazeDepth / 2));
      }
    }
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w') keys.forward = false;
    if (k === 's') keys.backward = false;
    if (k === 'a') keys.left = false;
    if (k === 'd') keys.right = false;
  });

  window.addEventListener('resize', onWindowResize);

  // Add a subtle grid helper for orientation (scaled to tileSize)
  const grid = new THREE.GridHelper(Math.max(mazeWidth, mazeDepth) * tileSize * 2, Math.max(mazeWidth, mazeDepth));
  grid.material.opacity = 0.15;
  grid.material.transparent = true;
  scene.add(grid);

  // set overhead center and offset for panning
  overheadCenter.set((mazeWidth * tileSize) / 2, 0, (mazeDepth * tileSize) / 2);
  overheadOffset = camera.position.clone().sub(new THREE.Vector3(overheadCenter.x, camera.position.y, overheadCenter.z));
}

  // Movement is handled per-frame in animate using keys state

function checkCollision(pos) {
  // slightly smaller collision radius so the player can move through narrow corridors
  const radius = 0.6;
  for (let wall of walls) {
    // Walls may be door meshes — use bounding sphere distance roughly
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
  const moveSpeed = 3.0; // units per second
  const move = new THREE.Vector3();
  // forward/back along -z
  if (typeof keys !== 'undefined') {
    if (keys.forward) move.z -= moveSpeed * delta;
    if (keys.backward) move.z += moveSpeed * delta;
    if (keys.left) move.x -= moveSpeed * delta;
    if (keys.right) move.x += moveSpeed * delta;
  }

  if (move.lengthSq() > 0) {
    // transform movement by camera rotation (so WASD is camera-relative)
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // build right vector
    const right = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
    const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    const worldMove = new THREE.Vector3();
    worldMove.addScaledVector(forward, -move.z);
    worldMove.addScaledVector(right, move.x);

    const newPos = camera.position.clone().add(worldMove);
    if (!checkCollision(newPos)) camera.position.copy(newPos);
  }

  // overhead panning: when in overhead mode, pan the overheadCenter and update camera position
  if (pov === 'overhead') {
    const panSpeed = 4.0; // units per second
    const pan = new THREE.Vector3();
    if (keys.forward) pan.z -= panSpeed * delta;
    if (keys.backward) pan.z += panSpeed * delta;
    if (keys.left) pan.x -= panSpeed * delta;
    if (keys.right) pan.x += panSpeed * delta;
    if (pan.lengthSq() > 0) {
      overheadCenter.add(pan);
      const newCamPos = new THREE.Vector3(overheadCenter.x, overheadCenter.y + overheadOffset.y, overheadCenter.z).add(new THREE.Vector3(overheadOffset.x, 0, overheadOffset.z));
      camera.position.copy(newCamPos);
      camera.lookAt(new THREE.Vector3(overheadCenter.x, 0, overheadCenter.z));
    }
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