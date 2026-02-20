import type { ProviderInstance } from '../types/provider.js';

/**
 * Select an instance via weighted random from instances not in cooldown.
 * Returns null if no instances are available (all cooling down or empty list).
 */
export function selectInstance(
  instances: ProviderInstance[],
  now: Date,
): ProviderInstance | null {
  const available = instances.filter((inst) => {
    if (!inst.enabled) return false;
    if (!inst.cooldownUntil) return true;
    return new Date(inst.cooldownUntil) <= now;
  });

  if (available.length === 0) return null;
  return weightedRandom(available);
}

/**
 * Select an instance via weighted random, falling back to the soonest-expiring
 * cooldown instance if all are cooling down.
 * Returns null only if the list is empty or all disabled.
 */
export function selectInstanceOrSoonest(
  instances: ProviderInstance[],
  now: Date,
): ProviderInstance | null {
  const enabled = instances.filter((inst) => inst.enabled);
  if (enabled.length === 0) return null;

  const result = selectInstance(enabled, now);
  if (result) return result;

  // All cooling down — pick the one expiring soonest
  let soonest: ProviderInstance | null = null;
  let soonestTime = Infinity;

  for (const inst of enabled) {
    if (!inst.cooldownUntil) continue;
    const t = new Date(inst.cooldownUntil).getTime();
    if (t < soonestTime) {
      soonestTime = t;
      soonest = inst;
    }
  }

  return soonest;
}

function weightedRandom(instances: ProviderInstance[]): ProviderInstance {
  const totalWeight = instances.reduce((sum, inst) => sum + inst.weight, 0);
  let r = Math.random() * totalWeight;

  for (const inst of instances) {
    r -= inst.weight;
    if (r < 0) return inst;
  }

  // Fallback (should not happen)
  return instances[instances.length - 1];
}
