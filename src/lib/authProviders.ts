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
