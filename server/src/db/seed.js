import { transaction } from './pool.js';
import { claims, datasets, narratives } from './seed-data.js';
import { rebuildAllLineage } from '../services/lineage.js';
import { invalidateCorpus } from '../services/corpus.js';

/** Load the demo datasets, narratives and claims, then reconstruct lineage. */
export async function seedDatabase() {
  const result = await transaction(async (db) => {
    const datasetIds = new Map();
    for (const d of datasets) {
      const { rows } = await db.query(
        `INSERT INTO datasets (slug, name, kind, description) VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [d.slug, d.name, d.kind, d.description],
      );
      datasetIds.set(d.slug, rows[0].id);
    }
    const narrativeIds = new Map();
    for (const n of narratives) {
      const { rows } = await db.query(
        `INSERT INTO narratives (title, summary, category, verdict, fact_check) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [n.title, n.summary, n.category, n.verdict, n.fact_check],
      );
      narrativeIds.set(n.key, rows[0].id);
    }
    await db.query(
      `INSERT INTO claims (narrative_id, dataset_id, text, author, region, reach, published_at)
       SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::text[], $5::text[], $6::int[], $7::timestamptz[])`,
      [
        claims.map((c) => narrativeIds.get(c.narrative)),
        claims.map((c) => datasetIds.get(c.dataset)),
        claims.map((c) => c.text),
        claims.map((c) => c.author),
        claims.map((c) => c.region),
        claims.map((c) => c.reach),
        claims.map((c) => c.published_at),
      ],
    );
    return rebuildAllLineage(db);
  });
  invalidateCorpus();
  return result;
}
