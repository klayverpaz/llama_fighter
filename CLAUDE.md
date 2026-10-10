# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Kickboxing de Palito": a browser 3D game (Vite + TypeScript, no UI framework). The player is a stick-figure samurai fighting NPCs with kickboxing strikes and guns. NPCs that get knocked out fall as Rapier ragdolls. There are two modes: Treino (training: NPCs get back up) and Modo Zumbi (waves of zombies, CoD-Zombies style). It has no backend, and the production build is an offline-capable PWA.

## Commands

```sh
npm run dev          # Vite dev server
npm test             # vitest run (Node, no WebGL)
npx vitest run src/combat/combat.test.ts      # single file
npx vitest run -t "front kicks damage"        # single test by name
npm run typecheck    # tsc --noEmit (strict, noUnusedLocals/Parameters)
npm run build        # typecheck + vite build (also emits sw.js)
python3 scripts/make-icons.py                 # regenerate PWA icons in public/icons
```

URL params for manual testing: `?npcs=N` sets the NPC count, `?touch=1` forces touch controls on desktop.

## Language conventions

- Code, identifiers, comments and test names are in **English**.
- Player-facing text (overlay/HUD strings, README) and **commit messages are in Brazilian Portuguese**, using Conventional Commit prefixes (`feat:`, `fix:`). Example: `feat: desmembramento, sangue e chefão 4× maior`.
- When a gameplay feature or control changes, update `README.md`, which documents controls, weapons and zombie types for players.

## Architecture

**Bootstrap and loop.** `src/main.ts` owns everything browser-specific: the Three.js scene, input (keyboard/mouse/touch), camera, overlay/HUD, audio (`Sfx`, synthesized with Web Audio and no asset files), visual effects (`Effects`), sky/atmosphere transitions, pause and restart. It runs a fixed 60 Hz physics step (`core/loop.ts`, accumulator-based) and renders on every frame.

**`Game` (`src/game.ts`) is the simulation core.** It is constructed with `(physics, scene, npcCount, rng?, mode, obstacles)`. It owns the Player, the NPCs, llamas, gun models and, in waves mode, a `WaveMode`. Each tick, `main.ts` builds a `GameInput` and calls `game.step(dt, input)`. Then it drains `GameEvent`s (a discriminated union: hits, KOs, shots, explosions, dismemberment, wave events, etc.) and turns them into sound, effects, HUD updates and camera shake. Keep new presentation reactions on this event path instead of calling into the UI from the simulation. `WaveMode` talks back to `Game` through the `WaveHost` interface.

**Figure: kinematic vs. ragdoll.** `figure/skeleton.ts` defines the 11 segments (lengths, masses, joint limits). `figure/fk.ts` converts a pose (root position/yaw plus local joint quaternions) into world transforms. `figure/figure.ts` creates one Rapier rigid body and one capsule mesh per segment. In `posed` mode the bodies are kinematic and driven by FK each tick. On KO they switch to dynamic, inherit the velocities from the previous tick, and then receive the strike impulse. On recovery they blend back to the stance pose. Gun-holding arms use two-bone IK (`figure/ik.ts`, `entities/rifleRig.ts`). `figure/samurai.ts` dresses the player figure.

**Animation.** `anim/animator.ts` plays keyframe clips (slerp between keyframes, blending between clips). `anim/clips.ts` and `anim/strikeClips.ts` hold the clip data, and `anim/walk.ts` is a procedural walk layer composed on top of the stance.

**Combat.** `combat/strikes.ts` is the strike table: key, limb, damage, impulse, and startup/active/recovery windows. `combat/attack.ts` is the attack state machine, and `combat/hits.ts` does hit detection. Guns live in `weapons/`: `guns.ts` is the gun table plus the specials (RPG, freeze ray, Tesla, antigravity, llama launcher). `rifle.ts` and `shotgun.ts` hold the weapon state logic, and the `*Model.ts` files build the meshes. Shots are Rapier raycasts. Colliders carry a `BodyTag` (`physics/world.ts` `bodyTag()`) that identifies which entity and segment was hit.

**NPCs and zombies.** `entities/npcBrain.ts` contains the pure steering/decision functions, and `entities/npc.ts` wires them to a Figure (state cycle chase → hold → flinch → ragdoll → recovering, plus zombie behavior, dismemberment and freezing). The wave rules (`modes/waves.ts`) and zombie kinds/stats/atmosphere per wave (`modes/zombieTypes.ts`) are pure. `modes/waveMode.ts` runs spawning, points, the Mystery Box and power-ups.

**World.** `world/arena.ts` defines the floating island (`ARENA.radius`, `voidY`, `onIsland`). Note that `modes/waveMode.ts` exports a *different* `ARENA` constant (spawn ring, box position, starting points). `world/obstacles.ts` generates a random obstacle layout per match and provides `pushOut` collision resolution.

**PWA.** `vite.config.ts` contains a custom build-only plugin that generates `sw.js` from `src/pwa/serviceWorker.ts`. It lists every bundled and `public/` file and derives a content-hash version from them. `base: './'` keeps the build relocatable.

## Testability rule

Logic modules are kept free of `three`/Rapier imports so they can be unit-tested in Node. Examples are `fk`, `animator`, `attack`, `strikes`, `npcBrain`, `waves`, `zombieTypes`, `obstacles`, `rifle`, `shotgun`, `touchMath` and `serviceWorker`. Keep it that way: extract pure functions and test them. Physics integration is still testable, because Rapier (`rapier3d-compat`, with embedded WASM) runs in Node. Tests like `game.test.ts`, `stress.test.ts` and `modes/waveGame.test.ts` construct a real `Game` with `await createPhysics()` and `new THREE.Scene()`, step it at `1/60`, pass a seeded RNG for determinism, and call `game.dispose()` / `physics.dispose()` at the end.

## Tuning values

All balance numbers live in `src/tuning/tuning.json`, loaded by `src/tuning/tuning.ts` into the live `TUNING` object. Gameplay modules alias its sections (`POINTS = TUNING.points`, `NPC_TUNING = TUNING.npc`, `STRIKES.jab` is `TUNING.strikes.jab` with key/limb attached, gun specs read their numbers through getters) and must read them at use time, never copy them into module-level constants, so the dev panel's in-place edits apply live. To add a tunable: add it to the JSON, read it through `TUNING`, and optionally add a tooltip in `TUNING_NOTES`. `zombies.maxHit` caps any single hit on the player.

**Dev mode** (dev builds only, `import.meta.env.DEV`; `src/dev/devPanel.ts` is dynamically imported so production drops it): a switch on the start and pause screens shows a top-right panel that edits every `TUNING` value. `tuning/devMode.ts` (pure, tested) keeps the dev values in localStorage; off restores `tuning.json`, on restores the dev values. "Baixar JSON" downloads a dump in the `tuning.json` shape, which can replace that file.

## Docs

`docs/superpowers/specs/2026-10-07-kickboxing-mvp-design.md` is the original MVP design (in Portuguese). It is still a good reference for the figure/ragdoll/combat design, but it predates guns, waves, touch controls and the PWA. Some details in it are outdated: `anim/player.ts` is now `anim/animator.ts`, and restart moved from R to Backspace.
