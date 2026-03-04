const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

const images = {
  title: loadImage("assets/title.png"),
  player: loadImage("assets/player.png"),
  unicorn: loadImage("assets/unicorn.png"),
  chestClosed: loadImage("assets/chest_closed.png"),
  chestOpen: loadImage("assets/chest_open.png"),
  forest: loadImage("assets/tree.png"), // your tiles/trees sheet
};

const keys = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function drawCrop(img, crop, dx, dy, dw, dh) {
  if (!img.complete || !img.naturalWidth) return false;
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, dx, dy, dw, dh);
  return true;
}

// -------------------------
// GAME STATE
// -------------------------
const STATE = { TITLE: "title", PLAY: "play", WIN: "win" };
let gameState = STATE.TITLE;

// -------------------------
// ASSET CROPS (tuned to your uploaded images)
// -------------------------

// player.png sprite sheet (4x4). Treat as 2048x1528 so each frame is 512x382.
const PLAYER = {
  cols: 4,
  rows: 4,
  frameW: 512,
  frameH: 382,
  drawW: 64,
  drawH: 64,
  dirRow: { down: 0, left: 1, right: 2, up: 3 },
};

// unicorn.png crop (unicorn inside the big transparent canvas)
const UNICORN_CROP = { sx: 649, sy: 372, sw: 724, sh: 753 };
const UNICORN_DRAW = { w: 72, h: 72 };

// chest images crop
const CHEST_CLOSED_CROP = { sx: 142, sy: 313, sw: 316, sh: 285 };
const CHEST_OPEN_CROP   = { sx: 448, sy: 313, sw: 316, sh: 285 };
const CHEST_DRAW = { w: 64, h: 58 };

// forest sheet crops
const GRASS_TILE_CROP = { sx: 15, sy: 12, sw: 218, sh: 225 };     // top-left grass tile
const BIG_TREE_CROP   = { sx: 1552, sy: 4, sw: 465, sh: 416 };    // big tree
const TREE_DRAW = { w: 140, h: 125 };

// -------------------------
// WORLD / ENTITIES
// -------------------------
let world, player, sparkles;

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
    unicorn: { x: 1920, y: 1850, found: false }
  };

  player = {
    x: 160,
    y: 160,
    w: 32,  // collision box
    h: 32,
    speed: 230,
    score: 0,
    dir: "down",
    frame: 0,
    animTime: 0,
  };

  sparkles = [];
}

resetGame();

// -------------------------
// INPUT EDGE TRIGGERS
// -------------------------
let lastE = false;
let lastAnyStartKey = false;
let lastSpace = false;

function anyStartKeyDown() {
  // Any key works, but avoid letting E open chests on the very first frame
  // We accept Enter/Space/Arrow keys/WASD as "start" keys too.
  return (
    keys.size > 0 ||
    keys.has("enter") ||
    keys.has(" ") ||
    keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d") ||
    keys.has("arrowup") || keys.has("arrowdown") || keys.has("arrowleft") || keys.has("arrowright")
  );
}

// -------------------------
// SPARKLES
// -------------------------
function spawnSparkle(x, y) {
  sparkles.push({
    x: x + (Math.random() * 60 - 30),
    y: y + (Math.random() * 60 - 30),
    life: 0.6 + Math.random() * 0.5,
    t: 0,
    size: 2 + Math.random() * 2,
  });
}

// -------------------------
// MOVEMENT / COLLISION
// -------------------------
function tryMove(nx, ny) {
  const next = { x: nx, y: ny, w: player.w, h: player.h };

  // world bounds
  if (next.x < 0 || next.y < 0 || next.x + next.w > world.w || next.y + next.h > world.h) return false;

  // obstacles
  for (const o of world.obstacles) {
    if (rectsOverlap(next, o)) return false;
  }

  player.x = nx;
  player.y = ny;
  return true;
}

// -------------------------
// UPDATE
// -------------------------
function update(dt) {
  // TITLE: press any key to start
  if (gameState === STATE.TITLE) {
    const down = anyStartKeyDown();
    if (down && !lastAnyStartKey) {
      gameState = STATE.PLAY;
    }
    lastAnyStartKey = down;
    return;
  }

  // WIN: space to restart
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

  // movement input
  let vx = 0, vy = 0;
  if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
  if (keys.has("arrowright") || keys.has("d")) vx += 1;
  if (keys.has("arrowup") || keys.has("w")) vy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) vy += 1;

  // normalize diagonal
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
      player.frame = (player.frame + 1) % PLAYER.cols; // 0..3
    }
  } else {
    player.frame = 0;
    player.animTime = 0;
  }

  // move (axis separated)
  const nx = player.x + vx * player.speed * dt;
  const ny = player.y + vy * player.speed * dt;
  tryMove(nx, player.y);
  tryMove(player.x, ny);

  // open chest with E (edge-trigger)
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

  // find unicorn (touch to win)
  if (!world.unicorn.found) {
    const pRect = { x: player.x, y: player.y, w: player.w, h: player.h };
    const uRect = { x: world.unicorn.x, y: world.unicorn.y, w: UNICORN_DRAW.w, h: UNICORN_DRAW.h };
    if (rectsOverlap(pRect, uRect)) {
      world.unicorn.found = true;
      gameState = STATE.WIN;
    }
  }

  // sparkles around unicorn while playing
  if (!world.unicorn.found) {
    if (Math.random() < 0.22) spawnSparkle(world.unicorn.x + UNICORN_DRAW.w / 2, world.unicorn.y + UNICORN_DRAW.h / 2);
  }

  // update sparkles
  for (const s of sparkles) s.t += dt;
  sparkles = sparkles.filter(s => s.t < s.life);
}

// -------------------------
// DRAW HELPERS
// -------------------------
function drawTitleScreen() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw title.png to cover the canvas while preserving aspect ratio
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
    // fallback
    ctx.fillStyle = "#0b0f0c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "42px system-ui";
    ctx.fillText("UNICORN QUEST", 260, 240);
  }

  // overlay "Press any key"
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, canvas.height - 92, canvas.width, 92);

  ctx.fillStyle = "white";
  ctx.font = "22px system-ui";
  ctx.fillText("Press any key to start", 340, canvas.height - 40);

  ctx.font = "14px system-ui";
  ctx.fillText("Move: WASD / Arrow Keys    Open chest: E", 300, canvas.height - 18);
}

function drawWorld() {
  // camera
  const camX = clamp(player.x - canvas.width / 2, 0, world.w - canvas.width);
  const camY = clamp(player.y - canvas.height / 2, 0, world.h - canvas.height);

  // background grass tiling
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (images.forest.complete && images.forest.naturalWidth) {
    const tileW = 96;
    const tileH = 96;

    const startX = Math.floor(camX / tileW) * tileW;
    const startY = Math.floor(camY / tileH) * tileH;

    for (let y = startY; y < camY + canvas.height + tileH; y += tileH) {
      for (let x = startX; x < camX + canvas.width + tileW; x += tileW) {
        ctx.drawImage(
          images.forest,
          GRASS_TILE_CROP.sx, GRASS_TILE_CROP.sy, GRASS_TILE_CROP.sw, GRASS_TILE_CROP.sh,
          Math.floor(x - camX), Math.floor(y - camY),
          tileW, tileH
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

  // unicorn (only during play; on win we handle different overlay)
  if (!world.unicorn.found && gameState === STATE.PLAY) {
    if (!drawCrop(
      images.unicorn,
      UNICORN_CROP,
      Math.floor(world.unicorn.x - camX),
      Math.floor(world.unicorn.y - camY),
      UNICORN_DRAW.w,
      UNICORN_DRAW.h
    )) {
      ctx.fillStyle = "#d9d9ff";
      ctx.fillRect(Math.floor(world.unicorn.x - camX), Math.floor(world.unicorn.y - camY), UNICORN_DRAW.w, UNICORN_DRAW.h);
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

  // player sprite sheet
  if (images.player.complete && images.player.naturalWidth) {
    const row = PLAYER.dirRow[player.dir] ?? 0;
    const col = player.frame;
    const sx = col * PLAYER.frameW;
    const sy = row * PLAYER.frameH;

    const dx = Math.floor((player.x - camX) - (PLAYER.drawW - player.w) / 2);
    const dy = Math.floor((player.y - camY) - (PLAYER.drawH - player.h) / 2);

    ctx.drawImage(
      images.player,
      sx, sy, PLAYER.frameW, PLAYER.frameH,
      dx, dy, PLAYER.drawW, PLAYER.drawH
    );
  } else {
    ctx.fillStyle = "#ffccdd";
    ctx.fillRect(Math.floor(player.x - camX), Math.floor(player.y - camY), player.w, player.h);
  }

  // sparkles
  for (const s of sparkles) {
    const t = s.t / s.life;
    const a = 1 - t;
    ctx.globalAlpha = a;
    const px = Math.floor((s.x - camX));
    const py = Math.floor((s.y - camY));
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

// -------------------------
// MAIN LOOP
// -------------------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  update(dt);

  if (gameState === STATE.TITLE) {
    drawTitleScreen();
  } else {
    drawWorld();
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);