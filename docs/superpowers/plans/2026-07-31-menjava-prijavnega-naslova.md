# Menjava prijavnega e-naslova — načrt izvedbe

> **Za agentne izvajalce:** OBVEZNA PODVEŠČINA: uporabi `superpowers:subagent-driven-development` (priporočeno) ali `superpowers:executing-plans` za izvedbo po nalogah. Koraki uporabljajo `- [ ]` za sledenje.

**Cilj:** Uporabnik z generičnim e-naslovom iz uvoza si prijavo zamenja za svojo — s povezavo Google računa ali z ročnim vpisom naslova — pri čemer `users.id` ostane nespremenjen.

**Arhitektura:** Dva čista modula v `src/lib` (zaznava generičnega naslova, zaznava vklopljenega ponudnika) in ena čista odločitvena funkcija napajajo eno predstavitveno komponento, vgrajeno na dveh mestih. Google pot gre skozi novo Vercel funkcijo, ki naslov zamenja strežniško z `email_confirm`, zato ne pošlje nobenega pisma. Ročna pot uporabi `updateUser`, nov trigger na `auth.users` pa poskrbi, da se `public.users.email` uskladi tudi po potrditvi prek povezave v pismu.

**Tehnologije:** React 19 + TypeScript + Vite, Supabase (auth + PostgREST), Vercel serverless funkcije, vitest.

**Spec:** `docs/superpowers/specs/2026-07-31-menjava-prijavnega-naslova-design.md`

---

## Zemljevid datotek

| Datoteka | Odgovornost |
|---|---|
| `src/lib/genericEmail.ts` | Ali je naslov generičen (samo domena) |
| `src/lib/genericEmail.test.ts` | Testi zanj |
| `src/lib/authProviders.ts` | Ali je Google vklopljen v Supabase |
| `src/lib/authProviders.test.ts` | Testi zanj |
| `src/lib/googleEmailAdoption.ts` | Čista odločitev: kateri naslov prevzeti iz identitet |
| `src/lib/googleEmailAdoption.test.ts` | Testi zanjo |
| `src/lib/adoptGoogleEmailApiSync.test.ts` | Varuje podvojeno kodo v `api/` |
| `api/adopt-google-email.ts` | Strežniška zamenjava naslova (tanka; logika je v `googleEmailAdoption`) |
| `src/components/AccountLoginSection.tsx` | Prikaz in obe akciji |
| `src/pages/Profile.tsx` | Vgradi komponento (trajni dom) |
| `src/pages/ChangePassword.tsx` | Vgradi komponento kot enkratno ponudbo |
| `supabase/migrations/20260731_01_sync_user_email.sql` | Trigger za sinhronizacijo `public.users.email` |
| `scripts/set-must-change-password.cjs` | Postopna uvedba zastavice (mapa je v `.gitignore`) |

**Zakaj taka delitev:** projekt nima testov komponent (ni `@testing-library`, ni `.test.tsx`). Vsa logika, ki jo je vredno testirati, gre zato v čiste module, komponenta pa ostane predstavitvena. Enako velja za Vercel funkcijo: `api/` ne sme uvažati iz `src/` (Vercel zapakira le `api/`, sicer `ERR_MODULE_NOT_FOUND`), zato se čista funkcija podvoji, razkorak pa lovi primerjalni test — natanko tako, kot to že počne `src/lib/playerImport/api-shared-sync.test.ts`.

---

### Naloga 1: Zaznava generičnega naslova

**Datoteke:**
- Ustvari: `src/lib/genericEmail.ts`
- Test: `src/lib/genericEmail.test.ts`

- [ ] **Korak 1: Napiši padajoč test**

```ts
import { describe, test, expect } from 'vitest'
import { isGenericEmail, GENERIC_EMAIL_DOMAINS } from './genericEmail'

describe('isGenericEmail', () => {
  test('prepozna obe generični domeni', () => {
    expect(isGenericEmail('ime.priimek.a1b2c3d4@balinar.app')).toBe(true)
    expect(isGenericEmail('ime.priimek@bocceapp.si')).toBe(true)
  })

  test('osebni naslovi niso generični', () => {
    expect(isGenericEmail('nekdo@gmail.com')).toBe(false)
    expect(isGenericEmail('nekdo@example.org')).toBe(false)
  })

  test('velike črke ne zmotijo', () => {
    expect(isGenericEmail('Ime.Priimek@BALINAR.APP')).toBe(true)
  })

  test('prazna in manjkajoča vrednost nista generični', () => {
    expect(isGenericEmail('')).toBe(false)
    expect(isGenericEmail(null)).toBe(false)
    expect(isGenericEmail(undefined)).toBe(false)
  })

  test('domena mora biti na koncu, ne kjerkoli', () => {
    expect(isGenericEmail('nekdo@balinar.app.zlonamerno.si')).toBe(false)
    expect(isGenericEmail('balinar.app@gmail.com')).toBe(false)
  })

  test('seznam domen je izvožen in vsebuje obe', () => {
    expect(GENERIC_EMAIL_DOMAINS).toEqual(['balinar.app', 'bocceapp.si'])
  })
})
```

- [ ] **Korak 2: Poženi test in preveri, da pade**

Poženi: `npx vitest run src/lib/genericEmail.test.ts`
Pričakovano: FAIL — `Failed to resolve import "./genericEmail"`

- [ ] **Korak 3: Napiši najmanjšo izvedbo**

```ts
// Generični naslovi nastanejo ob uvozu igralcev in niso od nikogar — nihče
// jih ne bere. Zato uporabniku ponudimo zamenjavo za lastnega.
//
// balinar.app je hkrati domena aplikacije. Če bi kdaj obstajal pravi poštni
// predal na tej domeni (npr. info@balinar.app), bi bil tu napačno označen kot
// generičen; ob pisanju (31. 7. 2026) takega računa ni.
export const GENERIC_EMAIL_DOMAINS = ['balinar.app', 'bocceapp.si'] as const

export function isGenericEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const domain = email.slice(at + 1).toLowerCase()
  return GENERIC_EMAIL_DOMAINS.includes(domain as (typeof GENERIC_EMAIL_DOMAINS)[number])
}
```

- [ ] **Korak 4: Poženi test in preveri, da gre skozi**

Poženi: `npx vitest run src/lib/genericEmail.test.ts`
Pričakovano: PASS, 6 testov

- [ ] **Korak 5: Potrdi v git**

```bash
git add src/lib/genericEmail.ts src/lib/genericEmail.test.ts
git commit -m "feat(prijava): zaznava genericnega e-naslova"
```

---

### Naloga 2: Zaznava vklopljenega ponudnika Google

**Datoteke:**
- Ustvari: `src/lib/authProviders.ts`
- Test: `src/lib/authProviders.test.ts`

Gumb za Google se ne sme prikazati, dokler ponudnik ni vklopljen — sicer uporabnik dobi `provider is not enabled`. Ob pisanju načrta `/auth/v1/settings` vrne `external: { email: true }` in nič drugega.

- [ ] **Korak 1: Napiši padajoč test**

```ts
import { describe, test, expect, vi, afterEach } from 'vitest'
import { isGoogleEnabled } from './authProviders'

const URL = 'https://projekt.supabase.co'
const KEY = 'anon-kljuc'

afterEach(() => { vi.unstubAllGlobals() })

function stubFetch(body: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({ ok, json: async () => body })
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('isGoogleEnabled', () => {
  test('vrne true, ko je google vklopljen', async () => {
    stubFetch({ external: { email: true, google: true } })
    expect(await isGoogleEnabled(URL, KEY)).toBe(true)
  })

  test('vrne false, ko je google izklopljen', async () => {
    stubFetch({ external: { email: true, google: false } })
    expect(await isGoogleEnabled(URL, KEY)).toBe(false)
  })

  test('vrne false, ko google v odzivu sploh ni naveden', async () => {
    stubFetch({ external: { email: true } })
    expect(await isGoogleEnabled(URL, KEY)).toBe(false)
  })

  test('vrne false, ko external manjka', async () => {
    stubFetch({})
    expect(await isGoogleEnabled(URL, KEY)).toBe(false)
  })

  test('vrne false ob napaki omrezja, ne vrze izjeme', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('brez povezave')))
    expect(await isGoogleEnabled(URL, KEY)).toBe(false)
  })

  test('poklice pravi naslov z apikey glavo', async () => {
    const spy = stubFetch({ external: { google: true } })
    await isGoogleEnabled(URL, KEY)
    expect(spy).toHaveBeenCalledWith(
      `${URL}/auth/v1/settings`,
      { headers: { apikey: KEY } },
    )
  })
})
```

- [ ] **Korak 2: Poženi test in preveri, da pade**

Poženi: `npx vitest run src/lib/authProviders.test.ts`
Pričakovano: FAIL — `Failed to resolve import "./authProviders"`

- [ ] **Korak 3: Napiši najmanjšo izvedbo**

```ts
// Gumb za Google skrijemo, dokler ponudnik ni vklopljen v Supabase, sicer
// uporabnik dobi "provider is not enabled". Ko ga lastnik projekta vklopi,
// se gumb pojavi sam, brez posega v kodo.
//
// Parametra sta neobvezna zaradi testov; v aplikaciji se privzeto vzameta iz
// okolja, enako kot v src/supabase.ts.
export async function isGoogleEnabled(
  baseUrl: string = import.meta.env.VITE_SUPABASE_URL,
  anonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/auth/v1/settings`, { headers: { apikey: anonKey } })
    if (!res.ok) return false
    const body = (await res.json()) as { external?: Record<string, boolean> }
    return body.external?.google === true
  } catch {
    // Nedosegljiv Supabase ni razlog za razpad vmesnika — gumb preprosto skrijemo.
    return false
  }
}
```

- [ ] **Korak 4: Poženi test in preveri, da gre skozi**

Poženi: `npx vitest run src/lib/authProviders.test.ts`
Pričakovano: PASS, 6 testov

- [ ] **Korak 5: Potrdi v git**

```bash
git add src/lib/authProviders.ts src/lib/authProviders.test.ts
git commit -m "feat(prijava): zaznava vklopljenega ponudnika Google"
```

---

### Naloga 3: Čista odločitev, kateri naslov prevzeti

**Datoteke:**
- Ustvari: `src/lib/googleEmailAdoption.ts`
- Test: `src/lib/googleEmailAdoption.test.ts`

Vsa presoja gre sem, da je testljiva. Vercel funkcija iz naloge 5 to logiko samo pokliče.

- [ ] **Korak 1: Napiši padajoč test**

```ts
import { describe, test, expect } from 'vitest'
import { chooseGoogleEmail } from './googleEmailAdoption'

const google = (email: string) => ({ provider: 'google', identity_data: { email } })
const geslo = (email: string) => ({ provider: 'email', identity_data: { email } })

describe('chooseGoogleEmail', () => {
  test('vrne naslov iz Google identitete', () => {
    expect(chooseGoogleEmail([geslo('a@balinar.app'), google('oseba@gmail.com')], 'a@balinar.app'))
      .toEqual({ ok: true, email: 'oseba@gmail.com' })
  })

  test('zavrne, ce Google identitete ni', () => {
    const r = chooseGoogleEmail([geslo('a@balinar.app')], 'a@balinar.app')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('brez_google_identitete')
  })

  test('zavrne, ce Google identiteta nima naslova', () => {
    const r = chooseGoogleEmail([{ provider: 'google', identity_data: {} }], 'a@balinar.app')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('brez_google_naslova')
  })

  test('zavrne, ce je naslov ze enak', () => {
    const r = chooseGoogleEmail([google('oseba@gmail.com')], 'oseba@gmail.com')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('naslov_ze_enak')
  })

  test('primerjava naslova ne loci velikih in malih crk', () => {
    const r = chooseGoogleEmail([google('Oseba@Gmail.com')], 'oseba@gmail.com')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('naslov_ze_enak')
  })

  test('prazen seznam identitet je zavrnjen', () => {
    const r = chooseGoogleEmail([], 'a@balinar.app')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('brez_google_identitete')
  })

  test('naslov se vrne v mali pisavi', () => {
    expect(chooseGoogleEmail([google('Oseba@Gmail.com')], 'a@balinar.app'))
      .toEqual({ ok: true, email: 'oseba@gmail.com' })
  })
})
```

- [ ] **Korak 2: Poženi test in preveri, da pade**

Poženi: `npx vitest run src/lib/googleEmailAdoption.test.ts`
Pričakovano: FAIL — `Failed to resolve import "./googleEmailAdoption"`

- [ ] **Korak 3: Napiši najmanjšo izvedbo**

```ts
export interface IdentityLike {
  provider: string
  identity_data?: { email?: string } | null
}

export type AdoptionCode = 'brez_google_identitete' | 'brez_google_naslova' | 'naslov_ze_enak'

export type AdoptionResult =
  | { ok: true; email: string }
  | { ok: false; code: AdoptionCode }

// Čista presoja, brez dostopa do baze in omrežja — zato jo je mogoče testirati
// in zato jo Vercel funkcija samo pokliče.
// Preverjanje, ali naslov že pripada DRUGEMU računu, tu ni: zahteva poizvedbo
// v bazo in zato živi v ročevalniku.
export function chooseGoogleEmail(identities: IdentityLike[], currentEmail: string): AdoptionResult {
  const google = identities.find(i => i.provider === 'google')
  if (!google) return { ok: false, code: 'brez_google_identitete' }

  const email = google.identity_data?.email?.trim().toLowerCase()
  if (!email) return { ok: false, code: 'brez_google_naslova' }

  if (email === (currentEmail || '').trim().toLowerCase()) return { ok: false, code: 'naslov_ze_enak' }

  return { ok: true, email }
}
```

- [ ] **Korak 4: Poženi test in preveri, da gre skozi**

Poženi: `npx vitest run src/lib/googleEmailAdoption.test.ts`
Pričakovano: PASS, 7 testov

- [ ] **Korak 5: Potrdi v git**

```bash
git add src/lib/googleEmailAdoption.ts src/lib/googleEmailAdoption.test.ts
git commit -m "feat(prijava): cista odlocitev o prevzemu Google naslova"
```

---

### Naloga 4: Migracija — sinhronizacija `public.users.email`

**Datoteke:**
- Ustvari: `supabase/migrations/20260731_01_sync_user_email.sql`

Trigger na `auth.users` obstaja doslej samo `after insert` (`00_schema.sql:32`). Ko uporabnik potrdi nov naslov prek povezave v pismu, se spremeni `auth.users.email`, `public.users.email` pa ostane star — skrbniški seznam bi kazal zastarel podatek. To ni le potreba te funkcije, ampak splošna vrzel.

- [ ] **Korak 1: Napiši migracijo**

```sql
-- Sinhronizacija public.users.email z auth.users.email.
--
-- Doslej je obstajal samo trigger ob VSTAVLJANJU (handle_new_user, 00_schema.sql).
-- Ob spremembi naslova — bodisi prek supabase.auth.updateUser() in potrditve v
-- pismu, bodisi prek admin API-ja — se je public.users.email tiho razšel z
-- auth.users.email. Skrbniški seznam bere users_sensitive nad public.users,
-- zato je kazal zastarel naslov.
--
-- security definer: trigger teče nad auth.users, pisati pa mora v public.users.
-- Fiksen search_path je zahteva iz 20260628_02_security_hardening.sql.

create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end;
$$;

revoke execute on function public.sync_user_email() from anon, authenticated, public;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_user_email();
```

- [ ] **Korak 2: Poženi migracijo v Supabase SQL editorju**

Migracije se v tem projektu poganjajo **ročno** — ni CLI, ni CI. Prilepi vsebino datoteke v Supabase → SQL Editor in izvedi.
Pričakovano: `Success. No rows returned`

- [ ] **Korak 3: Preveri, da trigger obstaja**

Poženi v SQL editorju:

```sql
select tgname, tgenabled from pg_trigger
 where tgrelid = 'auth.users'::regclass and not tgisinternal;
```

Pričakovano: med vrsticami je `on_auth_user_email_changed` z `tgenabled = 'O'`.

- [ ] **Korak 4: Preveri, da se RLS ni pokvaril**

Poženi: `node scripts/check-rls-regression.cjs`
Pričakovano: `33/33 preverb uspesnih`

- [ ] **Korak 5: Potrdi v git**

```bash
git add supabase/migrations/20260731_01_sync_user_email.sql
git commit -m "fix(db): public.users.email se ni sinhroniziral z auth.users"
```

---

### Naloga 5: Vercel funkcija za prevzem Google naslova

**Datoteke:**
- Ustvari: `api/adopt-google-email.ts`
- Test: `src/lib/adoptGoogleEmailApiSync.test.ts`

`api/` ne sme uvažati vrednosti iz `src/`, zato se `chooseGoogleEmail` podvoji. Test primerja izvorno besedilo obeh kopij — enak vzorec kot `src/lib/playerImport/api-shared-sync.test.ts`.

- [ ] **Korak 1: Napiši padajoč test za sinhronizacijo podvojene kode**

```ts
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Varuje pred razkorakom med api/adopt-google-email.ts (ki NE sme uvažati iz src/,
// ker Vercel zapakira le api/) in izvirnikom v src/lib/googleEmailAdoption.ts.

const here = path.dirname(fileURLToPath(import.meta.url))
const apiSource = readFileSync(path.resolve(here, '../../api/adopt-google-email.ts'), 'utf8')
const srcSource = readFileSync(path.resolve(here, './googleEmailAdoption.ts'), 'utf8')

const MARKER = '(identities: IdentityLike[], currentEmail: string): AdoptionResult'

function extractBraceBody(source: string, marker: string, label: string): string {
  const idx = source.indexOf(marker)
  if (idx === -1) throw new Error(`Ni najdenega markerja "${marker}" v ${label}`)
  const start = source.indexOf('{', idx)
  let depth = 0
  let i = start
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') { depth--; if (depth === 0) break }
  }
  if (depth !== 0) throw new Error(`Nezaključen blok v ${label}`)
  return source.slice(start + 1, i)
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('api/adopt-google-email.ts <-> src/lib/googleEmailAdoption.ts', () => {
  test('telo chooseGoogleEmail se ujema v obeh kopijah', () => {
    expect(
      norm(extractBraceBody(apiSource, MARKER, 'api/adopt-google-email.ts')),
      'Kopiji chooseGoogleEmail se razlikujeta — posodobi obe',
    ).toBe(norm(extractBraceBody(srcSource, MARKER, 'src/lib/googleEmailAdoption.ts')))
  })

  test('api/adopt-google-email.ts ne uvaza vrednosti iz src/', () => {
    const slabi = apiSource.split('\n')
      .filter(l => /from ['"]\.\.\/src/.test(l) && !/^\s*import type/.test(l))
    expect(slabi, `Value-import iz src/ bo padel z ERR_MODULE_NOT_FOUND: ${slabi.join('; ')}`).toEqual([])
  })
})
```

- [ ] **Korak 2: Poženi test in preveri, da pade**

Poženi: `npx vitest run src/lib/adoptGoogleEmailApiSync.test.ts`
Pričakovano: FAIL — `ENOENT: no such file or directory ... api/adopt-google-email.ts`

- [ ] **Korak 3: Napiši funkcijo**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// Podvojeno iz src/lib/googleEmailAdoption.ts — api/ ne sme uvažati iz src/
// (Vercel zapakira le api/). Sinhronizacijo varuje src/lib/adoptGoogleEmailApiSync.test.ts.
interface IdentityLike {
  provider: string
  identity_data?: { email?: string } | null
}
type AdoptionCode = 'brez_google_identitete' | 'brez_google_naslova' | 'naslov_ze_enak'
type AdoptionResult = { ok: true; email: string } | { ok: false; code: AdoptionCode }

function chooseGoogleEmail(identities: IdentityLike[], currentEmail: string): AdoptionResult {
  const google = identities.find(i => i.provider === 'google')
  if (!google) return { ok: false, code: 'brez_google_identitete' }

  const email = google.identity_data?.email?.trim().toLowerCase()
  if (!email) return { ok: false, code: 'brez_google_naslova' }

  if (email === (currentEmail || '').trim().toLowerCase()) return { ok: false, code: 'naslov_ze_enak' }

  return { ok: true, email }
}

const SPOROCILA: Record<AdoptionCode, string> = {
  brez_google_identitete: 'Google račun ni povezan s tem računom.',
  brez_google_naslova: 'Google ni vrnil e-naslova.',
  naslov_ze_enak: 'Račun že uporablja ta naslov.',
}

const URL = process.env.SUPABASE_URL as string
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!URL || !SERVICE_KEY) return res.status(500).json({ error: 'Manjkata SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })

  const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  // Funkcija spreminja IZKLJUČNO naslov klicatelja — ciljnega uporabnika ne
  // sprejema iz zahteve, ampak ga vzame iz žetona. Zato ni potrebna vloga admina.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Manjka avtorizacija' })

  const { data: userData, error: uErr } = await admin.auth.getUser(token)
  if (uErr || !userData.user) return res.status(401).json({ error: 'Neveljavna seja' })
  const me = userData.user

  const odlocitev = chooseGoogleEmail(
    (me.identities ?? []) as IdentityLike[],
    me.email ?? '',
  )
  if (!odlocitev.ok) return res.status(400).json({ error: SPOROCILA[odlocitev.code], code: odlocitev.code })

  // Naslov ne sme pripadati drugemu računu — natanko tak položaj je ustvaril
  // podvojene račune, ki smo jih 31. 7. 2026 ročno združevali.
  const { data: zaseden, error: zErr } = await admin
    .from('users').select('id').ilike('email', odlocitev.email).maybeSingle()
  if (zErr) return res.status(500).json({ error: `Napaka pri preverjanju naslova: ${zErr.message}` })
  if (zaseden && zaseden.id !== me.id) {
    return res.status(409).json({
      error: 'Ta e-naslov že uporablja drug račun. Obrni se na administratorja, da računa združi.',
      code: 'naslov_zaseden',
    })
  }

  // email_confirm: true — naslov je z Google prijavo že dokazan, zato
  // potrditveno pismo ni potrebno. Ta pot torej ne pošlje nobenega pisma.
  const { error: aErr } = await admin.auth.admin.updateUserById(me.id, {
    email: odlocitev.email,
    email_confirm: true,
  })
  if (aErr) return res.status(500).json({ error: `Napaka pri zamenjavi naslova: ${aErr.message}` })

  // Trigger on_auth_user_email_changed poskrbi tudi za public.users.email,
  // a ga zapišemo izrecno, da odziv ne visi na vrstnem redu izvajanja.
  const { error: pErr } = await admin.from('users').update({ email: odlocitev.email }).eq('id', me.id)
  if (pErr) return res.status(500).json({ error: `Naslov zamenjan, profil ni osvežen: ${pErr.message}` })

  return res.status(200).json({ email: odlocitev.email })
}
```

- [ ] **Korak 4: Poženi test in preveri, da gre skozi**

Poženi: `npx vitest run src/lib/adoptGoogleEmailApiSync.test.ts`
Pričakovano: PASS, 2 testa

- [ ] **Korak 5: Preveri tipe za api/**

Poženi: `npm run typecheck:api`
Pričakovano: brez izpisa (brez napak)

- [ ] **Korak 6: Potrdi v git**

```bash
git add api/adopt-google-email.ts src/lib/adoptGoogleEmailApiSync.test.ts
git commit -m "feat(prijava): streznik zamenja naslov po povezavi Google racuna"
```

---

### Naloga 6: Komponenta `AccountLoginSection`

**Datoteke:**
- Ustvari: `src/components/AccountLoginSection.tsx`

Predstavitvena komponenta brez lastnih testov (projekt jih za komponente nima). Vsa presoja je v modulih iz nalog 1–3.

- [ ] **Korak 1: Napiši komponento**

```tsx
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { isGenericEmail } from '../lib/genericEmail'
import { isGoogleEnabled } from '../lib/authProviders'

/**
 * Prikaz prijavnega naslova in obe poti do zamenjave.
 *
 * Vgrajena je na dveh mestih in o njiju ne ve nič:
 *  - na profilu kot trajni dom (brez onSkip),
 *  - po prisilni menjavi gesla kot enkratna ponudba (z onSkip).
 */
export default function AccountLoginSection({ onSkip }: { onSkip?: () => void }) {
  const { user, refreshProfile } = useAuth()
  const [googleNaVoljo, setGoogleNaVoljo] = useState(false)
  const [novNaslov, setNovNaslov] = useState('')
  const [rocnoOdprto, setRocnoOdprto] = useState(false)
  const [stanje, setStanje] = useState<'mirno' | 'delam' | 'caka'>('mirno')
  const [napaka, setNapaka] = useState('')

  const naslov = user?.email ?? ''
  const genericen = isGenericEmail(naslov)

  useEffect(() => { isGoogleEnabled().then(setGoogleNaVoljo) }, [])

  async function poveziGoogle() {
    setNapaka('')
    setStanje('delam')
    const { error } = await supabase.auth.linkIdentity({ provider: 'google' })
    // Ob uspehu odjemalec odide na Google; koda pod tem se izvede le ob napaki.
    if (error) {
      setStanje('mirno')
      setNapaka(
        /manual linking/i.test(error.message)
          ? 'Povezovanje računov v Supabase še ni vklopljeno. Obrni se na administratorja.'
          : error.message,
      )
    }
  }

  async function zamenjajRocno(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setNapaka('')
    setStanje('delam')
    const { error } = await supabase.auth.updateUser({ email: novNaslov.trim() })
    if (error) {
      setStanje('mirno')
      setNapaka(error.message)
      return
    }
    setStanje('caka')
    await refreshProfile()
  }

  if (!genericen) {
    return (
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Prijavni naslov</p>
        <p className="text-sm font-medium text-gray-800">{naslov}</p>
      </div>
    )
  }

  return (
    <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 className="text-base font-bold text-gray-800">Prijava</h2>
        <p className="text-sm text-gray-500 mt-1">
          Prijavljaš se z naslovom <span className="font-mono text-xs">{naslov}</span>, ki ga je
          ustvaril uvoz igralcev — pošta nanj ne pride. Zamenjaj ga za svojega, da boš lahko
          ponastavil geslo in prejemal obvestila.
        </p>
      </div>

      {stanje === 'caka' ? (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2 rounded-lg">
          Na <strong>{novNaslov}</strong> smo poslali potrditveno povezavo. Naslov se zamenja šele,
          ko jo odpreš. Če pismo ne pride v nekaj minutah, preveri vsiljeno pošto in poskusi znova.
        </div>
      ) : (
        <>
          {googleNaVoljo && (
            <button type="button" onClick={poveziGoogle} disabled={stanje === 'delam'}
              className="w-full bg-white border border-gray-300 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50">
              Poveži z Google računom
            </button>
          )}

          {!rocnoOdprto ? (
            <button type="button" onClick={() => setRocnoOdprto(true)}
              className="w-full text-sm text-bocce-green hover:underline">
              Ali vpiši e-naslov ročno
            </button>
          ) : (
            <form onSubmit={zamenjajRocno} className="space-y-2">
              <input type="email" required value={novNaslov} onChange={e => setNovNaslov(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                placeholder="tvoj@naslov.si" autoComplete="email" />
              <button type="submit" disabled={stanje === 'delam'}
                className="w-full bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-50">
                {stanje === 'delam' ? 'Pošiljam...' : 'Pošlji potrditev'}
              </button>
            </form>
          )}
        </>
      )}

      {napaka && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{napaka}</div>
      )}

      {onSkip && (
        <button type="button" onClick={onSkip} className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
          {stanje === 'caka' ? 'Nadaljuj' : 'Preskoči'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Korak 2: Preveri tipe in prevod**

Poženi: `npm run build`
Pričakovano: `✓ built in …`, brez napak

- [ ] **Korak 3: Potrdi v git**

```bash
git add src/components/AccountLoginSection.tsx
git commit -m "feat(prijava): komponenta za zamenjavo prijavnega naslova"
```

---

### Naloga 7: Vgradnja na profil in po menjavi gesla

**Datoteke:**
- Spremeni: `src/pages/Profile.tsx` (uvoz + vgradnja pod razdelek z vlogo, okoli vrstice 200)
- Spremeni: `src/pages/ChangePassword.tsx` (celotna datoteka)

- [ ] **Korak 1: Vgradi na profil**

V `src/pages/Profile.tsx` dodaj uvoz k obstoječim:

```tsx
import AccountLoginSection from '../components/AccountLoginSection'
```

in takoj **za** blokom `{profile?.role && profile.role !== 'player' && ( … )}` vstavi:

```tsx
      <AccountLoginSection />
```

- [ ] **Korak 2: Prikaži ponudbo po menjavi gesla**

Zamenjaj **celotno vsebino** `src/pages/ChangePassword.tsx` s tem:

```tsx
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabase'
import AccountLoginSection from '../components/AccountLoginSection'

/**
 * Zaslon za prisilno spremembo gesla ob prvi prijavi (must_change_password).
 * Po uspehu zastavice NE počistimo takoj, ampak najprej ponudimo zamenjavo
 * prijavnega naslova. Ker se ta zaslon po sprostitvi ne prikaže več, je
 * ponudba naravno enkratna in ne potrebuje svojega stolpca v bazi.
 */
export default function ChangePassword() {
  const { profile, signOut, refreshProfile } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ponudba, setPonudba] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Novo geslo mora imeti vsaj 8 znakov'); return }
    if (password !== confirm) { setError('Gesli se ne ujemata'); return }
    setLoading(true)
    try {
      const { error: pErr } = await supabase.auth.updateUser({ password })
      if (pErr) throw pErr
      setPonudba(true)
      setLoading(false)
    } catch (err) {
      setError((err as Error).message ?? 'Napaka pri shranjevanju')
      setLoading(false)
    }
  }

  async function zakljuci() {
    await supabase.from('users').update({ must_change_password: false }).eq('id', profile!.id)
    await refreshProfile() // must_change_password = false → dostop se sprosti
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-4xl">{ponudba ? '✓' : '🔐'}</span>
          <h1 className="text-2xl font-bold text-gray-800 mt-2">
            {ponudba ? 'Geslo je shranjeno' : 'Nastavi novo geslo'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {ponudba
              ? 'Še ena stvar, preden nadaljuješ.'
              : 'Prvič si prijavljen z začetnim geslom. Pred nadaljevanjem nastavi svoje geslo.'}
          </p>
        </div>

        {ponudba ? (
          <AccountLoginSection onSkip={zakljuci} />
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Novo geslo *</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                placeholder="Vsaj 8 znakov" autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ponovi novo geslo *</label>
              <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-bocce-green outline-none"
                placeholder="Ponovi geslo" autoComplete="new-password" />
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</div>}

            <button type="submit" disabled={loading}
              className="w-full bg-bocce-green text-white py-2.5 rounded-lg font-semibold hover:bg-bocce-green-light transition-colors disabled:opacity-50">
              {loading ? 'Shranjujem...' : 'Shrani in nadaljuj'}
            </button>
          </form>
        )}

        <button onClick={() => signOut()} className="w-full text-center text-sm text-gray-500 mt-3 hover:text-gray-700">
          Odjava
        </button>
      </div>
    </div>
  )
}
```

Pripis »Sprememba e-pošte bo na voljo kasneje« s tem izgine — od zdaj velja obratno.

- [ ] **Korak 3: Preveri prevod in vse teste**

Poženi: `npm run build && npx vitest run`
Pričakovano: build uspe; `Test Files 26 passed` (22 obstoječih + 4 nove), testov `283 passed` (262 obstoječih + 21 novih: 6 + 6 + 7 + 2)

- [ ] **Korak 4: Preveri v brskalniku**

Poženi razvojni strežnik prek `preview_start` (konfiguracija `bocce`), odpri stran profila prijavljenega uporabnika z generičnim naslovom in preveri:
- razdelek »Prijava« je viden, gumba za Google **ni** (ponudnik še ni vklopljen),
- povezava »Ali vpiši e-naslov ročno« odpre polje,
- konzola je brez napak (`read_console_messages`).

- [ ] **Korak 5: Potrdi v git**

```bash
git add src/pages/Profile.tsx src/pages/ChangePassword.tsx
git commit -m "feat(prijava): razdelek na profilu in enkratna ponudba po menjavi gesla"
```

---

### Naloga 8: Skripta za postopno uvedbo zastavice

**Datoteke:**
- Ustvari: `scripts/set-must-change-password.cjs` (mapa je v `.gitignore` — commita ne bo)

Brez `must_change_password` velja skupno privzeto geslo iz uvoza in menjava naslova bi omogočila prevzem tujega računa (spec, razdelek 3). Uvedba gre po klubih.

- [ ] **Korak 1: Napiši skripto**

```js
// Nastavi must_change_password=true generičnim računom enega kluba.
//
// Brez te zastavice velja skupno privzeto geslo iz uvoza — kdor pozna tuj
// generični naslov in privzeto geslo, bi lahko po uvedbi menjave naslova
// prevzel tuj račun. Uvedba je zato pogoj, izvedena po klubih.
//
// Uporaba:
//   node scripts/set-must-change-password.cjs --klub "Hoče"            → suhi tek
//   node scripts/set-must-change-password.cjs --klub "Hoče" --izvedi   → nastavi

const path = require('path')
const fs = require('fs')

;(function loadEnv () {
  const p = path.join(__dirname, '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
})()

const URL_ = process.env.SUPABASE_URL
const KEY = process.env.SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('NAPAKA: manjka SUPABASE_URL ali SERVICE_ROLE_KEY.'); process.exit(1) }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const HJ = { ...H, 'Content-Type': 'application/json' }

const argv = process.argv.slice(2)
const IZVEDI = argv.includes('--izvedi')
const klub = (() => { const i = argv.indexOf('--klub'); return i >= 0 ? argv[i + 1] : null })()
if (!klub) { console.error('NAPAKA: manjka --klub "<ime>"'); process.exit(1) }

const GENERICNE = ['balinar.app', 'bocceapp.si']
const jeGenericen = e => GENERICNE.includes(String(e).split('@')[1])

async function main () {
  console.log(IZVEDI ? 'NAČIN: IZVEDBA' : 'NAČIN: SUHI TEK — nič se ne zapiše')
  const r = await fetch(
    `${URL_}/rest/v1/users?club=ilike.${encodeURIComponent(klub)}&select=id,email,full_name,must_change_password`,
    { headers: H },
  )
  const vsi = await r.json()
  if (!Array.isArray(vsi)) { console.error('NAPAKA:', JSON.stringify(vsi)); process.exit(1) }

  const tarce = vsi.filter(u => jeGenericen(u.email) && !u.must_change_password)
  console.log(`\nKlub "${klub}": ${vsi.length} računov, generičnih brez zastavice: ${tarce.length}`)
  if (!tarce.length) { console.log('Ni kaj nastaviti.'); return }

  if (!IZVEDI) {
    console.log('[suhi tek] nastavilo bi zastavico pri teh računih:')
    tarce.forEach(u => console.log(`   ${u.email}`))
    console.log('[suhi tek] nič ni zapisano. Za izvedbo dodaj --izvedi')
    return
  }

  let ok = 0
  for (const u of tarce) {
    const res = await fetch(`${URL_}/rest/v1/users?id=eq.${u.id}`, {
      method: 'PATCH', headers: HJ, body: JSON.stringify({ must_change_password: true }),
    })
    if (res.ok) ok++; else console.log(`  ✗ ${u.email}: ${res.status} ${await res.text()}`)
  }
  console.log(`\n✓ nastavljeno pri ${ok} od ${tarce.length} računov`)
}

main().catch(e => { console.error('NAPAKA', e); process.exit(1) })
```

- [ ] **Korak 2: Poženi suhi tek na enem klubu**

Poženi: `node scripts/set-must-change-password.cjs --klub "Hoče"`
Pričakovano: izpis števila računov in seznam naslovov, brez zapisa

- [ ] **Korak 3: Poženi izvedbo, ko je funkcija v produkciji**

Poženi: `node scripts/set-must-change-password.cjs --klub "Hoče" --izvedi`
Pričakovano: `✓ nastavljeno pri N od N računov`

Ta korak izvedi **šele po** uvedbi nalog 1–7 v produkcijo. Prej bi uporabniki naleteli na zaslon za menjavo gesla brez ponudbe za zamenjavo naslova.

---

## Odvisnosti in vrstni red

Naloge 1–3 so neodvisne in lahko tečejo v poljubnem vrstnem redu. Naloga 5 potrebuje 3 (podvojena funkcija). Naloga 6 potrebuje 1 in 2. Naloga 7 potrebuje 6. Naloga 4 (migracija) je neodvisna od kode, a mora biti v produkciji, preden kdo uporabi **ročno** pot — sicer se `public.users.email` po potrditvi ne uskladi. Naloga 8 gre nazadnje.

## Odstopanje od spec-a, razdelek 8

Spec je predvidel enotne teste za zavrnitve v `api/adopt-google-email.ts` — brez
žetona, brez Google identitete, ob zasedenem naslovu. Načrt jih ima le za
**drugo** od teh treh: `chooseGoogleEmail` je čista in v celoti pokrita
(naloga 3).

Preostali dve (401 brez žetona, 409 ob zasedenem naslovu) ostaneta brez enotnih
testov. Razlog: projekt nima nobenega testa za Vercel ročevalnike — obstoječi
`api/import-players.ts` je pokrit le s primerjavo izvorne kode, ne z izvajanjem.
Ročevalnik bere `process.env` ob nalaganju modula, zato bi ga bilo treba uvažati
dinamično z vsiljenim okoljem in zamenjanim `@supabase/supabase-js`. To bi bil
nov vzorec testiranja v tem projektu in presega obseg te funkcije.

Obe poti sta zato namenoma zelo kratki in brez presoje: `401` je preverba
prisotnosti niza, `409` pa primerjava dveh identifikatorjev. Vsa logika, ki bi
lahko bila napačna, je v čisti funkciji. Če se bo kdaj uvedlo testiranje
ročevalnikov, sta ti dve poti prvi kandidatki.

## Kar ostane nepreverjeno

Google pot je napisana po dokumentaciji in je **ni mogoče preizkusiti**, dokler lastnik projekta ne vklopi ponudnika in ročnega povezovanja identitet (spec, razdelek 10). Do takrat gumb ni viden in koda se ne izvede. Prvi pravi preizkus naj bo en račun, ne množična uvedba.

Dostava pisem za ročno pot je odvisna od SMTP, ki ob pisanju ni znan. Če je v rabi privzeti Supabase SMTP, bo ročna pot delovala le za nekaj uporabnikov na uro.
