'use strict';
/**
 * LITE version of markdown-it-attrs
 * Handles only the MOST COMMON patterns for maximum performance:
 * - End of block: `paragraph {.class}`
 * - Fenced code: ```lang {.class}
 * - Inline: *em*{.class}, ![](img){.class}, `code`{.class}
 *
 * SKIPS (for performance):
 * - Complex table rowspan/colspan
 * - List softbreak patterns
 * - HR detection
 */

module.exports = function liteAttrs(md, options_) {
  const LEFT = options_?.leftDelimiter || '{';
  const RIGHT = options_?.rightDelimiter || '}';
  const LEFT_CODE = LEFT.charCodeAt(0);
  const MIN_LEN = LEFT.length + 2 + RIGHT.length;

  // Single regex for all attribute types
  const ATTR_RE = /(?:\.\.([^\s#.={}]+))|(?:\.([^\s#.={}]+))|(?:#([^\s#.={}]+))|(?:([^\s#.={}]+)=(?:"([^"]*)"|'([^']*)'|([^\s}]*)))/g;

  function parseAttrs(str, start, end) {
    const s = str.substring(start + LEFT.length, end);
    if (!s) return null;

    let attrs = null;
    ATTR_RE.lastIndex = 0;
    let m;
    while ((m = ATTR_RE.exec(s)) !== null) {
      if (!attrs) attrs = [];
      if (m[1]) attrs.push(['css-module', m[1]]);
      else if (m[2]) attrs.push(['class', m[2]]);
      else if (m[3]) attrs.push(['id', m[3]]);
      else if (m[4]) attrs.push([m[4], m[5] || m[6] || m[7] || '']);
    }
    return attrs;
  }

  function apply(attrs, token) {
    if (!attrs) return;
    for (let i = 0; i < attrs.length; i++) {
      const k = attrs[i][0], v = attrs[i][1];
      if (k === 'class' || k === 'css-module') token.attrJoin(k, v);
      else token.attrPush(attrs[i]);
    }
  }

  function findOpen(tokens, i) {
    const t = tokens[i];
    if (t.nesting === 0) return t;
    const lvl = t.level, ot = t.type.slice(0, -5) + 'open';
    while (--i >= 0) if (tokens[i].type === ot && tokens[i].level === lvl) return tokens[i];
    return null;
  }

  function process(state) {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];

      // FENCE: ```lang {.class}
      if (t.type === 'fence' && t.info && t.info.indexOf(LEFT) !== -1) {
        const start = t.info.lastIndexOf(LEFT);
        const end = t.info.length;
        if (t.info.charCodeAt(end - 1) === RIGHT.charCodeAt(0)) {
          const attrs = parseAttrs(t.info, start, end - RIGHT.length);
          if (attrs) {
            apply(attrs, t);
            let newEnd = start;
            if (t.info.charCodeAt(newEnd - 1) === 32) newEnd--;
            t.info = t.info.substring(0, newEnd);
          }
        }
        continue;
      }

      // INLINE: process children
      if (t.type === 'inline' && t.children?.length) {
        const c = t.children;
        let hasLeft = false;
        for (let j = 0; j < c.length; j++) {
          if (c[j].content?.indexOf(LEFT) !== -1) { hasLeft = true; break; }
        }
        if (!hasLeft) continue;

        // Process reverse for safe splice
        for (let j = c.length - 1; j > 0; j--) {
          const ch = c[j];
          if (ch.type !== 'text' || !ch.content) continue;
          const ct = ch.content;
          if (ct.charCodeAt(0) !== LEFT_CODE) continue;

          const prev = c[j - 1];

          // image/code_inline {.attrs}
          if (prev.type === 'image' || prev.type === 'code_inline') {
            const end = ct.indexOf(RIGHT);
            if (end !== -1) {
              const attrs = parseAttrs(ct, 0, end);
              if (attrs) {
                apply(attrs, prev);
                const rest = ct.substring(end + RIGHT.length);
                if (rest) ch.content = rest;
                else c.splice(j, 1);
                continue;
              }
            }
          }

          // closing tag {.attrs}
          if (prev.nesting === -1) {
            const end = ct.indexOf(RIGHT);
            if (end !== -1) {
              const open = findOpen(c, j - 1);
              if (open) {
                const attrs = parseAttrs(ct, 0, end);
                if (attrs) {
                  apply(attrs, open);
                  const rest = ct.substring(end + RIGHT.length);
                  if (rest) ch.content = rest;
                  else c.splice(j, 1);
                  continue;
                }
              }
            }
          }
        }

        // End of block: paragraph text {.class}
        if (c.length > 0) {
          const last = c[c.length - 1];
          if (last.type === 'text' && last.content) {
            const ct = last.content;
            const start = ct.lastIndexOf(LEFT);
            if (start !== -1 && ct.charCodeAt(ct.length - 1) === RIGHT.charCodeAt(0)) {
              // Find next closing block token
              let ii = i + 1;
              while (ii < tokens.length && tokens[ii].nesting !== -1) ii++;
              if (ii < tokens.length) {
                const open = findOpen(tokens, ii);
                if (open) {
                  const attrs = parseAttrs(ct, start, ct.length - RIGHT.length);
                  if (attrs) {
                    apply(attrs, open);
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

  md.core.ruler.before('linkify', 'curly_attributes', process);
};
