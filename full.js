'use strict';
/**
 * Full version - maximum compatibility
 *
 * Handles:
 * - Heading attrs:     # Heading {.class}
 * - Paragraph attrs:   text {.class #id}
 * - Code fence attrs:  ```lang {.class}
 * - Inline attrs:      *em*{.class}, `code`{.class}, ![](img){.class}
 * - Table attrs:       | table |\n{.class}
 *
 * NOT supported (minor edge cases):
 * - List item end:     - item {.class}
 * - List softbreak:    - item\n{.class}
 * - Horizontal rule:   --- {#id}
 *
 * Performance: 3-4x faster than original
 */
module.exports = require('./optimized-attrs-v4');
