import type { LeagueTier } from '../types'

export type DisciplineType = 'trojka' | 'dvojka' | 'posamezno' | 'krog' | 'hitrostno' | 'natancno' | 'blizanje' | 'blizanje_krog' | 'stafeta' | 'podaljsek'

export interface DisciplineTemplate {
  name: string
  discipline_type: DisciplineType
  players_per_side: number
  has_reserve: boolean
  block_number: number
  order_num: number
}

// Menjava (rezerva) je možna LE pri Dvojki in Trojki; pri ostalih disciplinah ni.
// Podbloki (2.1/2.2/2.3) so združeni v celi Blok 2 (vzporedno igranje); ločuje jih vrstni red.

// 1. liga — 12 disciplin, 3 bloki.
// Za prihodnje sezone je Super liga enaka 1. ligi (zato ista predloga).
const LIGA1_DISCIPLINES: DisciplineTemplate[] = [
  // BLOK 1
  { name: 'TROJKA',      discipline_type: 'trojka',    players_per_side: 3, has_reserve: true,  block_number: 1, order_num: 1  },
  { name: 'DVOJKA',      discipline_type: 'dvojka',    players_per_side: 2, has_reserve: true,  block_number: 1, order_num: 2  },
  { name: 'POSAMEZNO',   discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 1, order_num: 3  },
  { name: 'KROG',        discipline_type: 'krog',      players_per_side: 1, has_reserve: false, block_number: 1, order_num: 4  },
  // BLOK 2 — vzporedno (2.1 hitrostno, 2.2 natančno, 2.3 štafeta)
  { name: 'HITROSTNO',   discipline_type: 'hitrostno', players_per_side: 1, has_reserve: false, block_number: 2, order_num: 5  },
  { name: 'NATANČNO 1',  discipline_type: 'natancno',  players_per_side: 1, has_reserve: false, block_number: 2, order_num: 6  },
  { name: 'NATANČNO 2',  discipline_type: 'natancno',  players_per_side: 1, has_reserve: false, block_number: 2, order_num: 7  },
  { name: 'ŠTAFETA',     discipline_type: 'stafeta',   players_per_side: 2, has_reserve: false, block_number: 2, order_num: 8  },
  // BLOK 3
  { name: 'TROJKA 2',    discipline_type: 'trojka',    players_per_side: 3, has_reserve: true,  block_number: 3, order_num: 9  },
  { name: 'DVOJKA 2',    discipline_type: 'dvojka',    players_per_side: 2, has_reserve: true,  block_number: 3, order_num: 10 },
  { name: 'POSAMEZNO 2', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 11 },
  { name: 'POSAMEZNO 3', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 12 },
]

// 2. liga / OBZ — 11 disciplin (kot 1. liga, a le eno Natančno).
const LIGA2_DISCIPLINES: DisciplineTemplate[] = [
  // BLOK 1
  { name: 'TROJKA',      discipline_type: 'trojka',    players_per_side: 3, has_reserve: true,  block_number: 1, order_num: 1  },
  { name: 'DVOJKA',      discipline_type: 'dvojka',    players_per_side: 2, has_reserve: true,  block_number: 1, order_num: 2  },
  { name: 'POSAMEZNO',   discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 1, order_num: 3  },
  { name: 'KROG',        discipline_type: 'krog',      players_per_side: 1, has_reserve: false, block_number: 1, order_num: 4  },
  // BLOK 2 — vzporedno
  { name: 'HITROSTNO 1', discipline_type: 'hitrostno', players_per_side: 1, has_reserve: false, block_number: 2, order_num: 5  },
  { name: 'NATANČNO',    discipline_type: 'natancno',  players_per_side: 1, has_reserve: false, block_number: 2, order_num: 6  },
  { name: 'ŠTAFETA',     discipline_type: 'stafeta',   players_per_side: 2, has_reserve: false, block_number: 2, order_num: 7  },
  // BLOK 3
  { name: 'TROJKA 2',    discipline_type: 'trojka',    players_per_side: 3, has_reserve: true,  block_number: 3, order_num: 8  },
  { name: 'DVOJKA 2',    discipline_type: 'dvojka',    players_per_side: 2, has_reserve: true,  block_number: 3, order_num: 9  },
  { name: 'POSAMEZNO 2', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 10 },
  { name: 'POSAMEZNO 3', discipline_type: 'posamezno', players_per_side: 1, has_reserve: false, block_number: 3, order_num: 11 },
]

export const DEFAULT_DISCIPLINES: Record<LeagueTier, DisciplineTemplate[]> = {
  super_liga:     LIGA1_DISCIPLINES,   // prihodnje sezone: Super liga = 1. liga
  '1_liga':       LIGA1_DISCIPLINES,
  '2_liga_zahod': LIGA2_DISCIPLINES,
  '2_liga_vzhod': LIGA2_DISCIPLINES,
  obz:            LIGA2_DISCIPLINES,
}

export const BLOCK_LABELS: Record<number, string> = {
  1: 'Blok 1',
  2: 'Blok 2',
  3: 'Blok 3',
}
