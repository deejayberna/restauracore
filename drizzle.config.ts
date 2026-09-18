import type { Config } from "drizzle-kit";
import { config } from "dotenv";

const envPath = process.env.DOTENV_CONFIG_PATH || ".env.local";
config({ path: envPath, override: true });

export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
