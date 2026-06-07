// Auto-assigns playground numbers based on first draw (natancno field = 1 or 4)

export function getAutoPlayground(discName: string, natancnoField: 1 | 4 | null): string {
  if (!natancnoField) return ''
  const map = natancnoField === 1
    ? {
        'ŠTAFETA':     '2 in 4',
        'KROG':        '4',
        'POSAMEZNO 1': '3',
        'NATANČNO 1':  '1',
        'NATANČNO 2':  '1',
        'HITROSTNO 1': '2 in 4',
      }
    : {
        'ŠTAFETA':     '1 in 3',
        'KROG':        '1',
        'POSAMEZNO 1': '2',
        'NATANČNO 1':  '4',
        'NATANČNO 2':  '4',
        'HITROSTNO 1': '1 in 3',
      }
  return (map as Record<string, string>)[discName] ?? ''
}

// Blok 4 disciplines that need a separate draw
export const BLOK4_DISCIPLINES = ['DVOJKA 1', 'DVOJKA 2', 'POSAMEZNO 2', 'POSAMEZNO 3']

export function getBlok4Playground(discName: string, drawBlok4: Record<string, number>): string {
  const field = drawBlok4[discName]
  return field != null ? String(field) : ''
}
