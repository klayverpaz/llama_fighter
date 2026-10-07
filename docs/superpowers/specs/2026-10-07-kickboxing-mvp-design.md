# Kickboxing de palito: MVP — design

Data: 2026-10-07
Status: aprovado em conversa, aguardando revisão do spec

## Objetivo

Joguinho 3D no browser onde o jogador controla um boneco de palito em terceira
pessoa (estilo GTA/Watch Dogs) e aplica golpes de kickboxing em NPCs que o
seguem em postura de luta. O ponto central é o ragdoll: NPCs nocauteados caem
de forma fisicamente convincente, ficam no chão alguns segundos e levantam.

Sucesso do MVP: abrir `npm run dev`, escolher a quantidade de NPCs, andar,
golpear, ver os NPCs tomarem dano, caírem de ragdoll com impulso coerente com
o golpe, e levantarem. Nada além disso.

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Visual | Bonecos de palito: cápsulas entre articulações, estilo toon, fundo "papel" |
| Física | Rapier. Bonecos cinemáticos em pé, dinâmicos (ragdoll) no nocaute |
| Dano | HP por NPC; golpe fraco empurra e dá flinch, HP zero derruba |
| Pós-queda | NPC fica ragdoll ~4 s, assenta, levanta e volta a seguir |
| Quantidade | Jogador escolhe 1 a 20 NPCs na tela inicial (padrão 5) ou via `?npcs=N` |
| Controles | WASD move o boneco relativo à câmera, Shift corre, mouse gira câmera, golpes no teclado |
| NPC | Só segue e encara; não ataca. Jogador não tem vida |

## Fora do escopo

NPC atacando, vida do jogador, som, obstáculos/cenário, modelos realistas
(Mixamo), ragdoll ativo com motores, mobile/touch, multiplayer.

## Stack

- Vite + TypeScript (sem framework de UI; HUD é HTML/CSS puro)
- `three` para renderização
- `@dimforge/rapier3d-compat` para física (WASM embutido, sem config de bundler)
- `vitest` para testes da lógica pura
- Sem backend. `npm run dev` sobe tudo.

## Arquitetura

### Loop

Timestep fixo de física a 60 Hz com acumulador; render a cada frame com
`requestAnimationFrame`. Ordem por tick: ler input → atualizar jogador e NPCs
(estado, animação, pose alvo) → aplicar poses cinemáticas → `world.step()` →
resolver acertos → sincronizar meshes com corpos.

### Módulos

```
src/
  main.ts                 bootstrap: cena, física, UI, loop
  core/loop.ts            timestep fixo + render
  physics/world.ts        init do Rapier, chão, helpers
  figure/skeleton.ts      definição dos 11 segmentos: comprimento, raio, massa, joint e limites
  figure/fk.ts            pose (rotações locais + raiz) → transform mundial por segmento (puro)
  figure/figure.ts        cria corpos, joints e meshes; modos posed/ragdoll; sync; velocidades
  anim/clips.ts           clipes de keyframe (postura, andar, 7 golpes, levantar)
  anim/player.ts          playback de clipe, slerp entre keyframes, blend entre clipes (puro)
  combat/strikes.ts       tabela: dano, impulso, membro, janelas startup/ativo/recuperação
  combat/attack.ts        máquina de estados do ataque (puro)
  combat/hits.ts          teste de interseção do sensor e aplicação de dano/impulso
  entities/player.ts      input → movimento, orientação, mira suave, ataques
  entities/npc.ts         steering, separação, ciclo caído → levantar
  camera/thirdPerson.ts   órbita atrás do jogador, pointer lock, pitch limitado
  input/keyboard.ts       estado de teclas + eventos de golpe
  input/mouse.ts          deltas de mouse sob pointer lock
  ui/overlay.ts           tela inicial (quantidade de NPCs), HUD, reinício
```

Regra: `fk.ts`, `anim/player.ts`, `combat/strikes.ts`, `combat/attack.ts` e a
parte de decisão de `entities/npc.ts` não importam `three` nem `rapier`, para
serem testáveis em Node sem WebGL.

### Boneco (Figure)

11 segmentos: cabeça, tronco, pelve, braço D/E, antebraço D/E, coxa D/E,
canela D/E. A raiz é a pelve. Cada segmento é um `RigidBody` do Rapier com um
collider de cápsula e um `Mesh` de cápsula no Three.js. Mão e pé não são
segmentos próprios: são a extremidade do antebraço e da canela, e cada um tem
um collider sensor esférico pequeno usado só para detectar acertos do jogador.

Joints (todas com limites):

- Pescoço, ombros, quadris, coluna (pelve↔tronco): esféricas, limites por eixo
- Cotovelos, joelhos: revolutas, 0° a ~140°

Modos:

- `posed`: corpos cinemáticos (`KinematicPositionBased`). A cada tick, a pose
  atual (rotações locais por articulação + posição e yaw da raiz) passa pela
  cinemática direta e cada corpo recebe `setNextKinematicTranslation/Rotation`.
  O boneco colide com outros bonecos e com o chão, mas não é empurrado.
- `ragdoll`: corpos dinâmicos. A física manda e os meshes só copiam.

Transição posed → ragdoll: guarda o transform do tick anterior, calcula
velocidade linear e angular por segmento, troca o tipo do corpo para dinâmico,
aplica essas velocidades e em seguida o impulso do golpe no segmento atingido.
Isso evita que o boneco "congele" no ar antes de cair.

Transição ragdoll → posed: troca os corpos para cinemáticos na pose em que
estão, e o animador faz blend dessa pose (lida de volta dos corpos) para a
postura de luta em ~0,8 s, enquanto a raiz é interpolada até a altura em pé.
Não há animação de levantar realista no MVP; é um blend direto.

### Animação

Pose = `{ root: {position, yaw}, joints: Record<JointName, Quaternion> }`.
Clipe = lista de keyframes `{ t, joints: Partial<...> }` com duração e flag de
loop. O player interpola com slerp entre keyframes e faz blend linear entre
clipe atual e próximo durante uma janela curta (~0,1 s).

Clipes:

- `stance`: postura de luta com leve oscilação (loop)
- `walk`: pernas e braços oscilando, amplitude e frequência escalam com a
  velocidade (procedural sobre a `stance`, não keyframe fixo)
- `jab`, `cross`, `hookL`, `hookR`, `lowKick`, `frontKick`, `highKick`:
  3 a 4 keyframes cada: recolher, estender, retornar
- `getUp`: não é clipe; é o blend descrito acima

### Combate

`strikes.ts` define por golpe: tecla, membro que acerta (mão D/E, pé D/E),
dano, impulso, janela em segundos (`startup`, `active`, `recovery`), e um
vetor de direção relativo ao jogador (frente, com componente pra cima em
cruzados e high kick, pra baixo no low kick).

Valores iniciais (ajustáveis no playtest):

| Golpe | Tecla | Membro | Dano | Impulso |
|---|---|---|---|---|
| Jab | J | mão E | 8 | 40 |
| Direto | K | mão D | 14 | 70 |
| Cruzado E | U | mão E | 18 | 90 |
| Cruzado D | I | mão D | 18 | 90 |
| Low kick | N | pé D | 15 | 60 |
| Chute frontal | M | pé D | 20 | 110 |
| High kick | , | pé D | 30 | 140 |

HP do NPC: 50.

`attack.ts` é uma máquina de estados pura: `idle → startup → active →
recovery → idle`, com `canAttack` falso fora de `idle`. Não há buffer de
input nem combos no MVP. Enquanto em qualquer fase de ataque o jogador não
anda.

`hits.ts`: durante `active`, consulta o sensor do membro atacante contra os
colliders de NPCs (`world.intersectionPairsWith`). Primeiro contato por
golpe por NPC conta. Resolução:

- `hp -= dano`. Se `hp > 0`: NPC recebe `flinch` (blend curto para uma pose
  de recuo) e é deslocado 0,3 m para trás ao longo de 0,2 s (cinemático).
- Se `hp <= 0`: NPC entra em `ragdoll`. O impulso é aplicado no segmento
  atingido, no ponto de contato, na direção do golpe transformada pelo yaw do
  jogador.

### Jogador

- Movimento relativo ao yaw da câmera. W afasta da câmera. Velocidade 3 m/s,
  6 m/s com Shift. O boneco vira suavemente para a direção do movimento.
- Ao iniciar um golpe, se houver NPC em pé num raio de 2,5 m, o boneco vira
  para o mais próximo (mira suave). Senão, vira para a frente da câmera.
- A raiz do jogador é controlada diretamente (cinemática); o chão é plano,
  então não há gravidade nem pulo para o jogador.

### NPC

Estados: `chase → hold → flinch → ragdoll → recovering → chase`.

- `chase`: vira para o jogador e anda a 2,5 m/s até ficar a 1,3 m.
- `hold`: parado em `stance`, continua encarando o jogador. Volta a `chase`
  se a distância passar de 1,8 m.
- Separação: cada NPC soma um empurrão horizontal para longe dos outros NPCs
  em pé num raio de 0,9 m, para não empilhar.
- `ragdoll`: timer de 4 s. Quando o timer vence e a velocidade máxima dos
  segmentos está abaixo de um limiar, entra em `recovering`.
- `recovering`: blend para `stance` em 0,8 s, HP volta a 50, segue para `chase`.

Posição inicial: distribuídos num anel de raio 6 a 10 m ao redor do jogador.

### Câmera

Terceira pessoa, órbita atrás do jogador a ~4 m de distância e 1,8 m de
altura, olhando um ponto ~1,2 m acima da raiz. Mouse X gira yaw, mouse Y gira
pitch limitado a [-20°, +60°]. Suavização por lerp. Pointer Lock: clique no
canvas trava, Esc solta; com o mouse solto o jogo pausa e mostra a overlay.
Sem colisão de câmera (não há obstáculos).

### Cena e visual

Chão: plano de 60 x 60 m, cor de papel, com grade fina. Luz hemisférica +
direcional com sombra. Bonecos com `MeshToonMaterial`, jogador azul, NPCs
vermelhos; cabeça é esfera. Anéis de raio 10 m no chão marcam a arena só
visualmente, sem paredes.

### UI

- Tela inicial: título, input numérico de NPCs (1 a 20, padrão 5 ou valor de
  `?npcs=`), botão Começar que inicia e trava o mouse.
- HUD: canto inferior com os controles; canto superior com nocautes.
- R reinicia a partida com a mesma quantidade de NPCs.

### Erros

- Falha ao carregar o WASM do Rapier: overlay com mensagem e nada mais.
- Pointer Lock negado ou solto: jogo pausa e overlay volta.
- NPC que atravesse o chão por explosão numérica: se a raiz ficar abaixo de
  -2 m, reposiciona no anel inicial em `recovering`.

## Testes

Vitest, em Node, sem WebGL:

- `fk.ts`: pose neutra posiciona os segmentos nos comprimentos esperados;
  rotação de uma articulação move só os segmentos filhos.
- `anim/player.ts`: slerp no meio de dois keyframes; loop retorna ao início;
  blend 0 e 1 reproduzem os clipes originais.
- `combat/attack.ts`: transições por tempo; `canAttack` só em `idle`.
- `combat/strikes.ts`: toda tecla mapeia para um golpe único; valores
  positivos.
- Resolução de dano (função pura extraída de `hits.ts`): soma de golpes leva a
  HP zero; impulso tem a direção esperada após o yaw.
- Steering do NPC (função pura): aproxima quando longe, para na distância alvo,
  separação afasta de vizinhos.
- Smoke test de `figure.ts` com Rapier em Node: cria 11 corpos e 10 joints,
  nenhum NaN após 60 steps em ragdoll.

Física, visual, sensação dos golpes e calibração do ragdoll (massa, damping,
limites) são validados jogando, e os valores ficam concentrados em
`skeleton.ts` e `strikes.ts` para ajuste rápido.
