import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url) {
    throw new Error('SUPABASE_URL is not defined');
}

if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is not defined');
}

export const db = createClient(url, secretKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});