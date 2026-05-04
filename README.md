<p align="center">
  <img src="public/assets/huaqiang-hero-pixel.svg" width="132" alt="Huaqiang pixel portrait" />
</p>

<h1 align="center">Is It Ripe? - The Conqueror's Revenge</h1>

<p align="center">
  <strong>Vue 3 + PixiJS v8 + TypeScript meme roguelike</strong>
</p>

<p align="center">
  <a href="./README_ZH.md">中文文档</a>
</p>

A high-fidelity Huaqiang meme roguelike built with Vue 3 Composition API, PixiJS v8, TypeScript, GSAP, and Tailwind CSS. Huaqiang is the only playable character. The rest of the melon-market cast appears as enemies, landmarks, pressure patterns, and boss mechanics.

The game supports English, Chinese, and French for HUD text, upgrade cards, run goals, death review, subtitles, and speech synthesis. Chinese voice clips can be mounted through a local audio manifest when licensed files are available.

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite URL printed in the terminal, usually:

```text
http://127.0.0.1:5173/
```

Production checks:

```bash
npm run typecheck
npm run build
npm run preview
```

## Game Goal

Explore an endless CRT-styled market, clear enemies, complete landmarks, draft upgrade cards, form a build route, and defeat the final boss: **The Rigged Scale Emperor**.

The current run structure is built around these beats:

| Beat | What Happens |
| --- | --- |
| Start | Choose one of three run goals that shapes your route and post-run advice. |
| Lv2-Lv4 | Draft survival, movement, damage, or growth foundations. |
| Lv5 | Archetype Awakening: Fire, Ice, Magnet, and Temper cards become strongly favored. |
| Lv10 | Market Legend: rare cards and cross-archetype synergies appear more often. |
| Lv15 | Conqueror Eve: the final boss is announced, but it does not spawn immediately. |
| Boss Gate | Clear the **Guaranteed-Ripe Tribunal** landmark to unlock the final boss. |
| Finale | Defeat **The Rigged Scale Emperor** to win the run. |

The market is unbounded. There are no hard arena walls. Keep moving and the camera follows Huaqiang while terrain, stalls, enemies, and landmarks extend around the viewport.

## Controls

### Desktop

| Action | Input |
| --- | --- |
| Move | `WASD` or arrow keys |
| Throw cleaver-melons | Hold `Space`, `J`, `K`, or `Enter` |
| Aim | Keyboard attacks auto-target the nearest enemy; if none exists, they use the latest movement or aim direction. |
| Pick an upgrade | Click one card in the level-up modal. |
| Inspect owned card | Click an acquired card icon. |
| Change language | Use the top HUD language selector. |

### Mobile

Mobile controls appear only on touch or coarse-pointer devices.

| Action | Input |
| --- | --- |
| Move | Left virtual joystick. |
| Throw cleaver-melons | Hold the right throw zone. |
| Aim | The throw zone uses the current target and last movement direction. |
| Pick an upgrade | Tap one card. |
| Inspect owned card | Tap an acquired card icon. |
| Change language | Use the top HUD language selector. |

The canvas scales dynamically with the browser viewport. Landscape is recommended on phones because the minimap, card tray, and combat field have more room.

## HUD Layout

The HUD is intentionally split to keep the playfield readable:

| Area | Content |
| --- | --- |
| Top left | Huaqiang portrait, Health, Temper, EXP, Level, Luck, and meta goal button. |
| Top right | Minimap and language selector. |
| Under minimap | Acquired cards and selected card details. |
| Lower left | Active buffs only when they matter. |
| Bottom center | Current landmark/run objective prompt and control hint. |
| Center / side | Boss phase toast, boss gate notice, milestone burst, subtitles, and level-up modal. |

The shooting hint has been moved away from the center. On touch devices it is hidden to avoid blocking combat.

## Minimap

The minimap shows tactical information without replacing exploration:

| Marker | Meaning |
| --- | --- |
| Player arrow | Huaqiang position and facing/aim direction. |
| Red dots | Nearby enemies. |
| Yellow / larger dots | Elite or metal threats. |
| Boss marker | Final boss location when active. |
| Event marker | Current landmark direction and distance. |

If you feel lost, follow the event marker and the objective chip distance.

## Run Goals

Each run starts with a three-choice objective. This gives the run an early identity and powers the death review advice.

| Goal | Recommended Route | Reward Direction |
| --- | --- | --- |
| Ripe Streak Contract | Fire / Temper | Start with Luck and ripe chance; completion improves critical payoff. |
| Pick-a-Fight Contract | Risk / Growth | Start with higher EXP but slightly higher incoming damage; completion grants Luck and EXP. |
| Hold the Stall | Survival / Ice | Start with max Health and speed; completion grants damage reduction and healing. |

Completed run goals add an in-run boost badge so the reward is visible after the objective is finished.

## Core Combat

Huaqiang throws the **Infamous Cleaver-Melon**. Every projectile is either Ripe or Unripe.

| State | Color | Combat Role |
| --- | --- | --- |
| Ripe | Red | Critical damage, watermelon juice explosion, screen shake, and 50ms hit-stop. |
| Unripe | Green | Lower damage but stronger knockback, useful for spacing and boss guard breaks. |

Luck increases the chance of throwing a Ripe melon. Ripe hits also feed several Fire and critical builds.

## Damage And Survival Feedback

The game gives immediate feedback for both enemy and player damage:

| Feedback | Purpose |
| --- | --- |
| Enemy health bars | Every enemy has a visible HP bar above its sprite. |
| Floating numbers | Hits show damage values by type: normal, critical, fire, ice, and shatter. |
| Player damage alert | Recent health loss displays source and amount so deaths are easier to understand. |
| Death review | Game over summarizes level, kills, events, ripe hits, damage taken, risk cards, main threat, and advice. |

If you die suddenly, check the death review. It distinguishes contact pressure, traps, scale explosions, and boss damage.

## Temper System

Huaqiang gains Temper by hitting enemies and taking damage. At 100% Temper, he enters **Conqueror Mode**.

| Effect | Result |
| --- | --- |
| Visual shift | The background turns high-contrast red. |
| Fire rate | Throw cooldown is reduced to roughly one third. |
| Damage | Projectile damage increases. |
| Audio / subtitle | The Conquest trigger plays with localized subtitle feedback. |

Conqueror Mode drains Temper over time. When Temper reaches 0, the mode ends.

## Build Formation

The upgrade system is route-aware. Fire, Ice, Magnet, and Temper are archetypes with visible formation breakpoints:

| Count | Stage | Result |
| --- | --- | --- |
| 2 cards in an archetype | Online | The route gains its first real build identity and active effect. |
| 3 cards in an archetype | Finisher | The route gains a stronger capstone-like effect. |

Current archetype effects:

| Archetype | Online | Finisher |
| --- | --- | --- |
| Fire | Fire damage rises and burn zones hit harder. | Ripe crits are more likely to detonate fire zones. |
| Ice | Slow and freeze effects last longer. | Frozen enemies take extra shatter pressure. |
| Magnet | Black holes gain radius and pull strength. | Metal enemies are crushed harder inside magnets. |
| Temper | Temper gain rises and throwing gets faster. | Conqueror Mode becomes more oppressive. |

The HUD shows route counts so players can see whether a build is opening, online, or finishing.

## Upgrade Cards

There are currently **28 upgrade cards**. Level-up pauses the Pixi ticker and shows a Vue-rendered card modal. The default choice count is 3; **Street Smarts** raises future choices to 4.

| Card | Faction | Effect |
| --- | --- | --- |
| Motorcycle Dash | Core | +18% movement speed and faster recovery after impact. |
| Cleaver Mastery | Core | +9 damage, faster throw cadence, and higher ripe chance. |
| Fire-Roasted Melon | Fire | Ripe hits leave burning zones. |
| Juice Combustion | Fire | Ripe critical explosions ignite nearby enemies. |
| Flame Debt | Fire | Conqueror Mode doubles fire damage. |
| Chilled Melon | Ice | Unripe hits slow enemies by 35% for 1.8 seconds. |
| Frost Cleaver Back | Ice | Projectiles can freeze normal enemies; bosses are heavily slowed. |
| Frozen Scale Effect | Ice | Slowed or frozen metal enemies suffer stronger magnet pull. |
| Shatter Crit | Ice | Ripe hits against chilled enemies deal bonus shatter damage. |
| Magnet Detector | Magnet | Doubles magnet sabotage chance and widens black-hole pull. |
| Magnetic Rind | Magnet | Expands magnet radius and increases EXP gain by 12%. |
| Weight Collision | Magnet | Chilled metal enemies take ice collision damage while magnets pull them. |
| Black-Hole Ignition | Magnet | Expiring magnet vortices detonate burning enemies inside. |
| Market Fury | Temper | +20 max Health and +12 Luck. |
| Rage Blade | Temper | Above 60% Temper, projectiles carry bonus fire damage. |
| Last-Stand Temper | Temper | Low Health grants movement speed and extra Temper gain when hit. |
| Hard Bargain | Survival | +35 max Health and immediately restores 35 Health. |
| Rind Armor | Survival | Reduces contact damage by 12% and extends invulnerability slightly. |
| Debt Collection | Survival | Kills restore Health; elites and bosses restore more. |
| Fair Scale | Growth | +18% EXP gain and +6 Luck. |
| Street Smarts | Growth | Future level-ups offer four cards. |
| Combo Dealer | Growth | Projectile damage rises for each archetype card you own. |
| Steam Burst | Fire / Ice synergy | Fire damage against chilled enemies triggers an area steam blast. |
| Split Melon | Rare | Ripe hits split into two smaller side melons. |
| Public Provocation | Risk | +35% projectile damage, but incoming damage increases by 18%. |
| Ripe or Bust | Risk | +18% ripe chance, but unripe knockback is reduced by 25%. |
| Melon Credit | Risk | Immediately gain one extra level-up, but lose 20 max Health. |
| No Refunds | Risk | +0.38 critical multiplier, but kill healing is disabled. |

All cards have pixel-art portraits in the UI. Owned cards appear in the card tray during the run. Selecting an owned card shows exactly what it does.

## Landmarks: Risk And Reward

Landmarks are the current in-run event system. They spawn in the explorable market and create short risk/reward objectives.

| Landmark | How To Complete | Risk | Reward |
| --- | --- | --- | --- |
| Scale Warehouse | Destroy the core fake scale with projectiles. | Metal enemies gather and scale-weights can block the route. | Large EXP, Magnet badge, and an upgrade to a Magnet or current-route card. |
| Melon Stall Supply | Walk onto the glowing supply stall. | Taking supplies reveals your position and pulls enemies closer. | Healing, Luck, and a survival-tolerance badge. |
| Market Back Alley | Enter the alley and survive the timer. | Enemies spawn from multiple angles and squeeze exits. | Large EXP, Temper, and a 12-second temporary burst. |
| Guaranteed-Ripe Tribunal | Enter the timer zone and avoid damage. | Damage downgrades the payout; after Lv15 it becomes the final boss key. | Premium reward, rare voice, and an upgrade to an owned card. |

Only one landmark is active at a time. The objective chip shows title, distance, risk, reward, and completion status.

## Boss Flow

The final boss is intentionally gated so the clear has a ritual moment.

1. Reach **Lv15** to trigger Conqueror Eve and the boss warning.
2. Find and clear the **Guaranteed-Ripe Tribunal** landmark.
3. The **Rigged Scale Emperor** unlocks and enters the map.
4. Watch the minimap and boss phase prompts.
5. Break guard with unripe knockback, Ice, or stagger pressure.
6. Defeat the boss to win the run.

Boss phases add guard, summons, traps, magnet pressure, and burn zones. Phase toasts make transitions visible.

## Enemies

| Enemy | Role |
| --- | --- |
| Melon Vendor | Throws fake-price traps from Lv3 onward, restricting safe ground. |
| Market Thug | Dashes from Lv5 onward, punishing predictable movement. |
| Scale-Weight | Metal enemy affected by magnets; Lv10+ can arm and explode near Huaqiang. |
| Electronic Scale Boss | Mid-run boss with high health, traps, and mixed summons. |
| Rigged Scale Emperor | Final boss with phases, guard, traps, summons, and battlefield pressure. |

Enemy health, damage, speed, spawn pressure, and elite chance scale with Huaqiang's level. The enemy system is tuned for moderate combination pressure rather than permanent escape denial.

## Audio And Subtitles

The centralized audio system supports these triggers:

| Trigger | Use |
| --- | --- |
| `spawn` | Huaqiang opening line. |
| `critical_hit` | Ripe critical / signature hit. |
| `boss_kill` | Boss defeat. |
| `ultimate_ready` | Temper or signature pressure cue. |
| `zhengfu_theme` | Conqueror Mode. |
| `enemy_launch` | Enemy projectile / launch cue. |
| `burn_tick` | Burning damage cue. |
| `enemy_dash` | Thug dash cue. |
| `enemy_explode` | Scale-weight explosion cue. |
| `trap_tick` | Trap damage cue. |

Chinese original clips are optional. Add licensed files under `public/assets/audio/zh/` and map them in `public/assets/audio/zh/manifest.json`:

```json
{
  "spawn": { "src": "/assets/audio/zh/spawn.mp3", "volume": 0.95 },
  "critical_hit": { "src": "/assets/audio/zh/critical_hit.mp3", "volume": 0.95 },
  "boss_kill": { "src": "/assets/audio/zh/boss_kill.mp3", "volume": 0.95 },
  "ultimate_ready": { "src": "/assets/audio/zh/ultimate_ready.mp3", "volume": 0.95 },
  "zhengfu_theme": { "src": "/assets/audio/zh/zhengfu_theme.mp3", "volume": 0.8 },
  "enemy_launch": { "src": "/assets/audio/zh/enemy_launch.mp3", "volume": 0.65 },
  "burn_tick": { "src": "/assets/audio/zh/burn_tick.mp3", "volume": 0.45 },
  "enemy_dash": { "src": "/assets/audio/zh/enemy_dash.mp3", "volume": 0.65 },
  "enemy_explode": { "src": "/assets/audio/zh/enemy_explode.mp3", "volume": 0.75 },
  "trap_tick": { "src": "/assets/audio/zh/trap_tick.mp3", "volume": 0.45 }
}
```

When a clip is missing or blocked, the game falls back to Web Audio tones and browser `speechSynthesis`. Subtitles use a GSAP pop animation and are positioned to reduce combat obstruction.

## Visual Style

| System | Implementation |
| --- | --- |
| CRT look | Scanlines, chromatic aberration, vignette, and TV-drama color grading. |
| Pixel cast | Huaqiang, vendor, thug, scale-weight, and scale boss use generated pixel portraits. |
| Huaqiang consistency | HUD portrait and in-canvas player sprite share the same pixel identity. |
| Juice particles | Pixi `ParticleContainer` powers red/green watermelon juice bursts. |
| Hit feedback | Critical hits trigger hit-stop, camera shake, particles, and floating damage numbers. |
| Responsive layout | Desktop and mobile HUD layouts avoid the minimap and combat-critical screen space. |

## Technical Architecture

| Area | Notes |
| --- | --- |
| Frontend | Vue 3 Composition API Single File Component. |
| Renderer | PixiJS v8 `Application`, world containers, responsive `ResizeObserver`, and ticker loop. |
| State | Reactive game state tracks Health, Temper, EXP, Level, Luck, run goal, buffs, and HUD data. |
| Entities | Class-based `Player`, `Enemy`, and `Projectile` contracts. |
| Pooling | Object pools for projectiles and enemies reduce GC pressure during high-action moments. |
| Collision | Runtime collision loop covers projectile-enemy, enemy-player, traps, burn zones, and magnet pulls. |
| UI Bridge | Pixi runs the simulation; Vue renders HUD, modals, language selection, card tray, objectives, and recap screens. |
| Cleanup | `onUnmounted` destroys the Pixi app, removes event listeners, disconnects observers, and closes audio resources. |

## File Map

| File | Purpose |
| --- | --- |
| `src/Game.vue` | Main Vue/Pixi gameplay component and UI overlay. |
| `src/game/types.ts` | Shared TypeScript contracts and ids. |
| `src/game/constants.ts` | Upgrade ids, locale options, audio triggers, meta goals, and tuning constants. |
| `src/game/i18n.ts` | Chinese, English, and French localized copy. |
| `src/game/pixelPortraits.ts` | Code-native pixel portrait definitions. |
| `src/game/entities/` | Class-based entity implementations. |
| `src/game/systems/audio.ts` | Audio manifest manager and fallback audio system. |
| `public/assets/huaqiang-hero-pixel.svg` | Huaqiang hero portrait used in the README and HUD style. |
| `public/assets/huaqiang-cast-pixel.svg` | Pixel cast sheet for the market characters. |
