/**
 * Reading a stored value through a rename.
 *
 * The keys were named after the project when it was called Run Story. Renaming
 * them outright would silently discard whatever a reader had already chosen —
 * their maximum heart rate, whether they had opted into the weather lookup,
 * whether they had seen the tour — because a missing key is indistinguishable
 * from a first visit. So a read falls back to the old key, and the next write
 * lands under the new one, which retires the old name without anybody noticing
 * it was ever there.
 */

/** The value under `key`, or under `legacyKey` if the rename has not caught up. */
export function readStored(key: string, legacyKey: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
  } catch {
    // Storage can be disabled outright, which is a preference rather than a
    // fault: the app works without it and simply forgets between visits.
    return null;
  }
}
