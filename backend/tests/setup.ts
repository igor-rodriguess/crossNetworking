import { beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import type { PoolClient } from "pg";
import { pool, __setTestClient } from "../src/shared/db";

// Harness de rollback por teste: um único client mantém uma transação externa;
// cada teste roda dentro dela e sofre ROLLBACK ao final — nada é persistido.
let client: PoolClient;

beforeAll(async () => {
  client = await pool.connect();
  __setTestClient(client);
});

beforeEach(async () => {
  await client.query("BEGIN");
});

afterEach(async () => {
  await client.query("ROLLBACK");
});

afterAll(async () => {
  __setTestClient(null);
  client.release();
  await pool.end();
});
