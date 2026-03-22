/**
 * Parse a URL hash string into an object.
 *
 * Format: #key1=value1&key2=value2
 * Values are JSON-parsed after URI-decoding.
 *
 * @param {string} hash - the hash string including the leading '#'
 * @returns {Object} parsed key-value pairs
 */
export function parseHash(hash) {
  hash = hash.slice(1);
  return hash
    .split("&")
    .map((s) => s.split("="))
    .filter((s) => s[0] !== "" && s[1] !== undefined)
    .reduce((pre, [key, value]) => {
      try {
        return {
          ...pre,
          [key]: JSON.parse(decodeURIComponent(value)),
        };
      } catch (e) {
        console.log(e, key, decodeURIComponent(value));
        return pre;
      }
    }, {});
}
