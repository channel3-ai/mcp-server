// Validate a captured search payload against the output schemas: npx tsx scripts/validate-schemas.ts <payload.json>
import { readFileSync } from "node:fs";
import { SearchProductsResultSchema } from "../src/schemas";

const payload = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const result = SearchProductsResultSchema.safeParse(payload);

if (!result.success) {
	console.error("VALIDATION FAILED");
	console.error(JSON.stringify(result.error.issues.slice(0, 10), null, 2));
	process.exit(1);
}

console.log(`VALIDATION PASSED: ${result.data.products.length} products conform`);
