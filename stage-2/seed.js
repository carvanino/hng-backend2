/**
 * seed.js — Populate the profiles table from a JSON data file.
 *
 * Usage:
 *   npm run seed
 *
 * Place the provided JSON array at:  ./data/profiles.json
 *
 * Each element must have (at minimum):
 *   name, gender, gender_probability, age, age_group,
 *   country_id, country_name, country_probability
 *
 * Re-running the seed is safe: duplicates are silently skipped via
 * ON CONFLICT (name) DO NOTHING.
 */

import { readFile } from "fs/promises";
import { v7 as uuid } from "uuid";
import { query, initDB } from "./db.js";
import "dotenv/config";

const BATCH_SIZE = 100; // rows per INSERT statement

async function seed() {
  console.log("⟳  Initialising database schema…");
  await initDB();

  let raw;
  try {
    raw = await readFile("./data/profiles.json", "utf-8");
  } catch {
    console.error(
      "✗  Could not read ./data/profiles.json — place the seed file there and retry."
    );
    process.exit(1);
  }

  const profiles = JSON.parse(raw).profiles;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    console.error("✗  profiles.json must be a non-empty JSON array.");
    process.exit(1);
  }

  console.log(`⟳  Seeding ${profiles.length} profiles (batch size ${BATCH_SIZE})…`);

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);

    // Build a multi-row INSERT for the batch
    const valuePlaceholders = [];
    const flatValues = [];
    let idx = 1;

    for (const p of batch) {
      valuePlaceholders.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`
      );
      flatValues.push(
        uuid(),
        String(p.name).trim().toLowerCase(),
        p.gender,
        p.gender_probability,
        p.age,
        p.age_group,
        p.country_id,
        p.country_name,
        p.country_probability
      );
    }

    const sql = `
      INSERT INTO profiles
        (id, name, gender, gender_probability, age, age_group,
         country_id, country_name, country_probability)
      VALUES ${valuePlaceholders.join(", ")}
      ON CONFLICT (name) DO NOTHING
    `;

    const result = await query(sql, flatValues);
    inserted += result.rowCount;
    skipped += batch.length - result.rowCount;

    process.stdout.write(
      `\r  processed ${Math.min(i + BATCH_SIZE, profiles.length)} / ${profiles.length}`
    );
  }

  console.log(`\n✓  Done. Inserted: ${inserted}, Skipped (duplicate): ${skipped}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("✗  Seed failed:", err.message);
  process.exit(1);
});
