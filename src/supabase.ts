import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Manjka VITE_SUPABASE_URL ali VITE_SUPABASE_ANON_KEY v .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
