'use strict';
/**
 * Lite version - maximum speed (~20% faster than full)
 *
 * Handles common patterns:
 * - Headings:      # Heading {.class}
 * - Paragraphs:    text {.class #id}
 * - Code fences:   ```lang {.class}
 * - Inline:        *em*{.class}, `code`{.class}, ![](img){.class}
 *
 * Does not handle:
 * - Table attrs
 * - List item attrs
 * - Softbreak attrs
 *
 * Use require('markdown-it-attrs2') for full compatibility.
 */
module.exports = require('./optimized-attrs-lite');
