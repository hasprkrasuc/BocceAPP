# Menjava prijavnega e-naslova (Google ali ročno) — načrt

Datum: 31. 7. 2026

## 1. Cilj

Uporabnik, ki se prijavlja z generičnim e-naslovom iz uvoza, naj si prijavo
zamenja za svojo — bodisi s povezavo Google računa bodisi z ročnim vpisom
naslova. Račun ostane isti (`users.id` se ne premakne), zamenja se le prijavni
podatek.

Stanje ob pisanju: od 1172 računov jih ima 1159 generični naslov (1139 na
`@balinar.app`, 20 na `@bocceapp.si`), 13 pa osebnega.

**Zakaj to šteje.** Ker te možnosti ni, so si igralci ustvarjali druge račune z
Gmailom, športna zgodovina pa je ostajala na generičnem. Tako je nastalo 11
podvojenih parov, ki smo jih 31. 7. 2026 ročno združili. Ta funkcija je
preventiva; brez nje bo vsak nov val uvoza ustvaril novo generacijo dvojnikov.

## 2. Izhodiščno stanje (preverjeno proti produkciji)

| Ugotovitev | Posledica za načrt |
|---|---|
| Google OAuth **ni vklopljen** (`/auth/v1/settings` vrne samo `email = true`) | Gumb mora biti skrit, dokler ponudnika ni |
| V `src/` ni `signInWithOAuth` ne `linkIdentity` | Vsa OAuth koda je nova |
| Trigger na `auth.users` obstaja **samo `after insert`** (`00_schema.sql:32`) | `public.users.email` se ob spremembi ne posodobi — potreben nov trigger |
| 1085 od 1159 generičnih računov ima `must_change_password = false` | Skupno privzeto geslo iz uvoza je še v veljavi |
| Tok `must_change_password` že obstaja (`App.tsx:49`, `ChangePassword.tsx`) | Enkratno ponudbo obesimo nanj, brez novega stolpca |
| SMTP ni znan | Google pot ne sme biti odvisna od pisem |

## 3. Varnostno izhodišče

Dokler velja skupno privzeto geslo, bi menjava naslova omogočila prevzem tujega
računa: kdor pozna generični naslov in privzeto geslo, se prijavi, naslov
zamenja za svojega in trajno prevzame zgodovino — pri sodnikih tudi pravico
vpisovanja rezultatov.

Kar tveganje omejuje: e-naslovi niso javno berljivi (RLS; `users_sensitive` je
le za administratorje), pripona `<hex8>` pa je naključna, zato naslova ni
mogoče uganiti. Ogroženi so torej naslovi, ki jih je klub že razdelil.

**Ukrep:** generičnim računom se nastavi `must_change_password = true`, uvedeno
postopoma po klubih. Menjava naslova je na voljo šele po tem, ko ima uporabnik
lastno geslo. Ročna pot poleg tega zahteva potrditev na novem naslovu.

## 4. Uporabniški tok

### 4a. Razdelek na profilu (trajni dom)

Na strani profila nov razdelek »Prijava«:

- prikaže trenutni prijavni naslov;
- če je naslov generičen, razloži, zakaj je tak, in ponudi dve možnosti;
- če ni generičen, prikaže samo naslov brez ponudb.

### 4b. Enkratna ponudba po menjavi gesla

Po uspešni menjavi gesla v `ChangePassword` se pokaže isti razdelek kot
**neblokirajoča** ponudba z gumbom »Preskoči«. Ker `must_change_password`
takrat pade na `false`, se ta zaslon naravno prikaže le enkrat — stolpca za
»zavrnjeno« ne potrebujemo.

### 4c. Pot prek Googla

1. Odjemalec kliče `supabase.auth.linkIdentity({ provider: 'google' })`.
2. Po vrnitvi z Googla odjemalec zazna pripeto Google identiteto in pokliče
   `POST /api/adopt-google-email` z žetonom seje.
3. Funkcija preveri žeton, prek service-role prebere identitete uporabnika,
   vzame naslov iz Google identitete in ga nastavi na `auth.users` z
   `email_confirm: true` ter na `public.users`.
4. Odjemalec osveži profil in pokaže nov naslov.

Naslov je s prijavo pri Googlu že dokazan, zato potrditveno pismo ni potrebno.
**Ta pot ne pošlje nobenega pisma in ni odvisna od SMTP.**

### 4d. Ročna pot

1. Uporabnik vpiše nov naslov.
2. Odjemalec kliče `supabase.auth.updateUser({ email })`.
3. Supabase pošlje potrditev na **nov** naslov; sprememba stopi v veljavo šele
   po kliku na povezavo.
4. Vmesnik pokaže čakajoče stanje in navodilo, kaj storiti, če pismo ne pride.
5. Ob potrditvi trigger iz razdelka 6 posodobi `public.users.email`.

## 5. Arhitektura

| Enota | Odgovornost |
|---|---|
| `src/lib/genericEmail.ts` | `isGenericEmail(email)` — edino merilo je domena (`balinar.app`, `bocceapp.si`) |
| `src/lib/authProviders.ts` | `isGoogleEnabled()` — prebere `/auth/v1/settings` in vrne `external.google` |
| `src/components/AccountLoginSection.tsx` | Prikaz in obe akciji; brez znanja o tem, kje je vgrajen |
| `api/adopt-google-email.ts` | Strežniška zamenjava naslova po pripenjanju Googla |
| `supabase/migrations/20260731_01_sync_user_email.sql` | Trigger za sinhronizacijo `public.users.email` |
| `scripts/set-must-change-password.cjs` | Postopna uvedba zastavice po klubih (gitignorirano) |

`AccountLoginSection` je uporabljen na dveh mestih (profil, po menjavi gesla) in
o njiju ne ve nič — prejme le `onSkip?: () => void`, ki ga profil ne poda.

## 6. Migracija

```sql
create or replace function public.sync_user_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end; $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_user_email();
```

Popravlja splošno vrzel, ne le to funkcijo: doslej se `public.users.email` ob
nobeni spremembi naslova ni posodobil sam.

## 7. Robni primeri in varovala

| Primer | Ravnanje |
|---|---|
| Naslov že pripada drugemu računu | Obe poti zavrneta z razumljivim sporočilom; računov **ne** združujeta |
| Google ponudnik ni vklopljen | Gumb se ne izriše (`isGoogleEnabled()`) |
| Ročno povezovanje identitet ni vklopljeno v Supabase | `linkIdentity` vrne napako; prikaže se sporočilo, da možnost še ni na voljo |
| Uporabnik prekine Google tok | Nič se ne spremeni; naslov ostane generičen |
| `adopt-google-email` klican brez Google identitete | Vrne 400 in ničesar ne spremeni |
| Žeton seje neveljaven ali tuj | Vrne 401; funkcija spreminja izključno naslov klicatelja |
| Pismo za ročno potrditev ne pride | Vmesnik pove, da naslov ostane nespremenjen do potrditve, in ponudi ponovni poskus |
| Naslov ni generičen | Razdelek pokaže samo trenutni naslov |

## 8. Testiranje

- Enote: `isGenericEmail` (domene, prazna vrednost, velike črke), `isGoogleEnabled` (odziv brez `external`).
- `api/adopt-google-email.ts`: zavrnitev brez žetona, brez Google identitete in ob zasedenem naslovu.
- Po migraciji: `node scripts/check-rls-regression.cjs` mora ostati 33/33.
- Obstoječih 262 testov mora ostati zelenih.
- Google tok je mogoče preizkusiti šele po vklopu ponudnika; do takrat ostane nepreverjen in tako tudi označen.

## 9. Zunaj obsega

- Združevanje računov v aplikaciji (opravljeno s `scripts/merge-duplicate-users.cjs`).
- Vrnitev z osebnega naslova nazaj na generičnega.
- Skrbniško urejanje tujih naslovov.
- Drugi ponudniki prijave razen Googla.

## 10. Kar mora nastaviti lastnik projekta

1. Projekt v Google Cloud, OAuth client ID in secret.
2. Vnos obojega v Supabase → Authentication → Providers → Google.
3. Preusmeritveni URL-ji za produkcijo in localhost.
4. **Authentication → Advanced → Manual linking** — brez tega `linkIdentity`
   vrne napako, tudi če je Google vklopljen.
5. Preverba, ali je nastavljen lasten SMTP; privzeti Supabase SMTP je omejen na
   nekaj pisem na uro in za ročno pot pri 1159 računih ne zadošča.

## 11. Potrjene odločitve

| Vprašanje | Odločitev |
|---|---|
| Zaščita pred prevzemom | Prisilna menjava gesla + potrditev na nov naslov |
| Obseg | Obe poti; Google vklopi lastnik projekta |
| SMTP | Predpostavimo privzetega; Google pot ne sme biti odvisna od pisem |
| Naslov po pripenjanju Googla | Zamenja se z Google naslovom, strežniško, brez pisma |
| Dostop | Razdelek na profilu **in** enkratna ponudba po menjavi gesla |
| Uvedba zastavice | Postopoma, najprej en klub |
