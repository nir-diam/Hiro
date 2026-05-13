/**
 * Strip region prefixes and split by separators to get candidate city names
 * (e.g. "אזור חיפה" → ["חיפה"], "תל אביב - יפו" → ["תל אביב", "יפו"]).
 * Kept in a dependency-free module so matchingScoreService can import it without
 * pulling cityService (avoids circular init where cityService.exports is still empty).
 * @param {string} locationStr
 * @returns {string[]}
 */
function getLocationSearchTerms(locationStr) {
  if (!locationStr || typeof locationStr !== 'string') return [];
  let s = locationStr.trim();
  if (!s) return [];

  const terms = new Set([s]);

  const prefixRegex = /^(אזור|מחוז|גוש|נפת|נפה)\s+/i;
  const afterPrefix = s.replace(prefixRegex, '').trim();
  if (afterPrefix && afterPrefix !== s) {
    terms.add(afterPrefix);
    s = afterPrefix;
  }

  const parts = s.split(/\s*[-–,—]\s*|,/).map((p) => p.trim()).filter(Boolean);
  parts.forEach((p) => terms.add(p));

  return Array.from(terms);
}

module.exports = { getLocationSearchTerms };
