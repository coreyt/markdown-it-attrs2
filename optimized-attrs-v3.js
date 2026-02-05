'use strict';
/**
 * MAXIMUM PERFORMANCE markdown-it-attrs implementation v3
 *
 * Ultra-aggressive optimizations:
 * 1. Zero-allocation hot paths where possible
 * 2. Pre-computed lookup tables
 * 3. Minimal string operations
 * 4. Single regex for all attribute types
 * 5. Avoid all unnecessary function calls
 * 6. Direct property access everywhere
 */

module.exports = function maxPerfAttrs(md, options_) {
  const LEFT = options_?.leftDelimiter || '{';
  const RIGHT = options_?.rightDelimiter || '}';
  const LEFT_CODE = LEFT.charCodeAt(0);
  const RIGHT_CODE = RIGHT.charCodeAt(0);
  const LEFT_LEN = LEFT.length;
  const RIGHT_LEN = RIGHT.length;
  const MIN_LEN = LEFT_LEN + 2 + RIGHT_LEN;
  const allowedAttrs = options_?.allowedAttributes;

  // Single regex to extract ALL attributes at once
  // Matches: .class, ..css-module, #id, key=value, key="value", key='value'
  const ATTR_RE = /(?:\.\.([^\s#.={}]+))|(?:\.([^\s#.={}]+))|(?:#([^\s#.={}]+))|(?:([^\s#.={}]+)=(?:"([^"]*)"|'([^']*)'|([^\s}]*)))/g;

  // HR detection
  const HR_RE = /^[ ]{0,3}[-*_]{3,}[ ]?\{/;

  /**
   * FAST: Parse attributes using single compiled regex
   * Returns array or null (avoids allocations when no attrs)
   */
  function parseAttrs(content, start, end) {
    const str = content.substring(start + LEFT_LEN, end);
    if (!str) return null;

    let attrs = null;
    let match;
    ATTR_RE.lastIndex = 0;

    while ((match = ATTR_RE.exec(str)) !== null) {
      if (!attrs) attrs = [];
      if (match[1]) {
        // ..css-module
        attrs.push(['css-module', match[1]]);
      } else if (match[2]) {
        // .class
        attrs.push(['class', match[2]]);
      } else if (match[3]) {
        // #id
        attrs.push(['id', match[3]]);
      } else if (match[4]) {
        // key=value
        attrs.push([match[4], match[5] || match[6] || match[7] || '']);
      }
    }

    if (attrs && allowedAttrs?.length) {
      return attrs.filter(([k]) =>
        allowedAttrs.some(a => k === a || (a instanceof RegExp && a.test(k)))
      );
    }
    return attrs;
  }

  /**
   * FAST: Add attributes to token
   */
  function applyAttrs(attrs, token) {
    if (!attrs || !token) return;
    for (let i = 0, len = attrs.length; i < len; i++) {
      const k = attrs[i][0];
      const v = attrs[i][1];
      if (k === 'class' || k === 'css-module') {
        token.attrJoin(k, v);
      } else {
        token.attrPush(attrs[i]);
      }
    }
  }

  /**
   * FAST: Find opening token
   */
  function findOpen(tokens, idx) {
    const t = tokens[idx];
    if (t.nesting === 0) return t;
    if (t.type === 'softbreak') return null;

    const lvl = t.level;
    const openType = t.type.slice(0, -5) + 'open';
    while (--idx >= 0) {
      if (tokens[idx].type === openType && tokens[idx].level === lvl) {
        return tokens[idx];
      }
    }
    return null;
  }

  /**
   * FAST: Check and extract end attrs from string
   * Returns [attrs, newLen] or null
   */
  function checkEndAttrs(str) {
    const len = str.length;
    if (len < MIN_LEN) return null;

    // Find last {
    let start = len - 1;
    while (start >= 0 && str.charCodeAt(start) !== LEFT_CODE) start--;
    if (start < 0) return null;

    // Must end with }
    if (str.charCodeAt(len - RIGHT_LEN) !== RIGHT_CODE) return null;

    const attrs = parseAttrs(str, start, len - RIGHT_LEN);
    if (!attrs) return null;

    // Calculate new length (trim trailing space)
    let newLen = start;
    if (newLen > 0 && str.charCodeAt(newLen - 1) === 32) newLen--;

    return [attrs, newLen];
  }

  /**
   * FAST: Check and extract start attrs
   * Returns [attrs, remaining] or null
   */
  function checkStartAttrs(str) {
    if (!str || str.length < MIN_LEN) return null;
    if (str.charCodeAt(0) !== LEFT_CODE) return null;

    // Find closing }
    let end = LEFT_LEN;
    while (end < str.length && str.charCodeAt(end) !== RIGHT_CODE) end++;
    if (end >= str.length) return null;

    const attrs = parseAttrs(str, 0, end);
    if (!attrs) return null;

    return [attrs, str.substring(end + RIGHT_LEN)];
  }

  /**
   * Main processor
   */
  function process(state) {
    const tokens = state.tokens;
    const len = tokens.length;

    for (let i = 0; i < len; i++) {
      const token = tokens[i];
      const type = token.type;

      // ═══════════════════════════════════════════════════════════════════════
      // FENCE
      // ═══════════════════════════════════════════════════════════════════════
      if (type === 'fence') {
        const info = token.info;
        if (info && info.indexOf(LEFT) !== -1) {
          const r = checkEndAttrs(info);
          if (r) {
            applyAttrs(r[0], token);
            token.info = info.substring(0, r[1]);
          }
        }
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // TABLE_CLOSE - look ahead for {.attrs}
      // ═══════════════════════════════════════════════════════════════════════
      if (type === 'table_close' && i + 2 < len) {
        const t1 = tokens[i + 1];
        const t2 = tokens[i + 2];
        if (t1.type === 'paragraph_open' && t2.type === 'inline') {
          const c = t2.content;
          if (c && c.charCodeAt(0) === LEFT_CODE && c.charCodeAt(c.length - 1) === RIGHT_CODE) {
            const attrs = parseAttrs(c, 0, c.length - RIGHT_LEN);
            if (attrs) {
              applyAttrs(attrs, findOpen(tokens, i));
              t1.hidden = true;
              t2.hidden = true;
              if (i + 3 < len) tokens[i + 3].hidden = true;
            }
          }
        }
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // LIST_CLOSE - look ahead for {.attrs}
      // ═══════════════════════════════════════════════════════════════════════
      if ((type === 'bullet_list_close' || type === 'ordered_list_close') && i + 3 < len) {
        const t1 = tokens[i + 1];
        const t2 = tokens[i + 2];
        const t3 = tokens[i + 3];
        if (t1.type === 'paragraph_open' && t2.type === 'inline' && t3.type === 'paragraph_close') {
          const c = t2.content;
          if (c && c.charCodeAt(0) === LEFT_CODE && c.charCodeAt(c.length - 1) === RIGHT_CODE &&
              t2.children?.length === 1) {
            const attrs = parseAttrs(c, 0, c.length - RIGHT_LEN);
            if (attrs) {
              applyAttrs(attrs, findOpen(tokens, i));
              t1.hidden = true;
              t2.hidden = true;
              t3.hidden = true;
            }
          }
        }
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PARAGRAPH_OPEN - check for HR
      // ═══════════════════════════════════════════════════════════════════════
      if (type === 'paragraph_open' && i + 2 < len) {
        const t1 = tokens[i + 1];
        const t2 = tokens[i + 2];
        if (t1.type === 'inline' && t2.type === 'paragraph_close' && t1.children?.length === 1) {
          const c = t1.content;
          if (c && HR_RE.test(c)) {
            const r = checkEndAttrs(c);
            if (r) {
              token.type = 'hr';
              token.tag = 'hr';
              token.nesting = 0;
              token.markup = c;
              applyAttrs(r[0], token);
              t1.hidden = true;
              t2.hidden = true;
            }
          }
        }
        continue;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // INLINE - process children
      // ═══════════════════════════════════════════════════════════════════════
      if (type === 'inline') {
        const children = token.children;
        if (!children || !children.length) continue;

        // Quick check for delimiter
        let hasLeft = false;
        for (let j = 0; j < children.length; j++) {
          const c = children[j].content;
          if (c && c.indexOf(LEFT) !== -1) {
            hasLeft = true;
            break;
          }
        }
        if (!hasLeft) continue;

        // Process children (reverse for safe splice)
        for (let j = children.length - 1; j > 0; j--) {
          const child = children[j];
          if (child.type !== 'text' || !child.content) continue;

          const prev = children[j - 1];
          const c = child.content;

          // image/code_inline {.attrs}
          if ((prev.type === 'image' || prev.type === 'code_inline') && c.charCodeAt(0) === LEFT_CODE) {
            const r = checkStartAttrs(c);
            if (r) {
              applyAttrs(r[0], prev);
              if (r[1]) child.content = r[1];
              else children.splice(j, 1);
              continue;
            }
          }

          // closing tag {.attrs}
          if (prev.nesting === -1 && c.charCodeAt(0) === LEFT_CODE) {
            const r = checkStartAttrs(c);
            if (r) {
              const open = findOpen(children, j - 1);
              if (open) {
                applyAttrs(r[0], open);
                if (r[1]) child.content = r[1];
                else children.splice(j, 1);
                continue;
              }
            }
          }
        }

        // Softbreak pattern
        const clen = children.length;
        if (clen >= 2) {
          const last = children[clen - 1];
          const prev = children[clen - 2];
          if (prev.type === 'softbreak' && last.type === 'text') {
            const c = last.content;
            if (c && c.charCodeAt(0) === LEFT_CODE && c.charCodeAt(c.length - 1) === RIGHT_CODE) {
              const attrs = parseAttrs(c, 0, c.length - RIGHT_LEN);
              if (attrs) {
                // List softbreak
                if (i >= 2 && tokens[i - 2].type === 'list_item_open') {
                  let ii = i - 2;
                  while (ii > 0 && tokens[ii - 1].type !== 'ordered_list_open' &&
                         tokens[ii - 1].type !== 'bullet_list_open') ii--;
                  if (ii > 0) {
                    applyAttrs(attrs, tokens[ii - 1]);
                    children.length -= 2;
                    continue;
                  }
                }
                // General softbreak
                let ii = i + 1;
                while (ii + 1 < len && tokens[ii + 1].nesting === -1) ii++;
                const open = findOpen(tokens, ii);
                if (open) {
                  applyAttrs(attrs, open);
                  children.length -= 2;
                  continue;
                }
              }
            }
          }
        }

        // End of block pattern
        if (children.length > 0) {
          const last = children[children.length - 1];
          if (last.type === 'text' && last.content) {
            const c = last.content;
            if (c.indexOf(LEFT) !== -1) {
              const r = checkEndAttrs(c);
              if (r) {
                let ii = i + 1;
                while (ii < len && tokens[ii].nesting !== -1) ii++;
                if (ii < len) {
                  const open = findOpen(tokens, ii);
                  if (open) {
                    applyAttrs(r[0], open);
                    last.content = c.substring(0, r[1]);
                    continue;
                  }
                }
              }
            }
          }
        }

        // List item end pattern
        if (i >= 2 && tokens[i - 2].type === 'list_item_open' && children.length > 0) {
          const last = children[children.length - 1];
          if (last.type === 'text' && last.content) {
            const r = checkEndAttrs(last.content);
            if (r) {
              applyAttrs(r[0], tokens[i - 2]);
              last.content = last.content.substring(0, r[1]);
            }
          }
        }
      }
    }

    // Remove hidden tokens
    let w = 0;
    for (let r = 0; r < tokens.length; r++) {
      if (!tokens[r].hidden) tokens[w++] = tokens[r];
    }
    tokens.length = w;
  }

  md.core.ruler.before('linkify', 'curly_attributes', process);
};
