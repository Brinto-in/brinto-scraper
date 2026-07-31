const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
    url: 'libsql://brinto-brinto2026.aws-ap-south-1.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODM1OTk4ODEsImlkIjoiMDE5ZjQ1YjctOWYwMS03NDY4LThlMTYtY2I2NzFjMDJhNGFkIiwia2lkIjoidmhrTzNxUFUtWUcweEdQWVVRZ2dBWUdxaW1yWF85QjRuTDI1RFVDUlF2OCIsInJpZCI6ImQzNjQ4ZDllLTJmM2UtNGVmYy04YThjLTJjY2RiYmUwOWMxYyJ9.PAJFizf1J05Kh5-ju810DiB5SdRY3tkaUpufaEy3lXRcU-AG5aXB9KowXAllqgUJW3WqFn64FdIvjEgd6AORDQ',
});

module.exports = { db };
