# DOOM Light: Retro Raycast Engine

A playable, barebones, Wolfenstein 3D/Doom-style first-person shooter running entirely in the web browser. Built using vanilla JS (Canvas 2D context) with **no build steps, no frameworks, and no external assets**.

🎮 **[PLAY THE GAME LIVE IN YOUR BROWSER HERE!](https://rohanptk.github.io/browser-doom-raycaster/)**

🕹️ **Or play locally by double-clicking `index.html`!**

---

## 🌟 Features

- **2D Canvas Raycaster (DDA)**: Grid-based line-of-sight DDA algorithm with correct perspective (non-fisheye correction) and distance-based depth shading.
- **Occluded Billboard Sprites**: Interactive items and enemy states rendered relative to player distance, using a per-column Z-Buffer to prevent rendering behind solid walls.
- **Procedural Graphics & Audio**: Custom wall textures, weapon frames, and item graphics are drawn dynamically to offscreen canvases at boot. Sound effects are synthesized on-the-fly using the Web Audio API.
- **Weapon Selection**: Features 3 classic weapons:
  1. **Pistol** — Hitscan, medium damage, slow fire rate, infinite ammunition.
  2. **Shotgun** — Hitscan pellet spread (6 rays), high close-range damage, slower reload rate.
  3. **Chaingun** — Hitscan, rapid fire, low damage per bullet.
- **Enemy AI State Machine**: Simple state tracking (Idle ➔ Chase ➔ Attack ➔ Dead) with line-of-sight tracing.

---

## 🎮 Controls

| Input | Action |
| --- | --- |
| **W, A, S, D** | Move Forward / Strafe Left / Move Backward / Strafe Right |
| **Mouse / Arrow Keys** | Look Around |
| **Left Click / Space** | Shoot Active Weapon (requires Pointer Lock) |
| **1, 2, 3 / Scroll Wheel** | Switch Weapons (Pistol / Shotgun / Chaingun) |
| **R** | Restart Game (when Dead or Cleared) |

---

## 🛠️ Engine Configuration (`game.js`)

At the very top of `game.js`, a global `CONFIG` object is exposed for customization:

```javascript
const CONFIG = {
    resolution: { width: 320, height: 200 }, // Scaled via CSS image-rendering pixelated
    fov: Math.PI / 3, // Field of view (60 degrees)
    player: {
        speed: 3.5, // Movement speed units/sec
        rotSpeed: 2.2, // Rotation speed radians/sec
        radius: 0.25, // Collision sizing
    },
    weapons: [ ... ] // Individual weapons fire rates, pellet counts, damage, and ammo limits
};
```

---

## 🧱 Local Setup & Execution

Since the project uses vanilla paths and procedurally generated assets, you do not need to install `npm` dependencies, run a local bundler, or start a server.

1. Clone or download this repository.
2. Navigate to the project directory:
   ```bash
   cd browser-doom-raycaster
   ```
3. Open `index.html` in any modern web browser (Double-click or drag into the window).
4. Click **INITIALIZE NEURAL LINK** to lock your mouse pointer and start playing.
