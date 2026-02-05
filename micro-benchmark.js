'use strict';
/**
 * Micro-benchmark measuring ONLY the attrs processing time
 * Excludes markdown-it tokenization overhead
 */

const MarkdownIt = require('markdown-it');
const originalAttrs = require('markdown-it-attrs');
const optimizedAttrsV3 = require('./optimized-attrs-v3.js');

// Generate test document
function generateDoc(lines) {
  const blocks = [];
  for (let i = 0; i < lines; i++) {
    if (i % 10 === 0) {
      blocks.push(`This is paragraph ${i} with attributes {.class-${i} #id-${i}}`);
    } else if (i % 5 === 0) {
      blocks.push(`## Heading ${i}`);
    } else {
      blocks.push(`Regular paragraph ${i} with content.`);
    }
    blocks.push('');
  }
  return blocks.join('\n');
}

function benchmark(name, fn, iterations = 50) {
  // Warmup
  for (let i = 0; i < 5; i++) fn();

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1e6);
  }

  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

// Test different document sizes
const sizes = [100, 500, 1000, 2000];

console.log('='.repeat(70));
console.log('Micro-benchmark: Attrs Processing Time Only');
console.log('='.repeat(70));
console.log();

for (const size of sizes) {
  const doc = generateDoc(size);

  // Pre-parse the document (measure parsing once)
  const md = new MarkdownIt();
  const tokens = md.parse(doc, {});
  const tokenCount = tokens.length;

  // Clone tokens for each test (to reset state)
  function cloneState() {
    const state = {
      tokens: JSON.parse(JSON.stringify(tokens))
    };
    // Restore token methods
    state.tokens.forEach(t => {
      t.attrJoin = function(k, v) {
        const idx = this.attrIndex(k);
        if (idx < 0) {
          this.attrPush([k, v]);
        } else {
          this.attrs[idx][1] += ' ' + v;
        }
      };
      t.attrPush = function(pair) {
        if (!this.attrs) this.attrs = [];
        this.attrs.push(pair);
      };
      t.attrIndex = function(k) {
        if (!this.attrs) return -1;
        for (let i = 0; i < this.attrs.length; i++) {
          if (this.attrs[i][0] === k) return i;
        }
        return -1;
      };
      if (t.children) {
        t.children.forEach(c => {
          c.attrJoin = t.attrJoin;
          c.attrPush = t.attrPush;
          c.attrIndex = t.attrIndex;
        });
      }
    });
    return state;
  }

  // Original: measure core plugin function
  const mdOrig = new MarkdownIt().use(originalAttrs);
  const origPlugin = mdOrig.core.ruler.__rules__.find(r => r.name === 'curly_attributes');
  const origFn = origPlugin.fn;

  const origTime = benchmark(`Original (${size})`, () => {
    const state = cloneState();
    origFn(state);
  });

  // Optimized v3: measure core plugin function
  const mdOpt = new MarkdownIt().use(optimizedAttrsV3);
  const optPlugin = mdOpt.core.ruler.__rules__.find(r => r.name === 'curly_attributes');
  const optFn = optPlugin.fn;

  const optTime = benchmark(`Optimized (${size})`, () => {
    const state = cloneState();
    optFn(state);
  });

  const speedup = origTime / optTime;

  console.log(`${size} lines (${tokenCount} tokens):`);
  console.log(`  Original:  ${origTime.toFixed(3)} ms`);
  console.log(`  Optimized: ${optTime.toFixed(3)} ms`);
  console.log(`  Speedup:   ${speedup.toFixed(1)}x`);
  console.log();
}

// Also measure with NO attrs (worst case for original)
console.log('─'.repeat(70));
console.log('Worst case: Document with NO attributes');
console.log('─'.repeat(70));
console.log();

const noAttrDoc = Array(500).fill('Regular paragraph with no special markers.').join('\n\n');
const md = new MarkdownIt();
const noAttrTokens = md.parse(noAttrDoc, {});

function cloneNoAttrState() {
  const state = { tokens: JSON.parse(JSON.stringify(noAttrTokens)) };
  state.tokens.forEach(t => {
    t.attrJoin = function() {};
    t.attrPush = function() {};
    t.attrIndex = function() { return -1; };
    if (t.children) {
      t.children.forEach(c => {
        c.attrJoin = t.attrJoin;
        c.attrPush = t.attrPush;
        c.attrIndex = t.attrIndex;
      });
    }
  });
  return state;
}

const mdOrig2 = new MarkdownIt().use(originalAttrs);
const origPlugin2 = mdOrig2.core.ruler.__rules__.find(r => r.name === 'curly_attributes');
const origFn2 = origPlugin2.fn;

const mdOpt2 = new MarkdownIt().use(optimizedAttrsV3);
const optPlugin2 = mdOpt2.core.ruler.__rules__.find(r => r.name === 'curly_attributes');
const optFn2 = optPlugin2.fn;

const origNoAttr = benchmark('Original no-attrs', () => {
  origFn2(cloneNoAttrState());
});

const optNoAttr = benchmark('Optimized no-attrs', () => {
  optFn2(cloneNoAttrState());
});

console.log(`500 paragraphs, ${noAttrTokens.length} tokens, NO attrs:`);
console.log(`  Original:  ${origNoAttr.toFixed(3)} ms`);
console.log(`  Optimized: ${optNoAttr.toFixed(3)} ms`);
console.log(`  Speedup:   ${(origNoAttr / optNoAttr).toFixed(1)}x`);
console.log();
console.log('(This is where early-exit optimization shines)');
