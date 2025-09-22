import "dotenv/config";

import path from "node:path";
import { defineConfig } from "prisma/config";

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: path.join("prisma", "schema"),
});
