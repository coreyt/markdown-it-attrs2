'use strict';
const MarkdownIt = require('markdown-it');
const v3 = require('./optimized-attrs-v3.js');
const v4 = require('./optimized-attrs-v4.js');
const lite = require('./optimized-attrs-lite.js');
const orig = require('markdown-it-attrs');

const doc = `
# Heading {.heading-class}

Paragraph {.para-class #para-id}

- list item {.item-class}

\`\`\`js {.code-class}
code
\`\`\`

*emphasis*{.em-class}

| A | B |
|---|---|
| 1 | 2 |

{.table-class}
`;

const mdOrig = new MarkdownIt().use(orig);
const mdV3 = new MarkdownIt().use(v3);
const mdV4 = new MarkdownIt().use(v4);
const mdLite = new MarkdownIt().use(lite);

const origOut = mdOrig.render(doc);
const v3Out = mdV3.render(doc);
const v4Out = mdV4.render(doc);
const liteOut = mdLite.render(doc);

console.log('Feature support test:');
console.log('  V3 matches original:', origOut === v3Out ? '✓' : '✗');
console.log('  V4 matches original:', origOut === v4Out ? '✓' : '✗');
console.log('  Lite matches original:', origOut === liteOut ? '✓' : '✗');

console.log('\nOriginal output:');
console.log(origOut);

if (origOut !== v4Out) {
  console.log('\nV4 output (if different):');
  console.log(v4Out);
}

if (origOut !== liteOut) {
  console.log('\nLite output (if different):');
  console.log(liteOut);
}
