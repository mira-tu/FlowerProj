import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('FATAL: Supabase URL or Anon Key is missing in environment variables. Check .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

