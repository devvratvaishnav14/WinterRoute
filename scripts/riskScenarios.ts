/**
 * Development-only CLI: runs every scenario in the V0 risk-model
 * scenario matrix (`src/lib/scoring/scenarios.ts`) through
 * `computeCommuteRisk` and prints the full result for manual inspection
 * — engineered features, factor scores/contributions, overall index,
 * label, prediction status, and data coverage.
 *
 * Not a user-facing dashboard, not part of the app build — run directly
 * with `npx tsx scripts/riskScenarios.ts` (or `npm run scenarios`).
 * Uses only synthetic fixtures (`lib/scoring/fixtures.ts`), never live
 * provider calls.
 */
import { computeCommuteRisk } from "@/lib/scoring/computeCommuteRisk";
import { RISK_SCENARIOS } from "@/lib/scoring/scenarios";

function formatFactor(score: number | undefined, status: string): string {
  return status === "scored" ? `${score}/100` : status;
}

for (const scenario of RISK_SCENARIOS) {
  const inputs = scenario.build();
  const risk = computeCommuteRisk(inputs);

  console.log(`\n=== [${scenario.category}] ${scenario.name} ===`);
  console.log(`  overallIndex: ${risk.overallIndex} (${risk.label}) — predictionStatus: ${risk.predictionStatus}`);
  if (risk.sufficiency.reasons.length > 0) {
    console.log(`  sufficiency reasons: ${risk.sufficiency.reasons.join("; ")}`);
  }
  console.log(
    `  factors: weather=${formatFactor(risk.factors.weather.score, risk.factors.weather.status)}` +
      ` traffic=${formatFactor(risk.factors.traffic.score, risk.factors.traffic.status)}` +
      ` transit=${formatFactor(risk.factors.transit.score, risk.factors.transit.status)}` +
      ` roadEvents=${formatFactor(risk.factors.roadEvents.score, risk.factors.roadEvents.status)}`,
  );
  console.log(`  dominantFactors: ${risk.dominantFactors.join(", ") || "(none)"}`);
  console.log(`  dataCoverage: ${JSON.stringify(risk.dataCoverage)}`);
  for (const sentence of risk.explanation) console.log(`  - ${sentence}`);
}

console.log(`\n${RISK_SCENARIOS.length} scenarios run.`);
