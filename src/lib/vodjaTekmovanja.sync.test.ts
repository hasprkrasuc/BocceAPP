import { describe, test, expect } from 'vitest'
import migracija from '../../supabase/migrations/20261002_01_prvenstvo_glavni_sodnik.sql?raw'
import povratek from '../../supabase/rollback/20261002_01_prvenstvo_glavni_sodnik_ROLLBACK.sql?raw'
import routeSource from '../components/ProtectedRoute.tsx?raw'
import editSource from '../pages/admin/TournamentEdit.tsx?raw'
import createSource from '../pages/admin/TournamentAdmin.tsx?raw'

/**
 * GLAVNI SODNIK / VODJA TEKMOVANJA — kar se iz kode ne vidi.
 *
 * Pravica vpisovati izide stoji na treh nogah, ki so vsaka v svoji datoteki:
 * stolpec in RLS politike v migraciji, zapora poti v odjemalcu in obrazec, ki
 * sodnika dodeli. Če katera odpade, se napaka ne pokaže kot zlom, ampak kot
 * tiho nedelovanje — sodnik dobi prazen zaslon ali 403 ob shranjevanju.
 *
 * Zaklenjena je tudi past, ki smo jo tu enkrat že imeli: prvotna politika
 * "Sodnik vpisuje izbijanje" (20260917_01) je sodnika iskala prek
 * `tournament_groups.judge_id`. Pri izbijanju skupin NI, zato politika ni
 * mogla biti nikoli izpolnjena — videti je bilo, kot da sodniki delujejo.
 */

const brezPresledkov = (s: string) => s.replace(/\s+/g, ' ')

describe('migracija postavi stolpec in pravice', () => {
  test('stolpec je idempotenten in se ob brisanju uporabnika le sprosti', () => {
    // `on delete set null`, ne `cascade`: brisanje uporabnika ne sme vzeti
    // prvenstva s sabo.
    expect(brezPresledkov(migracija))
      .toMatch(/add column if not exists chief_judge_id uuid references public\.users\(id\) on delete set null/)
  })

  test('funkcija ima izrecen search_path', () => {
    // Brez tega je funkcija odvisna od klicateljeve nastavitve — razhajanje,
    // ki smo ga lovili pri `sync_user_club` (glej CLAUDE.md).
    expect(migracija, 'is_tournament_judge brez set search_path').toMatch(/set search_path to 'public'/)
    expect(migracija).toMatch(/create or replace function public\.is_tournament_judge\(p_tournament_id uuid\)/)
  })

  test('mrtva politika prek tournament_groups je odstranjena', () => {
    expect(migracija, 'stara politika mora biti izrecno pobrisana')
      .toMatch(/drop policy if exists "Sodnik vpisuje izbijanje" on public\.izbijanje_izidi/)
  })

  test('nova politika sodnika NE išče prek skupin', () => {
    // Prav ta pot je bila napaka: izbijanje skupin ne pozna.
    const nova = migracija.slice(migracija.indexOf('create policy "Vodja tekmovanja vpisuje izbijanje"'))
    expect(nova.length, 'politike za izbijanje ni').toBeGreaterThan(0)
    expect(nova, 'politika spet visi na tournament_groups').not.toMatch(/tournament_groups/)
    expect(nova).toMatch(/is_tournament_judge\(r\.tournament_id\)/)
  })

  test('sodnik sme pisati končni vrstni red', () => {
    // final_rank živi na tournament_registrations; brez UPDATE tam gumb
    // »Zapiši končni vrstni red« sodniku vrne 403 in uvrstitve ne pridejo na
    // rang lestvico.
    const p = migracija.slice(migracija.indexOf('create policy "Vodja tekmovanja ureja prijave"'))
    expect(p.length, 'politike za prijave ni').toBeGreaterThan(0)
    expect(p).toMatch(/on public\.tournament_registrations/)
    expect(p).toMatch(/for update to authenticated/)
    expect(p).toMatch(/is_tournament_judge\(tournament_id\)/)
  })

  test('povratek pospravi vse, kar je migracija dodala', () => {
    for (const kos of [
      'drop policy if exists "Vodja tekmovanja ureja prijave"',
      'drop policy if exists "Vodja tekmovanja vpisuje izbijanje"',
      'drop function if exists public.is_tournament_judge(uuid)',
      'drop column if exists chief_judge_id',
    ]) {
      expect(povratek, `povratek ne pospravi: ${kos}`).toContain(kos)
    }
    // Povratek mora vrniti TUDI staro (neizpolnljivo) politiko, sicer ni
    // povratek, ampak tiho izboljšanje.
    expect(povratek, 'povratek mora obnoviti staro politiko')
      .toMatch(/create policy "Sodnik vpisuje izbijanje"/)
  })
})

describe('zapora poti', () => {
  test('urejanje tekmovanja preveri tudi :id', () => {
    // Ligaška in klubska zapora preverita le »vsaj eno«; tu to ne zadošča —
    // sodnik enega prvenstva ne sme odpreti drugega.
    const telo = routeSource.slice(
      routeSource.indexOf('export function TournamentEditRoute'),
      routeSource.indexOf('export function AdminRoute'),
    )
    expect(telo.length, 'TournamentEditRoute ne obstaja').toBeGreaterThan(0)
    expect(telo, 'zapora ne bere :id iz poti').toMatch(/useParams/)
    expect(telo, 'zapora ne preveri, ali gre za NJEGOVO tekmovanje')
      .toMatch(/managedTournamentIds\.includes\(id\)/)
  })
})

describe('obrazca', () => {
  test('ustvarjanje tekmovanja zapiše vodjo', () => {
    expect(createSource, 'chief_judge_id se pri ustvarjanju ne zapiše')
      .toMatch(/chief_judge_id: form\.chief_judge_id \|\| null/)
  })

  test('dodeli ga lahko samo admin', () => {
    // UPDATE na `tournaments` ima po RLS samo admin. Če bi sodnik videl
    // urejljiv izbirnik, bi mu shranjevanje tiho vrnilo napako.
    const panel = editSource.slice(editSource.indexOf('GLAVNI SODNIK / VODJA TEKMOVANJA'))
    expect(panel.length, 'panela za vodjo tekmovanja ni').toBeGreaterThan(0)
    expect(panel.slice(0, 1200), 'izbirnik ni pogojen z isAdmin').toMatch(/isAdmin \?/)
  })
})
