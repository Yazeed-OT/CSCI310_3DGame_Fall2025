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

// UI elements
const timerDisplay = document.getElementById('timer');
const gameOverText = document.getElementById('game-over');
const restartBtn = document.getElementById('restart');

init();
animate();

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  // Compute maze size
  const mazeWidth = mazeGrid[0].length;
  const mazeDepth = mazeGrid.length;

  // Default to an overhead camera so the map is visible after Enter
  camera.position.set(mazeWidth / 2, Math.max(mazeWidth, mazeDepth) * 0.9, mazeDepth * 1.2);
  camera.lookAt(new THREE.Vector3(mazeWidth / 2, 0, mazeDepth / 2));

  // Player start (first-person) coordinates
  const playerStartX = 1.5;
  const playerStartZ = 1.5;

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

  // Floor
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Maze walls
  // Make a slightly taller wall and a professional light-blue material
  const wallGeo = new THREE.BoxGeometry(1, 2.2, 1);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x68b0ff, // light blue
    roughness: 0.5,
    metalness: 0.05,
  });

  for (let z = 0; z < mazeGrid.length; z++) {
    for (let x = 0; x < mazeGrid[z].length; x++) {
      if (mazeGrid[z][x] === 1) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        // center walls on tile centers
        wall.position.set(x + 0.5, 1.1, z + 0.5);
        scene.add(wall);
        walls.push(wall);
      }
    }
  }

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

  // Add a subtle grid helper for orientation
  const grid = new THREE.GridHelper(Math.max(mazeWidth, mazeDepth) * 2, Math.max(mazeWidth, mazeDepth));
  grid.material.opacity = 0.15;
  grid.material.transparent = true;
  scene.add(grid);
}

  // Movement is handled per-frame in animate using keys state

function checkCollision(pos) {
  // slightly smaller collision radius so the player can move through narrow corridors
  const radius = 0.6;
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

  renderer.render(scene, camera);
}