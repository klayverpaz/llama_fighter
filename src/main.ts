import { createScene } from './scene/scene';

const app = document.getElementById('app')!;
const { scene, camera, renderer } = createScene(app);

function frame() {
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
