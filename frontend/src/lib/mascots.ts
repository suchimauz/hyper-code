export const mascotNames = { crab: 'Краб', deepy: 'Deepy', whalegirl: 'Whalegirl', desksprite: 'DeskSprite', bitty: 'Bitty', tmuxai: 'TmuxAI', planet: 'Planet', 'rainbow-terminal-cat': 'Rainbow Terminal Cat' } as const;
export type Mascot = keyof typeof mascotNames;
export type MascotChoice = Mascot | 'random';
export function normalizeMascotChoice(value: unknown): MascotChoice { return typeof value === 'string' && Object.hasOwn(mascotNames, value) ? value as Mascot : 'random'; }
