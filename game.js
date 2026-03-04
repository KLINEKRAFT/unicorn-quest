// Unicorn Quest - simple mobile top-down starter
// Assets expected:
// assets/grass.png, player.png, trees.png, unicorn.png, title.png, theme_music.wav

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// crisp pixel scaling (keeps pixels sharp when scaled)
ctx.imageSmoothingEnabled = false;

function resize() {
  // Match canvas buffer to device pixels for sharpness
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}
window.addEventListener("resize", resize);
resize();

// ---------- Load assets ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load: " + src));
    img.src = src;
  });
}

const music = new Audio("assets/theme_music.wav");
music.loop = true;
music.volume = 0.5;

let IMG = {
  grass: null,
  player: null,
  trees: null,
  unicorn: null,
  title: null,
};

let assetsReady = false;

// ---------- Game state ----------
let state = "title"; // "title" | "play"
let startedAudio = false;

// World settings (simple, infinite tiling grass)
const WORLD = {
  width: 2600,   // world size in "pixels" of our game space
  height: 1600,
};

// Camera follows player
const camera = { x: 0, y: 0 };

// Player settings
const player = {
  x: WORLD.width / 2,
  y: WORLD.height / 2,
  speed: 180, // pixels/second
  size: 44,   // collision radius-ish
  facing: "down",
  animTime: 0,
  animFrame: 0,
};

// Unicorn (goal)
const unicorn = {
  x: 300 + Math.random() * (WORLD.width - 600),
  y: 300 + Math.random() * (WORLD.height - 600),
  size: 52,
  found: false,
};

// Trees as obstacles (generated)
const trees = [];
function generateTrees(count = 24) {
  trees.length = 0;
  for (let i = 0; i < count; i++) {
    const t = {
      x: 150 + Math.random() * (WORLD.width - 300),
      y: 150 + Math.random() * (WORLD.height - 300),
      r: 58, // collision radius
    };

    // keep trees away from player start and unicorn start
    const dP = dist(t.x, t.y, player.x, player.y);
    const dU = dist(t.x, t.y, unicorn.x, unicorn.y);
    if (dP < 220 || dU < 220) {
      i--;
      continue;
    }
    trees.push(t);
  }
}

// Simple helpers
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.hypot(dx, dy);
}

// ---------- Input ----------
const keys = { up: false, down: false, left: false, right: false };

// Keyboard support (desktop testing)
window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "w") keys.up = true;
  if (e.key === "ArrowDown" || e.key === "s") keys.down = true;
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = true;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = true;
});
window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowUp" || e.key === "w") keys.up = false;
  if (e.key === "ArrowDown" || e.key === "s") keys.down = false;
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = false;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = false;
});

// Mobile D-pad buttons
function bindHold(btnId, onDown, onUp) {
  const el = document.getElementById(btnId);
  const down = (ev) => { ev.preventDefault(); onDown(); };
  const up = (ev) => { ev.preventDefault(); onUp(); };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("pointerleave", up);
}
bindHold("btnUp", () => (keys.up = true), () => (keys.up = false));
bindHold("btnDown", () => (keys.down = true), () => (keys.down = false));
bindHold("btnLeft", () => (keys.left = true), () => (keys.left = false));
bindHold("btnRight", () => (keys.right = true), () => (keys.right = false));

// Tap/click canvas to start from title
canvas.addEventListener("pointerdown", () => {
  if (state === "title") startGame();
});

// ---------- Start game ----------
function startGame() {
  state = "play";

  // Must start audio on a user gesture for mobile browsers
  if (!startedAudio) {
    startedAudio = true;
    music.play().catch(() => {
      // If it fails, user can tap again; we won't spam errors.
    });
  }
}

// ---------- Rendering helpers ----------
function drawImageCover(img, x, y, w, h) {
  // Draw img to completely cover area (like CSS background-size: cover)
  const iw = img.width, ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// Draw repeating grass by tiling the grass image
function drawTiled(img, camX, camY, viewW, viewH) {
  const tileW = img.width;
  const tileH = img.height;

  // Determine starting tile based on camera offset
  const startX = Math.floor(camX / tileW) * tileW;
  const startY = Math.floor(camY / tileH) * tileH;

  for (let y = startY; y < camY + viewH; y += tileH) {
    for (let x = startX; x < camX + viewW; x += tileW) {
      const sx = x - camX;
      const sy = y - camY;
      ctx.drawImage(img, Math.floor(sx), Math.floor(sy));
    }
  }
}

// Draw a centered sprite (no sprite sheet slicing yet)
function drawCentered(img, worldX, worldY, scale = 1) {
  const x = worldX - camera.x;
  const y = worldY - camera.y;

  const w = img.width * scale;
  const h = img.height * scale;

  ctx.drawImage(
    img,
    Math.floor(x - w / 2),
    Math.floor(y - h / 2),
    Math.floor(w),
    Math.floor(h)
  );
}

// ---------- Collision ----------
function resolveCircleCollision(px, py, pr, ox, oy, or) {
  const dx = px - ox;
  const dy = py - oy;
  const d = Math.hypot(dx, dy);
  const minD = pr + or;
  if (d === 0 || d >= minD) return { x: px, y: py };
  const push = (minD - d);
  const nx = dx / d;
  const ny = dy / d;
  return { x: px + nx * push, y: py + ny * push };
}

// ---------- Update / Draw ----------
let last = performance.now();

function update(dt) {
  // Movement input
  let vx = 0, vy = 0;
  if (keys.up) vy -= 1;
  if (keys.down) vy += 1;
  if (keys.left) vx -= 1;
  if (keys.right) vx += 1;

  // Normalize diagonal
  if (vx !== 0 && vy !== 0) {
    const inv = 1 / Math.hypot(vx, vy);
    vx *= inv; vy *= inv;
  }

  // Facing / simple animation timer
  const moving = (vx !== 0 || vy !== 0);
  if (moving) {
    if (Math.abs(vx) > Math.abs(vy)) {
      player.facing = vx > 0 ? "right" : "left";
    } else {
      player.facing = vy > 0 ? "down" : "up";
    }
    player.animTime += dt;
    if (player.animTime > 0.12) {
      player.animTime = 0;
      player.animFrame = (player.animFrame + 1) % 4;
    }
  } else {
    player.animFrame = 0;
    player.animTime = 0;
  }

  // Apply movement
  const nx = player.x + vx * player.speed * dt;
  const ny = player.y + vy * player.speed * dt;

  player.x = clamp(nx, 0, WORLD.width);
  player.y = clamp(ny, 0, WORLD.height);

  // Collide with trees (circle-to-circle pushback)
  for (const t of trees) {
    const res = resolveCircleCollision(player.x, player.y, player.size * 0.55, t.x, t.y, t.r);
    player.x = res.x;
    player.y = res.y;
  }

  // Check unicorn found
  if (!unicorn.found) {
    const d = dist(player.x, player.y, unicorn.x, unicorn.y);
    if (d < (player.size + unicorn.size) * 0.55) {
      unicorn.found = true;
    }
  }

  // Camera follows player
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  camera.x = clamp(player.x - viewW / 2, 0, Math.max(0, WORLD.width - viewW));
  camera.y = clamp(player.y - viewH / 2, 0, Math.max(0, WORLD.height - viewH));
}

function draw() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  ctx.clearRect(0, 0, viewW, viewH);

  // Grass background
  drawTiled(IMG.grass, camera.x, camera.y, viewW, viewH);

  // Trees (draw with a consistent scale; your trees.png is a sheet of separate trees,
  // but for simplicity we draw the full image once per tree as a placeholder "sticker".
  // If you want, I can slice trees.png into individual tree sprites next.)
  for (const t of trees) {
    drawCentered(IMG.trees, t.x, t.y, 0.35);
  }

  // Unicorn (draw until found)
  if (!unicorn.found) {
    drawCentered(IMG.unicorn, unicorn.x, unicorn.y, 0.35);
  }

  // Player (same note: we’re drawing whole sprite sheet as placeholder.
  // Next step is slicing frames cleanly.)
  drawCentered(IMG.player, player.x, player.y, 0.35);

  // HUD text (simple)
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(12, 12, 230, 30);
  ctx.fillStyle = "#fff";
  ctx.fillText(unicorn.found ? "You found the unicorn!" : "Find the unicorn…", 22, 33);
}

function drawTitle() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  // background while loading
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, viewW, viewH);

  if (!assetsReady) {
    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText("Loading…", 20, 40);
    return;
  }

  drawImageCover(IMG.title, 0, 0, viewW, viewH);
}

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  if (state === "title") {
    drawTitle();
  } else {
    update(dt);
    draw();
  }

  requestAnimationFrame(loop);
}

// ---------- Boot ----------
(async function boot() {
  try {
    // Load images
    const [grass, playerImg, treesImg, unicornImg, titleImg] = await Promise.all([
      loadImage("assets/grass.png"),
      loadImage("assets/player.png"),
      loadImage("assets/trees.png"),
      loadImage("assets/unicorn.png"),
      loadImage("assets/title.png"),
    ]);

    IMG.grass = grass;
    IMG.player = playerImg;
    IMG.trees = treesImg;
    IMG.unicorn = unicornImg;
    IMG.title = titleImg;

    generateTrees(22);

    assetsReady = true;
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = "#fff";
    ctx.font = "18px sans-serif";
    ctx.fillText("Error loading assets.", 20, 40);
    ctx.font = "14px sans-serif";
    ctx.fillText("Check /assets filenames (case-sensitive).", 20, 65);
  }
})();
