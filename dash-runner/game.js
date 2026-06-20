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
const LEVEL_GOAL_SCORE = 6000;
const STORAGE_KEY = 'pulse-runner-best-score';

const world = {
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  groundY: DESIGN_HEIGHT - GROUND_HEIGHT,
  speed: 320,
  gravity: 2400,
};

const player = {
  x: 156,
  y: 0,
  width: 36,
  height: 36,
  velocityY: 0,
  onGround: true,
  rotation: 0,
};

let animationFrame = 0;
let lastTimestamp = 0;
let started = false;
let gameOver = false;
let levelComplete = false;
let score = 0;
let bestScore = Number(localStorage.getItem(STORAGE_KEY) || '0');
let difficulty = Number(difficultySlider.value) / 100;
let spawnTimer = 0;
let obstacleSeed = 0;
let obstacles = [];
let particles = [];
let stars = [];
let initialized = false;
let audioContext = null;
let masterGain = null;
let musicStartTime = 0;
let nextBeatTime = 0;
let beatIndex = 0;
let audioReady = false;

const MUSIC_BPM = 132;
const BEAT_DURATION = 60 / MUSIC_BPM;
const MUSIC_PATTERN = [0, 3, 5, 7, 5, 3, 10, 7];

function ensureAudio() {
  if (audioContext) return;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return;

  audioContext = new AudioContextCtor();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.08;
  masterGain.connect(audioContext.destination);
  musicStartTime = audioContext.currentTime + 0.08;
  nextBeatTime = musicStartTime;
  beatIndex = 0;
  audioReady = true;
}

function resumeAudio() {
  ensureAudio();
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function createNoiseBuffer(durationSeconds) {
  const sampleRate = audioContext.sampleRate;
  const frameCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    channelData[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

function playKick(time) {
  if (!audioContext || !masterGain) return;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(150, time);
  oscillator.frequency.exponentialRampToValueAtTime(48, time + 0.12);
  gainNode.gain.setValueAtTime(0.8, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
  oscillator.connect(gainNode);
  gainNode.connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + 0.18);
}

function playSnare(time) {
  if (!audioContext || !masterGain) return;

  const noiseSource = audioContext.createBufferSource();
  const noiseFilter = audioContext.createBiquadFilter();
  const gainNode = audioContext.createGain();
  noiseSource.buffer = createNoiseBuffer(0.18);
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 1600;
  gainNode.gain.setValueAtTime(0.32, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(gainNode);
  gainNode.connect(masterGain);
  noiseSource.start(time);
  noiseSource.stop(time + 0.18);
}

function playHat(time) {
  if (!audioContext || !masterGain) return;

  const noiseSource = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  noiseSource.buffer = createNoiseBuffer(0.05);
  filter.type = 'highpass';
  filter.frequency.value = 6000;
  gainNode.gain.setValueAtTime(0.12, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  noiseSource.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(masterGain);
  noiseSource.start(time);
  noiseSource.stop(time + 0.05);
}

function playJumpNote(time) {
  if (!audioContext || !masterGain) return;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const noteSequence = [523.25, 659.25, 783.99, 659.25];
  const noteIndex = Math.floor(score / 500) % noteSequence.length;

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(noteSequence[noteIndex], time);
  oscillator.frequency.exponentialRampToValueAtTime(noteSequence[noteIndex] * 1.5, time + 0.11);
  gainNode.gain.setValueAtTime(0.22, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
  oscillator.connect(gainNode);
  gainNode.connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + 0.15);
}

function scheduleMusic() {
  if (!audioReady || !audioContext) return;

  const horizon = audioContext.currentTime + 0.18;
  while (nextBeatTime < horizon) {
    const beatInBar = beatIndex % 4;
    const note = MUSIC_PATTERN[beatIndex % MUSIC_PATTERN.length];
    const noteTime = nextBeatTime;

    if (beatInBar === 0) {
      playKick(noteTime);
      playJumpNote(noteTime);
    } else if (beatInBar === 2) {
      playSnare(noteTime);
    } else {
      playHat(noteTime);
    }

    if (noteIndexFromScore() !== note) {
      playMelodyTone(noteTime, note);
    } else {
      playMelodyTone(noteTime, note + 12);
    }

    beatIndex += 1;
    nextBeatTime += BEAT_DURATION;
  }
}

function noteIndexFromScore() {
  return Math.floor(score / 250) % 12;
}

function playMelodyTone(time, semitoneOffset) {
  if (!audioContext || !masterGain) return;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const baseFrequency = 220;
  const frequency = baseFrequency * Math.pow(2, semitoneOffset / 12);

  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(frequency, time);
  gainNode.gain.setValueAtTime(0.06, time);
  gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
  oscillator.connect(gainNode);
  gainNode.connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + 0.24);
}

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
  const height = Math.round(width * (DESIGN_HEIGHT / DESIGN_WIDTH));
  const pixelRatio = window.devicePixelRatio || 1;

  canvas.width = Math.floor(width * pixelRatio);
  canvas.height = Math.floor(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  world.width = width;
  world.height = height;
  world.groundY = height - Math.max(72, Math.round(height * 0.18));

  if (!started || gameOver) {
    player.y = world.groundY - player.height;
  } else {
    player.y = clamp(player.y, 0, world.groundY - player.height);
  }
}

function createStars() {
  stars = Array.from({ length: 54 }, () => ({
    x: Math.random() * world.width,
    y: Math.random() * (world.groundY * 0.78),
    size: rand(1, 3),
    speed: rand(8, 40),
    alpha: rand(0.18, 0.9),
  }));
}

function renderHud() {
  scoreEl.textContent = formatScore(score);
  bestScoreEl.textContent = formatScore(bestScore);
}

function updateDifficulty() {
  difficulty = Number(difficultySlider.value) / 100;
  difficultyValueEl.textContent = difficultySlider.value;
}

function resetGame() {
  started = false;
  gameOver = false;
  levelComplete = false;
  score = 0;
  spawnTimer = 0;
  obstacleSeed = 0;
  obstacles = [];
  particles = [];
  player.velocityY = 0;
  player.onGround = true;
  player.rotation = 0;
  player.y = world.groundY - player.height;
  overlay.hidden = true;
  overlay.querySelector('.overlay-tag').textContent = 'Run ended';
  overlay.querySelector('h2').textContent = 'Crash detected';
  finalMessage.textContent = 'You hit an obstacle.';
  restartBtn.textContent = 'Run Again';
  restartSecondaryBtn.textContent = 'Restart Run';
  statusLabel.textContent = 'Press Space, Up Arrow, or tap to start jumping.';
  if (audioContext) {
    musicStartTime = audioContext.currentTime + 0.08;
    nextBeatTime = musicStartTime;
    beatIndex = 0;
  }
  renderHud();
}

function completeLevel() {
  if (gameOver) return;

  gameOver = true;
  levelComplete = true;
  obstacles = [];
  overlay.hidden = false;
  overlay.querySelector('.overlay-tag').textContent = 'Level complete';
  overlay.querySelector('h2').textContent = 'Finish reached';
  finalMessage.textContent = 'You cleared the level.';
  restartBtn.textContent = 'Play Again';
  restartSecondaryBtn.textContent = 'Play Again';
  statusLabel.textContent = 'Level complete. Press restart or R to play again.';

  bestScore = Math.max(bestScore, Math.floor(score));
  localStorage.setItem(STORAGE_KEY, String(bestScore));
  renderHud();
}

function jump() {
  resumeAudio();

  if (gameOver) {
    resetGame();
    return;
  }

  if (!started) {
    started = true;
    statusLabel.textContent = 'Keep the rhythm and avoid the spikes.';
  }

  if (!player.onGround) return;

  player.velocityY = -860 - difficulty * 110;
  player.onGround = false;

  if (audioContext && audioReady) {
    playJumpNote(audioContext.currentTime + 0.01);
  }

  for (let index = 0; index < 8; index += 1) {
    particles.push({
      x: player.x + player.width / 2,
      y: player.y + player.height,
      vx: rand(-160, -30),
      vy: rand(40, 160),
      life: rand(0.16, 0.34),
      color: index % 2 === 0 ? '#66f0ff' : '#ff7ca8',
    });
  }
}

function spawnObstacle() {
  obstacleSeed += 1;
  const spawnPlatform = obstacleSeed % 4 === 0;

  if (spawnPlatform) {
    obstacles.push({
      x: world.width + 48,
      y: world.groundY - rand(70, 110),
      width: rand(150, 230),
      height: rand(14, 18),
      type: 'platform',
      passed: false,
    });
    return;
  }

  const spike = Math.random() > 0.55;
  const width = spike ? rand(26, 36) : rand(34, 68);
  const height = spike ? rand(44, 78) : rand(36, 102);

  obstacles.push({
    x: world.width + 48,
    y: world.groundY - height,
    width,
    height,
    type: spike ? 'spike' : 'block',
    passed: false,
  });
}

function crash() {
  if (gameOver) return;

  gameOver = true;
  overlay.hidden = false;
  finalMessage.textContent = `You reached ${formatScore(score)} meters.`;
  statusLabel.textContent = 'Crash detected. Press restart or R to try again.';

  bestScore = Math.max(bestScore, Math.floor(score));
  localStorage.setItem(STORAGE_KEY, String(bestScore));
  renderHud();

  for (let index = 0; index < 28; index += 1) {
    particles.push({
      x: player.x + player.width / 2,
      y: player.y + player.height / 2,
      vx: rand(-320, 320),
      vy: rand(-260, 260),
      life: rand(0.28, 0.68),
      color: index % 3 === 0 ? '#ff7ca8' : '#66f0ff',
    });
  }
}

function getPlayerBounds() {
  return {
    left: player.x + 4,
    right: player.x + player.width - 4,
    top: player.y + 4,
    bottom: player.y + player.height - 4,
  };
}

function intersects(obstacle) {
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

  if (player.onGround) {
    player.rotation = 0;
  } else {
    player.rotation = clamp(player.rotation + 760 * deltaSeconds, 0, 360);
  }
}

function updateObstacles(deltaSeconds, distanceMeters) {
  if (levelComplete) return;

  const runSpeed = world.speed + difficulty * 220 + distanceMeters * 0.16;
  const spawnInterval = clamp(1.18 - difficulty * 0.68, 0.38, 1.0);

  spawnTimer += deltaSeconds;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    if (Math.random() > 0.1 + difficulty * 0.08) {
      spawnObstacle();
    }
  }

  for (const obstacle of obstacles) {
    obstacle.x -= runSpeed * deltaSeconds;

    if (!obstacle.passed && obstacle.x + obstacle.width < player.x) {
      obstacle.passed = true;
      score += 50 + Math.round(20 * difficulty);
    }

    if (obstacle.type === 'platform') {
      const previousBottom = player.y + player.height - player.velocityY * deltaSeconds;
      const currentBottom = player.y + player.height;
      const horizontalOverlap = player.x + player.width > obstacle.x && player.x < obstacle.x + obstacle.width;
      const landedFromAbove = player.velocityY >= 0 && previousBottom <= obstacle.y + 10 && currentBottom >= obstacle.y;

      if (landedFromAbove && horizontalOverlap) {
        player.y = obstacle.y - player.height;
        player.velocityY = 0;
        player.onGround = true;
        continue;
      }
    }

    if (intersects(obstacle)) {
      crash();
      break;
    }
  }

  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -120);
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

function updateStars(deltaSeconds, distanceMeters) {
  const drift = world.speed * 0.12 + distanceMeters * 0.03;

  for (const star of stars) {
    star.x -= (drift + star.speed) * deltaSeconds;
    if (star.x < -12) {
      star.x = world.width + rand(0, 60);
      star.y = rand(0, world.groundY * 0.8);
      star.size = rand(1, 3);
      star.alpha = rand(0.18, 0.9);
    }
  }
}

function drawBackground(distanceMeters) {
  const gradient = context.createLinearGradient(0, 0, 0, world.height);
  gradient.addColorStop(0, '#090f1f');
  gradient.addColorStop(0.55, '#070b16');
  gradient.addColorStop(1, '#04060c');
  context.fillStyle = gradient;
  context.fillRect(0, 0, world.width, world.height);

  context.fillStyle = 'rgba(255,255,255,0.04)';
  const gridOffset = -((distanceMeters * 28) % 72);
  for (let x = gridOffset; x < world.width + 72; x += 72) {
    context.fillRect(x, 0, 2, world.height);
  }

  for (const star of stars) {
    context.globalAlpha = star.alpha;
    context.fillStyle = '#dff7ff';
    context.fillRect(star.x, star.y, star.size, star.size);
  }
  context.globalAlpha = 1;

  const hillGradient = context.createLinearGradient(0, world.groundY - 48, 0, world.height);
  hillGradient.addColorStop(0, '#0b1630');
  hillGradient.addColorStop(1, '#060911');
  context.fillStyle = hillGradient;
  context.fillRect(0, world.groundY, world.width, world.height - world.groundY);

  context.strokeStyle = 'rgba(102, 240, 255, 0.18)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, world.groundY + 1);
  context.lineTo(world.width, world.groundY + 1);
  context.stroke();

  const pulseOffset = -((distanceMeters * 84) % 44);
  context.fillStyle = 'rgba(102, 240, 255, 0.09)';
  for (let x = pulseOffset; x < world.width + 44; x += 44) {
    context.fillRect(x, world.groundY + 20, 18, 2);
  }
}

function drawObstacle(obstacle) {
  if (obstacle.type === 'platform') {
    const platformGradient = context.createLinearGradient(obstacle.x, obstacle.y, obstacle.x, obstacle.y + obstacle.height);
    platformGradient.addColorStop(0, '#a7ffe8');
    platformGradient.addColorStop(1, '#66f0ff');
    context.fillStyle = platformGradient;
    context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

    context.fillStyle = 'rgba(255,255,255,0.22)';
    context.fillRect(obstacle.x + 5, obstacle.y + 3, obstacle.width - 10, 3);
    return;
  }

  if (obstacle.type === 'spike') {
    const top = obstacle.y;
    const base = obstacle.y + obstacle.height;
    const center = obstacle.x + obstacle.width / 2;

    const spikeGradient = context.createLinearGradient(obstacle.x, top, obstacle.x, base);
    spikeGradient.addColorStop(0, '#ff7ca8');
    spikeGradient.addColorStop(1, '#7af6ff');

    context.fillStyle = spikeGradient;
    context.beginPath();
    context.moveTo(obstacle.x, base);
    context.lineTo(center, top);
    context.lineTo(obstacle.x + obstacle.width, base);
    context.closePath();
    context.fill();
  } else {
    const blockGradient = context.createLinearGradient(obstacle.x, obstacle.y, obstacle.x, obstacle.y + obstacle.height);
    blockGradient.addColorStop(0, '#7af6ff');
    blockGradient.addColorStop(1, '#ff7ca8');
    context.fillStyle = blockGradient;
    context.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(obstacle.x + 4, obstacle.y + 4, Math.max(4, obstacle.width * 0.18), obstacle.height - 8);
  }
}

function drawPlayer() {
  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;

  context.save();
  context.translate(centerX, centerY);
  context.rotate((player.rotation * Math.PI) / 180);

  const bodyGradient = context.createLinearGradient(-player.width / 2, -player.height / 2, player.width / 2, player.height / 2);
  bodyGradient.addColorStop(0, '#ffe86c');
  bodyGradient.addColorStop(0.5, '#66f0ff');
  bodyGradient.addColorStop(1, '#ff7ca8');

  context.shadowBlur = 22;
  context.shadowColor = '#66f0ff';
  context.fillStyle = bodyGradient;
  context.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);

  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.26)';
  context.fillRect(-player.width / 2 + 5, -player.height / 2 + 5, 9, 9);
  context.fillStyle = 'rgba(0,0,0,0.18)';
  context.fillRect(-player.width / 2 + 13, -player.height / 2 + 13, player.width - 18, player.height - 18);

  context.restore();
}

function drawParticles() {
  for (const particle of particles) {
    context.globalAlpha = clamp(particle.life, 0, 1);
    context.fillStyle = particle.color || '#66f0ff';
    context.fillRect(particle.x, particle.y, 4, 4);
  }
  context.globalAlpha = 1;
}

function drawHud(distanceMeters) {
  context.fillStyle = 'rgba(6, 10, 20, 0.48)';
  context.fillRect(20, 20, 240, 74);
  context.strokeStyle = 'rgba(102, 240, 255, 0.18)';
  context.strokeRect(20, 20, 240, 74);

  context.fillStyle = '#dff7ff';
  context.font = '700 16px Bahnschrift, Segoe UI, sans-serif';
  context.fillText(`Score ${formatScore(score)}`, 34, 48);
  context.fillStyle = '#9ed8ff';
  context.font = '600 13px Bahnschrift, Segoe UI, sans-serif';
  context.fillText(`Best ${formatScore(bestScore)}`, 34, 70);
  context.fillText(`Distance ${formatScore(distanceMeters)}m`, 34, 90);

  const progress = clamp(score / LEVEL_GOAL_SCORE, 0, 1);
  const barX = 130;
  const barY = 35;
  const barWidth = 92;
  const barHeight = 10;

  context.fillStyle = 'rgba(255,255,255,0.08)';
  context.fillRect(barX, barY, barWidth, barHeight);
  context.fillStyle = progress >= 1 ? '#ffe86c' : '#66f0ff';
  context.fillRect(barX, barY, barWidth * progress, barHeight);
  context.strokeStyle = 'rgba(255,255,255,0.16)';
  context.strokeRect(barX, barY, barWidth, barHeight);
  context.fillStyle = '#dff7ff';
  context.font = '600 11px Bahnschrift, Segoe UI, sans-serif';
  context.fillText(`${Math.floor(progress * 100)}%`, barX + 100, 44);
}

function gameLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.033);
  lastTimestamp = timestamp;

  const distanceMeters = score / 100;

  if (!gameOver) {
    if (started) {
      score += deltaSeconds * (120 + difficulty * 190);
      if (score >= LEVEL_GOAL_SCORE) {
        score = LEVEL_GOAL_SCORE;
        completeLevel();
      } else {
        updatePlayer(deltaSeconds);
        updateObstacles(deltaSeconds, distanceMeters);
      }
    }

    updateParticles(deltaSeconds);
    updateStars(deltaSeconds, distanceMeters);
    bestScore = Math.max(bestScore, Math.floor(score));
    renderHud();
  } else {
    updateParticles(deltaSeconds);
    updateStars(deltaSeconds, distanceMeters);
  }

  scheduleMusic();

  drawBackground(distanceMeters);

  for (const obstacle of obstacles) {
    drawObstacle(obstacle);
  }

  drawParticles();
  drawPlayer();
  drawHud(distanceMeters);

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
  if (initialized) return;
  initialized = true;

  resizeCanvas();
  createStars();
  updateDifficulty();
  renderHud();
  resetGame();

  window.addEventListener('resize', () => {
    resizeCanvas();
    createStars();
    resetGame();
  });

  window.addEventListener('keydown', handleJumpInput);
  window.addEventListener('pointerdown', jump);

  restartBtn.addEventListener('click', resetGame);
  restartSecondaryBtn.addEventListener('click', resetGame);
  difficultySlider.addEventListener('input', () => {
    updateDifficulty();
    resetGame();
  });

  window.addEventListener('pageshow', () => {
    resetGame();
  });

  animationFrame = window.requestAnimationFrame(gameLoop);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setup);
} else {
  setup();
}
