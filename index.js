'use strict';
/**
 * markdown-it-attrs2 - Optimized attribute parsing for markdown-it
 *
 * Default export: Lite version (4-7x faster, handles common patterns)
 *
 * For full compatibility with all edge cases, use:
 *   const attrs = require('markdown-it-attrs2/full');
 *
 * Available variants:
 *   - require('markdown-it-attrs2')      - Lite (default, fastest)
 *   - require('markdown-it-attrs2/lite') - Same as default
 *   - require('markdown-it-attrs2/full') - Full compatibility (v3)
 */
module.exports = require('./optimized-attrs-lite');
