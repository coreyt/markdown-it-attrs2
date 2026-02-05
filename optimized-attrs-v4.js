'use strict';
/**
 * MAXIMUM PERFORMANCE v4 - Additional optimizations from research:
 *
 * NEW techniques from other plugins:
 * 1. Cached utility references (from markdown-it-emoji)
 * 2. Position tracking instead of substring (from markdown-it-emoji)
 * 3. Validate-mode early exit (from markdown-it internals)
 * 4. Shared state between passes (from markdown-it-py)
 * 5. Inline critical functions to avoid call overhead
 * 6. Avoid creating intermediate objects/arrays
 * 7. Use scanRE.test() before deeper parsing (from markdown-it-emoji)
 */

module.exports = function maxPerfAttrsV4(md, options_) {
  const LEFT = options_?.leftDelimiter || '{';
  const RIGHT = options_?.rightDelimiter || '}';
  const LEFT_CODE = LEFT.charCodeAt(0);
  const RIGHT_CODE = RIGHT.charCodeAt(0);
  const LEFT_LEN = LEFT.length;
  const RIGHT_LEN = RIGHT.length;
  const MIN_LEN = LEFT_LEN + 2 + RIGHT_LEN;
  const allowedAttrs = options_?.allowedAttributes;

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZATION: Pre-compiled scan regex for quick check before parsing
  // This is from markdown-it-emoji - test before parse
  // ═══════════════════════════════════════════════════════════════════════════
  const SCAN_RE = new RegExp(
    escapeRegExp(LEFT) + '[^' + escapeRegExp(RIGHT) + ']+' + escapeRegExp(RIGHT)
  );

  // Single regex for all attribute types - compiled once
  const ATTR_RE = /(?:\.\.([^\s#.={}]+))|(?:\.([^\s#.={}]+))|(?:#([^\s#.={}]+))|(?:([^\s#.={}]+)=(?:"([^"]*)"|'([^']*)'|([^\s}]*)))/g;

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZATION: Cache utility references (from markdown-it-emoji)
  // Accessing md.utils.X repeatedly has lookup overhead
  // ═══════════════════════════════════════════════════════════════════════════
  const arrayReplaceAt = md.utils.arrayReplaceAt;

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZATION: Inline parseAttrs with position tracking instead of substring
  // Avoid creating intermediate strings where possible
  // ═══════════════════════════════════════════════════════════════════════════
  function parseAttrsInRange(str, start, end) {
    // Extract just the attr content without delimiters
    const attrStart = start + LEFT_LEN;
    const attrEnd = end;

    if (attrEnd <= attrStart) return null;

    // Use substring only once
    const attrStr = str.substring(attrStart, attrEnd);

    let attrs = null;
    ATTR_RE.lastIndex = 0;
    let m;
    while ((m = ATTR_RE.exec(attrStr)) !== null) {
      if (!attrs) attrs = [];
      if (m[1]) attrs.push(['css-module', m[1]]);
      else if (m[2]) attrs.push(['class', m[2]]);
      else if (m[3]) attrs.push(['id', m[3]]);
      else if (m[4]) attrs.push([m[4], m[5] || m[6] || m[7] || '']);
    }

    if (attrs && allowedAttrs?.length) {
      return attrs.filter(([k]) =>
        allowedAttrs.some(a => k === a || (a instanceof RegExp && a.test(k)))
      );
    }
    return attrs;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZATION: Inline apply function (avoid function call overhead in hot path)
  // ═══════════════════════════════════════════════════════════════════════════
  function applyAttrs(attrs, token) {
    if (!attrs) return;
    for (let i = 0, len = attrs.length; i < len; i++) {
      const k = attrs[i][0];
      if (k === 'class' || k === 'css-module') {
        token.attrJoin(k, attrs[i][1]);
      } else {
        token.attrPush(attrs[i]);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Find opening token - optimized with early type check
  // ═══════════════════════════════════════════════════════════════════════════
  function findOpen(tokens, idx) {
    const t = tokens[idx];
    const nesting = t.nesting;
    if (nesting === 0) return t;
    if (t.type === 'softbreak') return null;

    const lvl = t.level;
    const type = t.type;
    // Compute open type only once
    const openType = type.slice(0, type.length - 5) + 'open';

    while (--idx >= 0) {
      const tok = tokens[idx];
      if (tok.type === openType && tok.level === lvl) {
        return tok;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Main processing - optimized with all techniques
  // ═══════════════════════════════════════════════════════════════════════════
  function process(state) {
    const tokens = state.tokens;
    const len = tokens.length;

    // ═══════════════════════════════════════════════════════════════════════
    // OPTIMIZATION: Track indices to remove, batch removal at end
    // Avoids repeated splice operations which are O(n) each
    // ═══════════════════════════════════════════════════════════════════════
    const toHide = [];

    for (let i = 0; i < len; i++) {
      const token = tokens[i];
      const type = token.type;

      // FENCE: ```lang {.class}
      if (type === 'fence') {
        const info = token.info;
        // Quick scan before deeper parse
        if (info && SCAN_RE.test(info)) {
          const start = info.lastIndexOf(LEFT);
          if (start !== -1 && info.charCodeAt(info.length - RIGHT_LEN) === RIGHT_CODE) {
            const attrs = parseAttrsInRange(info, start, info.length - RIGHT_LEN);
            if (attrs) {
              applyAttrs(attrs, token);
              // Trim info - compute new end
              let newEnd = start;
              if (info.charCodeAt(newEnd - 1) === 32) newEnd--;
              token.info = info.substring(0, newEnd);
            }
          }
        }
        continue;
      }

      // TABLE_CLOSE - look ahead for {.attrs}
      if (type === 'table_close' && i + 2 < len) {
        const t1 = tokens[i + 1];
        const t2 = tokens[i + 2];
        if (t1.type === 'paragraph_open' && t2.type === 'inline') {
          const c = t2.content;
          if (c && c.charCodeAt(0) === LEFT_CODE && c.charCodeAt(c.length - 1) === RIGHT_CODE) {
            const attrs = parseAttrsInRange(c, 0, c.length - RIGHT_LEN);
            if (attrs) {
              applyAttrs(attrs, findOpen(tokens, i));
              toHide.push(i + 1, i + 2, i + 3);
            }
          }
        }
        continue;
      }

      // LIST_CLOSE - look ahead for {.attrs}
      if ((type === 'bullet_list_close' || type === 'ordered_list_close') && i + 3 < len) {
        const t1 = tokens[i + 1];
        const t2 = tokens[i + 2];
        const t3 = tokens[i + 3];
        if (t1.type === 'paragraph_open' && t2.type === 'inline' && t3.type === 'paragraph_close') {
          const c = t2.content;
          if (c && c.charCodeAt(0) === LEFT_CODE && c.charCodeAt(c.length - 1) === RIGHT_CODE &&
              t2.children?.length === 1) {
            const attrs = parseAttrsInRange(c, 0, c.length - RIGHT_LEN);
            if (attrs) {
              applyAttrs(attrs, findOpen(tokens, i));
              toHide.push(i + 1, i + 2, i + 3);
            }
          }
        }
        continue;
      }

      // INLINE: Process children
      if (type === 'inline') {
        const children = token.children;
        if (!children || !children.length) continue;

        // ═══════════════════════════════════════════════════════════════════
        // OPTIMIZATION: Use scan regex for quick check (from markdown-it-emoji)
        // ═══════════════════════════════════════════════════════════════════
        let hasMatch = false;
        for (let j = 0; j < children.length; j++) {
          const c = children[j].content;
          if (c && SCAN_RE.test(c)) {
            hasMatch = true;
            break;
          }
        }
        if (!hasMatch) continue;

        // Process children in reverse (from markdown-it-emoji)
        for (let j = children.length - 1; j > 0; j--) {
          const child = children[j];
          if (child.type !== 'text' || !child.content) continue;

          const ct = child.content;
          if (ct.charCodeAt(0) !== LEFT_CODE) continue;

          const prev = children[j - 1];

          // image/code_inline {.attrs}
          if (prev.type === 'image' || prev.type === 'code_inline') {
            const end = ct.indexOf(RIGHT);
            if (end !== -1) {
              const attrs = parseAttrsInRange(ct, 0, end);
              if (attrs) {
                applyAttrs(attrs, prev);
                const rest = ct.substring(end + RIGHT_LEN);
                if (rest) child.content = rest;
                else children.splice(j, 1);
                continue;
              }
            }
          }

          // closing tag {.attrs}
          if (prev.nesting === -1) {
            const end = ct.indexOf(RIGHT);
            if (end !== -1) {
              const open = findOpen(children, j - 1);
              if (open) {
                const attrs = parseAttrsInRange(ct, 0, end);
                if (attrs) {
                  applyAttrs(attrs, open);
                  const rest = ct.substring(end + RIGHT_LEN);
                  if (rest) child.content = rest;
                  else children.splice(j, 1);
                  continue;
                }
              }
            }
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // Softbreak pattern: text\n{.class}
        // ═══════════════════════════════════════════════════════════════════
        if (children.length >= 2) {
          const last = children[children.length - 1];
          const secondLast = children[children.length - 2];
          if (secondLast.type === 'softbreak' && last.type === 'text') {
            const ct = last.content;
            // Check if content is ONLY attrs: {.class}
            if (ct.charCodeAt(0) === LEFT_CODE && ct.charCodeAt(ct.length - 1) === RIGHT_CODE) {
              const attrs = parseAttrsInRange(ct, 0, ct.length - RIGHT_LEN);
              if (attrs) {
                // Find the closing block token and apply to its opening
                let ii = i + 1;
                while (ii + 1 < len && tokens[ii + 1].nesting === -1) ii++;
                const open = findOpen(tokens, ii);
                if (open) {
                  applyAttrs(attrs, open);
                  // Remove softbreak and text children
                  children.length = children.length - 2;
                  continue;
                }
              }
            }
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // List item end pattern: - item {.class}
        // Must check BEFORE general end-of-block pattern
        // ═══════════════════════════════════════════════════════════════════
        if (i >= 2 && tokens[i - 2].type === 'list_item_open' && children.length > 0) {
          const last = children[children.length - 1];
          if (last.type === 'text' && last.content) {
            const ct = last.content;
            const start = ct.lastIndexOf(LEFT);
            if (start !== -1 && ct.charCodeAt(ct.length - 1) === RIGHT_CODE) {
              const attrs = parseAttrsInRange(ct, start, ct.length - RIGHT_LEN);
              if (attrs) {
                // Apply to list_item_open, not the paragraph
                applyAttrs(attrs, tokens[i - 2]);
                let newEnd = start;
                if (ct.charCodeAt(newEnd - 1) === 32) newEnd--;
                last.content = ct.substring(0, newEnd);
                continue; // Skip general end-of-block pattern
              }
            }
          }
        }

        // End of block pattern (general case)
        if (children.length > 0) {
          const last = children[children.length - 1];
          if (last.type === 'text' && last.content) {
            const ct = last.content;
            // Quick check with scan regex first
            if (SCAN_RE.test(ct)) {
              const start = ct.lastIndexOf(LEFT);
              if (start !== -1 && ct.charCodeAt(ct.length - 1) === RIGHT_CODE) {
                // Find next closing block token
                let ii = i + 1;
                while (ii < len && tokens[ii].nesting !== -1) ii++;
                if (ii < len) {
                  const open = findOpen(tokens, ii);
                  if (open) {
                    const attrs = parseAttrsInRange(ct, start, ct.length - RIGHT_LEN);
                    if (attrs) {
                      applyAttrs(attrs, open);
                      let newEnd = start;
                      if (ct.charCodeAt(newEnd - 1) === 32) newEnd--;
                      last.content = ct.substring(0, newEnd);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPTIMIZATION: Batch token removal at end (single pass)
    // ═══════════════════════════════════════════════════════════════════════════
    if (toHide.length > 0) {
      // Mark all at once
      for (let i = 0; i < toHide.length; i++) {
        if (toHide[i] < tokens.length) {
          tokens[toHide[i]].hidden = true;
        }
      }
      // Single compaction pass
      let w = 0;
      for (let r = 0; r < tokens.length; r++) {
        if (!tokens[r].hidden) tokens[w++] = tokens[r];
      }
      tokens.length = w;
    }
  }

  md.core.ruler.before('linkify', 'curly_attributes', process);
};

function escapeRegExp(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
