import type { LeagueTier } from '../types'

export type DisciplineType = 'trojka' | 'dvojka' | 'posamezno' | 'krog' | 'hitrostno' | 'natancno' | 'blazanje' | 'stafeta' | 'podaljsek'

export interface DisciplineTemplate {
  name: string
  discipline_type: DisciplineType
  players_per_side: number
  has_reserve: boolean
  block_number: number
  order_num: number
}

// Super Liga = 1. Liga (10 disciplin, 4 bloki)
const SUPER_LIGA_DISCIPLINES: DisciplineTemplate[] = [
  // BLOK 1
  { name: 'ŠTAFETA',     discipline_type: 'stafeta',   players_per_side: 2, has_reserve: false, block_number: 1, order_num: 1  },
  // BLOK 2 – igranje vzporedno
  { name: 'KROG',        discipline_type: 'krog',      players_per_side: 1, has_reserve: false, block_number: 2, order_num: 2  },
  { name: 'POSAMEZNO 1', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 2, order_num: 3  },
  { name: 'NATANČNO 1',  discipline_type: 'natancno',  players_per_side: 1, has_reserve: false, block_number: 2, order_num: 4  },
  { name: 'NATANČNO 2',  discipline_type: 'natancno',  players_per_side: 1, has_reserve: false, block_number: 2, order_num: 5  },
  // BLOK 3
  { name: 'HITROSTNO 1', discipline_type: 'hitrostno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 6  },
  // BLOK 4
  { name: 'DVOJKA 1',    discipline_type: 'dvojka',    players_per_side: 2, has_reserve: true,  block_number: 4, order_num: 7  },
  { name: 'DVOJKA 2',    discipline_type: 'dvojka',    players_per_side: 2, has_reserve: true,  block_number: 4, order_num: 8  },
  { name: 'POSAMEZNO 2', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 4, order_num: 9  },
  { name: 'POSAMEZNO 3', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 4, order_num: 10 },
]

// 2. Liga / OBZ (9 disciplin) – enako kot Super Liga brez NATANČNO 2 v Bloku 2
const LIGA2_DISCIPLINES: DisciplineTemplate[] = SUPER_LIGA_DISCIPLINES
  .filter(d => d.name !== 'NATANČNO 2')
  .map((d, i) => ({ ...d, order_num: i + 1 }))

export const DEFAULT_DISCIPLINES: Record<LeagueTier, DisciplineTemplate[]> = {
  super_liga:     SUPER_LIGA_DISCIPLINES,
  '1_liga':       SUPER_LIGA_DISCIPLINES,
  '2_liga_zahod': LIGA2_DISCIPLINES,
  '2_liga_vzhod': LIGA2_DISCIPLINES,
  obz:            LIGA2_DISCIPLINES,
}

export const BLOCK_LABELS: Record<number, string> = {
  1: 'Blok 1',
  2: 'Blok 2 — vzporedno igranje',
  3: 'Blok 3',
  4: 'Blok 4',
}
