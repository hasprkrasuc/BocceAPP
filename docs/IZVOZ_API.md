# Izvozni API BalinarApp (za evidenco BZS in portal OKS)

Varovan API, prek katerega zunanji sistemi (evidenca BZS na
`evidence.balinanje.si`, posrednik za portal OKS) berejo podatke
registriranih igralcev in rezultatske dosežke z državnih prvenstev —
za potrebe registracij in kategorizacij športnikov pri OKS-ZŠZ.

## Osnovni naslov

```
https://jzpzigjljwufdnqcjtjb.supabase.co/functions/v1/izvoz
```

## Avtentikacija

Vsaka zahteva mora imeti glavo z API ključem, ki ga izda Balinarska zveza
Slovenije (skrbnik aplikacije BalinarApp):

```
X-Api-Kljuc: <ključ>
```

Brez veljavnega ključa strežnik vrne `401`. Ključ je vezan na prejemnika in
ga je mogoče kadarkoli preklicati; v bazi je shranjen samo njegov sha256.
Vse zahteve so GET prek HTTPS.

## Končne točke

### `GET /v1/igralci`

Vsi registrirani igralci (vloga igralca ali članstvo v ligaški postavi).

```json
{
  "verzija": "v1",
  "ustvarjeno": "2026-10-05T08:00:00.000Z",
  "stevilo": 1234,
  "igralci": [
    {
      "id": "7d9e…",                  // trajni ID igralca v BalinarApp (UUID)
      "ime_priimek": "Janez Novak",
      "datum_rojstva": "1990-05-14",  // lahko null
      "letnik": 1990,                 // lahko null
      "spol": "M",                    // "M" / "Ž", lahko null
      "emso": "1405990500123",        // lahko null, če ni evidentiran
      "drzavljanstvo": "Slovenija",   // lahko null
      "klub": { "id": "a1b2…", "naziv": "BK Primer" },  // null = brez kluba
      "sportna_stevilka": "12345",    // športna številka BZS, lahko null
      "obz_stevilka": "NG-123"        // registrska številka OBZ, lahko null
    }
  ]
}
```

### `GET /v1/dosezki`

Uvrstitve z **zaključenih državnih prvenstev** (uradni končni vrstni red).
Neobvezni parameter `?leto=2026` omeji na prvenstva v danem koledarskem letu.

```json
{
  "verzija": "v1",
  "ustvarjeno": "2026-10-05T08:00:00.000Z",
  "stevilo": 321,
  "dosezki": [
    {
      "tekmovanje": {
        "id": "9a5f…",
        "naziv": "Državno prvenstvo dvojice 2026",
        "vrsta": "drzavno_prvenstvo",
        "datum": "2026-09-06",
        "kategorija": "člani",        // člani/članice/U18/U18 mladinke/U14/…
        "disciplina": "dvojka",       // posamezno/dvojka/krog/hitrostno/natancno/…
        "st_udelezencev": 25
      },
      "mesto": 1,
      "igralca": [
        { "id": "7d9e…", "ime_priimek": "Janez Novak", "emso": "1405990500123" },
        { "id": "8c1f…", "ime_priimek": "Peter Kranjc", "emso": "0203985500456" }
      ]
    }
  ]
}
```

- Pri posamičnih disciplinah ima `igralca` en element, pri dvojicah dva.
- `id` igralca je isti kot v `/v1/igralci` — po njem se zapisa povežeta;
  igralec brez računa v registru (zgodovinski vnosi) ima `id: null`.
- Deljena mesta (npr. deljen bron brez tekme za 3. mesto) se pojavijo kot
  dve vrstici z istim `mesto`.

## Napake

| Koda | Pomen |
|------|-------|
| 401  | manjkajoč ali neveljaven API ključ |
| 404  | neznana pot |
| 405  | metoda ni GET |
| 500  | napaka strežnika (kontakt: skrbnik BalinarApp) |

## Varstvo osebnih podatkov

Odgovora vsebujeta EMŠO in datum rojstva, ker ju OKS-ZŠZ zahteva za
registracijo in kategorizacijo športnikov. Ključ se izda samo zvezi oziroma
njenemu pogodbenemu obdelovalcu; prenosi tečejo izključno prek HTTPS in se
ne predpomnijo javno.

## Različice

Pot vsebuje različico (`/v1/…`). Polja se znotraj `v1` lahko samo dodajajo,
nikoli odstranjujejo ali preimenujejo; nezdružljive spremembe dobijo `/v2`.
