'use strict';
/**
 * Full version - 100% compatible with markdown-it-attrs
 *
 * Handles ALL patterns:
 * - Heading attrs:     # Heading {.class}
 * - Paragraph attrs:   text {.class #id}
 * - Code fence attrs:  ```lang {.class}
 * - Inline attrs:      *em*{.class}, `code`{.class}, ![](img){.class}
 * - Table attrs:       | table |\n{.class}
 * - List item attrs:   - item {.class}
 * - Softbreak attrs:   text\n{.class}
 *
 * Performance: 3-7x faster than original
 */
module.exports = require('./optimized-attrs-v4');
