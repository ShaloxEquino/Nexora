import { PLANS, computeExpiresAt, isLicenseValid } from '@nexora/shared/plans';
import type { Plan } from '@nexora/shared/types';

export { PLANS, computeExpiresAt, isLicenseValid };

/** Returns the set of features available for a given plan. */
export function featuresForPlan(plan: Plan): Set<string> {
  const base = new Set(['devtools', 'privacy', 'productivity']);
  if (plan === 'TRIAL') {
    return base;
  }
  return new Set([...base, 'ai', 'advanced_privacy', 'sync']);
}

/** Check if a feature is allowed for a plan. */
export function isFeatureAllowed(plan: Plan, feature: string): boolean {
  return featuresForPlan(plan).has(feature);
}
