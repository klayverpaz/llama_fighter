import { DEFAULT_TUNING, TUNING, TUNING_NOTES, type TuningGroup } from '../tuning/tuning';
import { DevMode } from '../tuning/devMode';

/** Dev-build balancing panel (top right): every tuning.json value, editable live, plus a JSON dump. */
export interface DevPanel {
  readonly mode: DevMode;
  /** Turn dev mode on/off: the panel shows while on and the game runs on the dev values. */
  setOn(on: boolean): void;
}

const CSS = `
.kb-dev { position: absolute; right: 12px; top: 12px; z-index: 20; width: 300px; max-height: calc(100vh - 250px);
  min-height: 120px; display: flex; flex-direction: column; font: 12px ui-sans-serif, system-ui, sans-serif; color: #2b2620;
  background: rgba(255, 253, 247, 0.94); border: 2px solid #2b2620; border-radius: 10px; box-shadow: 4px 4px 0 #2b2620; }
.kb-dev[hidden] { display: none; }
.kb-dev.min { min-height: 0; }
.kb-dev.min .body, .kb-dev.min .bar { display: none; }
.kb-dev .head { display: flex; align-items: center; gap: 6px; padding: 6px 10px; font-weight: 800; cursor: pointer; user-select: none; }
.kb-dev .head .tag { margin-left: auto; font-size: 10px; color: #8a8174; font-weight: 600; }
.kb-dev .bar { display: flex; gap: 6px; padding: 0 10px 6px; }
.kb-dev .bar button { flex: 1; font: 700 12px ui-sans-serif, system-ui; padding: 5px 6px; border: 1.5px solid #2b2620;
  border-radius: 6px; background: #2a6fdb; color: white; cursor: pointer; }
.kb-dev .bar button.alt { background: #fffdf7; color: #2b2620; }
.kb-dev .body { overflow-y: auto; padding: 0 10px 8px; }
.kb-dev details { border-top: 1px solid rgba(43, 38, 32, 0.2); }
.kb-dev summary { padding: 5px 0; font-weight: 700; cursor: pointer; }
.kb-dev summary .n { color: #c0392b; font-weight: 800; }
.kb-dev .grp { margin: 4px 0 6px 6px; padding-left: 6px; border-left: 2px solid rgba(43, 38, 32, 0.15); }
.kb-dev .grp > .t { font-weight: 700; color: #5c554b; margin-bottom: 2px; }
.kb-dev .row { display: flex; align-items: center; gap: 6px; padding: 1px 0; }
.kb-dev .row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kb-dev .row input { width: 78px; font: 12px ui-monospace, monospace; padding: 2px 4px; border: 1px solid #8a8174; border-radius: 4px; text-align: right; }
.kb-dev .row.changed span { color: #c0392b; font-weight: 700; }
.kb-dev .row.changed input { border-color: #c0392b; background: #fff1ee; }
`;

export function createDevPanel(root: HTMLElement, store: Storage | null): DevPanel {
  const mode = new DevMode(store);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'kb-dev';
  el.innerHTML = `
    <div class="head">🛠 Balanceamento <span class="tag">modo dev · tuning.json</span></div>
    <div class="bar">
      <button class="dump">Baixar JSON</button>
      <button class="reset alt">Restaurar padrão</button>
    </div>
    <div class="body"></div>`;
  root.appendChild(el);
  const body = el.querySelector('.body') as HTMLElement;
  // Keys typed into the fields must not reach the game's keyboard handler.
  el.addEventListener('keydown', (e) => e.stopPropagation());
  el.addEventListener('keyup', (e) => e.stopPropagation());
  el.querySelector('.head')!.addEventListener('click', () => el.classList.toggle('min'));

  /** One refresh function per input, to resync after a reset or a mode switch. */
  const refreshers: Array<() => void> = [];
  const sectionCounters: Array<() => void> = [];

  function field(path: string, live: TuningGroup, def: TuningGroup, key: string): HTMLElement {
    const row = document.createElement('label');
    row.className = 'row';
    row.title = `${path}${TUNING_NOTES[path] ? ` — ${TUNING_NOTES[path]}` : ''}\npadrão: ${def[key]}`;
    const name = document.createElement('span');
    name.textContent = key;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    const refresh = () => {
      const v = live[key] as number;
      if (document.activeElement !== input) input.value = String(v);
      row.classList.toggle('changed', v !== def[key]);
    };
    input.addEventListener('input', () => {
      const v = input.valueAsNumber;
      if (!Number.isFinite(v)) return;
      live[key] = v;
      mode.changed();
      refresh();
      for (const c of sectionCounters) c();
    });
    input.addEventListener('blur', refresh);
    refreshers.push(refresh);
    row.append(name, input);
    return row;
  }

  function fill(parent: HTMLElement, path: string, live: TuningGroup, def: TuningGroup): void {
    for (const key of Object.keys(def)) {
      const sub = def[key];
      const p = `${path}.${key}`;
      if (typeof sub === 'number') {
        parent.appendChild(field(p, live, def, key));
      } else {
        const grp = document.createElement('div');
        grp.className = 'grp';
        grp.innerHTML = `<div class="t">${key}</div>`;
        fill(grp, p, live[key] as TuningGroup, sub);
        parent.appendChild(grp);
      }
    }
  }

  const live = TUNING as unknown as TuningGroup;
  const defs = DEFAULT_TUNING as unknown as TuningGroup;
  for (const section of Object.keys(defs)) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    details.appendChild(summary);
    fill(details, section, live[section] as TuningGroup, defs[section] as TuningGroup);
    const count = () => {
      const n = details.querySelectorAll('.row.changed').length;
      summary.innerHTML = `${section}${n ? ` <span class="n">(${n})</span>` : ''}`;
    };
    sectionCounters.push(count);
    body.appendChild(details);
  }

  const refreshAll = () => {
    for (const r of refreshers) r();
    for (const c of sectionCounters) c();
  };

  el.querySelector('.dump')!.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([mode.dump()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tuning-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  el.querySelector('.reset')!.addEventListener('click', () => {
    if (!window.confirm('Voltar todos os valores do modo dev para os do tuning.json?')) return;
    mode.reset();
    refreshAll();
  });

  const sync = () => {
    el.hidden = !mode.on;
    refreshAll();
  };
  sync();

  return {
    mode,
    setOn(on) {
      mode.setOn(on);
      sync();
    },
  };
}
