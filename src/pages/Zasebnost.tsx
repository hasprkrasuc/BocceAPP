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
 * Kar še manjka, je označeno z <Dopolni>. Trije taki podatki so ostali in vsi
 * trije zahtevajo odločitev zveze, ne kode:
 *   - e-naslov za vprašanja o osebnih podatkih,
 *   - koliko časa po prenehanju članstva se podatki še hranijo,
 *   - razdelitev vlog med obema upravljavcema (26. člen).
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
        Kako BalinarApp ravna z osebnimi podatki. Zadnja sprememba: 25. 8. 2026.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-sm text-amber-900">
        <strong>Manjkajo še trije podatki</strong> — označeni so rumeno. Vse ostalo je
        dokončno in opisuje dejansko stanje aplikacije.
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
        <p>Upravljavca sta dva:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Balinarska zveza Slovenije</strong></li>
          <li><strong>Gašper Kraševec s.p.</strong></li>
        </ul>
        <p>
          Za vprašanja o osebnih podatkih so na voljo <strong>Simon Maljevac</strong>,{' '}
          <strong>Gašper Kraševec</strong> in <strong>Samo Vehovec</strong>; pišete jim
          lahko na <Dopolni>[e-naslov za vprašanja o osebnih podatkih]</Dopolni>.
        </p>
        <p>
          <Dopolni>[Kdo od upravljavcev za kaj odgovarja — dogovor po 26. členu Splošne
          uredbe.]</Dopolni>
        </p>
      </Razdelek>

      <Razdelek naslov="Katere podatke hranimo in zakaj">
        <p>
          Podatke prejmemo iz evidence Balinarske zveze Slovenije (
          <span className="font-mono text-xs">evidence.balinanje.si</span>), kamor jih ob včlanitvi
          odda klub. Del podatkov nastane med tekmovanjem — izidi, uvrstitve in sodniške
          zadolžitve.
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
                <td className="px-3 py-2">EMŠO</td>
                <td className="px-3 py-2">zahteva zveze pri registraciji; hkrati edini zanesljiv način, da ločimo osebe z enakim imenom in priimkom</td>
                <td className="px-3 py-2 text-gray-500">vi in skrbnik</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Datum rojstva, naslov, telefon, državljanstvo</td>
                <td className="px-3 py-2">registracija pri zvezi</td>
                <td className="px-3 py-2 text-gray-500">vi in skrbnik</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Fotografija</td>
                <td className="px-3 py-2">
                  prepoznavnost na profilu in v seznamu članov kluba ter obveščanje javnosti;
                  ni obvezna, podlaga je podpisano soglasje (glej spodaj)
                </td>
                <td className="px-3 py-2 text-gray-500">javno</td>
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
          <strong>Javno vidno je samo tisto, kar je v stolpcu »Kdo ga vidi« označeno kot
          javno.</strong> EMŠO, naslova, e-naslova,
          telefona in polnega datuma rojstva ne prikazujemo nikjer — ti podatki so na
          ravni baze zaprti tako, da jih tudi drug prijavljen uporabnik ne more prebrati.
          Vidite jih le vi in skrbnik zveze.
        </p>
        <p>
          Pravna podlaga za obdelavo je <strong>člansko razmerje in vodenje tekmovanj</strong>.
          Ta obdelava ne temelji na vaši privolitvi, zato je tudi ne morete preklicati;
          lahko pa uveljavljate pravice, naštete spodaj.
        </p>
        <p>
          <strong>Izjema je obveščanje javnosti.</strong> S podpisom na obrazcu
          <em> Evidenca in registracija igralcev po klubih</em> igralka oziroma igralec
          soglaša, da sme Balinarska zveza Slovenije njegovo ime in priimek, letnico
          rojstva in fotografije uporabljati za obveščanje javnosti — na svoji spletni
          strani, na družbenih omrežjih in v tiskanih izdajah.
        </p>
        <p>
          Ker ta del stoji na <strong>privolitvi</strong>, ga je za razliko od zgornjega
          mogoče <strong>preklicati</strong>. Preklic velja za naprej in ne vpliva na
          objave, ki so že bile narejene, niti na rezultate in zapisnike tekem — ti so del
          vodenja tekmovanj in ne obveščanja javnosti.
        </p>
      </Razdelek>

      <Razdelek naslov="Mladoletni">
        <p>
          V tekmovanjih U14 in U18 nastopajo mladoletne osebe. Ob registraciji mladoletnega
          člana mora biti podana <strong>privolitev staršev oziroma skrbnikov</strong>.
        </p>
        <p>
          Te privolitve se zbirajo in hranijo v evidenci Balinarske zveze Slovenije na{' '}
          <span className="font-mono text-xs">evidence.balinanje.si</span>, ne v tej aplikaciji.
          BalinarApp podatke od tam prejme.
        </p>
        <p>
          Podatki mladoletnih so zaščiteni enako kot vsi ostali; javno se prikazujeta ime
          in klub ter letnica rojstva, tako kot pri članih. Fotografija ni obvezna in je
          nihče ne naloži sam — doda jo skrbnik zveze; če je naložena, je javno vidna.
        </p>
        <p>
          Soglasje za objavo fotografij je pri mladoletnem članu del iste privolitve, ki jo
          ob registraciji podpišejo <strong>starši oziroma skrbniki</strong>, in ga je
          mogoče preklicati enako kot pri polnoletnih.
        </p>
      </Razdelek>

      <Razdelek naslov="Kje so podatki in komu jih zaupamo">
        <p>
          Podatki so shranjeni pri <strong>Supabase</strong> v podatkovnem središču v{' '}
          <strong>Frankfurtu (Evropska unija)</strong>, aplikacijo pa poganja{' '}
          <strong>Vercel</strong>. Oba nastopata kot obdelovalca in podatkov ne
          uporabljata za svoje namene.
        </p>
        <p>Podatkov ne prodajamo in jih ne posredujemo tretjim osebam za trženje.</p>
      </Razdelek>

      <Razdelek naslov="Kako dolgo jih hranimo">
        <p>
          Osebne podatke hranimo, dokler traja članstvo, in po njegovem prenehanju še{' '}
          <Dopolni>[koliko časa]</Dopolni>. Nato jih izbrišemo ali nepovratno anonimiziramo.
        </p>
        <p>
          <strong>Tekmovalni rezultati ostanejo.</strong> Uvrstitve, izidi in zapisniki
          tekem so del zgodovine tekmovanj in se hranijo trajno; pri njih ostane zapisano
          ime, s katerim ste nastopili, brez ostalih osebnih podatkov.
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
