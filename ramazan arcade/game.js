const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 40;
const COLS = 15;
const ROWS = 15;

const keys = {};
let lastPState = false;

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyP' && !lastPState) {
        if (gameState === 'playing') {
            gameState = 'paused';
            document.getElementById('pause-screen').style.display = 'flex';
        } else if (gameState === 'paused') {
            resumeGame();
        }
        lastPState = true;
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyP') lastPState = false;
});

let grid = [];
let particles = [];
let items = [];
let enemies = [];
let projectiles = [];
let boss = null;
let currentLevel = 1;

// Now 'menu' is the starting state
let gameState = 'menu'; // 'menu', 'playing', 'paused', 'transition', 'gameover'
let transitionTimer = 0;
let cannons = []; // Moved to top

let totalOlives = 0;
let olivesCollected = 0;
let globalScore = 0;

let currentMode = localStorage.getItem('ramadanGameMode') || 'iftar';

function toggleMode() {
    currentMode = (currentMode === 'iftar') ? 'sahur' : 'iftar';
    localStorage.setItem('ramadanGameMode', currentMode);
    applyMode();
}

function applyMode() {
    const menu = document.getElementById('menu-screen');
    const btn = document.getElementById('mode-toggle-btn');
    if (menu) {
        menu.classList.remove('iftar', 'sahur');
        menu.classList.add(currentMode);
    }
    if (btn) {
        btn.innerText = `MOD: ${currentMode.toUpperCase()}`;
        btn.style.backgroundColor = (currentMode === 'iftar') ? '#4338ca' : '#1e1b4b';
    }
}
// Initial apply
setTimeout(applyMode, 100);

// Load 4 directional player sprites for P1 and P2
// P1: save as p1_up.png, p1_down.png, p1_left.png, p1_right.png
// P2: save as p2_up.png, p2_down.png, p2_left.png, p2_right.png
function loadSprites(prefix) {
    const s = {
        up: new Image(),
        down: new Image(),
        left: new Image(),
        right: new Image(),
    };
    s.up.src = `${prefix}_up.png`;
    s.down.src = `${prefix}_down.png`;
    s.left.src = `${prefix}_left.png`;
    s.right.src = `${prefix}_right.png`;
    return s;
}
const p1Sprites = loadSprites('p1');
const p2Sprites = loadSprites('p2');

// Load custom images for customization
const teaSprites = loadSprites('tea'); // tea_up.png, tea_down.png, etc.
const drummerSprites = loadSprites('drummer'); // drummer_up.png, drummer_down.png, etc.

// Background Music setup
const menuMusic = new Audio('menu_bg.mp3');
menuMusic.loop = true;
const gameMusic = new Audio('game_bg.mp3');
gameMusic.loop = true;

function manageMusic() {
    if (!soundEnabled) {
        menuMusic.pause();
        gameMusic.pause();
        return;
    }

    if (gameState === 'menu') {
        if (menuMusic.paused) menuMusic.play().catch(e => console.log("Music play blocked:", e));
        gameMusic.pause();
        gameMusic.currentTime = 0;
    } else if (gameState === 'playing' || gameState === 'paused' || gameState === 'transition') {
        if (gameMusic.paused) gameMusic.play().catch(e => console.log("Music play blocked:", e));
        menuMusic.pause();
        menuMusic.currentTime = 0;
    } else {
        menuMusic.pause();
        gameMusic.pause();
    }
}

// Load Floor Texture
let floorPattern = null;
const floorImage = new Image();
floorImage.src = 'bg.png';
floorImage.onload = () => {
    floorPattern = ctx.createPattern(floorImage, 'repeat');
};

function createMeltParticles(gridX, gridY) {
    const pX = gridX * TILE_SIZE + TILE_SIZE / 2;
    const pY = gridY * TILE_SIZE + TILE_SIZE / 2;
    for (let i = 0; i < 20; i++) {
        particles.push({
            x: pX,
            y: pY,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.0,
            decay: 0.02 + Math.random() * 0.03
        });
    }
}

class Item {
    constructor(gridX, gridY, type) {
        this.gridX = gridX;
        this.gridY = gridY;
        this.x = gridX * TILE_SIZE;
        this.y = gridY * TILE_SIZE;
        this.type = type;
        this.bobOffset = 0;
        this.bobTime = Math.random() * Math.PI * 2;
    }
    update() {
        this.bobTime += 0.1;
        this.bobOffset = Math.sin(this.bobTime) * 3;
    }
    draw() {
        if (this.type === 'olive') {
            let cx = this.x + TILE_SIZE / 2;
            let cy = this.y + TILE_SIZE / 2 + this.bobOffset;

            // Larger olive body
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.ellipse(cx, cy, 13, 16, -0.2, 0, Math.PI * 2);
            ctx.fill();

            // Darker outline
            ctx.strokeStyle = '#14532d';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath();
            ctx.ellipse(cx - 4, cy - 4, 5, 7, -0.4, 0, Math.PI * 2);
            ctx.fill();

            // Red pimento center
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(cx + 2, cy + 1, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class Enemy {
    constructor(startX, startY, type) {
        this.gridX = startX;
        this.gridY = startY;
        this.x = startX * TILE_SIZE;
        this.y = startY * TILE_SIZE;
        this.targetX = this.x;
        this.targetY = this.y;
        this.type = type; // 'tea' or 'date'

        // Slower base speeds as requested
        let baseSpeed = type === 'date' ? 1.0 : 0.4;
        this.speed = baseSpeed + (currentLevel * 0.1);

        this.isMoving = false;
        this.dirX = 1;
        this.dirY = 0;
        this.bounceHeight = 0;
        this.bounceTime = 0;

        this.state = 'move';
        this.breakTimer = 0;
        this.breakGridX = 0;
        this.breakGridY = 0;
    }

    update() {
        if (this.state === 'breaking') {
            this.breakTimer--;
            if (this.breakTimer <= 0) {
                // Break it
                if (grid[this.breakGridX][this.breakGridY] && grid[this.breakGridX][this.breakGridY].type === 'lokum') {
                    createMeltParticles(this.breakGridX, this.breakGridY);
                    if (grid[this.breakGridX][this.breakGridY].hasOlive) items.push(new Item(this.breakGridX, this.breakGridY, 'olive'));
                    grid[this.breakGridX][this.breakGridY] = null;
                }

                this.targetX = this.breakGridX * TILE_SIZE;
                this.targetY = this.breakGridY * TILE_SIZE;
                this.isMoving = true;
                this.state = 'move';
            }
            // Check collision while breaking
            for (let p of [p1, p2]) {
                let px = p.x + TILE_SIZE / 2, py = p.y + TILE_SIZE / 2;
                let ex = this.x + TILE_SIZE / 2, ey = this.y + TILE_SIZE / 2;
                if (Math.hypot(px - ex, py - ey) < TILE_SIZE * 0.7 && p.invulTimer <= 0) {
                    if (this.type === 'tea') {
                        gameState = 'gameover';
                    } else if (p.stunTimer <= 0) {
                        p.stunTimer = 60;
                        p.invulTimer = 120;
                    }
                }
            }
            return;
        }

        if (this.isMoving) {
            let dx = this.targetX - this.x;
            let dy = this.targetY - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (this.type === 'date') {
                this.bounceTime += 0.15;
                this.bounceHeight = Math.abs(Math.sin(this.bounceTime)) * 15;
            }

            if (dist < this.speed) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.gridX = Math.round(this.targetX / TILE_SIZE);
                this.gridY = Math.round(this.targetY / TILE_SIZE);
                this.isMoving = false;
                this.bounceHeight = 0;
            } else {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
        } else {
            let dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
            let forward = dirs.find(d => d.x === this.dirX && d.y === this.dirY);
            let possibleDirs = [];
            for (let d of dirs) {
                let tx = this.gridX + d.x;
                let ty = this.gridY + d.y;
                if (tx >= 1 && tx < COLS - 1 && ty >= 1 && ty < ROWS - 1) {
                    let cell = grid[tx][ty];
                    if (this.type === 'tea') {
                        // Tea cannot pass through Bread (walls)
                        if (!cell || cell.type !== 'bread') possibleDirs.push(d);
                    } else if (this.type === 'date') {
                        // Date can jump over Lokum, but NOT pass through Bread
                        if (!cell || cell.type !== 'bread') possibleDirs.push(d);
                    }
                }
            }

            if (possibleDirs.length > 0) {
                let chosenDir = possibleDirs.includes(forward) && Math.random() < 0.7 ? forward : possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
                this.dirX = chosenDir.x;
                this.dirY = chosenDir.y;
                let tx = this.gridX + this.dirX;
                let ty = this.gridY + this.dirY;

                if (this.type === 'tea' && grid[tx][ty] && grid[tx][ty].type === 'lokum') {
                    this.state = 'breaking';
                    this.breakTimer = 45; // 0.75 seconds to break
                    this.breakGridX = tx;
                    this.breakGridY = ty;
                } else {
                    this.targetX = tx * TILE_SIZE;
                    this.targetY = ty * TILE_SIZE;
                    this.isMoving = true;
                    this.bounceTime = 0;
                }
            } else {
                this.dirX *= -1;
                this.dirY *= -1;
            }
        }

        // Touch damage (tea kills, date stuns)
        for (let p of [p1, p2]) {
            let px = p.x + TILE_SIZE / 2, py = p.y + TILE_SIZE / 2;
            let ex = this.x + TILE_SIZE / 2, ey = this.y + TILE_SIZE / 2;
            if (Math.hypot(px - ex, py - ey) < TILE_SIZE * 0.7 && p.invulTimer <= 0) {
                if (this.type === 'tea') {
                    // Tea is lethal - game over!
                    gameState = 'gameover';
                } else {
                    // Date just stuns
                    if (p.stunTimer <= 0) {
                        p.stunTimer = 60;
                        p.invulTimer = 120;
                    }
                }
            }
        }
    }

    draw() {
        if (this.type === 'tea') {
            let sprite;
            if (this.dirY === -1) sprite = teaSprites.up;
            else if (this.dirY === 1) sprite = teaSprites.down;
            else if (this.dirX === -1) sprite = teaSprites.left;
            else sprite = teaSprites.right;

            if (sprite.complete && sprite.naturalWidth > 0) {
                let renderX = this.x;
                let renderY = this.y;
                if (this.state === 'breaking') {
                    renderX += (Math.random() - 0.5) * 4;
                    renderY += (Math.random() - 0.5) * 4;
                }
                ctx.drawImage(sprite, renderX, renderY, TILE_SIZE, TILE_SIZE);
            } else {
                ctx.fillStyle = '#b91c1c';
                let renderX = this.x;
                let renderY = this.y;
                if (this.state === 'breaking') {
                    renderX += (Math.random() - 0.5) * 4;
                    renderY += (Math.random() - 0.5) * 4;
                }
                ctx.fillRect(renderX + 8, renderY + 12, TILE_SIZE - 16, TILE_SIZE - 16);
                ctx.fillStyle = '#fca5a5';
                let steamHeight = this.state === 'breaking' ? 10 + Math.sin(this.breakTimer * 0.5) * 4 : 6;
                let steamY = renderY + 10 - (steamHeight - 6);
                ctx.fillRect(renderX + 10, steamY, TILE_SIZE - 20, steamHeight);
            }
        } else if (this.type === 'date') {
            ctx.fillStyle = '#78350f';
            ctx.beginPath();
            ctx.ellipse(this.x + TILE_SIZE / 2, this.y + TILE_SIZE / 2 - this.bounceHeight, 14, 10, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class Projectile {
    constructor(x, y, dx, dy, type) {
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.dy = dy;
        this.type = type; // 'note' or 'cannonball'
        this.speed = type === 'cannonball' ? 2 : 3; // Slightly faster for visibility but still slow
        this.active = true;
    }
    update() {
        this.x += this.dx * this.speed;
        this.y += this.dy * this.speed;

        let gX = Math.floor(this.x / TILE_SIZE);
        let gY = Math.floor(this.y / TILE_SIZE);
        if (gX < 0 || gX >= COLS || gY < 0 || gY >= ROWS) {
            this.active = false;
            return;
        }

        let cell = grid[gX] && grid[gX][gY];
        // Cannonballs pass OVER bread (walls) now
        if (cell && cell.type === 'bread' && this.type !== 'cannonball') {
            this.active = false;
            return;
        }
        // Cannonballs destroy Lokum they pass through
        if (this.type === 'cannonball' && cell && cell.type === 'lokum') {
            createMeltParticles(gX, gY);
            globalScore += 5;
            if (cell.hasOlive) items.push(new Item(gX, gY, 'olive'));
            grid[gX][gY] = null;
        }

        for (let p of [p1, p2]) {
            if (Math.hypot(this.x - (p.x + TILE_SIZE / 2), this.y - (p.y + TILE_SIZE / 2)) < TILE_SIZE * 0.6 && p.invulTimer <= 0) {
                if (this.type === 'cannonball') {
                    gameState = 'gameover'; // Cannonball is lethal!
                } else {
                    if (p.stunTimer <= 0) { p.stunTimer = 90; p.invulTimer = 150; }
                }
                this.active = false;
            }
        }
    }
    draw() {
        if (this.type === 'note') {
            ctx.fillStyle = '#fbbf24';
            ctx.font = '20px Arial';
            ctx.fillText('♪', this.x, this.y + 10);
        } else if (this.type === 'cannonball') {
            // Dark metal cannonball with shine
            ctx.fillStyle = '#1c1917';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.arc(this.x - 2, this.y - 2, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

class BossDrummer {
    constructor(startX, startY) {
        this.gridX = startX;
        this.gridY = startY;
        this.x = startX * TILE_SIZE;
        this.y = startY * TILE_SIZE;
        this.targetX = this.x;
        this.targetY = this.y;

        // Dynamic speed based on level, slower
        this.speed = 0.8 + (currentLevel * 0.1);

        this.dirX = 0;
        this.dirY = 1;
        this.isMoving = false;
        this.state = 'move'; // move, prep, shoot
        this.timer = 120;
    }

    update() {
        if (this.state === 'move') {
            this.timer--;
            if (this.timer <= 0 && !this.isMoving) {
                this.state = 'prep';
                this.timer = 30; // 0.5s prep
            } else if (!this.isMoving) {
                let dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
                let targetDir = dirs[Math.floor(Math.random() * dirs.length)];
                let tx = this.gridX + targetDir.x;
                let ty = this.gridY + targetDir.y;
                if (tx >= 1 && tx < COLS - 1 && ty >= 1 && ty < ROWS - 1) {
                    if (!grid[tx][ty] || grid[tx][ty].type !== 'bread') {
                        this.dirX = targetDir.x;
                        this.dirY = targetDir.y;
                        if (grid[tx][ty] && grid[tx][ty].type === 'lokum') {
                            createMeltParticles(tx, ty);
                            if (grid[tx][ty].hasOlive) items.push(new Item(tx, ty, 'olive'));
                            grid[tx][ty] = null;
                        }
                        this.targetX = tx * TILE_SIZE;
                        this.targetY = ty * TILE_SIZE;
                        this.isMoving = true;
                    }
                }
            }

            if (this.isMoving) {
                let dx = this.targetX - this.x;
                let dy = this.targetY - this.y;
                let dist = Math.hypot(dx, dy);
                if (dist < this.speed) {
                    this.x = this.targetX; this.y = this.targetY;
                    this.gridX = Math.round(this.targetX / TILE_SIZE);
                    this.gridY = Math.round(this.targetY / TILE_SIZE);
                    this.isMoving = false;
                } else {
                    this.x += (dx / dist) * this.speed;
                    this.y += (dy / dist) * this.speed;
                }
            }
        } else if (this.state === 'prep') {
            this.timer--;
            if (this.timer <= 0) {
                // Shoot notes
                let cX = this.x + TILE_SIZE / 2, cY = this.y + TILE_SIZE / 2;
                projectiles.push(new Projectile(cX, cY, 0, -1, 'note'));
                projectiles.push(new Projectile(cX, cY, 0, 1, 'note'));
                projectiles.push(new Projectile(cX, cY, -1, 0, 'note'));
                projectiles.push(new Projectile(cX, cY, 1, 0, 'note'));
                this.state = 'move';
                this.timer = 120 + Math.random() * 60;
            }
        }

        // Touch damage
        for (let p of [p1, p2]) {
            if (Math.hypot(this.x - p.x, this.y - p.y) < TILE_SIZE * 0.8 && p.stunTimer <= 0 && p.invulTimer <= 0) {
                p.stunTimer = 60; p.invulTimer = 120;
            }
        }
    }

    draw() {
        let sprite;
        if (this.dirY === -1) sprite = drummerSprites.up;
        else if (this.dirY === 1) sprite = drummerSprites.down;
        else if (this.dirX === -1) sprite = drummerSprites.left;
        else sprite = drummerSprites.right;

        if (sprite.complete && sprite.naturalWidth > 0) {
            ctx.drawImage(sprite, this.x, this.y, TILE_SIZE, TILE_SIZE);
        } else {
            ctx.fillStyle = '#fb923c'; // Orange drummer
            ctx.fillRect(this.x + 2, this.y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.fillStyle = '#78350f'; // Drum
            ctx.fillRect(this.x + 8, this.y + 16, TILE_SIZE - 16, 12);
        }
        if (this.state === 'prep') {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillRect(this.x, this.y, TILE_SIZE, TILE_SIZE);
        }
    }
}

class BossSun {
    constructor() {
        this.state = 'idle';
        this.timer = 180;
        this.targetCols = [];
        this.speedFactor = 1 + (currentLevel * 0.1); // Slower scaling
    }

    update() {
        if (this.state === 'idle') {
            this.timer--;
            if (this.timer <= 0) {
                this.state = 'warn';
                this.timer = Math.max(45, 90 / this.speedFactor); // Longer warning time (slower)
                // Pick 3 random columns
                this.targetCols = [];
                for (let i = 0; i < 3; i++) {
                    this.targetCols.push(Math.floor(Math.random() * (COLS - 2)) + 1);
                }
            }
        } else if (this.state === 'warn') {
            this.timer--;
            if (this.timer <= 0) {
                this.state = 'fire';
                this.timer = 30; // Fire for 0.5s

                // Only damage players in the fired column, no lokum melting
                for (let col of this.targetCols) {
                    let rx1 = col * TILE_SIZE, rx2 = rx1 + TILE_SIZE;
                    for (let p of [p1, p2]) {
                        if (p.x + TILE_SIZE / 2 >= rx1 && p.x + TILE_SIZE / 2 <= rx2 && p.stunTimer <= 0 && p.invulTimer <= 0) {
                            gameState = 'gameover'; // Sun is lethal!
                        }
                    }
                }
            }
        } else if (this.state === 'fire') {
            this.timer--;
            if (this.timer <= 0) {
                this.state = 'idle';
                this.timer = 150;
                this.targetCols = [];
            }
        }
    }

    draw() {
        // Draw the sun at the top middle UI layer
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, -10, 50, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000'; // Smile
        ctx.beginPath();
        ctx.arc(canvas.width / 2, 5, 20, 0, Math.PI);
        ctx.stroke();

        if (this.state === 'warn') {
            for (let col of this.targetCols) {
                ctx.fillStyle = 'rgba(253, 224, 71, 0.3)';
                ctx.fillRect(col * TILE_SIZE, 0, TILE_SIZE, canvas.height);
            }
        } else if (this.state === 'fire') {
            for (let col of this.targetCols) {
                ctx.fillStyle = 'rgba(253, 224, 71, 0.8)';
                ctx.fillRect(col * TILE_SIZE, 0, TILE_SIZE, canvas.height);
                ctx.fillStyle = '#fff';
                ctx.fillRect(col * TILE_SIZE + 8, 0, TILE_SIZE - 16, canvas.height);
            }
        }
    }
}

class Player {
    constructor(id, startX, startY, color, controls, sprites) {
        this.id = id;
        this.gridX = startX;
        this.gridY = startY;
        this.x = startX * TILE_SIZE;
        this.y = startY * TILE_SIZE;
        this.targetX = startX * TILE_SIZE;
        this.targetY = startY * TILE_SIZE;
        this.color = color;
        this.controls = controls;

        // Slower sliding movement, 1 block at a time.
        this.speed = 4;
        this.isMoving = false;
        this.dirX = 0;
        this.dirY = 1;
        this.cooldown = 0;
        this.stunTimer = 0;
        this.invulTimer = 0;
        this.moveCooldown = 0; // Throttle to prevent immediate zip across map
        this.sprites = sprites; // Directional sprite set for this player

        // Action state logic for delayed block creation/destruction
        this.actionState = 'idle'; // 'idle', 'creating', 'destroying'
        this.actionTimer = 0;
        this.actionX = 0;
        this.actionY = 0;
    }

    update() {
        if (this.invulTimer > 0) this.invulTimer--;
        if (this.moveCooldown > 0) this.moveCooldown--;

        if (this.stunTimer > 0) {
            this.stunTimer--;
            return;
        }

        // Handle animation state machine for creating/destroying blocks
        if (this.actionState !== 'idle') {
            this.actionTimer--;
            if (this.actionTimer <= 0) {
                let tx = this.actionX;
                let ty = this.actionY;

                if (tx >= 1 && tx < COLS - 1 && ty >= 1 && ty < ROWS - 1) {
                    if (this.actionState === 'destroying') {
                        if (!grid[tx][ty] || grid[tx][ty].type !== 'lokum') {
                            this.actionState = 'idle';
                            this.cooldown = 10;
                        } else {
                            createMeltParticles(tx, ty);
                            globalScore += 5;
                            if (grid[tx][ty].hasOlive) items.push(new Item(tx, ty, 'olive'));
                            grid[tx][ty] = null;

                            this.actionX += this.dirX;
                            this.actionY += this.dirY;
                            this.actionTimer = 8; // delay per block destroyed (slower)
                        }
                    } else if (this.actionState === 'creating') {
                        let p1InWay = Math.round(p1.targetX / TILE_SIZE) === tx && Math.round(p1.targetY / TILE_SIZE) === ty;
                        let p2InWay = Math.round(p2.targetX / TILE_SIZE) === tx && Math.round(p2.targetY / TILE_SIZE) === ty;
                        let enemyInWay = enemies.some(e => Math.round(e.targetX / TILE_SIZE) === tx && Math.round(e.targetY / TILE_SIZE) === ty);

                        if (grid[tx][ty] || p1InWay || p2InWay || enemyInWay) {
                            this.actionState = 'idle';
                            this.cooldown = 10;
                        } else {
                            // Create some poof particles for creation
                            createMeltParticles(tx, ty);
                            grid[tx][ty] = { type: 'lokum', hasOlive: false };
                            globalScore += 2;

                            this.actionX += this.dirX;
                            this.actionY += this.dirY;
                            this.actionTimer = 6; // delay per block created (slower)
                        }
                    }
                } else {
                    this.actionState = 'idle';
                    this.cooldown = 10;
                }
            }
            return; // Cannot move while casting action
        }

        if (this.cooldown > 0) this.cooldown--;

        if (this.isMoving) {
            let dx = this.targetX - this.x;
            let dy = this.targetY - this.y;
            let dist = Math.hypot(dx, dy);

            if (dist <= this.speed) {
                this.x = this.targetX;
                this.y = this.targetY;
                this.gridX = Math.round(this.targetX / TILE_SIZE);
                this.gridY = Math.round(this.targetY / TILE_SIZE);
                this.isMoving = false;

                for (let i = items.length - 1; i >= 0; i--) {
                    let item = items[i];
                    if (item.gridX === this.gridX && item.gridY === this.gridY && item.type === 'olive') {
                        olivesCollected++;
                        globalScore += 50; // Points for olive
                        items.splice(i, 1);
                    }
                }
            } else {
                this.x += (dx / dist) * this.speed;
                this.y += (dy / dist) * this.speed;
            }
        } else if (this.moveCooldown <= 0) {
            let nx = 0, ny = 0;
            // Add a small input delay to prevent sliding too fast when holding the key down continuously
            if (keys[this.controls.up]) { ny = -1; this.dirX = 0; this.dirY = -1; }
            else if (keys[this.controls.down]) { ny = 1; this.dirX = 0; this.dirY = 1; }
            else if (keys[this.controls.left]) { nx = -1; this.dirX = -1; this.dirY = 0; }
            else if (keys[this.controls.right]) { nx = 1; this.dirX = 1; this.dirY = 0; }

            if (nx !== 0 || ny !== 0) {
                let targetGridX = this.gridX + nx;
                let targetGridY = this.gridY + ny;
                if (targetGridX >= 0 && targetGridX < COLS && targetGridY >= 0 && targetGridY < ROWS) {
                    let cell = grid[targetGridX][targetGridY];
                    if (!cell) {
                        this.targetX = targetGridX * TILE_SIZE;
                        this.targetY = targetGridY * TILE_SIZE;
                        this.isMoving = true;
                        this.moveCooldown = 2; // small throttle before taking next input
                    }
                }
            }
        }

        if (!this.isMoving && this.cooldown <= 0) {
            let actionX = this.gridX + this.dirX;
            let actionY = this.gridY + this.dirY;

            if (actionX >= 1 && actionX < COLS - 1 && actionY >= 1 && actionY < ROWS - 1) {
                if (keys[this.controls.action]) {
                    let firstCell = grid[actionX][actionY];

                    if (firstCell && firstCell.type === 'lokum') {
                        // Start Destroying Sequence
                        this.actionState = 'destroying';
                        this.actionX = actionX;
                        this.actionY = actionY;
                        this.actionTimer = 5; // initial windup
                    } else if (!firstCell) {
                        // Start Creating Sequence
                        let p1InWay = Math.round(p1.targetX / TILE_SIZE) === actionX && Math.round(p1.targetY / TILE_SIZE) === actionY;
                        let p2InWay = Math.round(p2.targetX / TILE_SIZE) === actionX && Math.round(p2.targetY / TILE_SIZE) === actionY;
                        let enemyInWay = enemies.some(e => Math.round(e.targetX / TILE_SIZE) === actionX && Math.round(e.targetY / TILE_SIZE) === actionY);

                        if (!p1InWay && !p2InWay && !enemyInWay) {
                            this.actionState = 'creating';
                            this.actionX = actionX;
                            this.actionY = actionY;
                            this.actionTimer = 5; // initial windup
                        }
                    }
                }
            }
        }
    }

    draw() {
        if (this.invulTimer > 0 && Math.floor(Date.now() / 100) % 2 === 0) return; // Blink

        // Determine which directional sprite to use from this player's own set
        let sprite;
        if (this.dirY === -1) sprite = this.sprites.up;
        else if (this.dirY === 1) sprite = this.sprites.down;
        else if (this.dirX === -1) sprite = this.sprites.left;
        else sprite = this.sprites.right;

        // Wiggle animation if casting action
        let renderX = this.x;
        let renderY = this.y;
        if (this.actionState !== 'idle') {
            renderX += (Math.random() - 0.5) * 4;
            renderY += (Math.random() - 0.5) * 4;
        }

        if (sprite.complete && sprite.naturalWidth > 0) {
            ctx.drawImage(sprite, renderX, renderY, TILE_SIZE, TILE_SIZE);
        } else {
            // Fallback if sprite not loaded
            ctx.fillStyle = this.color;
            ctx.fillRect(renderX + 4, renderY + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.fillStyle = '#fff';
            let eyeX = renderX + TILE_SIZE / 2 + this.dirX * 10;
            let eyeY = renderY + TILE_SIZE / 2 + this.dirY * 10;
            ctx.fillRect(eyeX - 2, eyeY - 2, 4, 4);
        }

        if (this.stunTimer > 0) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.fillText('zZ', this.x + 10, this.y - 5);
        }
    }
}

const p1Controls = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: 'KeyX' };
const p2Controls = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', action: 'Space' };

let p1 = new Player('P1', 1, 1, '#38bdf8', p1Controls, p1Sprites);
let p2 = new Player('P2', COLS - 2, ROWS - 2, '#a3e635', p2Controls, p2Sprites);

function startGame(level) {
    currentLevel = level;
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'flex';
    document.getElementById('gameCanvas').style.display = 'block';
    globalScore = 0; // Reset score on fresh start from menu
    initLevel();
}

// Global Pause Menu Functions
function resumeGame() {
    gameState = 'playing';
    document.getElementById('pause-screen').style.display = 'none';
}

function restartLevel() {
    document.getElementById('pause-screen').style.display = 'none';
    initLevel(); // Just reload the current level from scratch
}

let soundEnabled = true;
function toggleSound() {
    soundEnabled = !soundEnabled;
    let btn = document.getElementById('soundBtn');
    if (soundEnabled) {
        btn.innerHTML = '&#9834; SES: AÇIK';
    } else {
        btn.innerHTML = '&#9834; SES: KAPALI';
        menuMusic.pause();
        gameMusic.pause();
    }
}

function goToMainMenu() {
    gameState = 'menu';
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'none';
    document.getElementById('gameCanvas').style.display = 'none';
    document.getElementById('menu-screen').style.display = 'flex';
}

function initLevel() {
    olivesCollected = 0;
    totalOlives = 0;
    items = [];
    enemies = [];
    projectiles = [];
    cannons = [];
    boss = null;
    grid = [];
    gameState = 'playing';

    // Reset players
    p1.x = p1.targetX = 1 * TILE_SIZE; p1.y = p1.targetY = 1 * TILE_SIZE; p1.gridX = 1; p1.gridY = 1; p1.isMoving = false;
    p2.x = p2.targetX = (COLS - 2) * TILE_SIZE; p2.y = p2.targetY = (ROWS - 2) * TILE_SIZE; p2.gridX = COLS - 2; p2.gridY = ROWS - 2; p2.isMoving = false;

    for (let x = 0; x < COLS; x++) {
        grid[x] = [];
        for (let y = 0; y < ROWS; y++) {
            grid[x][y] = null;
        }
    }

    for (let i = 0; i < COLS; i++) {
        grid[i][0] = grid[i][ROWS - 1] = { type: 'bread' };
    }
    for (let i = 0; i < ROWS; i++) {
        grid[0][i] = grid[COLS - 1][i] = { type: 'bread' };
    }

    // Place Ramazan Cannons on the WALLS (outer boundary), firing inward
    // Top row fires downward, bottom fires up, left fires right, right fires left
    cannons.push(new RamadanCannon(3, 0, 0, 1));   // top wall
    cannons.push(new RamadanCannon(11, 0, 0, 1));  // top wall
    cannons.push(new RamadanCannon(0, 5, 1, 0));   // left wall
    cannons.push(new RamadanCannon(COLS - 1, 10, -1, 0)); // right wall
    cannons.push(new RamadanCannon(7, ROWS - 1, 0, -1)); // bottom wall

    // Level specific layouts
    if (currentLevel === 1) {
        for (let x = 3; x < COLS - 3; x += 2) for (let y = 3; y < ROWS - 3; y += 2) grid[x][y] = { type: 'bread' };
        enemies.push(new Enemy(7, 7, 'tea'));
    } else if (currentLevel === 2) {
        grid[5][5] = grid[9][5] = grid[5][9] = grid[9][9] = { type: 'bread' };
        boss = new BossDrummer(7, 7);
        enemies.push(new Enemy(12, 2, 'tea'));
    } else if (currentLevel === 3) {
        boss = new BossSun();
        enemies.push(new Enemy(6, 6, 'tea'));
        enemies.push(new Enemy(8, 8, 'tea'));
    }

    // Add random lokums and exactly 5 olives
    let emptyCells = [];
    for (let x = 2; x < COLS - 2; x++) {
        for (let y = 2; y < ROWS - 2; y++) {
            if (!grid[x][y] && (x !== 1 || y !== 1) && (x !== COLS - 2 || y !== ROWS - 2)) {
                emptyCells.push({ x, y });
            }
        }
    }
    // Shuffle cells
    emptyCells.sort(() => Math.random() - 0.5);
    for (let i = 0; i < emptyCells.length && i < 30; i++) {
        let cell = emptyCells[i];
        let isOlive = i < 5; // First 5 lokums get olives
        grid[cell.x][cell.y] = { type: 'lokum', hasOlive: isOlive };
        if (isOlive) totalOlives++;
    }
    // Only init inside startGame when invoked via menu
}

// Don't auto-init, but draw menu backdrop if wanted
// initLevel();

// ── Web Audio cannon sound ──────────────────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playCannonSound() {
    try {
        const bufferSize = audioCtx.sampleRate * 0.3;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
        }
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); // Reduced volume to 50% (was 0.6)
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        src.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        src.start();
    } catch (e) { }
}

// ── Ramazan Cannon class ────────────────────────────────────────────────────

class RamadanCannon {
    constructor(gridX, gridY, dirX, dirY) {
        this.gridX = gridX;
        this.gridY = gridY;
        this.x = gridX * TILE_SIZE;
        this.y = gridY * TILE_SIZE;
        this.dirX = dirX;
        this.dirY = dirY;
        this.fireTimer = 180 + Math.floor(Math.random() * 120); // stagger start
        this.fireInterval = 360; // fire every 6 seconds (60fps) - still slow but more visible
        this.flashTimer = 0; // muzzle flash
    }

    update() {
        this.fireTimer--;
        if (this.flashTimer > 0) this.flashTimer--;

        if (this.fireTimer <= 0) {
            this.fireTimer = this.fireInterval;
            this.flashTimer = 8;
            playCannonSound();

            // Spawn cannonball projectile
            let px = this.x + TILE_SIZE / 2;
            let py = this.y + TILE_SIZE / 2;
            projectiles.push(new Projectile(px, py, this.dirX, this.dirY, 'cannonball'));
        }
    }

    draw() {
        let cx = this.x + TILE_SIZE / 2;
        let cy = this.y + TILE_SIZE / 2;

        // Body — dark red orb pattern
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fill();
        
        // Brighter base outline to pop against walls
        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Crescent / star decoration (Ramazan theme)
        ctx.strokeStyle = '#fcd34d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx - 2, cy - 2, 9, Math.PI * 0.9, Math.PI * 2.3);
        ctx.stroke();

        // Star dot
        ctx.fillStyle = '#fcd34d';
        ctx.beginPath();
        ctx.arc(cx + 5, cy - 7, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Barrel — direction
        ctx.fillStyle = '#450a0a';
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(this.dirY, this.dirX));
        ctx.fillRect(6, -4, 16, 8);
        ctx.restore();

        // Muzzle flash
        if (this.flashTimer > 0) {
            ctx.fillStyle = `rgba(255, 200, 50, ${this.flashTimer / 8})`;
            ctx.beginPath();
            ctx.arc(cx + this.dirX * 22, cy + this.dirY * 22, 10, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// Cannonball draw / update handled by Projectile class extension
// ────────────────────────────────────────────────────────────────────────────

function update() {
    manageMusic();
    if (gameState === 'playing') {
        p1.update();
        p2.update();

        for (let item of items) item.update();
        for (let enemy of enemies) enemy.update();
        if (boss) boss.update();

        for (let i = projectiles.length - 1; i >= 0; i--) {
            projectiles[i].update();
            if (!projectiles[i].active) projectiles.splice(i, 1);
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx; p.y += p.vy; p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }

        for (let cannon of cannons) cannon.update();

        document.getElementById('p1-stats').innerText = `P1: WASD+X | Olives: ${olivesCollected}/${totalOlives}`;
        document.getElementById('score-stats').innerText = `Score: ${globalScore}`;
        document.getElementById('p2-stats').innerText = `P2: Arrows+SPACE | Lvl: ${currentLevel} (P:Pause)`;

        if (olivesCollected === totalOlives && totalOlives > 0) {
            globalScore += 500; // Level clear bonus
            gameState = 'transition';
            transitionTimer = 180; // 3 seconds
        }
    } else if (gameState === 'transition') {
        transitionTimer--;
        if (transitionTimer <= 0) {
            currentLevel++;
            if (currentLevel > 3) {
                gameState = 'gameover';
                document.getElementById('menu-screen').style.display = 'flex';
                document.getElementById('total-score-display').innerText = `Total Score: ${globalScore} - YOU WIN!`;
            } else {
                initLevel();
            }
        }
    } else if (gameState === 'gameover') {
        // Return to menu on game over
        document.getElementById('menu-screen').style.display = 'flex';
        document.getElementById('total-score-display').innerText = `Game Over! Score: ${globalScore}`;
        document.getElementById('ui-layer').style.display = 'none';
        document.getElementById('gameCanvas').style.display = 'none';
        gameState = 'menu';
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'menu') return; // Do not draw the game behind the html menu

    // Draw floor texture using bg.png, tiled to fill the canvas
    if (floorPattern) {
        ctx.fillStyle = floorPattern;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        // Fallback checkered background
        for (let x = 0; x < COLS; x++) {
            for (let y = 0; y < ROWS; y++) {
                ctx.fillStyle = (x + y) % 2 === 0 ? '#1e293b' : '#1c2636';
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
    // Faint grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    // Draw grid cells (blocks)
    for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
            if (grid[x][y]) {
                if (grid[x][y].type === 'bread') {
                    // Modern 3D Bread (Pide) Look
                    ctx.fillStyle = '#92400e'; // Shadow/border
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    ctx.fillStyle = '#d97706'; // Base
                    ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                    // Sesame seeds
                    ctx.fillStyle = '#fef3c7';
                    ctx.fillRect(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 2, 4);
                    ctx.fillRect(x * TILE_SIZE + 24, y * TILE_SIZE + 12, 2, 4);
                    ctx.fillRect(x * TILE_SIZE + 14, y * TILE_SIZE + 24, 2, 4);
                } else if (grid[x][y].type === 'lokum') {
                    // Modern 3D Lokum/Güllaç look
                    ctx.fillStyle = '#be123c'; // Dark pink edge
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    ctx.fillStyle = '#f43f5e'; // Pink base
                    ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 6);
                    ctx.fillStyle = '#fb7185'; // Top highlight (powder)
                    ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 12);

                    if (grid[x][y].hasOlive) {
                        // Render Exclamation Mark on top
                        ctx.fillStyle = '#fef08a'; // Yellow
                        ctx.font = 'bold 24px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText('!', x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE - 8);
                        // Add a tiny shadow to text
                        ctx.fillStyle = '#000';
                        ctx.fillText('!', x * TILE_SIZE + (TILE_SIZE / 2) + 1, y * TILE_SIZE + TILE_SIZE - 7);
                        // Redraw yellow over shadow
                        ctx.fillStyle = '#fef08a';
                        ctx.fillText('!', x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE - 8);
                    }
                }
            }
        }
    }

    for (let item of items) item.draw();
    for (let p of particles) {
        ctx.fillStyle = `rgba(251, 113, 133, ${Math.max(0, p.life)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    for (let enemy of enemies) enemy.draw();

    p1.draw();
    p2.draw();

    for (let proj of projectiles) proj.draw();
    for (let cannon of cannons) cannon.draw();

    if (boss) boss.draw(); // Draw boss on top (e.g., Sun)

    if (gameState === 'transition') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fcd34d';
        ctx.font = '20px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL CLEARED!', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillText(`Get ready for Level ${currentLevel + 1}...`, canvas.width / 2, canvas.height / 2 + 20);
    } else if (gameState === 'gameover') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#4ade80';
        ctx.font = '30px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText('YOU WIN!', canvas.width / 2, canvas.height / 2);
    }
    // Removed old canvas text for paused, as we now use the HTML overlay
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
