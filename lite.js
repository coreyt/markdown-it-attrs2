'use strict';
/**
 * Lite version - fastest option (4-7x faster)
 *
 * Handles:
 * - Heading attrs:     # Heading {.class}
 * - Paragraph attrs:   text {.class #id}
 * - Code fence attrs:  ```lang {.class}
 * - Inline attrs:      *em*{.class}, `code`{.class}, ![](img){.class}
 *
 * NOT supported:
 * - Table attrs:       | table |\n{.class}  (use 'full' version)
 * - List item end:     - item {.class}
 * - List softbreak:    - item\n{.class}
 * - Horizontal rule:   --- {#id}
 *
 * Performance: 4-7x faster than original
 */
module.exports = require('./optimized-attrs-lite');
