/**
 * Retro Doom-style Raycaster Game Engine
 * Rebuilt on a canonical vector-based camera projection (Lode Vandevenne model)
 * Written in vanilla JS with Canvas 2D.
 */

// 1. GLOBAL CONFIGURATION
const CONFIG = {
    resolution: { width: 320, height: 200 },
    fov: Math.PI / 3, // 60 degrees (plane length corresponds to FOV)
    player: {
        speed: 3.5, // units per second
        rotSpeed: 2.2, // radians per second
        radius: 0.25, // collision radius
    },
    enemy: {
        detectionRadius: 10.0,
        moveSpeed: 1.5,
        attackRange: 0.9,
        attackDamage: 12,
        attackCooldown: 1000, // ms
        maxHp: 50,
        hurtDuration: 200, // ms stagger stun
    },
    pickups: {
        healthAmount: 25,
        ammoShells: 6,
        ammoBullets: 40,
    },
    weapons: [
        {
            name: "PISTOL",
            damage: 25,
            fireRate: 400, // ms between shots
            ammo: Infinity,
            maxAmmo: Infinity,
            spread: 0,
            projectiles: 1,
            sound: "pistol"
        },
        {
            name: "SHOTGUN",
            damage: 15, // per pellet
            fireRate: 850,
            ammo: 8,
            maxAmmo: 30,
            spread: 0.12,
            projectiles: 6,
            sound: "shotgun"
        },
        {
            name: "CHAINGUN",
            damage: 12,
            fireRate: 110,
            ammo: 30,
            maxAmmo: 150,
            spread: 0.05,
            projectiles: 1,
            sound: "chaingun"
        }
    ]
};

// 2. LEVEL MAP (0 = empty, 1 = Brick, 2 = Tech, 3 = Grid/Door)
const MAP = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,0,2,2,0,2,0,1,0,3,3,3,3,0,0,1],
    [1,0,2,0,0,2,0,1,0,3,0,0,3,0,0,1],
    [1,0,2,0,2,2,0,0,0,3,0,0,3,0,0,1],
    [1,0,0,0,0,0,0,1,0,3,0,0,3,0,0,1],
    [1,0,2,2,2,2,0,1,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,1,1,0,1,1,1,1,1],
    [1,1,0,1,1,1,1,1,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,3,3,0,3,3,1,0,2,2,2,2,2,0,1],
    [1,0,3,0,0,0,3,1,0,2,0,0,0,2,0,1],
    [1,0,3,0,1,0,3,1,0,2,0,0,0,2,0,1],
    [1,0,3,0,0,0,3,0,0,2,0,0,0,2,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];
const MAP_WIDTH = MAP[0].length;
const MAP_HEIGHT = MAP.length;

// 3. SOUND SYNTHESIZER (Web Audio API)
class SoundManager {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    play(type) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;

        if (type === "pistol") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === "shotgun") {
            const bufferSize = this.ctx.sampleRate * 0.35;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(400, now);
            filter.frequency.exponentialRampToValueAtTime(80, now + 0.3);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.6, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.ctx.destination);

            noise.start(now);
            noise.stop(now + 0.35);
        } else if (type === "chaingun") {
            osc.type = "triangle";
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.linearRampToValueAtTime(90, now + 0.08);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === "enemy_hit") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.linearRampToValueAtTime(60, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === "enemy_die") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.linearRampToValueAtTime(40, now + 0.4);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === "player_hit") {
            osc.type = "square";
            osc.frequency.setValueAtTime(80, now);
            osc.frequency.linearRampToValueAtTime(40, now + 0.2);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === "pickup") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(880, now + 0.08);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    }
}
const sounds = new SoundManager();

// 4. TEXTURE & SPRITE PROCEDURAL GENERATION (Offscreen Canvas Buffers)
const Textures = {};
const Sprites = {};

function initTexturesAndSprites() {
    const createBuffer = (w, h) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return { canvas: c, ctx: c.getContext("2d") };
    };

    // Brick Wall (1)
    const t1 = createBuffer(64, 64);
    t1.ctx.fillStyle = "#802020";
    t1.ctx.fillRect(0, 0, 64, 64);
    t1.ctx.fillStyle = "#4a4a4a";
    for (let y = 0; y < 64; y += 16) {
        t1.ctx.fillRect(0, y, 64, 2);
    }
    for (let y = 0; y < 64; y += 16) {
        const offset = (y / 16) % 2 === 0 ? 0 : 16;
        for (let x = offset; x < 64 + offset; x += 32) {
            t1.ctx.fillRect(x % 64, y, 2, 16);
        }
    }
    t1.ctx.fillStyle = "rgba(0,0,0,0.15)";
    for (let i = 0; i < 50; i++) {
        t1.ctx.fillRect(Math.random() * 64, Math.random() * 64, 3, 3);
    }
    Textures[1] = t1.canvas;

    // Tech Wall (2)
    const t2 = createBuffer(64, 64);
    t2.ctx.fillStyle = "#2e3440";
    t2.ctx.fillRect(0, 0, 64, 64);
    t2.ctx.fillStyle = "#00f2fe";
    t2.ctx.fillRect(8, 8, 48, 4);
    t2.ctx.fillRect(8, 52, 48, 4);
    t2.ctx.fillRect(8, 12, 4, 40);
    t2.ctx.fillRect(52, 12, 4, 40);
    t2.ctx.fillStyle = "#ff0055";
    t2.ctx.fillRect(20, 24, 6, 6);
    t2.ctx.fillStyle = "#39ff14";
    t2.ctx.fillRect(38, 24, 6, 6);
    t2.ctx.fillStyle = "#1e222b";
    for (let y = 36; y < 48; y += 4) {
        t2.ctx.fillRect(16, y, 32, 2);
    }
    Textures[2] = t2.canvas;

    // Grid Wall (3)
    const t3 = createBuffer(64, 64);
    t3.ctx.fillStyle = "#4c566a";
    t3.ctx.fillRect(0, 0, 64, 64);
    t3.ctx.fillStyle = "#ffdf00";
    t3.ctx.beginPath();
    for (let i = -64; i < 64; i += 16) {
        t3.ctx.moveTo(i, 0);
        t3.ctx.lineTo(i + 8, 0);
        t3.ctx.lineTo(i + 8 + 64, 64);
        t3.ctx.lineTo(i + 64, 64);
        t3.ctx.fill();
    }
    t3.ctx.fillStyle = "#2e3440";
    t3.ctx.fillRect(0, 0, 64, 4);
    t3.ctx.fillRect(0, 60, 64, 4);
    t3.ctx.fillRect(0, 0, 4, 64);
    t3.ctx.fillRect(60, 0, 4, 64);
    Textures[3] = t3.canvas;

    // Enemy Idle
    const sIdle = createBuffer(64, 64);
    sIdle.ctx.fillStyle = "transparent";
    sIdle.ctx.beginPath();
    sIdle.ctx.arc(32, 32, 18, 0, Math.PI * 2);
    sIdle.ctx.fillStyle = "#9c27b0";
    sIdle.ctx.fill();
    sIdle.ctx.beginPath();
    sIdle.ctx.arc(32, 26, 6, 0, Math.PI * 2);
    sIdle.ctx.fillStyle = "#ffffff";
    sIdle.ctx.fill();
    sIdle.ctx.beginPath();
    sIdle.ctx.arc(32, 26, 3, 0, Math.PI * 2);
    sIdle.ctx.fillStyle = "#ff0055";
    sIdle.ctx.fill();
    sIdle.ctx.fillStyle = "#3b0066";
    sIdle.ctx.beginPath();
    sIdle.ctx.moveTo(18, 20); sIdle.ctx.lineTo(10, 8); sIdle.ctx.lineTo(24, 18);
    sIdle.ctx.fill();
    sIdle.ctx.beginPath();
    sIdle.ctx.moveTo(46, 20); sIdle.ctx.lineTo(54, 8); sIdle.ctx.lineTo(40, 18);
    sIdle.ctx.fill();
    Sprites["enemy_idle"] = sIdle.canvas;

    // Enemy Chase
    const sChase = createBuffer(64, 64);
    sChase.ctx.drawImage(sIdle.canvas, 0, 0);
    sChase.ctx.fillStyle = "#ff5722";
    sChase.ctx.beginPath();
    sChase.ctx.moveTo(24, 46); sChase.ctx.lineTo(32, 60); sChase.ctx.lineTo(40, 46);
    sChase.ctx.fill();
    Sprites["enemy_chase"] = sChase.canvas;

    // Enemy Attack
    const sAttack = createBuffer(64, 64);
    sAttack.ctx.drawImage(sIdle.canvas, 0, 0);
    sAttack.ctx.fillStyle = "rgba(255, 0, 85, 0.4)";
    sAttack.ctx.beginPath();
    sAttack.ctx.arc(32, 26, 12, 0, Math.PI * 2);
    sAttack.ctx.fill();
    Sprites["enemy_attack"] = sAttack.canvas;

    // Enemy Hurt
    const sHurt = createBuffer(64, 64);
    sHurt.ctx.drawImage(sIdle.canvas, 0, 0);
    sHurt.ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    sHurt.ctx.fillRect(0, 0, 64, 64);
    Sprites["enemy_hurt"] = sHurt.canvas;

    // Enemy Die
    const sDie = createBuffer(64, 64);
    sDie.ctx.fillStyle = "#7b1fa2";
    sDie.ctx.beginPath();
    sDie.ctx.arc(32, 45, 14, 0, Math.PI * 2);
    sDie.ctx.fill();
    sDie.ctx.fillStyle = "#ff0055";
    sDie.ctx.fillRect(15, 45, 34, 4);
    sDie.ctx.fillRect(25, 35, 14, 15);
    Sprites["enemy_die"] = sDie.canvas;

    // Pickup - Health
    const sHealth = createBuffer(64, 64);
    sHealth.ctx.beginPath();
    sHealth.ctx.arc(32, 40, 12, 0, Math.PI * 2);
    sHealth.ctx.fillStyle = "#1e1e24";
    sHealth.ctx.fill();
    sHealth.ctx.fillStyle = "#39ff14";
    sHealth.ctx.fillRect(29, 32, 6, 16);
    sHealth.ctx.fillRect(24, 37, 16, 6);
    Sprites["pickup_health"] = sHealth.canvas;

    // Pickup - Ammo
    const sAmmo = createBuffer(64, 64);
    sAmmo.ctx.fillStyle = "#ffdf00";
    sAmmo.ctx.fillRect(20, 32, 24, 18);
    sAmmo.ctx.fillStyle = "#000000";
    sAmmo.ctx.font = "bold 8px Courier";
    sAmmo.ctx.fillText("AMMO", 22, 43);
    Sprites["pickup_ammo"] = sAmmo.canvas;

    // Weapons (Base frames)
    const wPistol = createBuffer(64, 64);
    wPistol.ctx.fillStyle = "#4c566a";
    wPistol.ctx.fillRect(28, 20, 8, 30);
    wPistol.ctx.fillStyle = "#2e3440";
    wPistol.ctx.fillRect(30, 16, 4, 10);
    wPistol.ctx.fillStyle = "#5c4033";
    wPistol.ctx.fillRect(24, 45, 16, 19);
    Sprites["weapon_pistol"] = wPistol.canvas;

    const wShotgun = createBuffer(64, 64);
    wShotgun.ctx.fillStyle = "#2e3440";
    wShotgun.ctx.fillRect(24, 15, 7, 35);
    wShotgun.ctx.fillRect(33, 15, 7, 35);
    wShotgun.ctx.fillStyle = "#1a1c23";
    wShotgun.ctx.fillRect(22, 40, 20, 10);
    Sprites["weapon_shotgun"] = wShotgun.canvas;

    const wChaingun = createBuffer(64, 64);
    wChaingun.ctx.fillStyle = "#4c566a";
    wChaingun.ctx.fillRect(27, 22, 10, 28);
    wChaingun.ctx.fillStyle = "#1e222b";
    wChaingun.ctx.fillRect(29, 12, 2, 12);
    wChaingun.ctx.fillRect(32, 12, 2, 12);
    wChaingun.ctx.fillRect(35, 12, 2, 12);
    Sprites["weapon_chaingun"] = wChaingun.canvas;
}

// 5. GAME DATA AND STATE
const player = {
    x: 1.5,
    y: 1.5,
    // Vector Camera Representation (Per Lode Vandevenne's canonical math)
    dirX: 1.0,
    dirY: 0.0,
    planeX: 0.0,
    planeY: 0.66, // 0.66 corresponds to an ~66 deg FOV (which scales nicely)
    health: 100,
    activeWeaponIdx: 0,
    ammo: [Infinity, 12, 60],
    kills: 0,
    isFiring: false,
    fireTimer: 0,
    recoilY: 0
};

let enemies = [];
let sprites = []; // Collective list for health and ammo pickups

function initMapEntities() {
    // Standard player position vectors
    player.x = 1.5;
    player.y = 1.5;
    player.dirX = 1.0;
    player.dirY = 0.0;
    player.planeX = 0.0;
    player.planeY = Math.tan(CONFIG.fov / 2); // Perfectly calculated plane vector size

    player.health = 100;
    player.activeWeaponIdx = 0;
    player.ammo = [Infinity, 12, 60];
    player.kills = 0;
    player.isFiring = false;

    // Enemies (HP and State configurations tracked relative to CONFIG constraints)
    enemies = [
        { x: 14.5, y: 14.5, hp: CONFIG.enemy.maxHp, state: "idle", attackTimer: 0, hurtTimer: 0 },
        { x: 14.5, y: 2.5,  hp: CONFIG.enemy.maxHp, state: "idle", attackTimer: 0, hurtTimer: 0 },
        { x: 5.5,  y: 14.5, hp: CONFIG.enemy.maxHp, state: "idle", attackTimer: 0, hurtTimer: 0 },
        { x: 5.5,  y: 9.5,  hp: CONFIG.enemy.maxHp, state: "idle", attackTimer: 0, hurtTimer: 0 },
        { x: 9.5,  y: 9.5,  hp: CONFIG.enemy.maxHp, state: "idle", attackTimer: 0, hurtTimer: 0 },
        { x: 10.5, y: 13.5, hp: CONFIG.enemy.maxHp, state: "idle", attackTimer: 0, hurtTimer: 0 }
    ];

    // Collectible Pickups
    sprites = [
        { x: 4.5, y: 4.5, type: "health", sprite: "pickup_health", collected: false },
        { x: 4.5, y: 5.5, type: "ammo", sprite: "pickup_ammo", collected: false },
        { x: 10.5, y: 2.5, type: "ammo", sprite: "pickup_ammo", collected: false },
        { x: 10.5, y: 4.5, type: "health", sprite: "pickup_health", collected: false }
    ];
}

// 6. RENDERING CONTEXT & Z-BUFFER
let canvas, ctx;
const zBuffer = new Float32Array(CONFIG.resolution.width);

// 7. INPUT HANDLER
const keys = {};
let mouseDeltaX = 0;

function setupInputs() {
    window.addEventListener("keydown", e => {
        keys[e.code] = true;
        sounds.init();
        if (e.code === "Digit1") switchWeapon(0);
        if (e.code === "Digit2") switchWeapon(1);
        if (e.code === "Digit3") switchWeapon(2);
        if (e.code === "KeyR") restartGame();
        if (e.code === "Space") fireActiveWeapon();
    });

    window.addEventListener("keyup", e => {
        keys[e.code] = false;
    });

    canvas.addEventListener("click", () => {
        sounds.init();
        if (gameState === "play") {
            canvas.requestPointerLock();
            fireActiveWeapon();
        }
    });

    document.addEventListener("pointerlockchange", () => {
        const overlay = document.getElementById("overlay");
        if (document.pointerLockElement === canvas) {
            overlay.classList.add("hidden");
        } else {
            if (gameState === "play") overlay.classList.remove("hidden");
        }
    });

    window.addEventListener("mousemove", e => {
        if (document.pointerLockElement === canvas) {
            mouseDeltaX += e.movementX;
        }
    });

    window.addEventListener("wheel", e => {
        if (gameState !== "play") return;
        let newIdx = player.activeWeaponIdx + (e.deltaY > 0 ? 1 : -1);
        if (newIdx < 0) newIdx = CONFIG.weapons.length - 1;
        if (newIdx >= CONFIG.weapons.length) newIdx = 0;
        switchWeapon(newIdx);
    });

    document.getElementById("startButton").addEventListener("click", () => {
        sounds.init();
        canvas.requestPointerLock();
        startGame();
    });

    document.getElementById("restartButton").addEventListener("click", restartGame);
    document.getElementById("winRestartButton").addEventListener("click", restartGame);
}

function switchWeapon(idx) {
    player.activeWeaponIdx = idx;
    updateHUD();
}

// 8. RENDER PASS - WALLS (Canonical DDA Vector Model)
function castWalls() {
    const w = CONFIG.resolution.width;
    const h = CONFIG.resolution.height;

    // Floor and Ceiling
    ctx.fillStyle = "#1e1e24";
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = "#332211";
    ctx.fillRect(0, h / 2, w, h / 2);

    for (let x = 0; x < w; x++) {
        // cameraX is the coordinate on the camera plane, from -1 (left) to 1 (right)
        const cameraX = 2 * x / w - 1;
        
        // Ray direction vectors: combination of direction and plane vectors
        const rayDirX = player.dirX + player.planeX * cameraX;
        const rayDirY = player.dirY + player.planeY * cameraX;

        let mapX = Math.floor(player.x);
        let mapY = Math.floor(player.y);

        let sideDistX, sideDistY;

        // Length of ray from one x or y side to next x or y side
        const deltaDistX = Math.abs(1 / rayDirX);
        const deltaDistY = Math.abs(1 / rayDirY);

        let stepX, stepY;
        let hit = 0;
        let side = 0; // 0 = x-side hit, 1 = y-side hit

        if (rayDirX < 0) {
            stepX = -1;
            sideDistX = (player.x - mapX) * deltaDistX;
        } else {
            stepX = 1;
            sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
        }

        if (rayDirY < 0) {
            stepY = -1;
            sideDistY = (player.y - mapY) * deltaDistY;
        } else {
            stepY = 1;
            sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
        }

        // Perform DDA
        while (hit === 0) {
            if (sideDistX < sideDistY) {
                sideDistX += deltaDistX;
                mapX += stepX;
                side = 0;
            } else {
                sideDistY += deltaDistY;
                mapY += stepY;
                side = 1;
            }

            if (mapX < 0 || mapX >= MAP_WIDTH || mapY < 0 || mapY >= MAP_HEIGHT) {
                break;
            }

            if (MAP[mapY][mapX] > 0) {
                hit = MAP[mapY][mapX];
            }
        }

        if (hit > 0) {
            // Calculate perpendicular distance to avoid fisheye (Lode Vandevenne's canonical distance formula)
            let perpWallDist;
            if (side === 0) perpWallDist = sideDistX - deltaDistX;
            else perpWallDist = sideDistY - deltaDistY;

            // Write perpendicular distance to Z-Buffer
            zBuffer[x] = perpWallDist;

            // Calculate height of wall slice to draw on screen
            const wallHeight = Math.floor(h / perpWallDist);
            const drawStart = Math.max(0, -wallHeight / 2 + h / 2);
            const drawEnd = Math.min(h - 1, wallHeight / 2 + h / 2);

            const wallTex = Textures[hit];
            if (wallTex) {
                let wallX;
                if (side === 0) wallX = player.y + perpWallDist * rayDirY;
                else wallX = player.x + perpWallDist * rayDirX;
                wallX -= Math.floor(wallX);

                let texX = Math.floor(wallX * 64);
                if (side === 0 && rayDirX > 0) texX = 63 - texX;
                if (side === 1 && rayDirY < 0) texX = 63 - texX;

                ctx.drawImage(wallTex, texX, 0, 1, 64, x, drawStart, 1, drawEnd - drawStart);
            } else {
                ctx.fillStyle = side === 1 ? "#555" : "#777";
                ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
            }

            // Distance shading overlay
            const shadowOpacity = Math.min(1.0, perpWallDist / 12);
            ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
            ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
        }
    }
}

// 9. RENDER PASS - SPRITES (Billboard Projecting via Inverse Camera Matrix)
function castSprites() {
    const w = CONFIG.resolution.width;
    const h = CONFIG.resolution.height;

    const activeSprites = [];

    // Add collectible pickups
    sprites.forEach(s => {
        if (!s.collected) {
            activeSprites.push({
                x: s.x,
                y: s.y,
                canvas: Sprites[s.sprite],
                isEnemy: false
            });
        }
    });

    // Add active enemies
    enemies.forEach(e => {
        let tex = Sprites["enemy_idle"];
        if (e.state === "dead") tex = Sprites["enemy_die"];
        else if (e.state === "attack") tex = Sprites["enemy_attack"];
        else if (e.state === "chase") tex = Sprites["enemy_chase"];
        else if (e.state === "hurt") tex = Sprites["enemy_hurt"];

        activeSprites.push({
            x: e.x,
            y: e.y,
            canvas: tex,
            isEnemy: true,
            state: e.state
        });
    });

    // Sort sprites from farthest to nearest (back-to-front painter's algorithm)
    activeSprites.forEach(s => {
        s.dist = Math.pow(player.x - s.x, 2) + Math.pow(player.y - s.y, 2);
    });
    activeSprites.sort((a, b) => b.dist - a.dist);

    // Render sorted list using exact inverse matrix math
    activeSprites.forEach(s => {
        // 1. Calculate relative coordinates to player
        const relX = s.x - player.x;
        const relY = s.y - player.y;

        /*
         * ENGINE DESIGN NOTE:
         * Previously, the sprite translation code used a simple 2D angle rotation:
         *   rotX = spriteX * cos - spriteY * sin;
         *   rotY = spriteX * sin + spriteY * cos;
         * This simple 2D coordinate rotation was not mapped to the camera matrix,
         * resulting in sprites sliding across the screen relative to the cursor when the camera rotated.
         *
         * FIX: We now define the player direction vectors (dirX, dirY) and camera plane (planeX, planeY)
         * based on player.angle and CONFIG.fov. Using the standard inverse matrix calculation (invDet),
         * we rotate and scale the offsets (dx, dy) into camera space (transformX, transformY).
         * This correctly projects the sprite, locking it to the world grid without cursor-relative drift.
         */
        const invDet = 1.0 / (player.planeX * player.dirY - player.dirX * player.planeY);

        // Compute transformed camera-space coordinates using inverse camera matrix
        const transformX = invDet * (player.dirY * relX - player.dirX * relY);
        const transformY = invDet * (-player.planeY * relX + player.planeX * relY); // Depth coordinate

        if (transformY <= 0.1) return; // Behind player view camera

        // Calculate screen center column for projected sprite
        const spriteScreenX = Math.floor((w / 2) * (1 + transformX / transformY));

        // Height & width scaling factor
        const spriteHeight = Math.abs(Math.floor(h / transformY));
        const drawStartY = Math.max(0, -spriteHeight / 2 + h / 2);
        const drawEndY = Math.min(h - 1, spriteHeight / 2 + h / 2);

        const spriteWidth = Math.abs(Math.floor(h / transformY));
        const drawStartX = Math.max(0, -spriteWidth / 2 + spriteScreenX);
        const drawEndX = Math.min(w - 1, spriteWidth / 2 + spriteScreenX);

        const texWidth = 64;
        const texHeight = 64;

        // Render sprite columns, clipping against the per-column Z-Buffer
        for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
            const texX = Math.floor(256 * (stripe - (-spriteWidth / 2 + spriteScreenX)) * texWidth / spriteWidth) / 256;
            
            // Only draw if the sprite column is closer to player than the wall slice
            if (transformY < zBuffer[stripe]) {
                ctx.drawImage(s.canvas, texX, 0, 1, texHeight, stripe, drawStartY, 1, drawEndY - drawStartY);
                
                // Shade sprite relative to distance
                const shadowOpacity = Math.min(0.9, transformY / 12);
                ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
                ctx.fillRect(stripe, drawStartY, 1, drawEndY - drawStartY);
            }
        }
    });
}

// 10. PHYSICS & POSITION UPDATE (Vector Matrix Rotations)
function rotateCamera(theta) {
    // Perform standard 2D vector rotation matrix transformations
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Rotate player direction vector
    const oldDirX = player.dirX;
    player.dirX = player.dirX * cosT - player.dirY * sinT;
    player.dirY = oldDirX * sinT + player.dirY * cosT;

    // Rotate player camera plane vector
    const oldPlaneX = player.planeX;
    player.planeX = player.planeX * cosT - player.planeY * sinT;
    player.planeY = oldPlaneX * sinT + player.planeY * cosT;
}

function updatePhysics(dt) {
    if (gameState !== "play") return;

    // Movement directions
    let moveForward = 0;
    let strafeRight = 0;

    if (keys["KeyW"]) moveForward += 1;
    if (keys["KeyS"]) moveForward -= 1;
    if (keys["KeyA"]) strafeRight -= 1;
    if (keys["KeyD"]) strafeRight += 1;

    // Keyboard rotation inputs
    let turnDir = 0;
    if (keys["ArrowLeft"]) turnDir -= 1;
    if (keys["ArrowRight"]) turnDir += 1;

    // Apply mouse look rotation
    if (mouseDeltaX !== 0) {
        rotateCamera(mouseDeltaX * 0.0022);
        mouseDeltaX = 0;
    }

    // Apply keyboard look rotation
    if (turnDir !== 0) {
        rotateCamera(turnDir * CONFIG.player.rotSpeed * dt);
    }

    // Calculate displacement based on direction and plane vectors
    // Forward vector is (dirX, dirY), Right vector is (planeX, planeY) normalized
    const moveX = (player.dirX * moveForward - player.planeX * strafeRight) * CONFIG.player.speed * dt;
    const moveY = (player.dirY * moveForward - player.planeY * strafeRight) * CONFIG.player.speed * dt;

    // Move player with wall sliding collision
    const nextX = player.x + moveX;
    if (MAP[Math.floor(player.y)][Math.floor(nextX + (moveX > 0 ? CONFIG.player.radius : -CONFIG.player.radius))] === 0) {
        player.x = nextX;
    }
    const nextY = player.y + moveY;
    if (MAP[Math.floor(nextY + (moveY > 0 ? CONFIG.player.radius : -CONFIG.player.radius))][Math.floor(player.x)] === 0) {
        player.y = nextY;
    }

    // Collect Pickups
    sprites.forEach(s => {
        if (!s.collected) {
            const dist = Math.sqrt(Math.pow(player.x - s.x, 2) + Math.pow(player.y - s.y, 2));
            if (dist < 0.45) {
                let collected = false;
                if (s.type === "health" && player.health < 100) {
                    player.health = Math.min(100, player.health + CONFIG.pickups.healthAmount);
                    collected = true;
                } else if (s.type === "ammo") {
                    player.ammo[1] = Math.min(CONFIG.weapons[1].maxAmmo, player.ammo[1] + CONFIG.pickups.ammoShells);
                    player.ammo[2] = Math.min(CONFIG.weapons[2].maxAmmo, player.ammo[2] + CONFIG.pickups.ammoBullets);
                    collected = true;
                }

                if (collected) {
                    s.collected = true;
                    sounds.play("pickup");
                    updateHUD();
                }
            }
        }
    });
}

// 11. ENTITIES UPDATE (Enemy AI Logic)
function updateEntities(dt) {
    if (gameState !== "play") return;

    let aliveEnemies = 0;
    enemies.forEach(e => {
        if (e.state === "dead") return;
        aliveEnemies++;

        const dist = Math.sqrt(Math.pow(player.x - e.x, 2) + Math.pow(player.y - e.y, 2));
        
        // Raycast Line of Sight check
        let hasLOS = true;
        const steps = Math.floor(dist * 2.5);
        if (steps > 0) {
            const dx = (player.x - e.x) / steps;
            const dy = (player.y - e.y) / steps;
            for (let i = 1; i < steps; i++) {
                const cx = e.x + dx * i;
                const cy = e.y + dy * i;
                if (MAP[Math.floor(cy)][Math.floor(cx)] > 0) {
                    hasLOS = false;
                    break;
                }
            }
        }

        // Hurt Stagger Transition
        if (e.state === "hurt") {
            e.hurtTimer -= dt * 1000;
            if (e.hurtTimer <= 0) {
                e.state = "chase";
            }
            return;
        }

        // Idle ➔ Chase ➔ Attack transitions
        if (e.state === "idle") {
            if (dist < CONFIG.enemy.detectionRadius && hasLOS) {
                e.state = "chase";
            }
        } else if (e.state === "chase") {
            if (dist <= CONFIG.enemy.attackRange && hasLOS) {
                e.state = "attack";
                e.attackTimer = 0; // Strike immediately
            } else {
                // Move towards player in world space (AI direction is independent of player cursor looking)
                const dirX = (player.x - e.x) / dist;
                const dirY = (player.y - e.y) / dist;
                
                const moveStepX = dirX * CONFIG.enemy.moveSpeed * dt;
                const moveStepY = dirY * CONFIG.enemy.moveSpeed * dt;
                
                const nextX = e.x + moveStepX;
                const nextY = e.y + moveStepY;
                const enemyRadius = 0.25;

                // Try combined path step
                if (MAP[Math.floor(nextY)][Math.floor(nextX)] === 0) {
                    e.x = nextX;
                    e.y = nextY;
                } else {
                    // Slide along wall axes if path is blocked
                    if (MAP[Math.floor(e.y)][Math.floor(nextX + (moveStepX > 0 ? enemyRadius : -enemyRadius))] === 0) {
                        e.x = nextX;
                    }
                    if (MAP[Math.floor(nextY + (moveStepY > 0 ? enemyRadius : -enemyRadius))][Math.floor(e.x)] === 0) {
                        e.y = nextY;
                    }
                }
            }
        } else if (e.state === "attack") {
            if (dist > CONFIG.enemy.attackRange || !hasLOS) {
                e.state = "chase";
            } else {
                e.attackTimer -= dt * 1000;
                if (e.attackTimer <= 0) {
                    player.health = Math.max(0, player.health - CONFIG.enemy.attackDamage);
                    sounds.play("player_hit");
                    e.attackTimer = CONFIG.enemy.attackCooldown;
                    updateHUD();

                    if (player.health <= 0) {
                        endGame(false);
                    }
                }
            }
        }
    });

    if (aliveEnemies === 0) {
        endGame(true);
    }
}

// 12. WEAPONS MANAGEMENT
function updateWeapons(dt) {
    if (player.isFiring) {
        player.fireTimer -= dt * 1000;
        player.recoilY = Math.sin((player.fireTimer / CONFIG.weapons[player.activeWeaponIdx].fireRate) * Math.PI) * 15;
        if (player.fireTimer <= 0) {
            player.isFiring = false;
            player.recoilY = 0;
        }
    }
}

function fireActiveWeapon() {
    if (gameState !== "play" || player.isFiring) return;
    const w = CONFIG.weapons[player.activeWeaponIdx];

    if (player.ammo[player.activeWeaponIdx] <= 0) {
        sounds.play("enemy_hit"); // Out-of-ammo click noise
        return;
    }

    player.isFiring = true;
    player.fireTimer = w.fireRate;
    if (w.ammo !== Infinity) {
        player.ammo[player.activeWeaponIdx]--;
    }
    updateHUD();

    sounds.play(w.sound);

    // Shoot hitscan projectile rays
    for (let p = 0; p < w.projectiles; p++) {
        // Calculate dynamic ray vector by adding noise to player's primary direction
        const noise = (Math.random() - 0.5) * w.spread;
        
        // Calculate ray direction vectors
        const cosN = Math.cos(noise);
        const sinN = Math.sin(noise);
        const rayDirX = player.dirX * cosN - player.dirY * sinN;
        const rayDirY = player.dirX * sinN + player.dirY * cosN;

        let closestEnemy = null;
        let closestDist = Infinity;

        enemies.forEach(e => {
            if (e.state === "dead") return;

            const ex = e.x - player.x;
            const ey = e.y - player.y;

            // Project enemy position onto bullet ray direction
            const proj = ex * rayDirX + ey * rayDirY;
            if (proj > 0) {
                const perpDist = Math.sqrt((ex * ex + ey * ey) - proj * proj);
                if (perpDist < 0.4) {
                    if (proj < closestDist) {
                        // Check if walls block bullet
                        let blocked = false;
                        const steps = Math.floor(proj * 2.5);
                        for (let i = 1; i < steps; i++) {
                            const cx = player.x + rayDirX * (proj / steps) * i;
                            const cy = player.y + rayDirY * (proj / steps) * i;
                            if (MAP[Math.floor(cy)][Math.floor(cx)] > 0) {
                                blocked = true;
                                break;
                            }
                        }

                        if (!blocked) {
                            closestEnemy = e;
                            closestDist = proj;
                        }
                    }
                }
            }
        });

        if (closestEnemy) {
            closestEnemy.hp -= w.damage;
            sounds.play("enemy_hit");
            
            if (closestEnemy.hp <= 0) {
                closestEnemy.state = "dead";
                player.kills++;
                sounds.play("enemy_die");
                updateHUD();
            } else {
                closestEnemy.state = "hurt";
                closestEnemy.hurtTimer = CONFIG.enemy.hurtDuration;
            }
        }
    }
}

// 13. HUD & SCREEN OVERLAYS
function updateHUD() {
    document.getElementById("hud-health").innerText = player.health + "%";
    const healthFill = document.getElementById("health-bar");
    if (healthFill) healthFill.style.width = player.health + "%";

    const currentWep = CONFIG.weapons[player.activeWeaponIdx];
    document.getElementById("hud-weapon").innerText = currentWep.name;

    const ammoVal = player.ammo[player.activeWeaponIdx];
    document.getElementById("hud-ammo").innerText = ammoVal === Infinity ? "INF" : ammoVal;
    
    const ammoFill = document.getElementById("ammo-bar");
    if (ammoFill) {
        if (ammoVal === Infinity) {
            ammoFill.style.width = "100%";
        } else {
            ammoFill.style.width = Math.min(100, (ammoVal / currentWep.maxAmmo) * 100) + "%";
        }
    }

    document.getElementById("hud-kills").innerText = player.kills;
}

function drawWeaponHUD() {
    const w = CONFIG.resolution.width;
    const h = CONFIG.resolution.height;

    let wSprite;
    if (player.activeWeaponIdx === 0) wSprite = Sprites["weapon_pistol"];
    else if (player.activeWeaponIdx === 1) wSprite = Sprites["weapon_shotgun"];
    else wSprite = Sprites["weapon_chaingun"];

    const scale = 2.0;
    const weaponWidth = 64 * scale;
    const weaponHeight = 64 * scale;

    const screenX = w / 2 - weaponWidth / 2;
    const screenY = h - weaponHeight + player.recoilY + 10;

    ctx.drawImage(wSprite, screenX, screenY, weaponWidth, weaponHeight);

    // Muzzle Flash
    if (player.isFiring && player.fireTimer > (CONFIG.weapons[player.activeWeaponIdx].fireRate * 0.7)) {
        ctx.fillStyle = "#ffdf00";
        ctx.beginPath();
        let tipX = w / 2;
        let tipY = h - 65;
        if (player.activeWeaponIdx === 1) {
            ctx.arc(tipX - 10, tipY, 12, 0, Math.PI * 2);
            ctx.arc(tipX + 10, tipY, 12, 0, Math.PI * 2);
        } else {
            ctx.arc(tipX, tipY, 10, 0, Math.PI * 2);
        }
        ctx.fill();

        ctx.fillStyle = "rgba(255, 223, 0, 0.15)";
        ctx.fillRect(0, 0, w, h);
    }
}

// 14. MAIN GAME LOOP
let gameState = "menu";
let lastTime = 0;

function loop(time) {
    const dt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;

    updatePhysics(dt);
    updateEntities(dt);
    updateWeapons(dt);

    ctx.clearRect(0, 0, CONFIG.resolution.width, CONFIG.resolution.height);
    
    // Render passes
    castWalls();
    castSprites();
    drawWeaponHUD();

    if (gameState === "play") {
        requestAnimationFrame(loop);
    }
}

function startGame() {
    gameState = "play";
    initMapEntities();
    updateHUD();
    document.getElementById("overlay").classList.add("hidden");
    document.getElementById("gameover-screen").classList.add("hidden");
    document.getElementById("win-screen").classList.add("hidden");
    lastTime = performance.now();
    requestAnimationFrame(loop);
}

function endGame(won) {
    gameState = won ? "win" : "gameover";
    document.exitPointerLock();

    if (won) {
        document.getElementById("win-kills").innerText = player.kills;
        document.getElementById("win-screen").classList.remove("hidden");
    } else {
        document.getElementById("death-kills").innerText = player.kills;
        document.getElementById("gameover-screen").classList.remove("hidden");
    }
}

function restartGame() {
    startGame();
}

window.addEventListener("DOMContentLoaded", () => {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");
    
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;

    initTexturesAndSprites();
    setupInputs();
    initMapEntities();
    updateHUD();
});
