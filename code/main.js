import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { mazeGrid } from './maze.js';

let scene, camera, renderer, clock, playerVelocity;
let walls = [];
let timer = 60;
let timerInterval;
let gameOver = false;

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

  // Start camera at the maze entrance (first-person-ish). This makes movement visible immediately.
  const playerStartX = 1.5;
  const playerStartZ = 1.5;
  camera.position.set(playerStartX, 1.6, playerStartZ);
  camera.lookAt(new THREE.Vector3(playerStartX, 0, playerStartZ + 1));

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();
  playerVelocity = new THREE.Vector3();

  // Lighting
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(10, 10, 10);
  scene.add(light);

  const ambient = new THREE.AmbientLight(0x404040);
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

  // Controls
  document.addEventListener('keydown', handleKey);
  window.addEventListener('resize', onWindowResize);

  // Add a subtle grid helper for orientation
  const grid = new THREE.GridHelper(Math.max(mazeWidth, mazeDepth) * 2, Math.max(mazeWidth, mazeDepth));
  grid.material.opacity = 0.15;
  grid.material.transparent = true;
  scene.add(grid);
}

function handleKey(e) {
  if (gameOver) return;
  const speed = 0.1;
  let moveX = 0, moveZ = 0;
  if (e.key === 'w') moveZ = -speed;
  if (e.key === 's') moveZ = speed;
  if (e.key === 'a') moveX = -speed;
  if (e.key === 'd') moveX = speed;

  const newPos = camera.position.clone();
  newPos.x += moveX;
  newPos.z += moveZ;

  if (!checkCollision(newPos)) {
    camera.position.copy(newPos);
  }
}

function checkCollision(pos) {
  for (let wall of walls) {
    const dist = wall.position.distanceTo(pos);
    if (dist < 0.8) return true; // Collision range
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
  renderer.render(scene, camera);
}