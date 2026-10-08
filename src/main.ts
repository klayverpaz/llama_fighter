import * as THREE from 'three';
import { createScene } from './scene/scene';
import { createPhysics, type Physics } from './physics/world';
import { createFixedStepper } from './core/loop';
import { Game, type GameEvent, type GameInput } from './game';
import { Keyboard } from './input/keyboard';
import { MouseLook } from './input/mouse';
import { ThirdPersonCamera, moveDirection } from './camera/thirdPerson';
import { KEY_TO_STRIKE, type StrikeName } from './combat/strikes';
import { createOverlay } from './ui/overlay';
import { parseNpcCount } from './ui/params';
import { Effects } from './fx/effects';
import { Sfx } from './audio/sfx';
import { GUNS, WEAPON_KEYS } from './weapons/guns';
import { TimeScale, ComboCounter, comboLabel } from './core/timeScale';
import { atmosphereFor, mixAtmosphere, ZOMBIE_KINDS, type Atmosphere } from './modes/zombieTypes';
import { TouchControls, isTouchDevice } from './input/touch';
import { stickMoveDirection } from './input/touchMath';
import { generateObstacles } from './world/obstacles';
import { ARENA as WAVE_ARENA } from './modes/waveMode';

async function main() {
  const app = document.getElementById('app')!;
  const touchMode = isTouchDevice();
  const overlay = createOverlay(app, touchMode);
  const { scene, camera, renderer, setAtmosphere } = createScene(app, touchMode);
  /** Sky transition between waves: from `atmoFrom` to `atmoTo` over a few seconds. */
  let atmoFrom: Atmosphere = atmosphereFor(1);
  let atmoTo: Atmosphere = atmoFrom;
  let atmoT = 1;
  let atmoNow: Atmosphere = atmoFrom;
  const changeAtmosphere = (to: Atmosphere) => {
    atmoFrom = atmoNow;
    atmoTo = to;
    atmoT = 0;
  };

  let physics: Physics;
  try {
    physics = await createPhysics();
  } catch (err) {
    overlay.showError(`Não consegui carregar a física (WASM): ${String(err)}`);
    return;
  }

  const keyboard = new Keyboard();
  keyboard.attach();
  const mouse = new MouseLook(renderer.domElement);
  mouse.attach();
  const orbit = new ThirdPersonCamera(camera);
  const stepper = createFixedStepper(1 / 60);
  const effects = new Effects(scene);
  const sfx = new Sfx();
  const time = new TimeScale();
  const combo = new ComboCounter();
  /** Game time (scaled), for combo windows. */
  let gameTime = 0;
  let shake = 0;
  let wasSlow = false;
  let lastKnockouts = 0;

  let game: Game | null = null;
  let npcCount = parseNpcCount(window.location.search);
  /** Touch mode has no pointer lock: the game runs unless this is set. */
  let touchPaused = false;
  let touchState = '';
  function syncTouch(g: Game) {
    const key = `${g.player.weapon}/${g.player.mounted}`;
    if (!touch || key === touchState) return;
    touchState = key;
    touch.setWeapon(g.player.weapon, g.player.mounted);
  }
  const touch = touchMode ? new TouchControls(app, () => pauseTouch()) : null;
  const KEY_TO_STRIKE_NAMES = Object.fromEntries(Object.values(KEY_TO_STRIKE).map((n) => [n, true]));

  let mode: 'training' | 'waves' = 'waves';
  let groanTimer = 4;

  function startGame(count: number, nextMode: 'training' | 'waves' = mode) {
    npcCount = count;
    mode = nextMode;
    sfx.unlock();
    effects.clear();
    lastKnockouts = 0;
    game?.dispose();
    // A fresh obstacle layout every match, keeping the spawn and the Mystery Box clear.
    const obstacles = generateObstacles(Math.random, [
      { x: 0, z: 0, r: 3.5 },
      { x: WAVE_ARENA.boxPosition.x, z: WAVE_ARENA.boxPosition.z, r: 2.6 },
    ]);
    game = new Game(physics, scene, count, Math.random, mode, obstacles);
    const g0 = game;
    orbit.clip = (from, to) => g0.cameraClip(from, to);
    overlay.setKillsLabel(mode === 'waves' ? 'Abates' : 'Nocautes');
    changeAtmosphere(atmosphereFor(1));
    overlay.setKnockouts(0);
    touch?.setOwned(game.player.owned);
    overlay.hide();
    keyboard.clear();
    if (touch) {
      touchPaused = false;
      touchState = '';
      touch.setWeapon('fists', false);
      touch.release();
      touch.show();
      enterFullscreen();
    } else {
      mouse.requestLock();
    }
  }

  function pauseTouch() {
    if (!touch || !game || touchPaused) return;
    touchPaused = true;
    touch.hide();
    overlay.showPaused(() => {
      touchPaused = false;
      overlay.hide();
      touch.show();
      sfx.unlock();
    }, () => startGame(npcCount));
  }

  /** Phones: go fullscreen and landscape where the browser allows it (Android); iOS just ignores it. */
  function enterFullscreen() {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    try {
      Promise.resolve(req?.())
        .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
        .catch(() => {});
    } catch { /* not supported */ }
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseTouch(); });

  mouse.onLockChange = (locked) => {
    if (!game || touch || game.waves?.over) return;
    if (locked) overlay.hide();
    else overlay.showPaused(() => mouse.requestLock());
  };
  renderer.domElement.addEventListener('click', () => { if (game && !touch) mouse.requestLock(); });

  overlay.showStart(npcCount, startGame);

  function aimRay() {
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3());
    return { origin, dir };
  }

  /** Build this tick's input from the keyboard and mouse. Returns null when the game must restart. */
  function readInput(): GameInput | null {
    const pressed = keyboard.drainPressed();
    if (pressed.includes('Backspace')) return null;
    const touchActions = touch?.consumeActions() ?? [];
    const strikes = [
      ...pressed.map((c) => KEY_TO_STRIKE[c]).filter((s): s is StrikeName => !!s),
      ...touchActions.filter((a): a is StrikeName => a in KEY_TO_STRIKE_NAMES),
    ];
    if (pressed.includes('KeyT') || touchActions.includes('slowmo')) time.toggle();
    let weapon: GameInput['weapon'] = pressed.includes('KeyQ') || touchActions.includes('weapon') ? 'toggle' : undefined;
    WEAPON_KEYS.forEach((w, i) => { if (pressed.includes(`Digit${i + 1}`)) weapon = w; });
    const pick = touchActions.find((a) => a.startsWith('pick:'));
    if (pick) weapon = pick.slice(5) as GameInput['weapon'];
    const wheel = mouse.consumeWheel();
    if (!weapon && wheel !== 0) weapon = wheel > 0 ? 'toggle' : 'prev';
    // Clicking a mouse button with empty hands draws the last gun used.
    if (!weapon && game && game.player.weapon === 'fists' && (mouse.left || mouse.right)) weapon = game.player.lastGun;
    let move = moveDirection({
      forward: keyboard.isDown('KeyW'), back: keyboard.isDown('KeyS'),
      left: keyboard.isDown('KeyA'), right: keyboard.isDown('KeyD'),
    }, orbit.yaw);
    if (touch && move.lengthSq() === 0) move = stickMoveDirection(touch.stick.x, touch.stick.y, orbit.yaw);
    return {
      move,
      run: keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight') || !!touch?.run,
      strikes,
      cameraYaw: orbit.yaw,
      weapon,
      aim: mouse.right || !!touch?.aim,
      fire: mouse.left || !!touch?.fire,
      reload: pressed.includes('KeyR') || touchActions.includes('reload'),
      use: pressed.includes('KeyE') || touchActions.includes('use'),
      mount: pressed.includes('KeyF') || touchActions.includes('mount'),
      jump: pressed.includes('Space') || touchActions.includes('jump'),
      aimRay: aimRay(),
    };
  }

  function handleEvents(g: Game, events: GameEvent[]) {
    for (const e of events) {
      switch (e.kind) {
        case 'fire': {
          const spec = GUNS[e.gun];
          orbit.pitch -= spec.recoilPitch * (0.8 + Math.random() * 0.4);
          orbit.yaw += (Math.random() - 0.5) * 2 * spec.recoilYaw;
          const flash: Record<string, number> = { rpg: 2.2, freeze: 0.6, tesla: 0.8, antigrav: 0.6, llamaCannon: 1.4 };
          effects.muzzleFlash(e.from, e.gunRotation, flash[e.gun] ?? 1);
          if (e.gun === 'rpg') { sfx.rocketLaunch(); effects.smoke(e.from); }
          else if (e.gun === 'freeze') sfx.freezeZap();
          else if (e.gun === 'tesla') sfx.tesla();
          else if (e.gun === 'antigrav') sfx.antigrav();
          else if (e.gun === 'llamaCannon') sfx.llamaLaunch();
          break;
        }
        case 'beam':
          effects.beam(e.from, e.to, e.gun === 'freeze' ? 0x7fe3ff : 0xc58cff, e.gun === 'freeze' ? 0.03 : 0.04);
          if (!e.hitNpc) effects.impact(e.to, null, false);
          break;
        case 'lightning': effects.lightning(e.points); break;
        case 'shatter': effects.shards(e.point); effects.blood(e.point, null, 1.5); sfx.shatter(); overlay.hitMarker(true); break;
        case 'float': effects.sparkle(e.point, 0xc58cff); overlay.hitMarker(true); break;
        case 'smoke': effects.smoke(e.point); break;
        case 'explosion':
          effects.explosion(e.point);
          sfx.explosion();
          shake = Math.max(shake, Math.min(1, 9 / Math.max(3, g.player.position.distanceTo(e.point))));
          break;
        case 'llamaBonk':
          effects.wool(e.point);
          if (e.hitNpc) effects.blood(e.point, null, 1.5);
          sfx.bonk();
          if (e.hitNpc) overlay.hitMarker(e.knockedOut);
          break;
        case 'waveStart':
          overlay.banner(`ONDA ${e.wave}`);
          sfx.waveStart();
          changeAtmosphere(atmosphereFor(e.wave));
          break;
        case 'newZombies':
          window.setTimeout(() => overlay.banner(`NOVO: ${e.names.join(' + ')}!`), 1600);
          break;
        case 'bossIncoming':
          window.setTimeout(() => {
            overlay.banner('O REI CHEGOU!');
            sfx.roar(true);
            shake = Math.max(shake, 0.6);
          }, 1800);
          break;
        case 'jump':
          sfx.jump();
          break;
        case 'land':
          effects.dust(e.point, Math.min(1, e.speed / 9));
          sfx.land(e.speed);
          break;
        case 'fell':
          sfx.fall();
          break;
        case 'respawn':
          overlay.banner('DE VOLTA!');
          break;
        case 'steedDown':
          effects.smoke(e.point);
          effects.wool(e.point);
          sfx.zombieLlama();
          break;
        case 'waveCleared':
          overlay.banner(`ONDA ${e.wave} CONCLUÍDA`);
          sfx.waveEnd();
          break;
        case 'hurt':
          overlay.hurt();
          sfx.hurt();
          shake = Math.max(shake, 0.35);
          break;
        case 'death':
          sfx.gameOver();
          time.trigger(2.5);
          window.setTimeout(() => {
            if (document.pointerLockElement) document.exitPointerLock();
            touch?.hide();
            overlay.showGameOver(
              { wave: e.wave, kills: e.kills, points: e.points, reason: e.reason },
              () => startGame(npcCount, 'waves'),
              () => startGame(npcCount, 'training'),
            );
          }, 1800);
          break;
        case 'zombieSpawn':
          if (e.zombie !== 'cavalry') effects.dirt(e.point);
          if (e.zombie === 'runner' && Math.random() < 0.5) sfx.screech();
          else if (e.zombie === 'brute') sfx.roar();
          else if (e.zombie === 'cavalry') sfx.zombieLlama();
          else if (e.zombie === 'exploder') sfx.fuse();
          break;
        case 'zombieKilled':
          window.setTimeout(() => effects.splat(e.point.clone().setY(0), 0.45 + Math.random() * 0.45), 600);
          break;
        case 'corpseGone':
          effects.smoke(e.point);
          break;
        case 'powerUpDrop':
          sfx.powerUpDrop();
          break;
        case 'powerUp':
          overlay.banner(e.power === 'maxAmmo' ? 'MUNIÇÃO MÁXIMA!' : e.power === 'instaKill' ? 'INSTA-KILL!' : 'NUKE!');
          sfx.powerUp(e.power);
          if (e.power === 'nuke') {
            shake = 1;
            time.trigger(1.5);
            effects.explosion(g.player.position.clone().add(new THREE.Vector3(0, 6, 0)));
          }
          break;
        case 'boxOpen':
          sfx.boxJingle();
          break;
        case 'boxResult':
          overlay.banner(`${GUNS[e.gun].label.toUpperCase()}!`);
          sfx.boxResult();
          touch?.setOwned(g.player.owned);
          break;
        case 'shot': {
          const gun = g.player.gun;
          if (e.pellet === 0) {
            const spec = GUNS[e.gun];
            if (gun && e.gun === 'rifle') effects.shot(e.from, e.to, gun.gunPosition, gun.gunRotation);
            else if (gun) effects.muzzleFlash(e.from, gun.gunRotation, 1.8);
            if (e.gun === 'rifle') sfx.shot();
            else sfx.shotgun();
            // Recoil: the muzzle climbs and wanders a little; spray control is pulling the mouse down.
            orbit.pitch -= spec.recoilPitch * (0.8 + Math.random() * 0.4);
            orbit.yaw += (Math.random() - 0.5) * 2 * spec.recoilYaw;
          }
          if (e.gun === 'shotgun') effects.tracer(e.from, e.to);
          if (e.target === 'npc') {
            effects.blood(e.to, e.dir, e.gun === 'shotgun' ? 0.5 : 1);
            if (e.pellet === 0) sfx.splat();
          } else if (e.target !== 'none') effects.impact(e.to, e.normal, false);
          if (e.target === 'npc' && e.result !== 'none' && e.result !== 'body') {
            overlay.hitMarker(e.result === 'killed');
            sfx.hitMarker(e.result === 'killed');
          }
          break;
        }
        case 'melee':
          sfx.punch(e.knockedOut);
          if (e.zombie) effects.blood(e.point, e.dir, e.knockedOut ? 1.2 : 0.5);
          break;
        case 'dismember':
          effects.blood(e.point, e.dir, e.big ? 4 : 2);
          effects.bleed(e.stump, e.big ? 3 : 1.8, e.big ? 90 : 45, e.big ? 3 : 1.8);
          effects.bleed(e.limb, 1.2, 25, 0.6);
          sfx.dismember(e.big);
          shake = Math.max(shake, e.big ? 0.4 : 0.12);
          break;
        case 'dryFire': sfx.dryFire(); break;
        case 'reloadStart': sfx.reloadStart(); break;
        case 'reloadEnd': sfx.reloadEnd(); break;
        case 'swap': sfx.swap(); break;
        case 'mount': sfx.llama(); break;
        case 'pump': sfx.pump(); effects.casing(e.port, e.gunRotation, 'shell'); break;
        case 'shellLoaded': sfx.shell(); break;
        case 'dismount': sfx.swap(); break;
      }
    }
  }

  function updateHud(g: Game) {
    const p = g.player;
    const w = g.waves;
    overlay.setKnockouts(w ? w.kills : g.knockouts);
    if (w) {
      const intermission = w.director.phase === 'intermission';
      overlay.setWaveHud({
        wave: w.wave,
        remaining: intermission ? null : w.remaining,
        nextIn: intermission ? w.director.timer : null,
        points: w.points,
        hp: w.health.hp,
        maxHp: 100,
        instaKill: w.instaKillLeft,
        box: w.nearBox ? { affordable: w.points >= 950, rolling: w.boxRolling } : null,
      });
      touch?.setUse(w.nearBox && !w.over);
      overlay.setBossBar(w.boss && w.boss.state !== 'ragdoll'
        ? { name: ZOMBIE_KINDS.boss.name, hp: w.boss.hp, max: w.boss.maxHp } : null);
    } else {
      overlay.setWaveHud(null);
      overlay.setBossBar(null);
      touch?.setUse(false);
    }
    if (w?.over) {
      overlay.setRifleHud(null);
      overlay.setWeaponHint(null);
      return;
    }
    if (!p.armed) {
      overlay.setRifleHud(null);
      overlay.setWeaponHint(p.weapon === 'fists'
        ? (g.waves
          ? (touch ? 'Toque em Armas para sacar a AK · Caixa Misteriosa dá armas novas' : 'Clique ou Q saca a AK · E na Caixa Misteriosa ($950) dá armas novas')
          : (touch ? 'Toque em Armas para escolher uma de 7 armas · ⏱ câmera lenta' : 'Clique ou Q saca a arma · 1–8 escolhem · T câmera lenta · F lhama'))
        : null);
      return;
    }
    const spec = GUNS[p.currentGun ?? p.lastGun];
    const spread = spec.spread(p.rifle, p.aimBlend, p.moving);
    const pxPerRad = window.innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    overlay.setWeaponHint(null);
    overlay.setRifleHud({
      label: spec.label,
      ammo: p.rifle.ammo,
      mag: Number.isFinite(p.reserve[p.currentGun ?? p.lastGun]) ? p.reserve[p.currentGun ?? p.lastGun] : spec.magSize,
      reloading: p.rifle.reloading > 0,
      spreadPx: spread * pxPerRad,
      aiming: p.aimBlend > 0.5,
    });
  }

  /** New knockouts this tick feed the combo counter; big moments trigger slow motion and a banner. */
  function checkCombo(g: Game) {
    const total = g.waves ? g.waves.kills : g.knockouts;
    const fresh = total - lastKnockouts;
    lastKnockouts = total;
    if (fresh <= 0) return;
    const size = combo.add(fresh, gameTime);
    const label = comboLabel(size);
    if (label) {
      overlay.banner(label);
      sfx.combo(size);
    }
    // Several at once (a rocket into a crowd, a chain of lightning) or a long streak: bullet time.
    if (fresh >= 2 || size >= 4) time.trigger(fresh >= 3 || size >= 5 ? 1.8 : 1.2);
  }

  /** Follow the body while it tumbles (falling into the void, knocked dead). */
  function cameraFocus(g: Game): THREE.Vector3 {
    return g.player.figure.mode === 'ragdoll' ? g.player.figure.pelvisPosition() : g.player.rootPosition();
  }

  function applyShake(dt: number) {
    if (shake <= 0) return;
    const a = shake * 0.12;
    camera.position.add(new THREE.Vector3((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a));
    shake = Math.max(0, shake - dt * 2.5);
  }

  let last = -1;
  function frame(now: number) {
    const elapsed = last < 0 ? 0 : (now - last) / 1000;
    last = now;
    const { dx, dy } = mouse.consume();
    orbit.rotate(dx, dy);
    if (touch) {
      const look = touch.consumeLook();
      if (game && !touchPaused) orbit.rotate(look.dx, look.dy);
    }

    const running = !!game && (touch ? !touchPaused : mouse.locked);
    time.update(running ? elapsed : 0);
    if (time.slow !== wasSlow) {
      wasSlow = time.slow;
      overlay.setSlowMo(time.slow);
      touch?.setSlowMo(time.slow);
      sfx.setSlowMo(time.slow);
      sfx.slowMoWhoosh(time.slow);
    }
    const simElapsed = elapsed * time.scale;
    if (game?.waves && running && !game.waves.over) {
      groanTimer -= elapsed;
      const alive = game.npcs.filter((n) => n.standing).length;
      if (groanTimer <= 0 && alive > 0) {
        sfx.groan();
        groanTimer = 1.5 + Math.random() * (6 / Math.min(alive, 6));
      }
    }
    if (game && running) {
      const g = game;
      let restart = false;
      stepper.advance(simElapsed, () => {
        gameTime += stepper.dt;
        if (restart) return;
        const input = readInput();
        if (!input) { restart = true; return; }
        g.step(stepper.dt, input);
        handleEvents(g, g.drainEvents());
        checkCombo(g);
      });
      if (restart) startGame(npcCount);
      if (game) syncTouch(game);
    } else {
      keyboard.clear();
    }

    if (game) {
      orbit.update(cameraFocus(game), elapsed, game.player.aimBlend);
      updateHud(game);
    }
    effects.update(running ? simElapsed : 0);
    if (atmoT < 1) {
      atmoT = Math.min(1, atmoT + elapsed / 4);
      atmoNow = mixAtmosphere(atmoFrom, atmoTo, atmoT * atmoT * (3 - 2 * atmoT));
      setAtmosphere(atmoNow);
    }
    applyShake(elapsed);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Dev-only hook so the game can be driven and screenshotted without pointer lock (automation, debugging).
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__kb = {
      start(count = 5, m: 'training' | 'waves' = 'training') {
        startGame(count, m);
        overlay.hide();
      },
      get game() { return game; },
      orbit,
      touch,
      /** Advance `ticks` fixed steps using the live keyboard/mouse/touch input, then render. */
      tick(ticks: number) {
        if (!game) return;
        for (let i = 0; i < ticks; i++) {
          if (touch) {
            const look = touch.consumeLook();
            orbit.rotate(look.dx, look.dy);
          }
          const input = readInput();
          if (!input) return;
          game.step(stepper.dt, input);
          handleEvents(game, game.drainEvents());
          checkCombo(game);
          orbit.update(cameraFocus(game), stepper.dt, game.player.aimBlend);
          effects.update(stepper.dt);
          syncTouch(game);
        }
        updateHud(game);
        renderer.render(scene, camera);
      },
      /** Jump the sky straight to a wave's atmosphere (screenshots). */
      sky(wave: number) {
        atmoNow = atmoTo = atmosphereFor(wave);
        atmoT = 1;
        setAtmosphere(atmoNow);
      },
      /** Advance `ticks` fixed steps with the given input overrides, then render one frame. */
      step(ticks: number, over: Partial<GameInput> = {}) {
        if (!game) return;
        for (let i = 0; i < ticks; i++) {
          const input: GameInput = {
            move: new THREE.Vector3(), run: false, strikes: [], cameraYaw: orbit.yaw, aimRay: aimRay(), ...over,
          };
          game.step(stepper.dt, input);
          handleEvents(game, game.drainEvents());
          checkCombo(game);
          orbit.update(cameraFocus(game), stepper.dt, game.player.aimBlend);
          effects.update(stepper.dt);
        }
        updateHud(game);
        renderer.render(scene, camera);
      },
    };
  }
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:16px">Falha ao iniciar: ${String(err)}</pre>`;
});
