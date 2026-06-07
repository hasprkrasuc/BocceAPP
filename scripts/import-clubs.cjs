// Import clubs into Supabase
// Run: node scripts/import-clubs.cjs

const SUPABASE_URL = 'https://jzpzigjljwufdnqcjtjb.supabase.co'
const SERVICE_ROLE_KEY = 'sb_secret_4-_wy19_YzslkrjQZb6VbA_PJ_lDDKp'

const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Helper: extract city from address "Street, PostalCode City"
function extractCity(address) {
  if (!address) return null
  const match = address.match(/\d{4}\s+(.+)$/)
  return match ? match[1].trim().replace(/,$/, '').trim() : null
}

// Helper: title case for name
function titleCase(str) {
  return str.trim().replace(/\s+/g, ' ')
}

// Raw club data — deduplicated by name
const rawClubs = [
  { name: 'HRAST',                          address: 'Kobjeglava 75, 6222 Štanjel',                contact_name: 'Marjan Grmek',        contact_email: 'gregor.rudez@gmail.com',         contact_phone: '041 585 523' },
  { name: 'TRATA',                          address: 'Hafnerjevo naselje 25, 4221 Škofja Loka',   contact_name: 'Bojan Buden',         contact_email: 'loka.turist@siol.net',           contact_phone: '031 604 820' },
  { name: 'SKALA SEŽANA',                   address: 'Prešernova ulica 34, 6250 Ilirska Bistrica',contact_name: 'Ervin Ozbič',         contact_email: 'ervin.ozbic@gmail.com',          contact_phone: '041 536 993' },
  { name: 'TERMOPLASTI PLAMA ILIRSKA BISTRICA', address: 'Bazoviška 24, 6250 Ilirska Bistrica',   contact_name: 'Silvo Boštjančič',    contact_email: 'tanja.silvo@gmail.com',          contact_phone: '031 575 348' },
  { name: 'VELENJE PREMOGOVNIK',            address: 'p.p. 52, 3320 Velenje',                    contact_name: 'Željko Voglar',       contact_email: 'voglar.zeljko@gmail.com',        contact_phone: '041 745 225' },
  { name: 'QAP POSTOJNA',                   address: 'Volaričeva 10, 6230 Postojna',              contact_name: 'Herman Zakrajšek',    contact_email: 'herman.zakrajsek@gov.si',        contact_phone: '031 334 353' },
  { name: 'ORLEK ORO MET PIVKA',            address: 'Petelinje 86a, 6257 Pivka',                 contact_name: 'Alojz Česnik',        contact_email: 'drago.stunf@gmail.com',          contact_phone: '041 354 327' },
  { name: 'ZABIČE KOZLEK',                  address: 'Zabiče 30e, 6250 Ilirska Bistrica',         contact_name: 'Ivan Ličan',          contact_email: 'zabicekozlek@gmail.com',         contact_phone: '040 520 077' },
  { name: 'PLANINA AJDOVŠČINA',             address: 'Planina 105, 5270 Ajdovščina',              contact_name: 'Patrik Faganel',      contact_email: 'bkplanina@gmail.com',            contact_phone: '040 295 045' },
  { name: 'BISTRICA PRI TRŽIČU',            address: 'Deteljica 8, 4290 Tržič',                  contact_name: 'Brane Hervol',        contact_email: 'hervol@siol.net',                contact_phone: '031 421 907' },
  { name: 'PLISKOVICA',                     address: 'Pliskovica 77a, 6221 Pliskovica',           contact_name: 'Pavel Žerjal',        contact_email: 'zerjal.ales@gmail.com',          contact_phone: '031 869 315' },
  { name: 'KOŠANA',                         address: 'Dolnja Košana 70, 6256 Košana',             contact_name: 'Jože Štradjot',       contact_email: 'kosanabalinarskiklub@gmail.com', contact_phone: '041 491 553' },
  { name: 'ČIRČE VAN DEN',                  address: 'Smledniška 146, 4000 Kranj',                contact_name: 'Aleksander Pezdevšek',contact_email: 'florjan.pezdevsek@gmail.com',    contact_phone: '031 346 929' },
  { name: 'LOKA 1000',                      address: 'Novi svet 13, 4220 Škofja Loka',            contact_name: 'Jurij Štancer',       contact_email: 'jurijstancer@gmail.com',         contact_phone: '051 220 938' },
  { name: 'JADRAN IZOLA',                   address: 'Dantejeva 18, 6310 Izola',                  contact_name: 'Barbara Blaževič',    contact_email: 'bsdjadranizola@gmail.com',       contact_phone: '040 187 775' },
  { name: 'TRŽIČ ORODJARSTVO KNIFIC',       address: 'Ravne 9, 4290 Tržič',                      contact_name: 'Dušan Kavčič',        contact_email: 'dusankavcic@gmail.com',          contact_phone: '040 256 606' },
  { name: 'GRADNA GIK',                     address: 'Obrov 55e, 6243 Obrov',                    contact_name: 'Zdenko Gustinčič',    contact_email: 'rado@gikobrov.si',               contact_phone: '041 788 176' },
  { name: 'MENGEŠ ROKOLL',                  address: 'Slovenska cesta 34, 1234 Mengeš',           contact_name: 'Jani Lucin',          contact_email: 'lucin.jani@gmail.com',           contact_phone: '068 692 420' },
  { name: 'KOLEKTOR IDRIJA',                address: 'Gregorčičeva 10, 5280 Idrija',              contact_name: 'Uroš Mrljak',         contact_email: 'bk.kolektor.idrija@gmail.com',   contact_phone: '041 475 296' },
  { name: 'GORIŠKA BRDA',                   address: 'Kozana 98, 5212 Dobrovo',                  contact_name: 'Zvezdan Prinčič',     contact_email: 'zvezdan.princic@gmail.com',      contact_phone: '041 754 669' },
  { name: 'GDP KRIM',                       address: 'Pot k ribniku 3, 1108 Ljubljana',           contact_name: 'Miha Sodec',          contact_email: 'bsk.krim@gmail.com',             contact_phone: '01 427 4579' },
  { name: 'POSTOJNA',                       address: 'Volaričeva ulica 10, 6230 Postojna',        contact_name: 'Herman Zakrajšek',    contact_email: 'herman.zakrajsek@gov.si',        contact_phone: '040 528 919' },
  { name: 'ŠIŠKA',                          address: 'Jezerska ulica 5, 1000 Ljubljana',          contact_name: 'Radiša Zivanović',    contact_email: 'bsd_siska@t-2.net',              contact_phone: '040 858 963' },
  { name: 'DESKLE',                         address: 'Srebrničeva ulica 18, 5210 Deskle',         contact_name: 'Marjan Scilling',     contact_email: 'ana.tiana@gmail.com',            contact_phone: '031 895 552' },
  { name: 'PODSKALA VIPAVA',                address: 'Goriška cesta 15, 5271 Vipava',             contact_name: 'Jožko Petrič',        contact_email: 'jozko.petric@gmail.com',         contact_phone: '051 306 703' },
  { name: 'PIVKA ORO MET',                  address: 'Petelinje 86a, 6257 Pivka',                 contact_name: 'Vojko Dujmovič',      contact_email: 'drago.stunf@gmail.com',          contact_phone: '041 354 327' },
  { name: 'BRUSTEAM IDRIJA',                address: 'Gregorčičeva 10, 5280 Idrija',              contact_name: 'Uroš Mrljak',         contact_email: 'bk.kolektor.idrija@gmail.com',   contact_phone: '041 438 255' },
  { name: 'SIVKE POSTOJNA',                 address: 'Volaričeva ulica 10, 6240 Postojna',        contact_name: 'Herman Zakrajšek',    contact_email: 'herman.zakrajsek@gov.si',        contact_phone: '040 528 919' },
  { name: 'KŠD PADNA',                      address: 'Padna 10, 6333 Sečovlje',                  contact_name: 'Aleš Grižon',         contact_email: 'laraviler@gmail.com',            contact_phone: '041 925 333' },
  { name: 'ANTENA PORTOROŽ',                address: 'Belokriška cesta 56/a, 6230 Portorož',     contact_name: 'Simon Možina',        contact_email: 'smozina@gmail.com',              contact_phone: '070 760 590' },
  { name: 'TRTA SVETI ANTON',               address: 'Vrtine 9, 6276 Pobegi',                    contact_name: 'Jožko Cepek',         contact_email: 'joze.cepak@gmail.com',           contact_phone: '031 721 167' },
  { name: 'KATARINA',                       address: 'Novokračine 19a, 6254 Jelšane',             contact_name: 'Roman Hostinger',     contact_email: 'roman.hostinger@gmail.com',      contact_phone: '031 674 176' },
  { name: 'KOŠANA 2',                       address: 'Neverke 27b, 6256 Košana',                 contact_name: 'Jože Štradjot',       contact_email: 'oton.morelj1@mail.com',          contact_phone: '051 424 485' },
  { name: 'TABOR OZELJAN',                  address: 'Ozeljan 29, 5261 Šempas',                  contact_name: 'Branko Košuta',       contact_email: 'branko.kosuta@siol.com',         contact_phone: '041 641 288' },
  { name: 'CERKNIŠKO JEZERO',               address: 'Cesta pod Tičnico 4, 1381 Rakek',          contact_name: 'Bojan Španić',        contact_email: 'balinarji.cerknica@gmail.com',   contact_phone: '040 297 269' },
  { name: 'CESTA',                          address: 'Cesta 94A, 5270 Ajdovščina',               contact_name: 'Aleksander Vodopivec',contact_email: 'balinarcesta@gmail.com',         contact_phone: '031 611 867' },
  { name: 'BEGUNJE',                        address: 'Begunje 46, 1382 Begunje pri Cerknici',    contact_name: 'Janez Klučar',        contact_email: 'bk.begunje@gmail.com',           contact_phone: '031 540 491' },
  { name: 'NANOS',                          address: 'Podgrič 1a, 5272 Podnanos',                contact_name: 'Bogdan Franetič',     contact_email: 'kovinarstvo.bogdan@siol.net',    contact_phone: '041 832 711' },
  { name: 'BREZA',                          address: 'Gaj 6, 8351 Straža',                       contact_name: 'Simon Bobnar',        contact_email: 'simon.bobnar@gmail.com',         contact_phone: '041 207 710' },
  { name: 'SODČEK',                         address: 'Trata IV/23, 1330 Kočevje',                contact_name: 'Janez Zule',          contact_email: 'janez.zule@telemach.net',        contact_phone: '040 795 353' },
  { name: 'HOČE',                           address: 'Šolska ulica 14, 2311 Hoče',               contact_name: 'Štefan Harič',        contact_email: 'stefan.haric1@gmail.com',        contact_phone: '040 277 651' },
  { name: 'SVOBODA',                        address: 'Gerbičeva 61, 1000 Ljubljana',              contact_name: 'Matjaž Prevc',        contact_email: 'maprevc@gmail.com',              contact_phone: '041 572 520' },
  { name: 'ROGOVILA',                       address: 'Prebačevo 28, 4000 Kranj',                 contact_name: 'Tone Vodnik',         contact_email: 'bkrogovila@gmail.com',           contact_phone: '041 523 602' },
  { name: 'KRŠKO',                          address: 'Aškerčeva 2, 8270 Krško',                  contact_name: 'Damjan Martinčič',    contact_email: 'prahmajster@gmail.com',          contact_phone: '041 445 077' },
  { name: 'BUDNIČAR',                       address: 'Količevo 53, 1230 Domžale',                contact_name: 'Stane Žavbi',         contact_email: 'budnicar@gmail.com',             contact_phone: '040 250 383' },
  { name: 'SODRAŽICA',                      address: 'Zavrti 10, 1317 Sodražica',                contact_name: 'Marko Matelič',       contact_email: 'tadej.kosmrlj@gmail.com',        contact_phone: '041 953 418' },
  { name: 'ZARJA',                          address: 'Linharteva 47, 1000 Ljubljana',             contact_name: 'Danilo Grilj',        contact_email: 'sd.zarja@gmail.com',             contact_phone: '041 465 785' },
  { name: 'TABOR IHAN',                     address: 'Študljanska 85, 1230 Domžale',             contact_name: 'Franc Rahne',         contact_email: 'rahne.france@gmail.com',         contact_phone: '051 217 996' },
]

async function main() {
  console.log(`Uvažam ${rawClubs.length} klubov...\n`)

  let inserted = 0, skipped = 0, errors = 0

  for (const club of rawClubs) {
    const city = extractCity(club.address)
    const name = titleCase(club.name)

    // Check if already exists
    const { data: existing } = await supabase
      .from('clubs')
      .select('id')
      .ilike('name', name)
      .maybeSingle()

    if (existing) {
      console.log(`  Preskočen (že obstaja): ${name}`)
      skipped++
      continue
    }

    const { error } = await supabase.from('clubs').insert({
      name,
      city,
      contact_name: club.contact_name,
      contact_email: club.contact_email.trim(),
      contact_phone: club.contact_phone,
    })

    if (error) {
      console.error(`  ❌ Napaka (${name}): ${error.message}`)
      errors++
    } else {
      console.log(`  ✓ ${name} — ${city}`)
      inserted++
    }
  }

  console.log(`\nZaključeno: Uvoženih ${inserted}, Preskočenih ${skipped}, Napak ${errors}`)
}

main().catch(console.error)
