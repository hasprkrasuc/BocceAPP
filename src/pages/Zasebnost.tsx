/**
 * POLITIKA ZASEBNOSTI IN PIŠKOTKI
 *
 * Obvestilo posamezniku po 13. členu Splošne uredbe (GDPR). Obvezno je ne glede
 * na piškotke — teh aplikacija namreč ne uporablja.
 *
 * Kar je tu zapisano o hrambi v brskalniku in o dostopih, je preverjeno stanje
 * kode in baze, ne domneva. Če se to kdaj spremeni (dodana analitika, nov
 * javni stolpec), je treba popraviti tudi to stran.
 *
 * Pravna dejstva, ki jih iz kode ni mogoče izpeljati — upravljavec, pravna
 * podlaga, roki hrambe — so označena z <Dopolni>. Dokler niso izpolnjena,
 * stran opozori nase, da ne ustvarja videza dokončnosti.
 */

import { Link } from 'react-router-dom'

/** Podatek, ki ga mora dopolniti upravljavec; vidno označen, da se ne spregleda. */
function Dopolni({ children }: { children: React.ReactNode }) {
  return (
    <mark className="bg-amber-100 text-amber-900 px-1 rounded border border-amber-200">
      {children}
    </mark>
  )
}

function Razdelek({ naslov, children }: { naslov: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-gray-800 mb-3">{naslov}</h2>
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">{children}</div>
    </section>
  )
}

export default function Zasebnost() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Zasebnost in piškotki</h1>
      <p className="text-sm text-gray-500 mb-6">
        Kako BalinarApp ravna z osebnimi podatki. Zadnja sprememba: 9. 8. 2026.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-sm text-amber-900">
        <strong>Osnutek.</strong> Rumeno označena mesta mora dopolniti zveza — brez njih
        obvestilo ni popolno. Vse ostalo opisuje dejansko stanje aplikacije.
      </div>

      <Razdelek naslov="Piškotkov ne uporabljamo">
        <p>
          BalinarApp <strong>ne uporablja piškotkov</strong>. Prav tako ne uporabljamo
          analitike, sledilnikov, oglaševalskih omrežij ali kakršnihkoli zunanjih
          skriptov. Vašega obiska ne merimo in ne posredujemo nikomur.
        </p>
        <p>V brskalniku se shranita samo dve stvari, obe nujni za delovanje:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Kaj</th>
                <th className="text-left px-3 py-2 font-semibold">Zakaj</th>
                <th className="text-left px-3 py-2 font-semibold">Koliko časa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2">Prijavna seja</td>
                <td className="px-3 py-2">da ostanete prijavljeni in vam ni treba vpisovati gesla ob vsakem koraku</td>
                <td className="px-3 py-2">do odjave</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Čas zadnje osvežitve</td>
                <td className="px-3 py-2">da se stran po objavi nove različice osveži samo enkrat in se ne vrti v krogu</td>
                <td className="px-3 py-2">do zaprtja zavihka</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Oboje je nujno potrebno za storitev, ki jo izrecno zahtevate — prijavo. Za takšno
          hrambo privolitev ni potrebna, sledenja, v katero bi lahko privolili, pa ni.
          Zato vas ne nadlegujemo s pasico o piškotkih.
        </p>
        <p>
          Obe vrednosti lahko kadarkoli izbrišete v nastavitvah brskalnika (podatki
          strani). Po tem boste odjavljeni.
        </p>
      </Razdelek>

      <Razdelek naslov="Kdo obdeluje vaše podatke">
        <p>
          Upravljavec je <Dopolni>[polno ime pravne osebe, naslov, matična številka]</Dopolni>.
        </p>
        <p>
          Za vprašanja o osebnih podatkih pišite na <Dopolni>[e-naslov]</Dopolni>.
          {' '}<Dopolni>[Ali je imenovana pooblaščena oseba za varstvo podatkov — če da, kontakt.]</Dopolni>
        </p>
      </Razdelek>

      <Razdelek naslov="Katere podatke hranimo in zakaj">
        <p>
          Podatke prejmemo ob včlanitvi oziroma registraciji pri klubu, del pa jih nastane
          med tekmovanjem (izidi, uvrstitve, sodniške zadolžitve).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">Podatek</th>
                <th className="text-left px-3 py-2 font-semibold">Čemu služi</th>
                <th className="text-left px-3 py-2 font-semibold">Kdo ga vidi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-3 py-2">Ime in priimek, klub, letnica rojstva, spol</td>
                <td className="px-3 py-2">lestvice, zapisniki tekem, kategorije</td>
                <td className="px-3 py-2 text-gray-500">javno</td>
              </tr>
              <tr>
                <td className="px-3 py-2">E-naslov</td>
                <td className="px-3 py-2">prijava v aplikacijo</td>
                <td className="px-3 py-2 text-gray-500">vi in skrbnik</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Datum rojstva, EMŠO, naslov, telefon, državljanstvo</td>
                <td className="px-3 py-2">registracija pri zvezi in preverjanje istovetnosti ob uvozu evidence</td>
                <td className="px-3 py-2 text-gray-500">vi in skrbnik</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Rezultati in uvrstitve</td>
                <td className="px-3 py-2">vodenje tekmovanj in zgodovina</td>
                <td className="px-3 py-2 text-gray-500">javno</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>Javno vidno je samo prvo in zadnje.</strong> EMŠO, naslova, e-naslova,
          telefona in polnega datuma rojstva ne prikazujemo nikjer — ti podatki so na
          ravni baze zaprti tako, da jih tudi drug prijavljen uporabnik ne more prebrati.
        </p>
        <p>
          Pravna podlaga za obdelavo je <Dopolni>[npr. članska pogodba in vodenje
          tekmovanj; dopolni po posvetu s pravnikom]</Dopolni>.
        </p>
      </Razdelek>

      <Razdelek naslov="Mladoletni">
        <p>
          V tekmovanjih U14 in U18 nastopajo mladoletne osebe. Njihovi podatki so
          zaščiteni enako kot vsi ostali; javno se prikazujeta ime in klub ter letnica
          rojstva, tako kot pri članih.
        </p>
        <p>
          <Dopolni>[Kako se pridobi soglasje staršev pri mlajših od 15 let in kdo ga
          hrani.]</Dopolni>
        </p>
      </Razdelek>

      <Razdelek naslov="Kje so podatki in komu jih zaupamo">
        <p>
          Podatki so shranjeni pri <strong>Supabase</strong> v podatkovnem središču v
          <strong> Frankfurtu (Evropska unija)</strong>, aplikacijo pa poganja
          <strong> Vercel</strong>. Oba nastopata kot obdelovalca in podatkov ne
          uporabljata za svoje namene.
        </p>
        <p>Podatkov ne prodajamo in jih ne posredujemo tretjim osebam za trženje.</p>
      </Razdelek>

      <Razdelek naslov="Kako dolgo jih hranimo">
        <p>
          <Dopolni>[Rok hrambe po prenehanju članstva — posebej za osebne podatke in
          posebej za tekmovalne rezultate, ki so del zgodovine tekmovanj.]</Dopolni>
        </p>
      </Razdelek>

      <Razdelek naslov="Vaše pravice">
        <p>Kadarkoli lahko zahtevate:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>vpogled</strong> — kateri vaši podatki se obdelujejo,</li>
          <li><strong>popravek</strong> netočnih podatkov,</li>
          <li><strong>izbris</strong>, kadar za hrambo ni več podlage,</li>
          <li><strong>omejitev obdelave</strong> in <strong>ugovor</strong>,</li>
          <li><strong>prenos</strong> podatkov v strojno berljivi obliki.</li>
        </ul>
        <p>
          Del tega lahko opravite sami: na strani{' '}
          <Link to="/profil" className="text-bocce-green hover:underline font-medium">Moj profil</Link>{' '}
          lahko svoje podatke pregledate, popravite in prenesete v datoteki.
          Za izbris ali karkoli drugega pišite na <Dopolni>[e-naslov]</Dopolni>.
        </p>
        <p>
          Če menite, da z vašimi podatki ne ravnamo pravilno, se lahko pritožite
          Informacijskemu pooblaščencu RS (
          <a href="https://www.ip-rs.si" target="_blank" rel="noopener noreferrer"
            className="text-bocce-green hover:underline">ip-rs.si</a>).
        </p>
      </Razdelek>

      <Razdelek naslov="Spremembe">
        <p>
          Ob spremembi te politike bomo posodobili datum na vrhu strani. Če bo sprememba
          pomembna, vas bomo obvestili tudi v aplikaciji.
        </p>
      </Razdelek>
    </div>
  )
}
