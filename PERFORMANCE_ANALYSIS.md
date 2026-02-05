# Performance Analysis: markdown-it-attrs

## Summary

**YES, significant performance improvement is achievable: 2.5x to 4x faster.**

This analysis examines the [markdown-it-attrs](https://github.com/arve0/markdown-it-attrs) library and demonstrates that architectural optimizations can yield substantial performance gains.

## Benchmark Results

| Test Case | Original | Optimized | Speedup |
|-----------|----------|-----------|---------|
| Simple 100 lines | 2.65 ms | 0.70 ms | **3.78x** |
| Simple 500 lines | 4.42 ms | 1.57 ms | **2.82x** |
| Simple 1000 lines | 7.87 ms | 2.44 ms | **3.23x** |
| Complex 100 lines | 2.19 ms | 0.90 ms | **2.45x** |
| Complex 500 lines | 6.73 ms | 2.45 ms | **2.75x** |
| Complex 1000 lines | 11.84 ms | 3.49 ms | **3.39x** |

## Key Bottlenecks Identified

### 1. O(n × p) Pattern Matching (HIGH IMPACT)

The current implementation tests every token against all 12 patterns:

```javascript
// index.js:77-100
for (let i = 0; i < tokens.length; i++) {
  for (let p = 0; p < patterns.length; p++) {
    const pattern = patterns[p];
    const match = pattern.tests.every(t => {
      const res = test(tokens, i, t);
      // ...
    });
  }
}
```

**Problem**: A 1000-line document generates ~1500 tokens × 12 patterns = **18,000+ pattern checks**.

**Solution**: Token-type dispatch table - only check relevant patterns per token type.

### 2. No Early Exit for Non-Attribute Tokens (HIGH IMPACT)

~80% of tokens in typical documents don't contain `{` delimiters, yet they're still checked against all 12 patterns.

**Solution**: Quick `string.includes('{')` check before any pattern matching.

### 3. Dynamic Property Iteration in `test()` (MEDIUM IMPACT)

```javascript
// index.js:114-197
for (const key of Object.keys(t)) {
  if (key === 'children' && isArrayOfObjects(t.children)) {
    // Recursive validation with Array.every()
    match = childTests.every(tt => test(children, j, tt).match);
  }
  switch (typeof t[key]) {  // Runtime type checking
    case 'function': if (!t[key](token[key])) { return res; }
  }
}
```

**Problem**: Uses `Object.keys()` iteration, repeated `Array.every()` calls, and runtime type dispatch.

**Solution**: Direct property access with specialized test functions.

### 4. `hasDelimiters()` Closure Creation (MEDIUM IMPACT)

```javascript
// utils.js:154-218
exports.hasDelimiters = function (where, options) {
  return function (str) {
    // Creates a new closure for each pattern
    // Multiple slice(), indexOf(), lastIndexOf() operations
  };
};
```

**Problem**: Creates closure functions during initialization; performs repeated string operations.

**Solution**: Inline delimiter checks with early returns.

### 5. Character-by-Character Parsing (LOW IMPACT)

```javascript
// utils.js:15-120 - getAttrs()
for (let i = start + options.leftDelimiter.length; i < str.length; i++) {
  if (parsingKey && char_.search(allowedKeyChars) === -1) {
    continue;
  }
}
```

**Problem**: Regex test on every character during key parsing.

**Solution**: Use `charCodeAt()` comparisons instead of regex.

## Token Analysis

| Document | Top-level Tokens | Child Tokens | Pattern Checks (Original) |
|----------|-----------------|--------------|---------------------------|
| Simple 100 | 300 | 100 | 3,600 |
| Simple 500 | 1,500 | 500 | 18,000 |
| Complex 100 | 445 | 180 | 5,340 |
| Complex 500 | 2,225 | 900 | 26,700 |

## Optimization Strategies Implemented

### 1. Token-Type Dispatch

Instead of checking all 12 patterns for every token:

```javascript
// Optimized: Only check relevant patterns per token type
if (type === 'fence' && token.info && token.info.includes('{')) {
  // Only check fenced code block pattern
}
if (type === 'table_close') {
  // Only check table patterns
}
if (type === 'inline') {
  // Only check inline patterns
}
```

### 2. Early Delimiter Check

```javascript
// Skip tokens without delimiters (biggest win)
let hasAnyDelimiter = false;
for (const child of children) {
  if (child.content && child.content.includes('{')) {
    hasAnyDelimiter = true;
    break;
  }
}
if (!hasAnyDelimiter) return;  // Skip 80%+ of tokens
```

### 3. Direct String Operations

```javascript
// Instead of creating closure functions:
function hasDelimiterEnd(str) {
  if (!str || str.length < MIN_CURLY_LEN) return false;
  const start = str.lastIndexOf('{');
  if (start === -1) return false;
  // ...direct checks
}
```

### 4. CharCode Comparisons

```javascript
// Instead of regex per character:
const c = str.charCodeAt(i);
if (c === 61 && parsingKey) {  // '='
  parsingKey = false;
  continue;
}
```

## Recommendations

### Option A: Full Rewrite (High effort, 3-4x improvement)
- Rewrite with single-pass architecture
- Token-type dispatch table
- Pre-compiled patterns
- All edge cases handled

### Option B: "Lite" Version (Medium effort, 2-3x improvement)
- Focus on common patterns: `{.class}`, `{#id}`, `{key=value}`
- Skip complex table colspan/rowspan handling
- Simpler to maintain

### Option C: Targeted Fixes (Low effort, 1.5-2x improvement)
- Add early delimiter check to existing code
- Cache `hasDelimiters()` closures
- Minimal code changes

## Existing Alternatives

The [purocean/markdown-it-attributes](https://github.com/purocean/markdown-it-attributes) TypeScript implementation claims **132x faster** performance, demonstrating that even greater improvements are possible with a full architectural redesign.

## Conclusion

**Performance can be significantly improved (2.5-4x) through:**
1. Token-type dispatch (reduces pattern checks from O(n×p) to O(n))
2. Early delimiter detection (skips 80%+ of tokens)
3. Direct property access (eliminates `Object.keys()` overhead)
4. Avoiding closure creation in hot paths

The prototype implementation in this repository demonstrates these gains are achievable while maintaining functional correctness.

## Files

- `benchmark.js` - Performance benchmark suite
- `optimized-attrs.js` - Optimized implementation prototype
