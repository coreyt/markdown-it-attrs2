'use strict';
/**
 * Benchmark comparing original markdown-it-attrs vs optimized implementation
 */

const MarkdownIt = require('markdown-it');
const originalAttrs = require('markdown-it-attrs');
const optimizedAttrs = require('./optimized-attrs.js');
const optimizedAttrsV2 = require('./optimized-attrs-v2.js');
const optimizedAttrsV3 = require('./optimized-attrs-v3.js');
const liteAttrs = require('./optimized-attrs-lite.js');
const puroceanAttrs = require('markdown-it-attributes').default; // purocean's "132x faster" impl

// Generate test documents of varying complexity
function generateSimpleDoc(lines) {
  const blocks = [];
  for (let i = 0; i < lines; i++) {
    if (i % 10 === 0) {
      // Every 10th line has attributes
      blocks.push(`This is paragraph ${i} with attributes {.class-${i} #id-${i}}`);
    } else if (i % 5 === 0) {
      blocks.push(`## Heading ${i}`);
    } else {
      blocks.push(`Regular paragraph ${i} with some content that doesn't have any special markers.`);
    }
    blocks.push('');
  }
  return blocks.join('\n');
}

function generateComplexDoc(lines) {
  const blocks = [];
  for (let i = 0; i < lines; i++) {
    const mod = i % 20;
    if (mod === 0) {
      // Fenced code block with attrs
      blocks.push('```javascript {.highlight}');
      blocks.push('const x = 1;');
      blocks.push('```');
    } else if (mod === 2) {
      // Inline code with attrs
      blocks.push(`Some text with \`code()\`{.inline-code} and more text.`);
    } else if (mod === 4) {
      // Table
      blocks.push('| A | B |');
      blocks.push('| --- | --- |');
      blocks.push('| 1 | 2 |');
      blocks.push('');
      blocks.push('{.table-class}');
    } else if (mod === 6) {
      // List with attrs
      blocks.push('- item 1');
      blocks.push('- item 2 {.list-item}');
      blocks.push('');
    } else if (mod === 8) {
      // Emphasis with attrs
      blocks.push(`Text with *emphasis*{.em} and **bold**{.strong} formatting.`);
    } else if (mod === 10) {
      // Block with end attrs
      blocks.push(`A paragraph with attributes at the end {.end-attrs data-value="${i}"}`);
    } else if (mod === 12) {
      // Softbreak with attrs
      blocks.push('Line one');
      blocks.push('{.softbreak-class}');
    } else {
      // Plain paragraph (majority of content)
      blocks.push(`Regular content on line ${i} without any special attribute syntax to parse.`);
    }
    blocks.push('');
  }
  return blocks.join('\n');
}

function benchmark(name, fn, iterations = 10) {
  // Warmup
  for (let i = 0; i < 3; i++) fn();

  // Collect times
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6); // ms
  }

  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = times[0];
  const max = times[times.length - 1];

  return { name, median, avg, min, max };
}

function runBenchmarks() {
  console.log('='.repeat(70));
  console.log('markdown-it-attrs Performance Benchmark');
  console.log('='.repeat(70));
  console.log();

  const testCases = [
    { name: 'Simple 100 lines', doc: generateSimpleDoc(100) },
    { name: 'Simple 500 lines', doc: generateSimpleDoc(500) },
    { name: 'Simple 1000 lines', doc: generateSimpleDoc(1000) },
    { name: 'Complex 100 lines', doc: generateComplexDoc(100) },
    { name: 'Complex 500 lines', doc: generateComplexDoc(500) },
    { name: 'Complex 1000 lines', doc: generateComplexDoc(1000) },
  ];

  for (const { name, doc } of testCases) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Test: ${name}`);
    console.log(`Document size: ${doc.length} chars, ${doc.split('\n').length} lines`);
    console.log('─'.repeat(70));

    // Original implementation
    const mdOriginal = new MarkdownIt().use(originalAttrs);
    const originalResult = benchmark('Original', () => mdOriginal.render(doc));

    // Optimized implementation v1
    const mdOptimized = new MarkdownIt().use(optimizedAttrs);
    const optimizedResult = benchmark('Optimized v1', () => mdOptimized.render(doc));

    // Optimized implementation v2
    const mdOptimizedV2 = new MarkdownIt().use(optimizedAttrsV2);
    const optimizedV2Result = benchmark('Optimized v2', () => mdOptimizedV2.render(doc));

    // Optimized implementation v3 (max perf)
    const mdOptimizedV3 = new MarkdownIt().use(optimizedAttrsV3);
    const optimizedV3Result = benchmark('Optimized v3', () => mdOptimizedV3.render(doc));

    // Lite version (common patterns only)
    const mdLite = new MarkdownIt().use(liteAttrs);
    const liteResult = benchmark('Lite', () => mdLite.render(doc));

    // Purocean's "132x faster" implementation
    const mdPurocean = new MarkdownIt().use(puroceanAttrs);
    const puroceanResult = benchmark('Purocean', () => mdPurocean.render(doc));

    // Verify outputs match (for correctness)
    const originalOutput = mdOriginal.render(doc);
    const v1Match = originalOutput === mdOptimized.render(doc);
    const v2Match = originalOutput === mdOptimizedV2.render(doc);
    const v3Match = originalOutput === mdOptimizedV3.render(doc);
    const liteMatch = originalOutput === mdLite.render(doc);
    const puroceanMatch = originalOutput === mdPurocean.render(doc);

    console.log(`\n  Original:     ${originalResult.median.toFixed(3)} ms (median)`);
    console.log(`  Optimized v1: ${optimizedResult.median.toFixed(3)} ms  ${(originalResult.median / optimizedResult.median).toFixed(1)}x  ${v1Match ? '✓' : '✗'}`);
    console.log(`  Optimized v2: ${optimizedV2Result.median.toFixed(3)} ms  ${(originalResult.median / optimizedV2Result.median).toFixed(1)}x  ${v2Match ? '✓' : '✗'}`);
    console.log(`  Optimized v3: ${optimizedV3Result.median.toFixed(3)} ms  ${(originalResult.median / optimizedV3Result.median).toFixed(1)}x  ${v3Match ? '✓' : '✗'}`);
    console.log(`  Lite:         ${liteResult.median.toFixed(3)} ms  ${(originalResult.median / liteResult.median).toFixed(1)}x  ${liteMatch ? '✓' : '✗ (common patterns only)'}`);
    console.log(`  Purocean:     ${puroceanResult.median.toFixed(3)} ms  ${(originalResult.median / puroceanResult.median).toFixed(1)}x  ${puroceanMatch ? '✓' : '✗'} (claimed 132x)`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Benchmark complete');
  console.log('='.repeat(70));
}

// Also test token counts to understand the O(n*p) impact
function analyzeTokens() {
  console.log('\n' + '='.repeat(70));
  console.log('Token Analysis');
  console.log('='.repeat(70));

  const md = new MarkdownIt();
  const testCases = [
    { name: 'Simple 100', doc: generateSimpleDoc(100) },
    { name: 'Simple 500', doc: generateSimpleDoc(500) },
    { name: 'Complex 100', doc: generateComplexDoc(100) },
    { name: 'Complex 500', doc: generateComplexDoc(500) },
  ];

  for (const { name, doc } of testCases) {
    const tokens = md.parse(doc, {});
    let childTokens = 0;
    for (const t of tokens) {
      if (t.children) childTokens += t.children.length;
    }

    const patterns = 12; // Number of patterns in original impl
    const patternChecks = tokens.length * patterns;
    const childChecks = childTokens * patterns;

    console.log(`\n${name}:`);
    console.log(`  Top-level tokens: ${tokens.length}`);
    console.log(`  Child tokens: ${childTokens}`);
    console.log(`  Pattern checks (O(n×p)): ${patternChecks.toLocaleString()}`);
    console.log(`  Potential child checks: ~${childChecks.toLocaleString()}`);
  }
}

runBenchmarks();
analyzeTokens();
