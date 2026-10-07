import { createScene } from './scene/scene';
import { createPhysics } from './physics/world';
import { createFixedStepper } from './core/loop';
import { Game } from './game';
import { Keyboard } from './input/keyboard';
import { MouseLook } from './input/mouse';
import { ThirdPersonCamera, moveDirection } from './camera/thirdPerson';
import { KEY_TO_STRIKE, type StrikeName } from './combat/strikes';
import { createOverlay } from './ui/overlay';
import { parseNpcCount } from './ui/params';

async function main() {
  const app = document.getElementById('app')!;
  const overlay = createOverlay(app);
  const { scene, camera, renderer } = createScene(app);

  let physics;
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

  let game: Game | null = null;
  let npcCount = parseNpcCount(window.location.search);

  function startGame(count: number) {
    npcCount = count;
    game?.dispose();
    game = new Game(physics!, scene, count);
    overlay.setKnockouts(0);
    overlay.hide();
    keyboard.clear();
    mouse.requestLock();
  }

  mouse.onLockChange = (locked) => {
    if (!game) return;
    if (locked) overlay.hide();
    else overlay.showPaused(() => mouse.requestLock());
  };
  renderer.domElement.addEventListener('click', () => { if (game) mouse.requestLock(); });

  overlay.showStart(npcCount, startGame);

  let last = performance.now();
  function frame(now: number) {
    const elapsed = (now - last) / 1000;
    last = now;
    const { dx, dy } = mouse.consume();
    orbit.rotate(dx, dy);

    if (game && mouse.locked) {
      const g = game;
      stepper.advance(elapsed, () => {
        const pressed = keyboard.drainPressed();
        if (pressed.includes('KeyR')) { startGame(npcCount); return; }
        const strikes = pressed.map((c) => KEY_TO_STRIKE[c]).filter((s): s is StrikeName => !!s);
        const move = moveDirection({
          forward: keyboard.isDown('KeyW'), back: keyboard.isDown('KeyS'),
          left: keyboard.isDown('KeyA'), right: keyboard.isDown('KeyD'),
        }, orbit.yaw);
        const run = keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight');
        g.step(stepper.dt, { move, run, strikes, cameraYaw: orbit.yaw });
      });
      overlay.setKnockouts(game.knockouts);
    } else {
      keyboard.clear();
    }

    if (game) orbit.update(game.player.position, elapsed);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:16px">Falha ao iniciar: ${String(err)}</pre>`;
});
