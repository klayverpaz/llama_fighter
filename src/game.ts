import * as THREE from 'three';
import type { Physics } from './physics/world';
import { Figure } from './figure/figure';
import { PELVIS_HEIGHT } from './figure/skeleton';
import { Player, type PlayerInput, type TargetInfo } from './entities/player';
import { Npc } from './entities/npc';
import { ringPositions } from './entities/npcBrain';
import { findHits } from './combat/hits';

export const PLAYER_COLOR = 0x2a6fdb;
export const NPC_COLOR = 0xd94a3a;

export class Game {
  readonly player: Player;
  readonly npcs: Npc[] = [];
  knockouts = 0;
  private readonly byId = new Map<string, Npc>();

  constructor(private readonly physics: Physics, scene: THREE.Scene, npcCount: number) {
    const origin = new THREE.Vector3(0, PELVIS_HEIGHT, 0);
    this.player = new Player(new Figure(physics, scene, { id: 'player', color: PLAYER_COLOR, position: origin }), origin);
    ringPositions(npcCount).forEach((p, i) => {
      const pos = new THREE.Vector3(p.x, PELVIS_HEIGHT, p.z);
      const yaw = Math.atan2(-p.x, -p.z);
      const npc = new Npc(new Figure(physics, scene, { id: `npc-${i}`, color: NPC_COLOR, position: pos, yaw }), pos);
      npc.yaw = yaw;
      this.npcs.push(npc);
      this.byId.set(npc.id, npc);
    });
  }

  /** One fixed physics tick. */
  step(dt: number, input: PlayerInput): void {
    const targets: TargetInfo[] = this.npcs.map((n) => ({ id: n.id, position: n.position, standing: n.standing }));
    this.player.update(dt, input, targets);

    const playerGround = { x: this.player.position.x, z: this.player.position.z };
    for (const npc of this.npcs) {
      const others = this.npcs.filter((o) => o !== npc && o.standing).map((o) => o.ground);
      npc.update(dt, playerGround, others);
    }

    this.physics.step();

    const active = this.player.activeStrike();
    if (active) {
      for (const hit of findHits(this.physics, active.point, active.strike.hitRadius, this.player.figure.id)) {
        if (this.player.attack.hit.has(hit.figureId)) continue;
        const npc = this.byId.get(hit.figureId);
        if (!npc || !npc.standing) continue;
        this.player.recordHit(hit.figureId);
        if (npc.takeHit(active.strike, this.player.yaw, hit.segment, hit.point)) this.knockouts++;
      }
    }

    this.player.figure.syncMeshes();
    for (const npc of this.npcs) npc.figure.syncMeshes();
  }

  dispose(): void {
    this.player.figure.dispose();
    for (const npc of this.npcs) npc.figure.dispose();
    this.npcs.length = 0;
    this.byId.clear();
  }
}
