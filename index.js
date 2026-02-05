'use strict';
/**
 * markdown-it-attrs2 - Optimized attribute parsing for markdown-it
 *
 * 100% compatible with markdown-it-attrs, 3-7x faster.
 *
 * Usage:
 *   const md = require('markdown-it')();
 *   const attrs = require('markdown-it-attrs2');
 *   md.use(attrs);
 *
 * For the fastest option (common patterns only), use:
 *   const attrs = require('markdown-it-attrs2/lite');
 */
module.exports = require('./optimized-attrs-v4');
