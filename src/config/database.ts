import { createClient } from '@libsql/client';
import 'dotenv/config';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
    throw new Error('TURSO_DATABASE_URL is not defined');
}

if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN is not defined');
}

export const db = createClient({
    url,
    authToken
});