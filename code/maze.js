function initMaze() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const light = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(light);

  // Maze grid (your own version goes here)
  const mazeGrid = [
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,1,0,0,0,1],
    [1,0,1,0,1,0,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,1,0,1],
    [1,0,1,1,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,1,0,1,0,1],
    [1,0,1,1,1,0,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,1,0,1],
    [1,0,1,0,1,1,1,1,1,0,1],
    [1,0,0,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1],
  ];

  const wallSize = 1;
  const wallGeometry = new THREE.BoxGeometry(wallSize, wallSize, wallSize);
  const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x3333ff });

  // Loop through grid to create walls
  for (let row = 0; row < maze.length; row++) {
    for (let col = 0; col < maze[row].length; col++) {
      if (maze[row][col] === 1) {
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.x = col - maze[row].length / 2;
        wall.position.y = 0;
        wall.position.z = row - maze.length / 2;
        scene.add(wall);
      }
    }
  }

  // Camera setup
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  animate();
}