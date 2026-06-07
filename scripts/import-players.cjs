// Uvoz igralcev iz Excel registracijskih list
// Zaženi: node scripts/import-players.js "pot/do/datoteke.xlsx"
//
// Potrebuješ service_role ključ iz Supabase → Settings → API

const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')

// ── NASTAVI TE VREDNOSTI ────────────────────────────────────────
const SUPABASE_URL = 'https://jzpzigjljwufdnqcjtjb.supabase.co'
const SERVICE_ROLE_KEY = 'sb_secret_4-_wy19_YzslkrjQZb6VbA_PJ_lDDKp'
const DEFAULT_PASSWORD = 'BocceApp2025!'
const EMAIL_DOMAIN = 'bocceapp.si'
// ───────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Odstrani šumnike in posebne znake
function normalizeStr(str) {
  return (str || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // odstrani diakritike
    .replace(/[čć]/g, 'c')
    .replace(/[šś]/g, 's')
    .replace(/[žź]/g, 'z')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '.')       // vse ostalo → pika
    .replace(/\.{2,}/g, '.')          // večkratne pike → ena
    .replace(/^\.+|\.+$/g, '')        // trim pike
}

// Pretvori Excel serijsko številko v datum (DD.MM.YYYY)
function excelDateToString(val) {
  if (!val) return null
  if (typeof val === 'string') {
    // Že string format — normaliziraj na DD.MM.YYYY
    const cleaned = val.trim()
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(cleaned)) return cleaned
    return cleaned
  }
  if (typeof val === 'number') {
    // Excel serial → JS Date
    const date = new Date(Math.round((val - 25569) * 86400 * 1000))
    const d = date.getUTCDate().toString().padStart(2, '0')
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
    const y = date.getUTCFullYear()
    return `${d}.${m}.${y}`
  }
  return null
}

// Preberi Excel in vrni seznam igralcev
function readExcel(filePath) {
  const wb = XLSX.readFile(filePath)
  const players = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

    // Poišči vrstico z glavo (vsebuje "Ime" in "Priimek")
    let headerIdx = -1
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.includes('Ime') && row.includes('Priimek')) {
        headerIdx = i
        break
      }
    }

    if (headerIdx === -1) {
      console.log(`  Sheet "${sheetName}": ni najdena glava — preskočeno`)
      continue
    }

    const header = rows[headerIdx]
    const colKlub    = header.indexOf('Klub')
    const colIme     = header.indexOf('Ime')
    const colPriimek = header.indexOf('Priimek')
    const colSportna = header.indexOf('Športna št.')
    const colSpol    = header.indexOf('Spol')
    const colDatum   = header.findIndex(h => h === 'Datum')

    // Podatki začnejo 2 vrstici po glavi (sub-header "neobvezno" itd.)
    for (let i = headerIdx + 2; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue

      const ime     = (row[colIme] || '').toString().trim()
      const priimek = (row[colPriimek] || '').toString().trim()

      if (!ime || !priimek) continue

      players.push({
        ime,
        priimek,
        klub:     (row[colKlub] || '').toString().trim(),
        sportna:  colSportna >= 0 ? (row[colSportna] || '').toString().trim() : '',
        spol:     colSpol >= 0 ? (row[colSpol] || '').toString().trim() : '',
        datum:    colDatum >= 0 ? excelDateToString(row[colDatum]) : null,
        sheet:    sheetName,
      })
    }
  }

  return players
}

// Generiraj unikatne emaile
function generateEmails(players) {
  const used = new Set()
  return players.map(p => {
    const base = `${normalizeStr(p.ime)}.${normalizeStr(p.priimek)}`
    let email = `${base}@${EMAIL_DOMAIN}`
    let counter = 2
    while (used.has(email)) {
      email = `${base}${counter}@${EMAIL_DOMAIN}`
      counter++
    }
    used.add(email)
    return { ...p, email }
  })
}

async function importPlayer(player) {
  const fullName = `${player.ime} ${player.priimek}`

  // Ustvari auth račun
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: player.email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (authError) {
    if (authError.message.includes('already been registered')) {
      return { status: 'obstaja', email: player.email }
    }
    return { status: 'napaka', email: player.email, error: authError.message }
  }

  const userId = authData.user.id

  // Posodobi profil z vsemi podatki (trigger že ustvari osnoven profil)
  const { error: updateError } = await supabase
    .from('users')
    .update({
      full_name:      fullName,
      club:           player.klub || null,
      license_number: player.sportna || null,
      date_of_birth:  player.datum || null,
      gender:         player.spol || null,
    })
    .eq('id', userId)

  if (updateError) {
    return { status: 'profil_napaka', email: player.email, error: updateError.message }
  }

  return { status: 'ok', email: player.email, ime: fullName }
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Uporaba: node scripts/import-players.js "pot/do/datoteke.xlsx"')
    process.exit(1)
  }

  if (SERVICE_ROLE_KEY === 'VSTAVI_SERVICE_ROLE_KLJUČ_TUKAJ') {
    console.error('NAPAKA: Vstavi service_role ključ v skripto (vrstica 13)')
    process.exit(1)
  }

  console.log(`\nBerem: ${path.basename(filePath)}`)
  const players = readExcel(filePath)
  console.log(`Najdenih ${players.length} igralcev\n`)

  const withEmails = generateEmails(players)

  // Prikaži pregled pred uvozom
  console.log('Pregled prvih 5:')
  withEmails.slice(0, 5).forEach(p =>
    console.log(`  ${p.ime} ${p.priimek} → ${p.email} | ${p.klub} | ${p.datum || '—'} | ${p.spol}`)
  )
  console.log()

  let ok = 0, obstaja = 0, napake = 0

  for (const player of withEmails) {
    const result = await importPlayer(player)
    if (result.status === 'ok') {
      console.log(`✓ ${result.ime} → ${result.email}`)
      ok++
    } else if (result.status === 'obstaja') {
      console.log(`~ ${result.email} (že obstaja)`)
      obstaja++
    } else {
      console.log(`✗ ${result.email}: ${result.error}`)
      napake++
    }
    // Kratka pavza da ne prekoračimo rate limita
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\n─────────────────────────────────`)
  console.log(`Uvoženih:    ${ok}`)
  console.log(`Že obstaja:  ${obstaja}`)
  console.log(`Napake:      ${napake}`)
  console.log(`─────────────────────────────────`)
  console.log(`Privzeto geslo: ${DEFAULT_PASSWORD}`)
}

main().catch(console.error)
