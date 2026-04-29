import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

export const query = (text, params) => pool.query(text, params);

export const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id                  UUID          PRIMARY KEY,
      name                VARCHAR       UNIQUE NOT NULL,
      gender              VARCHAR       NOT NULL,
      gender_probability  FLOAT         NOT NULL,
      age                 INT           NOT NULL,
      age_group           VARCHAR       NOT NULL,
      country_id          VARCHAR(2)    NOT NULL,
      country_name        VARCHAR       NOT NULL,
      country_probability FLOAT         NOT NULL,
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_gender              ON profiles(gender);
    CREATE INDEX IF NOT EXISTS idx_profiles_age_group           ON profiles(age_group);
    CREATE INDEX IF NOT EXISTS idx_profiles_country_id          ON profiles(country_id);
    CREATE INDEX IF NOT EXISTS idx_profiles_age                 ON profiles(age);
    CREATE INDEX IF NOT EXISTS idx_profiles_gender_probability  ON profiles(gender_probability);
    CREATE INDEX IF NOT EXISTS idx_profiles_country_probability ON profiles(country_probability);
    CREATE INDEX IF NOT EXISTS idx_profiles_created_at          ON profiles(created_at);
  `);
};

export default pool;
