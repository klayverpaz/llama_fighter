# Kickboxing de Palito

Joguinho 3D no browser: um boneco de palito em terceira pessoa dá golpes de kickboxing em NPCs que o seguem. NPCs nocauteados caem de ragdoll (Rapier), levantam e voltam.

## Rodar

    npm install
    npm run dev

Abra a URL impressa. Escolha a quantidade de inimigos (ou use `?npcs=12`) e clique em Começar. Começar trava o mouse. Esc pausa; clique em Continuar para voltar.

## Controles

| Ação | Tecla |
|---|---|
| Mover | W A S D (relativo à câmera) |
| Correr | Shift |
| Câmera | Mouse |
| Jab / Direto | J / K |
| Cruzado esquerdo / direito | U / I |
| Low kick / Chute frontal / High kick | N / M / , |
| Reiniciar | R |

## Desenvolvimento

    npm test          # vitest (lógica pura + smoke tests de física em Node)
    npm run typecheck
    npm run build

Arquitetura e decisões: `docs/superpowers/specs/2026-10-07-kickboxing-mvp-design.md`. Valores de ajuste ficam em `src/figure/skeleton.ts`, `src/combat/strikes.ts` e `src/entities/npcBrain.ts`.
