import * as THREE from 'three';
import { createScene } from './scene/scene';
import { createPhysics } from './physics/world';
import { createFixedStepper } from './core/loop';
import { Figure } from './figure/figure';
import { PELVIS_HEIGHT } from './figure/skeleton';
import { Player, type TargetInfo } from './entities/player';
import { Keyboard } from './input/keyboard';
import { MouseLook } from './input/mouse';
import { ThirdPersonCamera, moveDirection } from './camera/thirdPerson';
import { KEY_TO_STRIKE, type StrikeName } from './combat/strikes';

async function main() {
  const app = document.getElementById('app')!;
  const { scene, camera, renderer } = createScene(app);
  const physics = await createPhysics();

  const keyboard = new Keyboard();
  keyboard.attach();
  const mouse = new MouseLook(renderer.domElement);
  mouse.attach();
  renderer.domElement.addEventListener('click', () => mouse.requestLock());

  const orbit = new ThirdPersonCamera(camera);
  const figure = new Figure(physics, scene, { id: 'player', color: 0x2a6fdb, position: new THREE.Vector3(0, PELVIS_HEIGHT, 0) });
  const player = new Player(figure, new THREE.Vector3(0, PELVIS_HEIGHT, 0));
  const targets: TargetInfo[] = [];

  const stepper = createFixedStepper(1 / 60);
  let last = performance.now();

  function frame(now: number) {
    const elapsed = (now - last) / 1000;
    last = now;
    const { dx, dy } = mouse.consume();
    orbit.rotate(dx, dy);

    if (mouse.locked) {
      stepper.advance(elapsed, () => {
        const strikes = keyboard.drainPressed().map((c) => KEY_TO_STRIKE[c]).filter((s): s is StrikeName => !!s);
        const move = moveDirection({
          forward: keyboard.isDown('KeyW'), back: keyboard.isDown('KeyS'),
          left: keyboard.isDown('KeyA'), right: keyboard.isDown('KeyD'),
        }, orbit.yaw);
        player.update(stepper.dt, { move, run: keyboard.isDown('ShiftLeft') || keyboard.isDown('ShiftRight'), strikes, cameraYaw: orbit.yaw }, targets);
        physics.step();
        figure.syncMeshes();
      });
    } else {
      keyboard.clear();
    }

    orbit.update(player.position, elapsed);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:16px">Falha ao iniciar: ${String(err)}</pre>`;
});
