'use strict';

function sortedUniqueIntersection(leftKeys, rightKeys) {
  const rightKeySet = new Set(rightKeys);
  return leftKeys.filter((key) => rightKeySet.has(key)).sort();
}

function sortedDifference(leftKeys, rightKeys) {
  const rightKeySet = new Set(rightKeys);
  return leftKeys.filter((key) => !rightKeySet.has(key)).sort();
}

function diffParsedFiles(base, target) {
  const sharedKeys = sortedUniqueIntersection(base.keys, target.keys);
  const missingInTarget = sortedDifference(base.keys, target.keys);
  const extraInTarget = sortedDifference(target.keys, base.keys);

  return {
    base: {
      path: base.path,
      keys_count: base.keys_count,
      duplicate_keys: base.duplicate_keys.slice(),
      empty_value_keys: base.empty_value_keys.slice(),
      malformed_lines_count: base.malformed_lines_count
    },
    target: {
      path: target.path,
      keys_count: target.keys_count,
      duplicate_keys: target.duplicate_keys.slice(),
      empty_value_keys: target.empty_value_keys.slice(),
      malformed_lines_count: target.malformed_lines_count
    },
    diff: {
      shared_keys: sharedKeys,
      missing_in_target: missingInTarget,
      extra_in_target: extraInTarget,
      same_key_count: sharedKeys.length,
      missing_in_target_count: missingInTarget.length,
      extra_in_target_count: extraInTarget.length
    },
    summary: {
      has_drift: missingInTarget.length > 0 || extraInTarget.length > 0,
      has_duplicates: base.duplicate_keys.length > 0 || target.duplicate_keys.length > 0,
      has_empty_values: base.empty_value_keys.length > 0 || target.empty_value_keys.length > 0,
      has_malformed_lines: base.malformed_lines_count > 0 || target.malformed_lines_count > 0
    }
  };
}

module.exports = {
  diffParsedFiles
};
