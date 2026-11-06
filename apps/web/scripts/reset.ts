import "./load-env";
import { client } from "../src/server/db/connection";

const tables = ["attendance", "verifications", "humans", "events", "hosts", "venues", "cities"];

async function main() {
  await client.execute("PRAGMA foreign_keys = OFF");
  for (const table of tables) await client.execute(`DROP TABLE IF EXISTS ${table}`);
  await client.execute("PRAGMA foreign_keys = ON");
  console.log(`Dropped ${tables.length} tables.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.close());
