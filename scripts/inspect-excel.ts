import { readFileSync } from "node:fs";
import { parseExcel } from "../src/lib/importer";
const path = process.argv[2];
if (!path) throw Error("Uso: npm run inspect:excel -- caminho/arquivo.xls");
console.log(
  JSON.stringify(parseExcel(readFileSync(path), path).preview, null, 2),
);
