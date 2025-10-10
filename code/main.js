let started = false;

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !started) {
    startGame();
    started = true;
  }
});

function startGame() {
  document.getElementById("overlay").style.display = "none";
  initMaze(); // function defined in maze.js
}

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/PointerLockControls.js';
import { mazeGrid } from './maze.js';

let scene, camera, renderer, controls, clock;
let walls = [];
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let timer = 60;
let gameOver = false;
let timerInterval;

// UI elements
const timerDisplay = document.getElementById('timer');
const gameOverText = document.getElementById('game-over');
const restartBtn = document.getElementById('restart');

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(1, 1.7, 1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

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
  const wallGeo = new THREE.BoxGeometry(1, 2, 1);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
  for (let z = 0; z < mazeGrid.length; z++) {
    for (let x = 0; x < mazeGrid[z].length; x++) {
      if (mazeGrid[z][x] === 1) {
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(x, 1, z);
        scene.add(wall);
        walls.push(wall);
      }
    }
  }

  // Pointer lock controls (mouse look)
  controls = new PointerLockControls(camera, document.body);

  document.addEventListener('click', () => {
    if (!gameOver) controls.lock();
  });

  // Movement key listeners
  const onKeyDown = function (event) {
    switch (event.code) {
      case 'KeyW': moveForward = true; break;
      case 'KeyS': moveBackward = true; break;
      case 'KeyA': moveLeft = true; break;
      case 'KeyD': moveRight = true; break;
    }
  };

  const onKeyUp = function (event) {
    switch (event.code) {
      case 'KeyW': moveForward = false; break;
      case 'KeyS': moveBackward = false; break;
      case 'KeyA': moveLeft = false; break;
      case 'KeyD': moveRight = false; break;
    }
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Timer
  startTimer();

  window.addEventListener('resize', onWindowResize);
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

function checkCollision(pos) {
  for (let wall of walls) {
    const dist = wall.position.distanceTo(pos);
    if (dist < 0.8) return true;
  }
  return false;
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;

  direction.z = Number(moveForward) - Number(moveBackward);
  direction.x = Number(moveRight) - Number(moveLeft);
  direction.normalize();

  if (moveForward || moveBackward) velocity.z -= direction.z * 10.0 * delta;
  if (moveLeft || moveRight) velocity.x -= direction.x * 10.0 * delta;

  const moveX = velocity.x * delta;
  const moveZ = velocity.z * delta;

  const newPos = camera.position.clone();
  const forward = new THREE.Vector3();
  controls.getDirection(forward);

  newPos.addScaledVector(forward, -moveZ);
  newPos.addScaledVector(new THREE.Vector3().crossVectors(forward, camera.up), moveX);

  if (!checkCollision(newPos)) camera.position.copy(newPos);

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}