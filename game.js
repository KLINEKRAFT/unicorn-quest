// Unicorn Quest - mobile top-down starter (auto-slices your non-grid player sheet)
// Assets expected:
// assets/grass.png, player.png, trees.png, unicorn.png, title.png, theme_music.wav

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

let IMG = { grass: null, player: null, trees: null, unicorn: null, title: null };
let assetsReady = false;

// ---------- Game state ----------
let state = "title"; // "title" | "play"
let startedAudio = false;

// World settings
const WORLD = { width: 2600, height: 1600 };
const camera = { x: 0, y: 0 };

// Player
const player = {
  x: WORLD.width / 2,
  y: WORLD.height / 2,
  speed: 180,
  size: 44,
  facing: "down", // "down" | "up" | "left" | "right"
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

// Trees obstacles
const trees = [];
function generateTrees(count = 22) {
  trees.length = 0;
  for (let i = 0; i < count; i++) {
    const t = {
      x: 150 + Math.random() * (WORLD.width - 300),
      y: 150 + Math.random() * (WORLD.height - 300),
      r: 58,
    };

    const dP = dist(t.x, t.y, player.x, player.y);
    const dU = dist(t.x, t.y, unicorn.x, unicorn.y);
    if (dP < 220 || dU < 220) { i--; continue; }
    trees.push(t);
  }
}

// Helpers
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

// ---------- Input ----------
const keys = { up: false, down: false, left: false, right: false };

// Keyboard (desktop testing)
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

// Mobile D-pad
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

// Tap canvas to start
canvas.addEventListener("pointerdown", () => {
  if (state === "title") startGame();
});

function startGame() {
  state = "play";
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
  const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawTiled(img, camX, camY, viewW, viewH) {
  const tileW = img.width, tileH = img.height;
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
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, Math.floor(x - w / 2), Math.floor(y - h / 2), Math.floor(w), Math.floor(h));
}

// ---------- Collision ----------
function resolveCircleCollision(px, py, pr, ox, oy, or) {
  const dx = px - ox, dy = py - oy;
  const d = Math.hypot(dx, dy);
  const minD = pr + or;
  if (d === 0 || d >= minD) return { x: px, y: py };
  const push = (minD - d);
  return { x: px + (dx / d) * push, y: py + (dy / d) * push };
}

// ---------- AUTO SLICE: player sheet frames ----------
let PLAYER_FRAMES = null;
/*
PLAYER_FRAMES format:
{
  down: { idle:[rect,rect,rect], walk:[rect...] },
  up:   { walk:[rect...] },
  left: { walk:[rect...] },
  right:{ walk:[rect...] }
}
rect = {sx, sy, sw, sh}
*/

function buildPlayerFramesFromImage(img) {
  // Detect non-background pixels and segment into rows/cols.
  // Your sheet has dark background + magenta noise; this finds “not dark” pixels.
  const off = document.createElement("canvas");
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext("2d", { willReadFrequently: true });
  octx.drawImage(img, 0, 0);

  const { data, width, height } = octx.getImageData(0, 0, off.width, off.height);

  // Mask: pixel is "ink" if it's not near-black.
  const ink = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // threshold tuned for your sheet: catches sprites + magenta edges, ignores black
    ink[p] = (r + g + b) > 70 ? 1 : 0;
  }

  // Row projection: find y bands that contain ink
  const rowHas = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    let any = 0;
    const base = y * width;
    for (let x = 0; x < width; x++) { if (ink[base + x]) { any = 1; break; } }
    rowHas[y] = any;
  }

  // Group contiguous y into bands (sprites rows)
  const bands = [];
  let y = 0;
  while (y < height) {
    while (y < height && !rowHas[y]) y++;
    if (y >= height) break;
    let y0 = y;
    while (y < height && rowHas[y]) y++;
    let y1 = y - 1;

    // trim tiny bands (noise)
    if (y1 - y0 > 30) bands.push({ y0, y1 });
  }

  // We expect ~5 bands; if more, keep the 5 largest
  bands.sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0));
  const picked = bands.slice(0, 5).sort((a, b) => a.y0 - b.y0);

  // For each band, find x segments and compute tight bbox per segment
  const rows = [];
  for (const band of picked) {
    const colHas = new Uint8Array(width);

    for (let x = 0; x < width; x++) {
      let any = 0;
      for (let yy = band.y0; yy <= band.y1; yy++) {
        if (ink[yy * width + x]) { any = 1; break; }
      }
      colHas[x] = any;
    }

    const segs = [];
    let x = 0;
    while (x < width) {
      while (x < width && !colHas[x]) x++;
      if (x >= width) break;
      let x0 = x;
      while (x < width && colHas[x]) x++;
      let x1 = x - 1;

      if (x1 - x0 > 30) segs.push({ x0, x1 });
    }

    // For each segment, compute bbox
    const rects = [];
    for (const s of segs) {
      let minX = width, minY = height, maxX = 0, maxY = 0;
      for (let yy = band.y0; yy <= band.y1; yy++) {
        const base = yy * width;
        for (let xx = s.x0; xx <= s.x1; xx++) {
          if (ink[base + xx]) {
            if (xx < minX) minX = xx;
            if (xx > maxX) maxX = xx;
            if (yy < minY) minY = yy;
            if (yy > maxY) maxY = yy;
          }
        }
      }
      // pad a little so feet/hair don't get clipped
      const pad = 6;
      minX = clamp(minX - pad, 0, width - 1);
      minY = clamp(minY - pad, 0, height - 1);
      maxX = clamp(maxX + pad, 0, width - 1);
      maxY = clamp(maxY + pad, 0, height - 1);

      rects.push({ sx: minX, sy: minY, sw: (maxX - minX + 1), sh: (maxY - minY + 1) });
    }

    // sort left->right
    rects.sort((a, b) => a.sx - b.sx);
    rows.push(rects);
  }

  // Map your sheet rows to actions (based on how your image is arranged):
  // Row 0: idle down (3)
  // Row 1: walk right (4)
  // Row 2: walk left (4)
  // Row 3: walk down (3)
  // Row 4: walk up (3)
  // If a row ends up with fewer frames detected, it still works.
  const r0 = rows[0] || [];
  const r1 = rows[1] || [];
  const r2 = rows[2] || [];
  const r3 = rows[3] || [];
  const r4 = rows[4] || [];

  return {
    down: { idle: r0.slice(0, 3), walk: r3.slice(0, 3) },
    right: { walk: r1.slice(0, 4) },
    left: { walk: r2.slice(0, 4) },
    up: { walk: r4.slice(0, 3) },
  };
}

function drawPlayer(worldX, worldY) {
  if (!PLAYER_FRAMES) {
    // fallback if frames not ready
    drawCenteredSticker(IMG.player, worldX, worldY, 0.35);
    return;
  }

  const moving = (keys.up || keys.down || keys.left || keys.right);

  // Pick correct frames list
  let frames = null;

  if (!moving) {
    // idle: prefer down idle; else first frame of facing walk
    if (player.facing === "down" && PLAYER_FRAMES.down.idle.length) {
      frames = PLAYER_FRAMES.down.idle;
    } else {
      frames = (PLAYER_FRAMES[player.facing]?.walk || PLAYER_FRAMES.down.walk);
    }
  } else {
    frames = (PLAYER_FRAMES[player.facing]?.walk || PLAYER_FRAMES.down.walk);
  }

  if (!frames || frames.length === 0) {
    drawCenteredSticker(IMG.player, worldX, worldY, 0.35);
    return;
  }

  const idx = player.animFrame % frames.length;
  const fr = frames[idx];

  // draw sliced frame
  const x = worldX - camera.x;
  const y = worldY - camera.y;

  // Scale frame up/down for game size
  const scale = 1.0; // source slice is already “tight”; we will size it manually
  const targetH = 80; // how tall the player appears on screen
  const aspect = fr.sw / fr.sh;
  const targetW = targetH * aspect;

  ctx.drawImage(
    IMG.player,
    fr.sx, fr.sy, fr.sw, fr.sh,
    Math.floor(x - targetW / 2),
    Math.floor(y - targetH / 2),
    Math.floor(targetW * scale),
    Math.floor(targetH * scale)
  );
}

// ---------- Update / Draw ----------
let last = performance.now();

function update(dt) {
  let vx = 0, vy = 0;
  if (keys.up) vy -= 1;
  if (keys.down) vy += 1;
  if (keys.left) vx -= 1;
  if (keys.right) vx += 1;

  if (vx !== 0 && vy !== 0) {
    const inv = 1 / Math.hypot(vx, vy);
    vx *= inv; vy *= inv;
  }

  const moving = (vx !== 0 || vy !== 0);

  if (moving) {
    if (Math.abs(vx) > Math.abs(vy)) player.facing = vx > 0 ? "right" : "left";
    else player.facing = vy > 0 ? "down" : "up";

    player.animTime += dt;
    if (player.animTime > 0.12) {
      player.animTime = 0;
      player.animFrame = (player.animFrame + 1) % 1000;
    }
  } else {
    player.animTime = 0;
    player.animFrame = 0;
  }

  const nx = player.x + vx * player.speed * dt;
  const ny = player.y + vy * player.speed * dt;

  player.x = clamp(nx, 0, WORLD.width);
  player.y = clamp(ny, 0, WORLD.height);

  // collide trees
  for (const t of trees) {
    const res = resolveCircleCollision(player.x, player.y, player.size * 0.55, t.x, t.y, t.r);
    player.x = res.x;
    player.y = res.y;
  }

  // unicorn found
  if (!unicorn.found) {
    const d = dist(player.x, player.y, unicorn.x, unicorn.y);
    if (d < (player.size + unicorn.size) * 0.55) unicorn.found = true;
  }

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  camera.x = clamp(player.x - viewW / 2, 0, Math.max(0, WORLD.width - viewW));
  camera.y = clamp(player.y - viewH / 2, 0, Math.max(0, WORLD.height - viewH));
}

function draw() {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  ctx.clearRect(0, 0, viewW, viewH);

  drawTiled(IMG.grass, camera.x, camera.y, viewW, viewH);

  // Trees (still sticker-style for simplicity)
  for (const t of trees) drawCenteredSticker(IMG.trees, t.x, t.y, 0.35);

  // Unicorn (sticker-style)
  if (!unicorn.found) drawCenteredSticker(IMG.unicorn, unicorn.x, unicorn.y, 0.35);

  // Player (NOW sliced + animated)
  drawPlayer(player.x, player.y);

  // HUD
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(12, 12, 260, 30);
  ctx.fillStyle = "#fff";
  ctx.fillText(unicorn.found ? "You found the unicorn!" : "Find the unicorn…", 22, 33);
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

  if (state === "title") drawTitle();
  else { update(dt); draw(); }

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

    // Build slices for YOUR non-grid player sheet
    PLAYER_FRAMES = buildPlayerFramesFromImage(IMG.player);

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
