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

// ---------- assets ----------
const images = {
  title: loadImage("assets/title.png"),
  player: loadImage("assets/player.png"),
  unicorn: loadImage("assets/unicorn.png"),
  chestClosed: loadImage("assets/chest_closed.png"),
  chestOpen: loadImage("assets/chest_open.png"),
  forest: loadImage("assets/tree.png"),
};

// ---------- settings & math ----------
const STATE = { TITLE: "title", PLAY: "play", WIN: "win" };
let gameState = STATE.TITLE;
let globalTime = 0; // used for sparkling effects

const PLAYER_SHEET = {
  frameW: 512, // Based on your 2048px wide image (4 cols)
  frameH: 384, // Based on your 1536px tall image (4 rows)
  drawW: 80, 
  drawH: 60,
  // Match your player.png row order
  dirRow: { down: 0, right: 1, left: 2, up: 3 }
};

// Precise crops for your uploaded PNGs
const UNICORN_CROP = { sx: 310, sy: 250, sw: 400, sh: 450 };
const CHEST_CLOSED_CROP = { sx: 320, sy: 340, sw: 380, sh: 330 };
const CHEST_OPEN_CROP   = { sx: 600, sy: 270, sw: 380, sh: 450 };
const BIG_TREE_CROP = { sx: 1530, sy: 0, sw: 518, sh: 650 };

// ---------- input ----------
const keys = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// ---------- game state ----------
let world, player, sparkles = [], walkTrail = [];

function resetGame() {
  world = {
    w: 2200, h: 2200,
    obstacles: [
      { x: 420, y: 350, w: 90, h: 90 },
      { x: 900, y: 520, w: 90, h: 90 },
      { x: 1280, y: 820, w: 90, h: 90 },
    ],
    chests: [
      { x: 520, y: 780, opened: false },
      { x: 1600, y: 520, opened: false },
    ],
    unicorn: { x: 1920, y: 1850, homeX: 1920, homeY: 1850, vx: 35, vy: 22, found: false }
  };

  player = {
    x: 160, y: 160, w: 32, h: 32,
    speed: 230, score: 0, dir: "down", frame: 0, animTime: 0
  };
}

resetGame();

// ---------- update ----------
function update(dt) {
  globalTime += dt;

  if (gameState === STATE.TITLE) {
    if (keys.size > 0) gameState = STATE.PLAY;
    return;
  }

  if (gameState === STATE.WIN) {
    if (keys.has(" ")) { resetGame(); gameState = STATE.TITLE; }
    return;
  }

  // Movement
  let vx = 0, vy = 0;
  if (keys.has("arrowleft") || keys.has("a")) vx -= 1;
  if (keys.has("arrowright") || keys.has("d")) vx += 1;
  if (keys.has("arrowup") || keys.has("w")) vy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) vy += 1;

  if (vx !== 0 || vy !== 0) {
    if (Math.abs(vx) > Math.abs(vy)) player.dir = vx < 0 ? "left" : "right";
    else player.dir = vy < 0 ? "up" : "down";
    
    player.animTime += dt;
    if (player.animTime > 0.12) {
      player.animTime = 0;
      player.frame = (player.frame + 1) % 4;
    }
    // Movement collision
    const speed = vx !== 0 && vy !== 0 ? player.speed * 0.707 : player.speed;
    const nx = player.x + vx * speed * dt;
    const ny = player.y + vy * speed * dt;
    
    // Simple wall collision check
    if (nx > 0 && nx < world.w - player.w) player.x = nx;
    if (ny > 0 && ny < world.h - player.h) player.y = ny;
  } else {
    player.frame = 0;
  }

  // Interaction (Chest)
  if (keys.has("e")) {
    world.chests.forEach(c => {
      if (!c.opened && rectsOverlap(player, {x:c.x, y:c.y, w:64, h:64})) {
        c.opened = true;
        player.score += 10;
      }
    });
  }

  // Win condition
  if (rectsOverlap(player, {x:world.unicorn.x, y:world.unicorn.y, w:80, h:80})) {
    gameState = STATE.WIN;
  }
}

// ---------- draw ----------
function drawTitle() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (images.title.complete) {
    ctx.drawImage(images.title, 0, 0, canvas.width, canvas.height);
  }

  // Sparkling "Press Start" effect
  const opacity = 0.5 + Math.sin(globalTime * 5) * 0.5;
  ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
  ctx.font = "bold 28px system-ui";
  ctx.textAlign = "center";
  ctx.fillText("PRESS ANY KEY TO START", canvas.width / 2, canvas.height - 80);
  
  // Extra sparkles around text
  if (Math.random() > 0.8) {
     const sx = (canvas.width / 2) + (Math.random() * 200 - 100);
     const sy = (canvas.height - 80) + (Math.random() * 40 - 20);
     ctx.fillStyle = "white";
     ctx.fillRect(sx, sy, 2, 2);
  }
}

function drawWorld() {
  const camX = clamp(player.x - canvas.width / 2, 0, world.w - canvas.width);
  const camY = clamp(player.y - canvas.height / 2, 0, world.h - canvas.height);

  ctx.fillStyle = "#1a472a"; // Grass color
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Chests
  world.chests.forEach(c => {
    const img = c.opened ? images.chestOpen : images.chestClosed;
    const crop = c.opened ? CHEST_OPEN_CROP : CHEST_CLOSED_CROP;
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, c.x - camX, c.y - camY, 64, 64);
  });

  // Draw Unicorn
  ctx.drawImage(images.unicorn, UNICORN_CROP.sx, UNICORN_CROP.sy, UNICORN_CROP.sw, UNICORN_CROP.sh, world.unicorn.x - camX, world.unicorn.y - camY, 80, 90);

  // Draw Player (Fixed Slicing)
  const row = PLAYER_SHEET.dirRow[player.dir];
  const sx = player.frame * PLAYER_SHEET.frameW;
  const sy = row * PLAYER_SHEET.frameH;

  ctx.drawImage(
    images.player,
    sx, sy, PLAYER_SHEET.frameW, PLAYER_SHEET.frameH,
    Math.floor(player.x - camX - 24), Math.floor(player.y - camY - 24), 
    PLAYER_SHEET.drawW, PLAYER_SHEET.drawH
  );

  // UI
  ctx.fillStyle = "white";
  ctx.font = "20px Arial";
  ctx.fillText(`Score: ${player.score}`, 20, 40);

  if (gameState === STATE.WIN) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0,0, canvas.width, canvas.height);
    ctx.fillStyle = "gold";
    ctx.font = "40px system-ui";
    ctx.fillText("QUEST COMPLETE!", canvas.width/2 - 150, canvas.height/2);
  }
}

function loop(now) {
  const dt = 0.016; // fixed delta for simplicity
  update(dt);
  if (gameState === STATE.TITLE) drawTitle();
  else drawWorld();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
