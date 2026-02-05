'use strict';
const MarkdownIt = require('markdown-it');
const orig = require('markdown-it-attrs');
const v4 = require('./optimized-attrs-v4.js');

// Test each pattern individually
const patterns = [
  ['fenced code', '```javascript {.highlight}\nconst x = 1;\n```'],
  ['inline code', 'Some text with `code()`{.inline-code} and more text.'],
  ['table', '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n{.table-class}'],
  ['list item', '- item 1\n- item 2 {.list-item}'],
  ['emphasis', 'Text with *emphasis*{.em} and **bold**{.strong} formatting.'],
  ['end of block', 'A paragraph with attributes at the end {.end-attrs data-value="10"}'],
  ['softbreak', 'Line one\n{.softbreak-class}'],
];

const mdOrig = new MarkdownIt().use(orig);
const mdV4 = new MarkdownIt().use(v4);

console.log('Pattern support test:\n');
patterns.forEach(([name, doc]) => {
  const origOut = mdOrig.render(doc);
  const v4Out = mdV4.render(doc);
  const match = origOut === v4Out;
  console.log(`${name}: ${match ? '✓' : '✗'}`);
  if (!match) {
    console.log('  Original:', origOut.replace(/\n/g, '\\n'));
    console.log('  V4:      ', v4Out.replace(/\n/g, '\\n'));
    console.log();
  }
});
