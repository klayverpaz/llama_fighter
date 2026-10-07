import { NPC_COUNT_MAX, NPC_COUNT_MIN, clampNpcCount } from './params';

export interface Overlay {
  showStart(defaultCount: number, onStart: (count: number) => void): void;
  showPaused(onResume: () => void): void;
  hide(): void;
  setKnockouts(n: number): void;
  showError(message: string): void;
}

const CSS = `
.kb-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(243, 238, 226, 0.85); color: #2b2620; z-index: 10; }
.kb-overlay[hidden] { display: none; }
.kb-card { background: #fffdf7; border: 2px solid #2b2620; border-radius: 12px; padding: 28px 32px; min-width: 320px;
  box-shadow: 6px 6px 0 #2b2620; text-align: center; }
.kb-card h1 { margin: 0 0 8px; font-size: 28px; }
.kb-card p { margin: 6px 0; color: #5c554b; }
.kb-card label { display: block; margin: 18px 0 8px; font-weight: 600; }
.kb-card input { font-size: 20px; width: 80px; text-align: center; padding: 6px; border: 2px solid #2b2620; border-radius: 8px; }
.kb-card button { margin-top: 18px; font-size: 18px; padding: 10px 22px; border: 2px solid #2b2620; border-radius: 8px;
  background: #2a6fdb; color: white; cursor: pointer; box-shadow: 3px 3px 0 #2b2620; }
.kb-card button:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #2b2620; }
.kb-hud { position: absolute; left: 16px; bottom: 16px; color: #2b2620; font-size: 13px; line-height: 1.5;
  background: rgba(255, 253, 247, 0.8); padding: 10px 14px; border-radius: 8px; border: 1px solid #2b2620; pointer-events: none; }
.kb-hud[hidden] { display: none; }
.kb-ko { position: absolute; left: 16px; top: 16px; color: #2b2620; font-size: 22px; font-weight: 700;
  background: rgba(255, 253, 247, 0.8); padding: 8px 14px; border-radius: 8px; border: 1px solid #2b2620; pointer-events: none; }
.kb-ko[hidden] { display: none; }
`;

const CONTROLS = [
  'WASD mover · Shift correr · Mouse câmera',
  'J jab · K direto · U cruzado esq · I cruzado dir',
  'N low kick · M chute frontal · , high kick',
  'R reiniciar · Esc pausar',
];

export function createOverlay(root: HTMLElement): Overlay {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'kb-overlay';
  const card = document.createElement('div');
  card.className = 'kb-card';
  overlay.appendChild(card);

  const hud = document.createElement('div');
  hud.className = 'kb-hud';
  hud.innerHTML = CONTROLS.map((l) => `<div>${l}</div>`).join('');
  hud.hidden = true;

  const ko = document.createElement('div');
  ko.className = 'kb-ko';
  ko.textContent = 'Nocautes: 0';
  ko.hidden = true;

  root.append(overlay, hud, ko);

  function show(html: string): HTMLElement {
    card.innerHTML = html;
    overlay.hidden = false;
    return card;
  }

  return {
    showStart(defaultCount, onStart) {
      const c = show(`
        <h1>Kickboxing de Palito</h1>
        <p>Derrube os bonecos. Eles levantam.</p>
        <label for="kb-count">Quantos inimigos? (${NPC_COUNT_MIN} a ${NPC_COUNT_MAX})</label>
        <input id="kb-count" type="number" min="${NPC_COUNT_MIN}" max="${NPC_COUNT_MAX}" value="${defaultCount}" />
        <div><button id="kb-start">Começar</button></div>
        <p style="margin-top:16px;font-size:12px">${CONTROLS.join('<br/>')}</p>
      `);
      const input = c.querySelector<HTMLInputElement>('#kb-count')!;
      const start = () => onStart(clampNpcCount(Number(input.value)));
      c.querySelector<HTMLButtonElement>('#kb-start')!.addEventListener('click', start);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
      input.focus();
    },
    showPaused(onResume) {
      const c = show(`
        <h1>Pausado</h1>
        <p>Clique para voltar ao jogo.</p>
        <div><button id="kb-resume">Continuar</button></div>
      `);
      c.querySelector<HTMLButtonElement>('#kb-resume')!.addEventListener('click', onResume);
    },
    hide() {
      overlay.hidden = true;
      hud.hidden = false;
      ko.hidden = false;
    },
    setKnockouts(n) {
      ko.textContent = `Nocautes: ${n}`;
    },
    showError(message) {
      show(`<h1>Não deu</h1><p>${message}</p>`);
      hud.hidden = true;
      ko.hidden = true;
    },
  };
}
