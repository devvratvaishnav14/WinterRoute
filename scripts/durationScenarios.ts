/**
 * Development-only CLI: runs every scenario in the V0 duration-model
 * scenario matrix (`src/lib/duration/scenarios.ts`) through
 * `computeExpectedDuration` and prints the full result for manual
 * inspection. Run with `npx tsx scripts/durationScenarios.ts` (or
 * `npm run duration-scenarios`). Synthetic fixtures only, never live
 * provider calls.
 */
import { computeExpectedDuration } from "@/lib/duration/computeExpectedDuration";
import { formatAdditionalTime, formatDurationRange } from "@/lib/duration/format";
import { DURATION_SCENARIOS } from "@/lib/duration/scenarios";

for (const scenario of DURATION_SCENARIOS) {
  const result = computeExpectedDuration(scenario.build());

  console.log(`\n=== [${scenario.category}] ${scenario.name} ===`);
  console.log(`  baseline: ${result.baselineDurationMinutes.toFixed(0)} min | status: ${result.predictionStatus}`);
  console.log(`  expected: ${formatDurationRange(result.lowerBoundMinutes, result.upperBoundMinutes)}`);
  console.log(`  additional: ${formatAdditionalTime(result.baselineDurationMinutes, result.lowerBoundMinutes, result.upperBoundMinutes)}`);
  console.log(`  directlyObservedDelay: ${result.directlyObservedDelayMinutes.toFixed(1)} min | timingBasis: ${result.timingBasis}`);
  if (result.statusReasons.length > 0) console.log(`  statusReasons: ${result.statusReasons.join("; ")}`);
  for (const contribution of result.contributingDelayFactors) {
    console.log(`  - ${contribution.label}: central ${contribution.centralMinutes.toFixed(1)}, range [${contribution.lowerMinutes.toFixed(1)}, ${contribution.upperMinutes.toFixed(1)}] (${contribution.provenance})`);
  }
  for (const sentence of result.explanation) console.log(`  * ${sentence}`);
}

console.log(`\n${DURATION_SCENARIOS.length} scenarios run.`);
