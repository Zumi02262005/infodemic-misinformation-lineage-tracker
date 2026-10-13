// Database maintenance commands.
//   node scripts/db.js setup    create the database if needed, apply the schema, load demo data if empty
//   node scripts/db.js reset    drop all tables and reload the demo data
//   node scripts/db.js rebuild  recompute lineage and similarity links for every claim
//   node scripts/db.js empty    drop all tables and recreate them with no data
import { config } from '../src/config.js';
import { applySchema, dropSchema, ensureDatabase, explainDbError, isEmpty } from '../src/db/bootstrap.js';
import { describeDatabaseUrl, pool } from '../src/db/pool.js';
import { seedDatabase } from '../src/db/seed.js';
import { rebuildAll } from '../src/services/lineage.js';

const command = process.argv[2] || 'setup';

async function main() {
  console.log(`Database: ${describeDatabaseUrl(config.databaseUrl)}`);
  const { created, name } = await ensureDatabase();
  if (created) console.log(`Created database "${name}".`);

  if (command === 'setup') {
    await applySchema();
    if (await isEmpty()) {
      const r = await seedDatabase();
      console.log(`Schema ready. Loaded demo data: ${r.claims} claims, ${r.narratives} narratives, ${r.links} similarity links.`);
    } else {
      console.log('Schema ready. The database already has claims, so the demo data was not loaded (use "npm run db:reset" to start over).');
    }
  } else if (command === 'reset') {
    await dropSchema();
    await applySchema();
    const r = await seedDatabase();
    console.log(`Database reset. Loaded demo data: ${r.claims} claims, ${r.narratives} narratives, ${r.links} similarity links.`);
  } else if (command === 'empty') {
    await dropSchema();
    await applySchema();
    console.log('Database emptied. All tables are recreated with no data.');
    if (config.autoSeed) {
      console.log('Note: AUTO_SEED is on, so the demo data will be loaded again the next time the server starts.');
      console.log('      Set AUTO_SEED=false in server/.env to keep the database empty.');
    }
  } else if (command === 'rebuild') {
    await applySchema();
    const r = await rebuildAll();
    console.log(`Rebuilt lineage for ${r.claims} claims in ${r.narratives} narratives (${r.links} similarity links) in ${r.ms} ms.`);
  } else {
    throw new Error(`Unknown command "${command}". Use setup, reset, empty or rebuild.`);
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    const { message, hint } = explainDbError(err);
    console.error(`\n${message}\n${hint}\n`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
