# Kickboxing de Palito

Joguinho 3D no browser: um boneco de palito em terceira pessoa dá golpes de kickboxing ou atira de AK-47 e escopeta em NPCs que o seguem. NPCs nocauteados caem de ragdoll (Rapier), levantam e voltam.

## A ilha

A arena é uma ilha flutuante: passou da borda, cai no vazio. No Modo Zumbi cair é morte ("CAIU NO LIMBO"); no Treino você reaparece no centro. Zumbis empurrados para fora (explosão de bazuca, tiro, chute) também caem e contam como abate.

Cada partida gera um layout novo de obstáculos: caixotes (alguns empilhados), muros baixos de pedra, pilares e rochas. Eles são sólidos — param balas, foguetes e corpos, e os zumbis precisam contorná-los. Caixotes e muros baixos dá para subir pulando; pilares e rochas não. O jogador é um samurai: kabuto com chifres dourados, armadura laqueada vermelha, katana na cintura e estandarte nas costas.

## Modo Zumbi (ondas)

Inspirado no Call of Duty Zombies. Os zumbis saem do chão nas bordas da arena: a onda N traz 5×N zumbis (5, 10, 15…) até o máximo de 40 por onda, com no máximo 24 vivos ao mesmo tempo. A cada onda eles têm mais vida, andam mais rápido (de arrastados a corredores) e batem mais forte.

- **Vida**: 100, regenera alguns segundos depois de parar de apanhar. Os zumbis atacam com garras quando chegam perto. Morreu, acabou: tela de fim com a onda, abates e pontos.
- **Pontos**: 10 por acerto, 60 por abate. Começa com $500, os punhos e a AK-47 com munição limitada.
- **Caixa Misteriosa** (tecla E; custa $950 na onda 1 e fica 20% mais cara a cada onda): sorteia uma arma nova (escopeta, bazuca, congelante, Tesla, antigravidade ou lança-lhamas).
- **Power-ups** que caem dos zumbis: Munição Máxima, Insta-Kill (15 s, qualquer acerto mata) e Nuke (mata todos os zumbis vivos).

**Tipos de zumbi** (cada onda libera algo novo, e os tipos novos ficam mais comuns):

| Desde a onda | Tipo | Como é |
|---|---|---|
| 1 | Andarilho | Verde, olhos amarelos. |
| 2 | Corredor | Pálido e magro, olhos vermelhos: rápido e frágil. |
| 4 | Brutamontes | Roxo e parrudo, olhos azuis: aguenta muito e bate forte. |
| 5 | Cavaleiro Zumbi | Montado numa **lhama zumbi** (lã podre, costelas à mostra, olhos vermelhos): rápido; tiro na lhama fere o cavaleiro, e ela cai quando ele morre. |
| 5, 10, 15… | Rei Brutamontes | Chefão **4× maior** (cerca de 7 m), dourado e de coroa, com barra de vida própria e garras que alcançam de longe. |

**Desmembramento e sangue**: cada acerto espirra sangue e deixa poças no chão. Braços e pernas acumulam dano e voam quando passam do limite — um zumbi sem braço continua vindo, sem perna cai. Tiro na cabeça que mata pode arrancá-la (com a escopeta, sempre), o high kick também. Explosões de bazuca arrancam membros, o zumbi congelado estilhaça em pedaços, e corpos no chão podem ser despedaçados a tiro. O cotoco jorra sangue por alguns segundos.

Nenhum golpe tira mais de 60 de vida (a vida é 100), nem do chefão. O céu escurece a cada onda: dia, entardecer, crepúsculo e, da onda 7 em diante, noite com neblina e lua de sangue.

O Treino livre continua disponível na tela inicial, com todas as armas e bonecos que levantam.

## Rodar

    npm install
    npm run dev

Abra a URL impressa. Escolha a quantidade de inimigos (ou use `?npcs=12`) e clique em Começar. Começar trava o mouse. Esc pausa; clique em Continuar para voltar ou em Menu principal para trocar de modo (também aparece na tela de fim de jogo).

## Controles

| Ação | Tecla |
|---|---|
| Mover | W A S D (relativo à câmera) |
| Correr | Shift |
| Pular | Espaço (no celular, botão Pular) |
| Câmera | Mouse |
| Jab / Direto | J / K |
| Cruzado esquerdo / direito | U / I |
| Low kick / Chute frontal / High kick | N / M / , |
| Trocar arma | Q ou roda do mouse (para baixo: próxima, para cima: anterior); 1 mãos, 2 AK-47, 3 escopeta, 4 bazuca, 5 congelante, 6 Tesla, 7 antigravidade, 8 lança-lhamas. No canto inferior direito aparecem a arma atual, a anterior e as duas próximas |
| Mirar por cima do ombro | Botão direito do mouse |
| Atirar (automático) | Botão esquerdo do mouse |
| Recarregar | R (recarrega sozinho quando esvazia) |
| Montar / descer da lhama | F (no celular, botão Lhama) |
| Usar (Caixa Misteriosa) | E (no celular, botão Usar) |
| Reiniciar | Backspace |

## Jogar no celular sem internet (app instalável)

O build de produção é um PWA: na primeira visita o service worker guarda o jogo inteiro (página, código com a física embutida, ícones) no aparelho, e depois ele abre e roda sem internet.

1. Sirva o build por HTTPS uma vez (ex.: `npm run build && npx vite preview --port 4173` + `ngrok http 4173`).
2. **Android (Chrome)**: abra o link, menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
3. **iPhone (Safari)**: abra o link, Compartilhar → **Adicionar à Tela de Início**, e abra o app pelo ícone **uma vez ainda com internet** (no iPhone o app instalado tem armazenamento próprio).
4. Quando aparecer **"Pronto para jogar offline ✓"**, já pode desligar a internet.

Quando houver uma versão nova no link, o app se atualiza na próxima vez que for aberto com internet. O ícone é gerado por `python3 scripts/make-icons.py`.

## Desenvolvimento

    npm test          # vitest (lógica pura + smoke tests de física em Node)
    npm run typecheck
    npm run build

Arquitetura e decisões: `docs/superpowers/specs/2026-10-07-kickboxing-mvp-design.md`. Todos os valores de balanceamento (dano, vida, velocidades, pontos, preço da caixa, armas, ondas…) ficam em `src/tuning/tuning.json`.

**Modo dev** (só no `npm run dev`): marque "🛠 Modo dev" no menu principal ou na pausa e aparece, no canto superior direito, um painel com todos os valores do `tuning.json` para editar com o jogo rodando (valores alterados ficam em vermelho). Desligar volta aos valores do arquivo; religar recupera os seus ajustes (eles ficam salvos no navegador). "Baixar JSON" baixa um arquivo no mesmo formato do `tuning.json` — para adotar os valores, substitua o `src/tuning/tuning.json` por ele. "Restaurar padrão" descarta os ajustes. Alguns valores só valem para o que surgir depois (vida de zumbi novo, pontos iniciais da próxima partida, física dos ragdolls).

## Celular

No celular (ou com `?touch=1` no desktop) aparecem controles de toque: joystick no polegar esquerdo (até a borda corre), arrastar o lado direito gira a câmera, botões de golpe, botão AK para sacar a arma e, com ela, FOGO (segure e arraste para mirar enquanto atira), MIRA (alterna) e Rec. O botão II pausa (dá para continuar, reiniciar ou voltar ao menu principal). Jogue com o celular deitado; no Android o jogo entra em tela cheia.

## Lhama

F (ou o botão Lhama no celular) monta o boneco numa lhama, que anda e corre mais rápido e vira com a câmera quando você mira. Montado só dá para usar a AK-47: ela é sacada sozinha e os golpes ficam bloqueados. Ao descer, a lhama fica parada onde você a deixou; ragdolls trombam nela.

## Armas especiais

- **Bazuca**: o foguete voa de verdade (com rastro de fumaça) e explode, derrubando e arremessando todo mundo num raio de 4,5 m.
- **Raio Congelante**: congela o NPC num bloco de gelo por 5 s; o próximo tiro, soco ou explosão o estilhaça.
- **Arma Tesla**: o raio salta em cadeia entre até 5 NPCs próximos.
- **Antigravidade**: o NPC vira ragdoll e cai para cima por 2,6 s, depois despenca lá de cima.
- **Lança-Lhamas**: dispara lhamas em arco; elas nocauteiam quem acertam e ficam quicando pelo cenário como objetos físicos.

## Combos

Derrubar vários de uma vez ou em sequência rápida mostra o combo na tela: DUPLO NOCAUTE!, TRIPLO!, QUÁDRUPLO!, MASSACRE!

## Escopeta

Escopeta pump de 8 cartuchos: cada tiro solta 9 bagos (cada um é um raio físico), com dano que cai com a distância — à queima-roupa no peito derruba de uma vez e arremessa o corpo; de longe espalha. Depois de cada tiro a mão esquerda trabalha a telha (o cartucho vermelho voa); a recarga é cartucho por cartucho e um tiro interrompe. A arma que não está na mão fica pendurada nas costas, as duas cruzadas em X.

## AK-47

- Tiro de raio (raycast no Rapier) saindo do cano em direção ao ponto sob a mira; a câmera de mira fica por cima do ombro direito.
- 600 tiros/min, pente de 30, recarga de 1,9 s com animação do carregador.
- Dispersão cresce na rajada, é maior andando ou atirando sem mirar; o recuo sobe a mira (puxe o mouse para baixo para controlar).
- Dano por região: cabeça derruba na hora, tronco em 3 tiros, membros em mais. Tiros num corpo caído continuam empurrando o ragdoll e o mantêm no chão.
- Os braços seguram a arma por cinemática inversa de dois ossos (`src/figure/ik.ts`, `src/entities/rifleRig.ts`); o som é sintetizado com Web Audio, sem arquivos.

