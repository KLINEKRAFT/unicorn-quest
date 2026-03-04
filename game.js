// Unicorn Quest - complete game.js
// Uses your existing assets + title screen + theme music + mobile D-pad
// Player animation is HARD-CROPPED to match your current non-grid player.png.
//
// Expected files (case-sensitive):
// assets/grass.png
// assets/player.png
// assets/trees.png
// assets/unicorn.png
// assets/title.png
// assets/theme_music.wav

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

function resize() {
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}
window.addEventListener("resize", resize);
resize();

// ---------- Load helpers ----------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load: " + src));
    img.src = src;
  });
}

// ---------- Audio ----------
const music = new Audio("assets/theme_music.wav");
music.loop = true;
music.volume = 0.5;

// ---------- Assets ----------
const IMG = {
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

// ---------- World ----------
const WORLD = {
  width: 2600,
  height: 1600,
};

const camera = { x: 0, y: 0 };

// ---------- Player ----------
const player = {
  x: WORLD.width / 2,
  y: WORLD.height / 2,
  speed: 180,        // px/sec
  collR: 22,         // collision radius
  facing: "down",    // "down" | "up" | "left" | "right"
  animTime: 0,
  animFrame: 0,
};

// ---------- Unicorn (goal) ----------
const unicorn = {
  x: 300 + Math.random() * (WORLD.width - 600),
  y: 300 + Math.random() * (WORLD.height - 600),
  collR: 26,
  found: false,
};

// ---------- Trees as obstacles ----------
const trees = [];
function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function resolveCircleCollision(px, py, pr, ox, oy, or) {
  const dx = px - ox;
  const dy = py - oy;
  const d = Math.hypot(dx, dy);
  const minD = pr + or;
  if (d === 0 || d >= minD) return { x: px, y: py };
  const push = (minD - d);
  return { x: px + (dx / d) * push, y: py + (dy / d) * push };
}

function generateTrees(count = 22) {
  trees.length = 0;
  for (let i = 0; i < count; i++) {
    const t = {
      x: 150 + Math.random() * (WORLD.width - 300),
      y: 150 + Math.random() * (WORLD.height - 300),
      r: 58,
    };

    // Keep trees away from player start and unicorn start
    const dP = dist(t.x, t.y, player.x, player.y);
    const dU = dist(t.x, t.y, unicorn.x, unicorn.y);
    if (dP < 220 || dU < 220) {
      i--;
      continue;
    }
    trees.push(t);
  }
}

// ---------- Input ----------
const keys = { up: false, down: false, left: false, right: false };

// Keyboard for desktop testing
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

// Mobile D-pad buttons from your HTML
function bindHold(btnId, onDown, onUp) {
  const el = document.getElementById(btnId);
  if (!el) return;

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

// Tap canvas to start from title
canvas.addEventListener("pointerdown", () => {
  if (state === "title") startGame();
});

function startGame() {
  state = "play";

  // Mobile browsers require user gesture for audio
  if (!startedAudio) {
    startedAudio = true;
    music.play().catch(() => {});
  }
}

// ---------- Drawing helpers ----------
function drawImageCover(img, x, y, w, h) {
  const iw = img.width, ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale, dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawTiled(img, camX, camY, viewW, viewH) {
  const tileW = img.width;
  const tileH = img.height;

  const startX = Math.floor(camX / tileW) * tileW;
  const startY = Math.floor(camY / tileH) * tileH;

  for (let y = startY; y < camY + viewH; y += tileH) {
    for (let x = startX; x < camX + viewW; x += tileW) {
      ctx.drawImage(img, Math.floor(x - camX), Math.floor(y - camY));
    }
  }
}

function drawCenteredSticker(img, worldX, worldY, scale = 1) {
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

// ---------- HARD-CROPPED PLAYER FRAMES (for your current player.png) ----------
/*
  rect = { sx, sy, sw, sh } in source image pixels.

  These were tuned to your current layout (tall sheet with 5 "bands"):
  Row 1: Idle Down (3)
  Row 2: Walk Right (4)
  Row 3: Walk Left (4)
  Row 4: Walk Down (3)
  Row 5: Walk Up (3)
*/
const PLAYER_FRAMES = {
  down: {
    idle: [
      { sx: 128, sy: 0, sw: 165, sh: 426 },
      { sx: 531, sy: 0, sw: 176, sh: 426 },
      { sx: 955, sy: 0, sw: 174, sh: 426 },
    ],
    walk: [
      { sx: 110, sy: 1174, sw: 186, sh: 532 },
      { sx: 522, sy: 1174, sw: 203, sh: 532 },
      { sx: 932, sy: 1174, sw: 194, sh: 532 },
    ],
  },

  right: {
    walk: [
      { sx: 128, sy: 344, sw: 167, sh: 512 },
      { sx: 537, sy: 344, sw: 166, sh: 512 },
      { sx: 949, sy: 344, sw: 160, sh: 512 },
      { sx: 1356, sy: 403, sw: 159, sh: 453 },
    ],
  },

  left: {
    walk: [
      { sx: 120, sy: 754, sw: 172, sh: 502 },
      { sx: 572, sy: 754, sw: 158, sh: 502 },
      { sx: 938, sy: 754, sw: 174, sh: 502 },
      { sx: 1378, sy: 754, sw: 161, sh: 481 },
    ],
  },

  up: {
    walk: [
      { sx: 121, sy: 1594, sw: 208, sh: 454 },
      { sx: 535, sy: 1594, sw: 201, sh: 454 },
      { sx: 942, sy: 1594, sw: 200, sh: 454 },
    ],
  },
};

function getPlayerFramesForState() {
  const moving = (keys.up || keys.down || keys.left || keys.right);

  if (!moving) {
    // Idle: only have explicit idle for down; otherwise use first walk frame
    if (player.facing === "down" && PLAYER_FRAMES.down.idle.length) {
      return PLAYER_FRAMES.down.idle;
    }
    return (PLAYER_FRAMES[player.facing]?.walk || PLAYER_FRAMES.down.walk);
  }

  return (PLAYER_FRAMES[player.facing]?.walk || PLAYER_FRAMES.down.walk);
}

function drawPlayer(worldX, worldY) {
  const frames = getPlayerFramesForState();
  if (!frames || frames.length === 0) {
    // Fallback: draw entire sheet (should not happen)
    drawCenteredSticker(IMG.player, worldX, worldY, 0.35);
    return;
  }

  const idx = player.animFrame % frames.length;
  const fr = frames[idx];

  const x = worldX - camera.x;
  const y = worldY - camera.y;

  // On-screen size of player (tweak this if needed)
  const targetH = 86; // in CSS pixels
  const aspect = fr.sw / fr.sh;
  const targetW = targetH * aspect;

  ctx.drawImage(
    IMG.player,
    fr.sx, fr.sy, fr.sw, fr.sh,
    Math.floor(x - targetW / 2),
    Math.floor(y - targetH / 2),
    Math.floor(targetW),
    Math.floor(targetH)
  );
}

// ---------- Update & Draw ----------
let last = performance.now();

function update(dt) {
  let vx = 0, vy = 0;
  if (keys.up) vy -= 1;
  if (keys.down) vy += 1;
  if (keys.left) vx -= 1;
  if (keys.right) vx += 1;

  // Normalize diagonal
  if (vx !== 0 && vy !== 0) {
    const inv = 1 / Math.hypot(vx, vy);
    vx *= inv;
    vy *= inv;
  }

  const moving = (vx !== 0 || vy !== 0);

  if (moving) {
    // Facing
    if (Math.abs(vx) > Math.abs(vy)) {
      player.facing = vx > 0 ? "right" : "left";
    } else {
      player.facing = vy > 0 ? "down" : "up";
    }

    // Animate
    player.animTime += dt;
    if (player.animTime > 0.12) {
      player.animTime = 0;
      player.animFrame = (player.animFrame + 1) % 1000000;
    }
  } else {
    player.animTime = 0;
    player.animFrame = 0;
  }

  // Move
  player.x = clamp(player.x + vx * player.speed * dt, 0, WORLD.width);
  player.y = clamp(player.y + vy * player.speed * dt, 0, WORLD.height);

  // Tree collision
  for (const t of trees) {
    const res = resolveCircleCollision(player.x, player.y, player.collR, t.x, t.y, t.r);
    player.x = res.x;
    player.y = res.y;
  }

  // Unicorn found
  if (!unicorn.found) {
    if (dist(player.x, player.y, unicorn.x, unicorn.y) < (player.collR + unicorn.collR)) {
      unicorn.found = true;
    }
  }

  // Camera follow
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  camera.x = clamp(player.x - viewW / 2, 0, Math.max(0, WORLD.width - viewW));
  camera.y = clamp(player.y - viewH / 2, 0, Math.max(0, WORLD.height - viewH));
}

function drawHUD() {
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(12, 12, 290, 30);
  ctx.fillStyle = "#fff";
  ctx.fillText(unicorn.found ? "You found the unicorn!" : "Find the unicorn…", 22, 33);
}

function drawPlay() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  ctx.clearRect(0, 0, viewW, viewH);

  // Grass
  drawTiled(IMG.grass, camera.x, camera.y, viewW, viewH);

  // Trees (simple "sticker" draw of entire trees.png)
  for (const t of trees) {
    drawCenteredSticker(IMG.trees, t.x, t.y, 0.35);
  }

  // Unicorn (simple "sticker" draw of entire unicorn.png)
  if (!unicorn.found) {
    drawCenteredSticker(IMG.unicorn, unicorn.x, unicorn.y, 0.35);
  }

  // Player (cropped + animated)
  drawPlayer(player.x, player.y);

  drawHUD();
}

function drawTitle() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

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
    drawPlay();
  }

  requestAnimationFrame(loop);
}

// ---------- Boot ----------
(async function boot() {
  try {
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