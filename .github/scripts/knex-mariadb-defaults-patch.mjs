// MariaDB ≥10.2.7 returns information_schema COLUMN_DEFAULT as a QUOTED SQL
// literal ('default') where MySQL returns the bare value (default). knex
// 2.4.2's mysql columnInfo() only normalizes the 'NULL' string, so
// setNullable()/dropNullable() — which rebuild a column from columnInfo —
// re-apply the quoted literal and corrupt the default (observed: a varchar
// default 'default' became «'»). This patches the installed knex to unquote
// MariaDB-style defaults. A real deployment would carry this as a pnpm
// patchedDependencies patch; in CI an in-place edit avoids lockfile churn.
import { globSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';

const candidates = globSync('node_modules/.pnpm/knex@*/node_modules/knex/lib/dialects/mysql/query/mysql-querycompiler.js');
if (candidates.length === 0) {
  console.error('knex mysql-querycompiler.js not found — did the layout change?');
  process.exit(1);
}

const ORIGINAL = "val.COLUMN_DEFAULT === 'NULL' ? null : val.COLUMN_DEFAULT,";
const PATCHED = "(val.COLUMN_DEFAULT === 'NULL' || val.COLUMN_DEFAULT == null) ? null : (typeof val.COLUMN_DEFAULT === 'string' && val.COLUMN_DEFAULT.length >= 2 && val.COLUMN_DEFAULT.startsWith(\"'\") && val.COLUMN_DEFAULT.endsWith(\"'\") ? val.COLUMN_DEFAULT.slice(1, -1).replace(/''/g, \"'\") : val.COLUMN_DEFAULT), /* mariadb-quoted-default fix */";

for (const file of candidates) {
  const src = readFileSync(file, 'utf8');
  if (src.includes('mariadb-quoted-default fix')) {
    console.log(`already patched: ${file}`);
    continue;
  }
  if (!src.includes(ORIGINAL)) {
    console.error(`expected columnInfo expression not found in ${file} — knex changed; update this patch.`);
    process.exit(1);
  }
  writeFileSync(file, src.replace(ORIGINAL, PATCHED));
  console.log(`patched: ${file}`);
}
