import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Anon Key is missing. Please ensure your .env file is correctly configured.');
  // In a production app, you might want to throw an error or handle this more gracefully.
}

export const supabase = createClient(supabaseUrl, supabaseKey);

