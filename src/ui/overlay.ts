import { NPC_COUNT_MAX, NPC_COUNT_MIN, clampNpcCount } from './params';

export interface WaveHud {
  wave: number;
  /** Zombies left this wave, or null during the intermission. */
  remaining: number | null;
  /** Seconds to the next wave during the intermission. */
  nextIn: number | null;
  points: number;
  hp: number;
  maxHp: number;
  instaKill: number;
  /** Show the Mystery Box prompt (with whether the player can afford it). */
  box: { affordable: boolean; rolling: boolean } | null;
}

export interface Overlay {
  showStart(defaultCount: number, onStart: (count: number, mode: 'training' | 'waves') => void): void;
  showPaused(onResume: () => void, onRestart?: () => void): void;
  hide(): void;
  setKnockouts(n: number): void;
  showError(message: string): void;
  /** Crosshair + ammo panel; hidden when `rifle` is null. `spreadPx` opens the crosshair. */
  setRifleHud(rifle: { label: string; ammo: number; mag: number; reloading: boolean; spreadPx: number; aiming: boolean } | null): void;
  hitMarker(kill: boolean): void;
  /** Small prompt at the bottom centre (e.g. how to draw the rifle); null hides it. */
  setWeaponHint(text: string | null): void;
  /** Big centred combo text that pops and fades. */
  banner(text: string): void;
  /** Slow-motion vignette and label. */
  setSlowMo(on: boolean): void;
  /** Zombie-mode HUD; null hides it (training). */
  setWaveHud(hud: WaveHud | null): void;
  /** Red flash when the player is hit. */
  hurt(): void;
  showGameOver(stats: { wave: number; kills: number; points: number }, onRetry: () => void, onTraining: () => void): void;
  setKillsLabel(label: string): void;
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
.kb-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; }
.kb-cross[hidden] { display: none; }
.kb-cross i { position: absolute; background: #fffdf7; box-shadow: 0 0 0 1px #2b2620; }
.kb-cross .t, .kb-cross .b { width: 2px; height: 9px; left: -1px; }
.kb-cross .l, .kb-cross .r { width: 9px; height: 2px; top: -1px; }
.kb-cross .dot { width: 2px; height: 2px; left: -1px; top: -1px; }
.kb-hit { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; pointer-events: none;
  opacity: 0; transition: opacity 0.12s; }
.kb-hit::before, .kb-hit::after { content: ''; position: absolute; left: 10px; top: -2px; width: 2px; height: 26px; background: #fffdf7;
  box-shadow: 0 0 0 1px #2b2620; }
.kb-hit::before { transform: rotate(45deg); } .kb-hit::after { transform: rotate(-45deg); }
.kb-hit.kill::before, .kb-hit.kill::after { background: #e0412f; }
.kb-hit.on { opacity: 1; transition: none; }
.kb-ammo { position: absolute; right: 16px; bottom: 16px; color: #2b2620; font-weight: 700; pointer-events: none;
  background: rgba(255, 253, 247, 0.85); padding: 8px 14px; border-radius: 8px; border: 1px solid #2b2620; text-align: right; }
.kb-ammo[hidden] { display: none; }
.kb-hint { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); color: #2b2620; font-size: 14px; font-weight: 600;
  background: rgba(255, 253, 247, 0.85); padding: 6px 12px; border-radius: 8px; border: 1px solid #2b2620; pointer-events: none; }
.kb-hint[hidden] { display: none; }
.kb-banner { position: absolute; left: 50%; top: 28%; transform: translate(-50%, -50%) scale(0.6); pointer-events: none; opacity: 0;
  font: 900 46px ui-sans-serif, system-ui, sans-serif; color: #fffdf7; letter-spacing: 0.04em; white-space: nowrap;
  -webkit-text-stroke: 3px #2b2620; text-shadow: 5px 5px 0 #e0412f; }
.kb-banner.pop { animation: kb-pop 1.4s ease-out forwards; }
@keyframes kb-pop { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4) rotate(-6deg); }
  12% { opacity: 1; transform: translate(-50%, -50%) scale(1.15) rotate(2deg); }
  25% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
  80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -60%) scale(1); } }
.kb-slow { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.25s;
  box-shadow: inset 0 0 160px 40px rgba(42, 111, 219, 0.45); }
.kb-slow.on { opacity: 1; }
.kb-wave { position: absolute; left: 50%; top: max(12px, env(safe-area-inset-top)); transform: translateX(-50%); pointer-events: none;
  text-align: center; color: #fffdf7; text-shadow: 2px 2px 0 #2b2620; }
.kb-wave[hidden] { display: none; }
.kb-wave .num { font: 900 34px ui-sans-serif, system-ui, sans-serif; color: #e0412f; -webkit-text-stroke: 1.5px #2b2620; letter-spacing: 0.06em; }
.kb-wave .sub { font: 700 14px ui-sans-serif, system-ui, sans-serif; }
.kb-wave .insta { font: 800 14px ui-sans-serif, system-ui; color: #ff5a4a; margin-top: 2px; }
.kb-points { position: absolute; left: 16px; top: 64px; pointer-events: none; font: 800 20px ui-sans-serif, system-ui; color: #2b2620;
  background: rgba(255, 253, 247, 0.85); padding: 6px 12px; border-radius: 8px; border: 1px solid #2b2620; }
.kb-points[hidden], .kb-health[hidden], .kb-blood[hidden], .kb-prompt[hidden] { display: none; }
.kb-health { position: absolute; left: 16px; bottom: 16px; width: 220px; height: 16px; border: 2px solid #2b2620; border-radius: 9px;
  background: rgba(255, 253, 247, 0.85); overflow: hidden; pointer-events: none; }
.kb-health i { display: block; height: 100%; background: linear-gradient(90deg, #c0392b, #e0412f); transition: width 0.15s; }
.kb-blood { position: absolute; inset: 0; pointer-events: none; opacity: 0;
  box-shadow: inset 0 0 180px 60px rgba(176, 20, 20, 0.85); transition: opacity 0.3s; }
.kb-blood.flash { opacity: 1 !important; transition: none; }
.kb-prompt { position: absolute; left: 50%; bottom: 120px; transform: translateX(-50%); pointer-events: none;
  font: 700 16px ui-sans-serif, system-ui; color: #fffdf7; background: rgba(43, 38, 32, 0.8); padding: 8px 14px; border-radius: 8px; }
.kb-prompt.no { color: #ffb3a8; }
body.kb-waves .kb-hud { display: none; }
.kb-card .kb-mode { display: block; width: 100%; margin-top: 12px; }
.kb-card .kb-mode.zombie { background: #4f7a32; font-size: 20px; }
.kb-slow span { position: absolute; left: 50%; bottom: 72px; transform: translateX(-50%); font: 800 14px ui-sans-serif, system-ui;
  letter-spacing: 0.3em; color: #fffdf7; background: rgba(42, 111, 219, 0.8); padding: 4px 10px; border-radius: 6px; }
.kb-ammo .n { font-size: 26px; font-variant-numeric: tabular-nums; }
.kb-ammo .lbl { font-size: 12px; letter-spacing: 0.08em; color: #5c554b; }
.kb-ammo .low { color: #c0392b; }
`;

const TOUCH_CONTROLS = [
  'Polegar esquerdo: joystick para andar (até a borda corre)',
  'Arraste o lado direito para girar a câmera',
  'Botões de golpe · AK saca a arma',
  'Com a AK: FOGO atira (arraste para mirar) · MIRA alterna a mira',
  'Armas abre o seletor (8 armas) · Lhama monta/desce · ⏱ câmera lenta',
  'II pausa · Jogue com o celular deitado',
];

const CONTROLS = [
  'WASD mover · Shift correr · Mouse câmera',
  'J jab · K direto · U cruzado esq · I cruzado dir',
  'N low kick · M chute frontal · , high kick',
  'Q / roda do mouse troca arma · 1 mãos 2 AK 3 escopeta 4 bazuca',
  '5 congelante 6 tesla 7 antigravidade 8 lança-lhamas · T câmera lenta',
  'Botão dir. mirar · Botão esq. atirar · R recarregar',
  'F montar/descer da lhama (montado: só armas)',
  'E usar a Caixa Misteriosa (modo zumbi) · Backspace reiniciar · Esc pausar',
];

export function createOverlay(root: HTMLElement, touch = false): Overlay {
  const controls = touch ? TOUCH_CONTROLS : CONTROLS;
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
  hud.innerHTML = controls.map((l) => `<div>${l}</div>`).join('');
  hud.hidden = true;

  const ko = document.createElement('div');
  ko.className = 'kb-ko';
  ko.textContent = 'Nocautes: 0';
  ko.hidden = true;

  const cross = document.createElement('div');
  cross.className = 'kb-cross';
  cross.innerHTML = '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i>';
  cross.hidden = true;
  const [ct, cb, cl, cr] = Array.from(cross.querySelectorAll<HTMLElement>('i'));

  const hit = document.createElement('div');
  hit.className = 'kb-hit';
  let hitTimer = 0;

  const ammo = document.createElement('div');
  ammo.className = 'kb-ammo';
  ammo.hidden = true;
  let lastAmmo = '';

  const hint = document.createElement('div');
  hint.className = 'kb-hint';
  hint.hidden = true;

  const bannerEl = document.createElement('div');
  bannerEl.className = 'kb-banner';
  const slow = document.createElement('div');
  slow.className = 'kb-slow';
  slow.innerHTML = '<span>CÂMERA LENTA</span>';

  const blood = document.createElement('div');
  blood.className = 'kb-blood';
  const wave = document.createElement('div');
  wave.className = 'kb-wave';
  wave.hidden = true;
  const points = document.createElement('div');
  points.className = 'kb-points';
  points.hidden = true;
  const health = document.createElement('div');
  health.className = 'kb-health';
  health.innerHTML = '<i></i>';
  health.hidden = true;
  const healthBar = health.firstElementChild as HTMLElement;
  const prompt = document.createElement('div');
  prompt.className = 'kb-prompt';
  prompt.hidden = true;
  let killsLabel = 'Nocautes';
  let lastWave = '';

  root.append(slow, blood, overlay, hud, ko, cross, hit, ammo, hint, bannerEl, wave, points, health, prompt);

  function show(html: string): HTMLElement {
    card.innerHTML = html;
    overlay.hidden = false;
    return card;
  }

  return {
    showStart(defaultCount, onStart) {
      const c = show(`
        <h1>Kickboxing de Palito</h1>
        <button id="kb-zombie" class="kb-mode zombie">🧟 Modo Zumbi (ondas)</button>
        <p style="font-size:13px">Sobreviva às ondas: +5 zumbis por onda, até 40. Pontos compram armas na Caixa Misteriosa.</p>
        <label for="kb-count">Treino livre — quantos bonecos? (${NPC_COUNT_MIN} a ${NPC_COUNT_MAX})</label>
        <input id="kb-count" type="number" min="${NPC_COUNT_MIN}" max="${NPC_COUNT_MAX}" value="${defaultCount}" />
        <div><button id="kb-start">Treino livre</button></div>
        <p style="margin-top:16px;font-size:12px">${controls.join('<br/>')}</p>
      `);
      const input = c.querySelector<HTMLInputElement>('#kb-count')!;
      const count = () => clampNpcCount(input.value.trim() === '' ? Number.NaN : Number(input.value));
      c.querySelector<HTMLButtonElement>('#kb-start')!.addEventListener('click', () => onStart(count(), 'training'));
      c.querySelector<HTMLButtonElement>('#kb-zombie')!.addEventListener('click', () => onStart(count(), 'waves'));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onStart(count(), 'training'); });
    },
    setKillsLabel(label) {
      killsLabel = label;
    },
    setWaveHud(h) {
      const on = !!h && overlay.hidden;
      document.body.classList.toggle('kb-waves', !!h);
      wave.hidden = !on;
      points.hidden = !on;
      health.hidden = !on;
      if (!h || !on) {
        prompt.hidden = true;
        return;
      }
      const key = `${h.wave}/${h.remaining}/${h.nextIn === null ? '' : Math.ceil(h.nextIn)}/${Math.ceil(h.instaKill)}`;
      if (key !== lastWave) {
        lastWave = key;
        const sub = h.nextIn !== null
          ? (h.wave === 0 ? `Os mortos acordam em ${Math.ceil(h.nextIn)}…` : `Próxima onda em ${Math.ceil(h.nextIn)}`)
          : `${h.remaining} zumbi${h.remaining === 1 ? '' : 's'}`;
        wave.innerHTML = `<div class="num">${h.wave > 0 ? `ONDA ${h.wave}` : ''}</div><div class="sub">${sub}</div>`
          + (h.instaKill > 0 ? `<div class="insta">☠ INSTA-KILL ${Math.ceil(h.instaKill)}s</div>` : '');
      }
      points.textContent = `$ ${h.points}`;
      healthBar.style.width = `${Math.max(0, (h.hp / h.maxHp) * 100)}%`;
      blood.style.opacity = String(Math.max(0, 0.75 * (1 - h.hp / h.maxHp) - 0.1));
      prompt.hidden = !h.box;
      if (h.box) {
        prompt.classList.toggle('no', !h.box.affordable && !h.box.rolling);
        prompt.textContent = h.box.rolling ? 'Girando a caixa…'
          : h.box.affordable ? `${touch ? 'Toque em Usar' : 'E'} — Caixa Misteriosa ($950)` : 'Caixa Misteriosa — precisa de $950';
      }
    },
    hurt() {
      blood.classList.add('flash');
      window.setTimeout(() => blood.classList.remove('flash'), 90);
    },
    showGameOver(stats, onRetry, onTraining) {
      const c = show(`
        <h1 style="color:#c0392b">VOCÊ MORREU</h1>
        <p style="font-size:18px">Sobreviveu até a <b>onda ${stats.wave}</b></p>
        <p>${stats.kills} zumbis abatidos · $ ${stats.points}</p>
        <button id="kb-retry" class="kb-mode zombie">Jogar de novo</button>
        <button id="kb-training" class="kb-mode" style="background:#fffdf7;color:#2b2620">Treino livre</button>
      `);
      wave.hidden = true;
      points.hidden = true;
      health.hidden = true;
      prompt.hidden = true;
      c.querySelector<HTMLButtonElement>('#kb-retry')!.addEventListener('click', onRetry);
      c.querySelector<HTMLButtonElement>('#kb-training')!.addEventListener('click', onTraining);
    },
    showPaused(onResume, onRestart) {
      const c = show(`
        <h1>Pausado</h1>
        <p>${touch ? 'Toque em Continuar para voltar.' : 'Clique para voltar ao jogo.'}</p>
        <div><button id="kb-resume">Continuar</button></div>
        ${onRestart ? '<div><button id="kb-restart" style="background:#fffdf7;color:#2b2620">Reiniciar</button></div>' : ''}
      `);
      c.querySelector<HTMLButtonElement>('#kb-resume')!.addEventListener('click', onResume);
      if (onRestart) c.querySelector<HTMLButtonElement>('#kb-restart')!.addEventListener('click', onRestart);
    },
    hide() {
      overlay.hidden = true;
      hud.hidden = false;
      ko.hidden = false;
    },
    setKnockouts(n) {
      ko.textContent = `${killsLabel}: ${n}`;
    },
    showError(message) {
      show(`<h1>Não deu</h1><p>${message}</p>`);
      hud.hidden = true;
      ko.hidden = true;
    },
    setRifleHud(rifle) {
      const visible = !!rifle && overlay.hidden;
      cross.hidden = !visible;
      ammo.hidden = !visible;
      if (!rifle || !visible) return;
      const gap = Math.round(4 + rifle.spreadPx);
      ct.style.top = `${-gap - 9}px`;
      cb.style.top = `${gap}px`;
      cl.style.left = `${-gap - 9}px`;
      cr.style.left = `${gap}px`;
      cross.style.opacity = rifle.aiming ? '1' : '0.55';
      const key = `${rifle.label}/${rifle.ammo}/${rifle.mag}/${rifle.reloading}`;
      if (key !== lastAmmo) {
        lastAmmo = key;
        const lowAmmo = rifle.ammo <= Math.max(1, Math.floor(rifle.mag / 6)) ? ' low' : '';
        ammo.innerHTML = rifle.reloading && rifle.ammo === 0
          ? `<div class="lbl">${rifle.label}</div><div class="n">recarregando…</div>`
          : `<div class="lbl">${rifle.label}${rifle.reloading ? ' · recarregando' : ''}</div>`
            + `<div class="n"><span class="${lowAmmo}">${rifle.ammo}</span> / ${rifle.mag}</div>`;
      }
    },
    banner(text) {
      bannerEl.textContent = text;
      bannerEl.classList.remove('pop');
      void bannerEl.offsetWidth;
      bannerEl.classList.add('pop');
    },
    setSlowMo(on) {
      slow.classList.toggle('on', on);
    },
    setWeaponHint(text) {
      const visible = !!text && overlay.hidden;
      hint.hidden = !visible;
      if (visible && hint.textContent !== text) hint.textContent = text;
    },
    hitMarker(kill) {
      hit.className = `kb-hit on${kill ? ' kill' : ''}`;
      window.clearTimeout(hitTimer);
      hitTimer = window.setTimeout(() => { hit.className = `kb-hit${kill ? ' kill' : ''}`; }, kill ? 220 : 90);
    },
  };
}
