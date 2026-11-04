// Applies pending database migrations.   npm run migrate
const config = require('../config');
const { open, migrate } = require('../db');

const db = open(config.databaseFile);
const applied = migrate(db, { log: (m) => console.log('[migrate]', m) });
console.log(applied.length ? `[migrate] done (${applied.length} applied)` : '[migrate] database is up to date');
console.log(`[migrate] database: ${config.databaseFile}`);
