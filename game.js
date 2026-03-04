const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

// ---------- helpers ----------
function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function drawCrop(img, crop, dx, dy, dw, dh) {
  if (!img.complete || !img.naturalWidth) return false;
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, dx, dy, dw, dh);
  return true;
}

// ---------- assets ----------
const images = {
  title: loadImage("assets/title.png"),
  player: loadImage("assets/player.png"),
  unicorn: loadImage("assets/unicorn.png"),
  chestClosed: loadImage("assets/chest_closed.png"),
  chestOpen: loadImage("assets/chest_open.png"),
  forest: loadImage("assets/tree.png"), // your tiles/trees sheet
};

// ---------- input ----------
const keys = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// ---------- game state ----------
const STATE = { TITLE: "title", PLAY: "play", WIN: "win" };
let gameState = STATE.TITLE;

// ---------- player sprite sheet (AUTO-CROP each cell so gutters don't matter) ----------
const PLAYER = {
  cols: 4,
  rows: 4,
  drawW: 64,
  drawH: 64,
  dirRow: { down: 0, left: 1, right: 2, up: 3 }, // adjust later if you want
  frames: null, // will become [row][col] => {sx,sy,sw,sh}
};

// Build cropped frames by scanning for non-transparent pixels in each cell
function buildPlayerFrames(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // Your sheet has 1 extra transparent pixel at bottom sometimes; ignore it.
  const effectiveH = h - (h % PLAYER.rows);

  const cellW = Math.floor(w / PLAYER.cols);
  const cellH = Math.floor(effectiveH / PLAYER.rows);

  const off = document.createElement("canvas");
  off.width = w;
  off.height = effectiveH;
  const octx = off.getContext("2d");
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0, 0, w, effectiveH);
  octx.drawImage(img, 0, 0);

  const data = octx.getImageData(0, 0, w, effectiveH).data;

  function alphaAt(x, y) {
    const i = (y * w + x) * 4 + 3;
    return data[i];
  }

  const frames = [];
  for (let r = 0; r < PLAYER.rows; r++) {
    frames[r] = [];
    for (let c = 0; c < PLAYER.cols; c++) {
      const x0 = c * cellW;
      const y0 = r * cellH;
      const x1 = (c === PLAYER.cols - 1) ? w : x0 + cellW;
      const y1 = (r === PLAYER.rows - 1) ? effectiveH : y0 + cellH;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      // scan cell for non-transparent pixels
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (alphaAt(x, y) > 10) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      // If cell is empty (shouldn't happen), fall back to whole cell
      if (!isFinite(minX)) {
        frames[r][c] = { sx: x0, sy: y0, sw: x1 - x0, sh: y1 - y0 };
        continue;
      }

      // add a tiny padding so we don't clip hair/boots
      const pad = 2;
      minX = Math.max(x0, minX - pad);
      minY = Math.max(y0, minY - pad);
      maxX = Math.min(x1 - 1, maxX + pad);
      maxY = Math.min(y1 - 1, maxY + pad);

      frames[r][c] = { sx: minX, sy: minY, sw: (maxX - minX + 1), sh: (maxY - minY + 1) };
    }
  }

  return frames;
}

function ensurePlayerFramesReady() {
  if (PLAYER.frames) return true;
  if (!images.player.complete || !images.player.naturalWidth) return false;
  PLAYER.frames = buildPlayerFrames(images.player);
  return true;
}

function getPlayerCrop(dir, col) {
  const row = PLAYER.dirRow[dir] ?? 0;
  const c = clamp(col, 0, PLAYER.cols - 1);
  return PLAYER.frames?.[row]?.[c] ?? { sx: 0, sy: 0, sw: 64, sh: 64 };
}

// ---------- crops for other images (same as before) ----------
const UNICORN_CROP = { sx: 649, sy: 372, sw: 724, sh: 753 };
const UNICORN_DRAW = { w: 72, h: 72 };

const CHEST_CLOSED_CROP = { sx: 142, sy: 313, sw: 316, sh: 285 };
const CHEST_OPEN_CROP   = { sx: 448, sy: 313, sw: 316, sh: 285 };
const CHEST_DRAW = { w: 64, h: 58 };

// forest tiles:
// Use a deeper inner crop to minimize borders, and OVERLAP tiles by 1px when drawing.
const GRASS_TILE = { sx: 15, sy: 12, sw: 218, sh: 225 };
const GRASS_INNER = { sx: GRASS_TILE.sx + 16, sy: GRASS_TILE.sy + 16, sw: GRASS_TILE.sw - 32, sh: GRASS_TILE.sh - 32 };

const BIG_TREE_CROP = { sx: 1552, sy: 4, sw: 465, sh: 416 };
const TREE_DRAW = { w: 140, h: 125 };

// ---------- particles ----------
let sparkles = [];
let walkTrail = [];

function spawnSparkle(x, y) {
  sparkles.push({
    x: x + (Math.random() * 60 - 30),
    y: y + (Math.random() * 60 - 30),
    life: 0.6 + Math.random() * 0.5,
    t: 0,
    size: 2 + Math.random() * 2,
  });
}
function spawnWalkSparkle(x, y) {
  walkTrail.push({
    x: x + (Math.random() * 18 - 9),
    y: y + (Math.random() * 18 - 9),
    life: 0.35 + Math.random() * 0.25,
    t: 0,
    size: 1 + Math.random() * 2,
    driftX: (Math.random() * 30 - 15),
    driftY: (Math.random() * 30 - 15),
  });
}

// ---------- world ----------
let world, player;

function resetGame() {
  world = {
    w: 2200,
    h: 2200,
    obstacles: [
      { x: 420,  y: 350,  w: 90,  h: 90 },
      { x: 900,  y: 520,  w: 90,  h: 90 },
      { x: 1280, y: 820,  w: 90,  h: 90 },
      { x: 1650, y: 450,  w: 90,  h: 90 },
      { x: 560,  y: 1250, w: 90,  h: 90 },
      { x: 1200, y: 1500, w: 90,  h: 90 },
    ],
    chests: [
      { x: 520,  y: 780,  opened: false },
      { x: 1600, y: 520,  opened: false },
      { x: 1760, y: 1550, opened: false },
    ],
    unicorn: {
      x: 1920, y: 1850,
      homeX: 1920, homeY: 1850,
      vx: 35, vy: 22,
      found: false,
      bobT: 0
    }
  };

  player = {
    x: 160,
    y: 160,
    w: 32,
    h: 32,
    speed: 230,
    score: 0,
    dir: "down",
    frame: 0,
    animTime: 0,
  };

  sparkles = [];
  walkTrail = [];
}

resetGame();

// ---------- collisions ----------
function tryMove(nx, ny) {
  const next = { x: nx, y: ny, w: player.w, h: player.h };

  if (next.x < 0 || next.y < 0 || next.x + next.w > world.w || next.y + next.h > world.h) return false;

  for (const o of world.obstacles) {
    if (rectsOverlap(next, o)) return false;
  }

  player.x = nx;
  player.y = ny;
  return true;
}

// ---------- edge triggers ----------
let lastAnyStartKey = false;
let lastE = false;
let lastSpace = false;

function anyStartKeyDown() {
  return keys.size > 0 || keys.has("enter") || keys.has(" ");
}

// ---------- update ----------
function update(dt) {
  // ensure frames are ready once player image loads
  ensurePlayerFramesReady();

  // TITLE
  if (gameState === STATE.TITLE) {
    const down = anyStartKeyDown();
    if (down && !lastAnyStartKey) {
      gameState = STATE.PLAY;
      lastE = true; // prevent immediate chest open
    }
    lastAnyStartKey = down;
    return;
  }

  // WIN
  const space = keys.has(" ");
  if (gameState === STATE.WIN) {
    if (space && !lastSpace) {
      resetGame();
      gameState = STATE.TITLE;
    }
    lastSpace = space;
    return;
  }
  lastSpace = space;

  // movement
  let vx = 0, vy = 0;
  if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
  if (keys.has("arrowright") || keys.has("d")) vx += 1;
  if (keys.has("arrowup") || keys.has("w")) vy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) vy += 1;

  if (vx !== 0 && vy !== 0) {
    const inv = 1 / Math.sqrt(2);
    vx *= inv; vy *= inv;
  }

  // direction
  if (Math.abs(vx) > Math.abs(vy)) {
    if (vx < 0) player.dir = "left";
    if (vx > 0) player.dir = "right";
  } else if (vy !== 0) {
    if (vy < 0) player.dir = "up";
    if (vy > 0) player.dir = "down";
  }

  const moving = (vx !== 0 || vy !== 0);

  // animation
  if (moving) {
    player.animTime += dt;
    if (player.animTime > 0.12) {
      player.animTime = 0;
      player.frame = (player.frame + 1) % 4;
    }
    if (Math.random() < 0.45) spawnWalkSparkle(player.x + player.w / 2, player.y + player.h);
  } else {
    player.frame = 0;
    player.animTime = 0;
  }

  // move (axis separated)
  const nx = player.x + vx * player.speed * dt;
  const ny = player.y + vy * player.speed * dt;
  tryMove(nx, player.y);
  tryMove(player.x, ny);

  // unicorn wandering + bob
  if (!world.unicorn.found) {
    const u = world.unicorn;
    u.bobT += dt;

    if (Math.random() < 0.02) u.vx += (Math.random() * 30 - 15);
    if (Math.random() < 0.02) u.vy += (Math.random() * 30 - 15);

    const maxSpeed = 55;
    u.vx = clamp(u.vx, -maxSpeed, maxSpeed);
    u.vy = clamp(u.vy, -maxSpeed, maxSpeed);

    u.x += u.vx * dt;
    u.y += u.vy * dt;

    const leash = 140;
    const minX = u.homeX - leash, maxX = u.homeX + leash;
    const minY = u.homeY - leash, maxY = u.homeY + leash;

    if (u.x <= minX || u.x >= maxX) u.vx *= -1;
    if (u.y <= minY || u.y >= maxY) u.vy *= -1;

    u.x = clamp(u.x, minX, maxX);
    u.y = clamp(u.y, minY, maxY);

    if (Math.random() < 0.22) spawnSparkle(u.x + UNICORN_DRAW.w / 2, u.y + UNICORN_DRAW.h / 2);
  }

  // chest open with E
  const eDown = keys.has("e");
  if (eDown && !lastE) {
    const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
    for (const c of world.chests) {
      if (c.opened) continue;
      const cRect = { x: c.x, y: c.y, w: CHEST_DRAW.w, h: CHEST_DRAW.h };
      if (rectsOverlap(pRect, cRect)) {
        c.opened = true;
        player.score += 10;
        break;
      }
    }
  }
  lastE = eDown;

  // win
  if (!world.unicorn.found) {
    const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
    const uRect = { x: world.unicorn.x, y: world.unicorn.y, w: UNICORN_DRAW.w, h: UNICORN_DRAW.h };
    if (rectsOverlap(pRect, uRect)) {
      world.unicorn.found = true;
      gameState = STATE.WIN;
    }
  }

  // update particles
  for (const s of sparkles) s.t += dt;
  sparkles = sparkles.filter(s => s.t < s.life);

  for (const p of walkTrail) p.t += dt;
  walkTrail = walkTrail.filter(p => p.t < p.life);
}

// ---------- draw ----------
function drawTitle() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (images.title.complete && images.title.naturalWidth) {
    const iw = images.title.naturalWidth;
    const ih = images.title.naturalHeight;
    const scale = Math.max(canvas.width / iw, canvas.height / ih);
    const dw = Math.ceil(iw * scale);
    const dh = Math.ceil(ih * scale);
    const dx = Math.floor((canvas.width - dw) / 2);
    const dy = Math.floor((canvas.height - dh) / 2);
    ctx.drawImage(images.title, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = "#0b0f0c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "42px system-ui";
    ctx.fillText("UNICORN QUEST", 260, 240);
  }

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, canvas.height - 92, canvas.width, 92);

  ctx.fillStyle = "white";
  ctx.font = "22px system-ui";
  ctx.fillText("Press any key to start", 340, canvas.height - 40);

  ctx.font = "14px system-ui";
  ctx.fillText("Move: WASD / Arrow Keys    Open chest: E", 300, canvas.height - 18);
}

function drawWorld() {
  const camX = clamp(player.x - canvas.width / 2, 0, world.w - canvas.width);
  const camY = clamp(player.y - canvas.height / 2, 0, world.h - canvas.height);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // background
  if (images.forest.complete && images.forest.naturalWidth) {
    const tileW = 96;
    const tileH = 96;
    const overlap = 1; // hides seams

    const startX = Math.floor(camX / tileW) * tileW;
    const startY = Math.floor(camY / tileH) * tileH;

    for (let y = startY; y < camY + canvas.height + tileH; y += tileH) {
      for (let x = startX; x < camX + canvas.width + tileW; x += tileW) {
        ctx.drawImage(
          images.forest,
          GRASS_INNER.sx, GRASS_INNER.sy, GRASS_INNER.sw, GRASS_INNER.sh,
          Math.floor(x - camX), Math.floor(y - camY),
          tileW + overlap, tileH + overlap
        );
      }
    }
  } else {
    ctx.fillStyle = "#113019";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // chests
  for (const c of world.chests) {
    const crop = c.opened ? CHEST_OPEN_CROP : CHEST_CLOSED_CROP;
    const img = c.opened ? images.chestOpen : images.chestClosed;
    if (!drawCrop(img, crop, Math.floor(c.x - camX), Math.floor(c.y - camY), CHEST_DRAW.w, CHEST_DRAW.h)) {
      ctx.fillStyle = c.opened ? "#caa94a" : "#6b4a2b";
      ctx.fillRect(Math.floor(c.x - camX), Math.floor(c.y - camY), CHEST_DRAW.w, CHEST_DRAW.h);
    }
  }

  // obstacles (trees)
  for (const o of world.obstacles) {
    const dx = Math.floor((o.x - camX) - (TREE_DRAW.w - o.w) / 2);
    const dy = Math.floor((o.y - camY) - (TREE_DRAW.h - o.h) / 2);
    if (!drawCrop(images.forest, BIG_TREE_CROP, dx, dy, TREE_DRAW.w, TREE_DRAW.h)) {
      ctx.fillStyle = "#0a1a10";
      ctx.fillRect(Math.floor(o.x - camX), Math.floor(o.y - camY), o.w, o.h);
    }
  }

  // unicorn
  if (!world.unicorn.found && gameState === STATE.PLAY) {
    const u = world.unicorn;
    const bob = Math.sin(u.bobT * 6) * 2;
    drawCrop(
      images.unicorn,
      UNICORN_CROP,
      Math.floor(u.x - camX),
      Math.floor(u.y - camY + bob),
      UNICORN_DRAW.w,
      UNICORN_DRAW.h
    );
  }

  // sparkle trail
  for (const p of walkTrail) {
    const t = p.t / p.life;
    const a = 1 - t;
    ctx.globalAlpha = a;

    const px = Math.floor((p.x + p.driftX * t) - camX);
    const py = Math.floor((p.y + p.driftY * t) - camY);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px - p.size, py, p.size * 2, 1);
    ctx.fillRect(px, py - p.size, 1, p.size * 2);

    ctx.globalAlpha = 1;
  }

  // player
  if (ensurePlayerFramesReady()) {
    const crop = getPlayerCrop(player.dir, player.frame);
    const dx = Math.floor((player.x - camX) - (PLAYER.drawW - player.w) / 2);
    const dy = Math.floor((player.y - camY) - (PLAYER.drawH - player.h) / 2);

    ctx.drawImage(
      images.player,
      crop.sx, crop.sy, crop.sw, crop.sh,
      dx, dy, PLAYER.drawW, PLAYER.drawH
    );
  } else {
    ctx.fillStyle = "#ffccdd";
    ctx.fillRect(Math.floor(player.x - camX), Math.floor(player.y - camY), player.w, player.h);
  }

  // unicorn ambient sparkles
  for (const s of sparkles) {
    const t = s.t / s.life;
    const a = 1 - t;
    ctx.globalAlpha = a;

    const px = Math.floor(s.x - camX);
    const py = Math.floor(s.y - camY);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px - s.size, py, s.size * 2, 1);
    ctx.fillRect(px, py - s.size, 1, s.size * 2);

    ctx.globalAlpha = 1;
  }

  // UI
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(12, 12, 360, 80);
  ctx.fillStyle = "white";
  ctx.font = "16px system-ui";
  ctx.fillText(`Score: ${player.score}`, 24, 40);
  ctx.fillText(`Open chest: E`, 24, 62);

  // WIN overlay
  if (gameState === STATE.WIN) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    ctx.font = "36px system-ui";
    ctx.fillText("You found the magical unicorn!", 160, 255);

    ctx.font = "18px system-ui";
    ctx.fillText("Press Space to return to the title screen", 250, 300);
  }
}

// ---------- main loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  update(dt);

  if (gameState === STATE.TITLE) drawTitle();
  else drawWorld();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
