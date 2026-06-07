// Import območni ligaši into Supabase
// Run: node scripts/import-clubs-obmocni.cjs

const SUPABASE_URL = 'https://jzpzigjljwufdnqcjtjb.supabase.co'
const SERVICE_ROLE_KEY = 'sb_secret_4-_wy19_YzslkrjQZb6VbA_PJ_lDDKp'

const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function extractCity(address) {
  if (!address) return null
  const match = address.match(/\d{4}\s+(.+)$/)
  return match ? match[1].trim().replace(/,$/, '').trim() : null
}

const clubs = [
  {
    name: 'HUBELJ',
    address: 'Bevkova 11, 5270 Ajdovščina',
    contact_name: 'Igor Vidic',
    contact_email: 'igor.vidic213@gmail.com',
    contact_phone: '040 615 611',
  },
  {
    name: 'KANAL',
    address: 'p.p. 32, 5213 Kanal',
    contact_name: 'Peter Mihalič',
    contact_email: 'peter.mihalic@gmail.com',
    contact_phone: '041 515 750',
  },
  {
    name: 'PODSKALA',
    address: 'Goriška cesta 15, 5271 Vipava',
    contact_name: 'Jožko Petrič',
    contact_email: 'jozko.petric@gmail.com',
    contact_phone: '051 306 703',
  },
  {
    name: 'RENČE',
    address: 'Trg 59, 5292 Renče',
    contact_name: 'Davorin Arčon',
    contact_email: 'andraz.sulic@siol.net',
    contact_phone: '040 381 365',
  },
  {
    name: 'DU ŠEMPETER',
    address: 'Vrtojbenska 32, 5290 Šempeter',
    contact_name: 'Fausto Čučat',
    contact_email: 'du.sempeter@gmail.com',
    contact_phone: '040 979 431',
  },
  {
    name: 'DESKLE',
    address: 'Srebrničeva ulica 18, 5210 Deskle',
    contact_name: 'Marjan Schilling',
    contact_email: 'schillingmarjan@gmail.com',
    contact_phone: '041 281 283',
  },
  {
    name: 'GORICA',
    address: 'Kidričeva ulica 30, 5000 Nova Gorica',
    contact_name: 'Iztok Čeperli',
    contact_email: 'iztokceperli@gmail.com',
    contact_phone: '041 810 358',
  },
  {
    name: 'KRAS',
    address: 'Opatje selo 25c, 5291 Miren',
    contact_name: 'Matjaž Marušič',
    contact_email: 'mat.marusic@gmail.com',
    contact_phone: '051 478 106',
  },
  {
    name: 'OREHOVLJE',
    address: 'Orehovlje 41, 5291 Miren',
    contact_name: 'Aleš Klančič',
    contact_email: 'brankatribuson1@gmail.com',
    contact_phone: '031 828 574',
  },
  {
    name: 'ROMBON',
    address: 'Brdo 42, 5230 Bovec',
    contact_name: 'Klavdij Berginc',
    contact_email: 'bkrombon@gmail.com',
    contact_phone: '051 664 949',
  },
  {
    name: 'SLATNA',
    address: 'Grgar 69, 5251 Grgar',
    contact_name: 'Jožef Čubej',
    contact_email: 'jozef.cubej@gmail.com',
    contact_phone: '031 458 973',
  },
  {
    name: 'SOČA',
    address: 'Most na Soči 60/a, 5216 Most na Soči',
    contact_name: 'Gabrijel Živec',
    contact_email: 'iwm@siol.net',
    contact_phone: '031 333 085',
  },
]

async function main() {
  console.log(`Uvažam ${clubs.length} območnih klubov...\n`)

  let inserted = 0, skipped = 0, errors = 0

  for (const club of clubs) {
    const city = extractCity(club.address)

    const { data: existing } = await supabase
      .from('clubs')
      .select('id')
      .ilike('name', club.name)
      .maybeSingle()

    if (existing) {
      console.log(`  Preskočen (že obstaja): ${club.name}`)
      skipped++
      continue
    }

    const { error } = await supabase.from('clubs').insert({
      name: club.name,
      city,
      contact_name: club.contact_name,
      contact_email: club.contact_email,
      contact_phone: club.contact_phone,
    })

    if (error) {
      console.error(`  ❌ Napaka (${club.name}): ${error.message}`)
      errors++
    } else {
      console.log(`  ✓ ${club.name} — ${city}`)
      inserted++
    }
  }

  console.log(`\nZaključeno: Uvoženih ${inserted}, Preskočenih ${skipped}, Napak ${errors}`)
}

main().catch(console.error)
