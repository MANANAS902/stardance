const canvas = document.getElementById('game');
const context = canvas.getContext('2d');
const statusLabel = document.getElementById('status');
const restartBtn = document.getElementById('restart');
const restartSecondaryBtn = document.getElementById('restart-secondary');
const overlay = document.getElementById('overlay');
const finalMessage = document.getElementById('final-message');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const difficultySlider = document.getElementById('difficulty');
const difficultyValueEl = document.getElementById('difficulty-value');

const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 540;
const GROUND_HEIGHT = 96;
const STORAGE_KEY = 'neon-dash-best-score';

let animationFrame = 0;
let lastTimestamp = 0;
let gameOver = false;
let ready = false;
let score = 0;
let bestScore = Number(localStorage.getItem(STORAGE_KEY) || '0');
let difficulty = Number(difficultySlider?.value || 55) / 100;
let spawnTimer = 0;
let obstacleSeed = 0;

const world = {
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  groundY: DESIGN_HEIGHT - GROUND_HEIGHT,
  speed: 330,
  gravity: 2300,
};

const player = {
  x: 150,
  y: 0,
  width: 34,
  height: 34,
  velocityY: 0,
  onGround: true,
  rotation: 0,
};

let obstacles = [];
let particles = [];
let stars = [];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function formatScore(value) {
  return String(Math.floor(value));
}

function resizeCanvas() {
  const parent = canvas.parentElement;
  const width = parent.clientWidth;
  const cssWidth = width;
  const cssHeight = Math.round(width * (DESIGN_HEIGHT / DESIGN_WIDTH));
  const pixelRatio = window.devicePixelRatio || 1;

  canvas.width = Math.floor(cssWidth * pixelRatio);
  canvas.height = Math.floor(cssHeight * pixelRatio);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  world.width = cssWidth;
  world.height = cssHeight;
  world.groundY = cssHeight - Math.max(72, Math.round(cssHeight * 0.18));
  player.y = world.groundY - player.height;
}

function initStars() {
  stars = Array.from({ length: 48 }, () => ({
    x: Math.random() * world.width,
    y: Math.random() * world.groundY,
    size: rand(1, 3),
    speed: rand(8, 34),
    alpha: rand(0.2, 0.9),
  }));
}

function resetGame() {
  gameOver = false;
  ready = true;
  score = 0;
  spawnTimer = 0;
  obstacleSeed = 0;
  obstacles = [];
  particles = [];
  player.y = world.groundY - player.height;
  player.velocityY = 0;
  player.onGround = true;
  player.rotation = 0;
  overlay.hidden = true;
  statusLabel.textContent = 'Press Space, Up Arrow, or click to jump.';
  renderHud();
}

function renderHud() {
  scoreEl.textContent = formatScore(score);
  bestScoreEl.textContent = formatScore(bestScore);
}

function updateDifficultyFromSlider() {
  difficulty = Number(difficultySlider.value) / 100;
  difficultyValueEl.textContent = String(difficultySlider.value);
}

function jump() {
  if (gameOver) {
    resetGame();
    return;
  }
  if (!ready) {
    ready = true;
  }
  if (!player.onGround) return;

  player.velocityY = -860 - difficulty * 120;
  player.onGround = false;
  statusLabel.textContent = 'Stay in rhythm.';
  for (let i = 0; i < 6; i += 1) {
    particles.push({
      x: player.x + player.width * 0.5,
      y: player.y + player.height,
      vx: rand(-140, -20),
      vy: rand(40, 140),
      life: rand(0.16, 0.32),
    });
  }
}

function spawnObstacle() {
  obstacleSeed += 1;
  const tall = Math.random() > 0.65;
  const width = tall ? rand(28, 42) : rand(34, 70);
  const height = tall ? rand(72, 132) : rand(36, 92);
  obstacles.push({
    x: world.width + 40,
    y: world.groundY - height,
    width,
    height,
    passed: false,
    phase: obstacleSeed % 2,
  });
}

function emitCrashParticles() {
  for (let i = 0; i < 24; i += 1) {
    particles.push({
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
      vx: rand(-320, 320),
      vy: rand(-280, 260),
      life: rand(0.35, 0.7),
      color: Math.random() > 0.5 ? '#7af6ff' : '#ff7ca8',
    });
  }
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  overlay.hidden = false;
  finalMessage.textContent = `You reached ${formatScore(score)} meters.`;
  statusLabel.textContent = 'Crash detected. Press restart or R to run again.';
  bestScore = Math.max(bestScore, score);
  localStorage.setItem(STORAGE_KEY, String(bestScore));
  renderHud();
  emitCrashParticles();
}

function getPlayerBounds() {
  return {
    left: player.x + 4,
    right: player.x + player.width - 4,
    top: player.y + 4,
    bottom: player.y + player.height - 4,
  };
}

function intersectsObstacle(obstacle) {
  const playerBounds = getPlayerBounds();
  return !(
    playerBounds.right < obstacle.x ||
    playerBounds.left > obstacle.x + obstacle.width ||
    playerBounds.bottom < obstacle.y ||
    playerBounds.top > obstacle.y + obstacle.height
  );
}

function updatePlayer(deltaSeconds) {
  player.velocityY += world.gravity * deltaSeconds;
  player.y += player.velocityY * deltaSeconds;

  if (player.y >= world.groundY - player.height) {
    player.y = world.groundY - player.height;
    player.velocityY = 0;
    player.onGround = true;
  }

  if (!player.onGround) {
    player.rotation = clamp(player.rotation + 720 * deltaSeconds, 0, 360);
  } else {
    player.rotation = 0;
  }
}

function updateObstacles(deltaSeconds, distance) {
  const runSpeed = world.speed + distance * 0.15 + difficulty * 240;
  const spawnInterval = clamp(1.24 - difficulty * 0.72, 0.42, 1.1);

  spawnTimer += deltaSeconds;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    if (Math.random() > 0.12 + difficulty * 0.1) {
      spawnObstacle();
    }
  }

  for (const obstacle of obstacles) {
    obstacle.x -= runSpeed * deltaSeconds;
    if (!obstacle.passed && obstacle.x + obstacle.width < player.x) {
      obstacle.passed = true;
      score += 50 + Math.round(20 * difficulty);
    }
    if (intersectsObstacle(obstacle)) {
      endGame();
      return;
    }
  }

  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -80);
}

function updateParticles(deltaSeconds) {
  particles = particles.filter((particle) => {
    particle.life -= deltaSeconds;
    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
    particle.vy += 1200 * deltaSeconds;
    return particle.life > 0;
  });
}

function updateStars(deltaSeconds, distance) {
  const drift = world.speed * 0.12 + distance * 0.03;
  for (const star of stars) {
    star.x -= (drift + star.speed) * deltaSeconds;
    if (star.x < -10) {
      star.x = world.width + rand(0, 60);
      star.y = rand(0, world.groundY * 0.8);
      star.size = rand(1, 3);
      star.alpha = rand(0.2, 0.9);
    }
  }
}

function drawBackground(distance) {
  const gradient = context.createLinearGradient(0, 0, 0, world.height);
  gradient.addColorStop(0, '#081021');
  gradient.addColorStop(1, '#050814');
  context.fillStyle = gradient;
  context.fillRect(0, 0, world.width, world.height);

  context.fillStyle = 'rgba(255,255,255,0.04)';
  for (let x = -((distance * 0.3) % 72); x < world.width + 72; x += 72) {
    context.fillRect(x, 0, 2, world.height);
  }

  for (const star of stars) {
    context.globalAlpha = star.alpha;
    context.fillStyle = '#d9f7ff';
    context.fillRect(star.x, star.y, star.size, star.size);
  }
  context.globalAlpha = 1;

  context.fillStyle = '#091425';
  context.fillRect(0, world.groundY, world.width, world.height - world.groundY);

  context.strokeStyle = 'rgba(122, 246, 255, 0.16)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, world.groundY + 1);
  context.lineTo(world.width, world.groundY + 1);
  context.stroke();

  const waveOffset = -((distance * 0.9) % 40);
  context.fillStyle = 'rgba(122, 246, 255, 0.08)';
  for (let x = waveOffset; x < world.width + 40; x += 40) {
    context.fillRect(x, world.groundY + 18, 20, 2);
  }
}

function drawObstacle(obstacle) {
  const glow = context.createLinearGradient(obstacle.x, obstacle.y, obstacle.x, obstacle.y + obstacle.height);
  glow.addColorStop(0, '#7af6ff');
  glow.addColorStop(1, '#ff7ca8');
  context.fillStyle = glow;
  context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(obstacle.x + 4, obstacle.y + 4, Math.max(4, obstacle.width * 0.18), obstacle.height - 8);
}

function drawPlayer() {
  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;

  context.save();
  context.translate(centerX, centerY);
  context.rotate((player.rotation * Math.PI) / 180);

  const bodyGradient = context.createLinearGradient(-player.width / 2, -player.height / 2, player.width / 2, player.height / 2);
  bodyGradient.addColorStop(0, '#ffe86c');
  bodyGradient.addColorStop(0.5, '#7af6ff');
  bodyGradient.addColorStop(1, '#ff7ca8');

  context.shadowBlur = 20;
  context.shadowColor = '#7af6ff';
  context.fillStyle = bodyGradient;
  context.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);

  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.28)';
  context.fillRect(-player.width / 2 + 5, -player.height / 2 + 5, 8, 8);
  context.fillStyle = 'rgba(0,0,0,0.18)';
  context.fillRect(-player.width / 2 + 12, -player.height / 2 + 12, player.width - 18, player.height - 18);
  context.restore();
}

function drawParticles() {
  for (const particle of particles) {
    context.globalAlpha = clamp(particle.life, 0, 1);
    context.fillStyle = particle.color || '#7af6ff';
    context.fillRect(particle.x, particle.y, 4, 4);
  }
  context.globalAlpha = 1;
}

function drawHUD() {
  context.fillStyle = 'rgba(5, 10, 20, 0.42)';
  context.fillRect(20, 20, 160, 70);
  context.strokeStyle = 'rgba(122, 246, 255, 0.2)';
  context.strokeRect(20, 20, 160, 70);

  context.fillStyle = '#d9f7ff';
  context.font = '700 16px Inter, Segoe UI, sans-serif';
  context.fillText(`Score ${formatScore(score)}`, 34, 48);
  context.fillStyle = '#8ec8ff';
  context.font = '600 13px Inter, Segoe UI, sans-serif';
  context.fillText(`Best ${formatScore(bestScore)}`, 34, 70);
}

function gameLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.033);
  lastTimestamp = timestamp;

  const distance = score / 100;

  if (!gameOver) {
    score += deltaSeconds * (120 + difficulty * 190);
    updatePlayer(deltaSeconds);
    updateObstacles(deltaSeconds, distance);
    updateParticles(deltaSeconds);
    updateStars(deltaSeconds, distance);
    bestScore = Math.max(bestScore, Math.floor(score));
    renderHud();
  } else {
    updateParticles(deltaSeconds);
    updateStars(deltaSeconds, distance);
  }

  drawBackground(distance);
  for (const obstacle of obstacles) {
    drawObstacle(obstacle);
  }
  drawParticles();
  drawPlayer();
  drawHUD();

  if (score > bestScore) {
    localStorage.setItem(STORAGE_KEY, String(Math.floor(score)));
  }

  animationFrame = window.requestAnimationFrame(gameLoop);
}

function handleJumpInput(event) {
  const key = event.key;
  if (key === ' ' || key === 'ArrowUp' || key === 'Spacebar') {
    event.preventDefault();
    jump();
  }
  if (key === 'r' || key === 'R') {
    resetGame();
  }
}

function setup() {
  resizeCanvas();
  initStars();
  updateDifficultyFromSlider();
  renderHud();
  resetGame();

  window.addEventListener('resize', () => {
    resizeCanvas();
    initStars();
    resetGame();
  });

  window.addEventListener('keydown', handleJumpInput);
  window.addEventListener('pointerdown', () => jump());

  restartBtn.addEventListener('click', resetGame);
  restartSecondaryBtn.addEventListener('click', resetGame);
  difficultySlider.addEventListener('input', () => {
    updateDifficultyFromSlider();
    resetGame();
  });

  animationFrame = window.requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', setup);