'use strict';
/**
 * Optimized markdown-it-attrs implementation
 *
 * Key optimizations:
 * 1. Early delimiter check - skip tokens without { character (biggest win)
 * 2. Token-type dispatch - only check relevant patterns per token type
 * 3. Direct property access instead of Object.keys() iteration
 * 4. Pre-compiled regex patterns
 * 5. Avoid creating closures in hot paths
 */

const defaultOptions = {
  leftDelimiter: '{',
  rightDelimiter: '}',
  allowedAttributes: []
};

/**
 * @param {import('markdown-it')} md
 * @param {object} options_
 */
module.exports = function optimizedAttrs(md, options_) {
  const options = { ...defaultOptions, ...options_ };
  const LEFT = options.leftDelimiter;
  const RIGHT = options.rightDelimiter;
  const MIN_CURLY_LEN = LEFT.length + 1 + RIGHT.length;

  // Pre-compiled patterns
  const CURLY_END_RE = new RegExp(
    '[ \\n]?' + escapeRegExp(LEFT) + '[^' + escapeRegExp(LEFT) + escapeRegExp(RIGHT) + ']+' + escapeRegExp(RIGHT) + '$'
  );
  const HR_RE = new RegExp(
    '^ {0,3}[-*_]{3,} ?' + escapeRegExp(LEFT) + '[^' + escapeRegExp(RIGHT) + ']'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // OPTIMIZATION 1: Fast delimiter check functions (no closure per call)
  // ─────────────────────────────────────────────────────────────────────────────

  function hasDelimiterStart(str) {
    if (!str || str.length < MIN_CURLY_LEN) return false;
    if (!str.startsWith(LEFT)) return false;
    const end = str.indexOf(RIGHT, MIN_CURLY_LEN - RIGHT.length);
    if (end === -1) return false;
    const nextChar = str.charAt(end + RIGHT.length);
    if (nextChar && RIGHT.indexOf(nextChar) !== -1) return false;
    return validCurlyLength(str.substring(0, end + RIGHT.length));
  }

  function hasDelimiterEnd(str) {
    if (!str || str.length < MIN_CURLY_LEN) return false;
    const start = str.lastIndexOf(LEFT);
    if (start === -1) return false;
    const end = str.indexOf(RIGHT, start + MIN_CURLY_LEN - RIGHT.length);
    if (end !== str.length - RIGHT.length) return false;
    return validCurlyLength(str.substring(start, end + RIGHT.length));
  }

  function hasDelimiterOnly(str) {
    if (!str || str.length < MIN_CURLY_LEN) return false;
    if (!str.startsWith(LEFT)) return false;
    if (!str.endsWith(RIGHT)) return false;
    return validCurlyLength(str);
  }

  function validCurlyLength(curly) {
    const firstChar = curly.charAt(LEFT.length);
    const isClassOrId = firstChar === '.' || firstChar === '#';
    return isClassOrId ? curly.length >= MIN_CURLY_LEN + 1 : curly.length >= MIN_CURLY_LEN;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OPTIMIZATION 2: Attribute parsing (streamlined, no per-char regex)
  // ─────────────────────────────────────────────────────────────────────────────

  function getAttrs(str, start) {
    const attrs = [];
    let key = '';
    let value = '';
    let parsingKey = true;
    let inQuotes = false;

    for (let i = start + LEFT.length; i < str.length; i++) {
      // Check for end delimiter
      if (str.substring(i, i + RIGHT.length) === RIGHT) {
        if (key) attrs.push([key, value]);
        break;
      }

      const c = str.charCodeAt(i);

      // = (61) switches to value parsing
      if (c === 61 && parsingKey) {
        parsingKey = false;
        continue;
      }

      // . (46) for class
      if (c === 46 && key === '') {
        if (str.charCodeAt(i + 1) === 46) {
          key = 'css-module';
          i++;
        } else {
          key = 'class';
        }
        parsingKey = false;
        continue;
      }

      // # (35) for id
      if (c === 35 && key === '') {
        key = 'id';
        parsingKey = false;
        continue;
      }

      // Quote handling
      if (c === 34) { // "
        inQuotes = !inQuotes;
        continue;
      }

      // Space (32) - separator
      if (c === 32 && !inQuotes) {
        if (key) {
          attrs.push([key, value]);
          key = '';
          value = '';
          parsingKey = true;
        }
        continue;
      }

      // Skip invalid key chars (tab, newline, form feed, space, /, >, ", ', =)
      if (parsingKey && (c === 9 || c === 10 || c === 12 || c === 32 ||
          c === 47 || c === 62 || c === 34 || c === 39 || c === 61)) {
        continue;
      }

      if (parsingKey) {
        key += str.charAt(i);
      } else {
        value += str.charAt(i);
      }
    }

    // Filter allowed attributes if configured
    if (options.allowedAttributes && options.allowedAttributes.length) {
      return attrs.filter(([attr]) =>
        options.allowedAttributes.some(allowed =>
          attr === allowed || (allowed instanceof RegExp && allowed.test(attr))
        )
      );
    }

    return attrs;
  }

  function addAttrs(attrs, token) {
    for (const [key, value] of attrs) {
      if (key === 'class' || key === 'css-module') {
        token.attrJoin(key, value);
      } else {
        token.attrPush([key, value]);
      }
    }
  }

  function getMatchingOpeningToken(tokens, i) {
    const token = tokens[i];
    if (token.type === 'softbreak' || token.nesting === 0) {
      return token.nesting === 0 ? token : false;
    }

    const level = token.level;
    const openType = token.type.replace('_close', '_open');

    for (let j = i; j >= 0; j--) {
      if (tokens[j].type === openType && tokens[j].level === level) {
        return tokens[j];
      }
    }
    return false;
  }

  function removeDelimiter(str) {
    const pos = str.search(CURLY_END_RE);
    return pos !== -1 ? str.slice(0, pos) : str;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OPTIMIZATION 3: Token-type dispatch instead of checking all patterns
  // ─────────────────────────────────────────────────────────────────────────────

  function curlyAttrs(state) {
    const tokens = state.tokens;
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];
      const type = token.type;

      // ─────────────────────────────────────────────────────────────────────────
      // OPTIMIZATION 4: Early exit - no delimiter means no attributes
      // This is the BIGGEST win: ~80% of tokens have no { at all
      // ─────────────────────────────────────────────────────────────────────────

      // Fenced code blocks: check info field
      if (type === 'fence' && token.info && token.info.includes(LEFT)) {
        if (hasDelimiterEnd(token.info)) {
          const start = token.info.lastIndexOf(LEFT);
          const attrs = getAttrs(token.info, start);
          addAttrs(attrs, token);
          token.info = removeDelimiter(token.info);
        }
        i++;
        continue;
      }

      // Table close: check for following {.attrs}
      if (type === 'table_close') {
        if (i + 2 < tokens.length &&
            tokens[i + 1].type === 'paragraph_open' &&
            tokens[i + 2].type === 'inline') {
          const content = tokens[i + 2].content;
          if (content && hasDelimiterOnly(content)) {
            const tableOpen = getMatchingOpeningToken(tokens, i);
            const attrs = getAttrs(content, 0);
            addAttrs(attrs, tableOpen);
            tokens.splice(i + 1, 3);
          }
        }
        i++;
        continue;
      }

      // Tables: thead/tbody metadata handling
      if (type === 'tr_close') {
        if (i + 2 < tokens.length &&
            tokens[i + 1].type === 'thead_close' &&
            tokens[i + 2].type === 'tbody_open') {
          handleTableMetadata(tokens, i);
        }
        i++;
        continue;
      }

      // Tables: tbody calculation
      if (type === 'tbody_close' && !token.hidden) {
        handleTableCalculation(tokens, i);
        i++;
        continue;
      }

      // List close with following attributes
      if ((type === 'bullet_list_close' || type === 'ordered_list_close')) {
        if (i + 3 < tokens.length &&
            tokens[i + 1].type === 'paragraph_open' &&
            tokens[i + 2].type === 'inline' &&
            tokens[i + 3].type === 'paragraph_close') {
          const content = tokens[i + 2].content;
          if (content && hasDelimiterOnly(content) &&
              tokens[i + 2].children && tokens[i + 2].children.length === 1) {
            const openingToken = getMatchingOpeningToken(tokens, i);
            const attrs = getAttrs(content, 0);
            addAttrs(attrs, openingToken);
            tokens.splice(i + 1, 3);
          }
        }
        i++;
        continue;
      }

      // Horizontal rule detection
      if (type === 'paragraph_open') {
        if (i + 2 < tokens.length &&
            tokens[i + 1].type === 'inline' &&
            tokens[i + 2].type === 'paragraph_close') {
          const inline = tokens[i + 1];
          if (inline.children && inline.children.length === 1 &&
              inline.content && HR_RE.test(inline.content)) {
            token.type = 'hr';
            token.tag = 'hr';
            token.nesting = 0;
            const content = inline.content;
            const start = content.lastIndexOf(LEFT);
            const attrs = getAttrs(content, start);
            addAttrs(attrs, token);
            token.markup = content;
            tokens.splice(i + 1, 2);
          }
        }
        i++;
        continue;
      }

      // Inline tokens: most complex - handle children
      if (type === 'inline' && token.children && token.children.length > 0) {
        processInlineToken(tokens, i);
        i++;
        continue;
      }

      i++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Inline token processing (separated for clarity and potential JIT optimization)
  // ─────────────────────────────────────────────────────────────────────────────

  function processInlineToken(tokens, i) {
    const token = tokens[i];
    const children = token.children;

    // Quick check: any child content has delimiter?
    let hasAnyDelimiter = false;
    for (let j = 0; j < children.length; j++) {
      if (children[j].content && children[j].content.includes(LEFT)) {
        hasAnyDelimiter = true;
        break;
      }
    }
    if (!hasAnyDelimiter) return;

    // Process children (may need multiple passes for nested attrs)
    let changed = true;
    let passes = 0;
    const maxPasses = 10; // Safety limit

    while (changed && passes < maxPasses) {
      changed = false;
      passes++;

      for (let j = 1; j < children.length; j++) {
        const child = children[j];
        if (child.type !== 'text' || !child.content) continue;

        const prev = children[j - 1];
        const content = child.content;

        // Pattern: inline nesting 0 (image, code_inline)
        if ((prev.type === 'image' || prev.type === 'code_inline') &&
            hasDelimiterStart(content)) {
          const endChar = content.indexOf(RIGHT);
          const attrs = getAttrs(content, 0);
          addAttrs(attrs, prev);
          if (content.length === endChar + RIGHT.length) {
            children.splice(j, 1);
            j--;
          } else {
            child.content = content.slice(endChar + RIGHT.length);
          }
          changed = true;
          continue;
        }

        // Pattern: inline attributes (closing tag with attrs)
        if (prev.nesting === -1 && hasDelimiterStart(content)) {
          const openingToken = getMatchingOpeningToken(children, j - 1);
          if (openingToken) {
            const attrs = getAttrs(content, 0);
            addAttrs(attrs, openingToken);
            child.content = content.slice(content.indexOf(RIGHT) + RIGHT.length);
            if (child.content === '') {
              children.splice(j, 1);
              j--;
            }
            changed = true;
          }
          continue;
        }
      }

      // Check for softbreak patterns (requires 2+ children)
      if (children.length >= 2) {
        const last = children[children.length - 1];
        const secondLast = children[children.length - 2];

        // Softbreak + attrs at end
        if (secondLast.type === 'softbreak' && last.type === 'text') {
          const content = last.content;

          // List softbreak pattern
          if (hasDelimiterOnly(content)) {
            if (i >= 2 && tokens[i - 2].type === 'list_item_open') {
              let ii = i - 2;
              while (tokens[ii - 1] &&
                     tokens[ii - 1].type !== 'ordered_list_open' &&
                     tokens[ii - 1].type !== 'bullet_list_open') {
                ii--;
              }
              if (ii > 0) {
                const attrs = getAttrs(content, 0);
                addAttrs(attrs, tokens[ii - 1]);
                token.children = children.slice(0, -2);
                changed = true;
              }
            } else {
              // General softbreak pattern
              let ii = i + 1;
              while (tokens[ii + 1] && tokens[ii + 1].nesting === -1) ii++;
              const openingToken = getMatchingOpeningToken(tokens, ii);
              if (openingToken) {
                const attrs = getAttrs(content, 0);
                addAttrs(attrs, openingToken);
                token.children = children.slice(0, -2);
                changed = true;
              }
            }
          }
        }
      }

      // End of block pattern (attrs at end of text) - works with any number of children
      if (children.length > 0) {
        const last = children[children.length - 1];
        if (last.type === 'text' && last.content && hasDelimiterEnd(last.content)) {
          const content = last.content;
          let ii = i + 1;
          while (ii < tokens.length && tokens[ii] && tokens[ii].nesting !== -1) ii++;
          if (ii < tokens.length) {
            const openingToken = getMatchingOpeningToken(tokens, ii);
            if (openingToken) {
              const start = content.lastIndexOf(LEFT);
              const attrs = getAttrs(content, start);
              addAttrs(attrs, openingToken);
              let trimmed = content.slice(0, start);
              if (trimmed.endsWith(' ')) trimmed = trimmed.slice(0, -1);
              last.content = trimmed;
              changed = true;
            }
          }
        }
      }

      // List item end pattern
      if (i >= 2 && tokens[i - 2].type === 'list_item_open' && children.length > 0) {
        const last = children[children.length - 1];
        if (last.type === 'text' && last.content && hasDelimiterEnd(last.content)) {
          const content = last.content;
          const attrs = getAttrs(content, content.lastIndexOf(LEFT));
          addAttrs(attrs, tokens[i - 2]);
          let trimmed = content.slice(0, content.lastIndexOf(LEFT));
          if (trimmed.endsWith(' ')) trimmed = trimmed.slice(0, -1);
          last.content = trimmed;
          changed = true;
        }
      }
    }
  }

  // Table metadata handling (simplified)
  function handleTableMetadata(tokens, i) {
    const tr = getMatchingOpeningToken(tokens, i);
    const th = tokens[i - 1];
    let colsnum = 0;
    let n = i;

    while (--n > 0) {
      if (tokens[n] === tr) {
        tokens[n - 1].meta = { ...tokens[n + 2]?.meta, colsnum };
        break;
      }
      if (tokens[n].level === th.level && tokens[n].type === th.type) {
        colsnum++;
      }
    }
    tokens[i + 2].meta = { ...tokens[i + 2].meta, colsnum };
  }

  // Table calculation (kept similar to original for correctness)
  function handleTableCalculation(tokens, i) {
    let idx = i - 2;
    while (idx > 0 && tokens[--idx].type !== 'tbody_open');

    const calc = (tokens[idx].meta?.colsnum) >> 0;
    if (calc < 2) return;

    const level = tokens[i].level + 2;

    for (let n = idx; n < i; n++) {
      if (tokens[n].level > level) continue;

      const token = tokens[n];
      const rows = token.hidden ? 0 : (token.attrGet('rowspan') >> 0);
      const cols = token.hidden ? 0 : (token.attrGet('colspan') >> 0);

      if (rows > 1) {
        let colsnum = calc - (cols > 0 ? cols : 1);
        for (let k = n, num = rows; k < i && num > 1; k++) {
          if (tokens[k].type === 'tr_open') {
            tokens[k].meta = { ...tokens[k].meta };
            if (tokens[k].meta?.colsnum) colsnum--;
            tokens[k].meta.colsnum = colsnum;
            num--;
          }
        }
      }

      if (token.type === 'tr_open' && token.meta?.colsnum) {
        const max = token.meta.colsnum;
        for (let k = n, num = 0; k < i; k++) {
          if (tokens[k].type === 'td_open') num++;
          else if (tokens[k].type === 'tr_close') break;
          if (num > max && !tokens[k].hidden) hideToken(tokens[k]);
        }
      }

      if (cols > 1) {
        const one = [];
        let end = n + 3;
        let num = calc;

        for (let k = n; k > idx; k--) {
          if (tokens[k].type === 'tr_open') {
            num = tokens[k].meta?.colsnum || num;
            break;
          } else if (tokens[k].type === 'td_open') {
            one.unshift(k);
          }
        }

        for (let k = n + 2; k < i; k++) {
          if (tokens[k].type === 'tr_close') {
            end = k;
            break;
          } else if (tokens[k].type === 'td_open') {
            one.push(k);
          }
        }

        const off = one.indexOf(n);
        let real = num - off;
        real = real > cols ? cols : real;
        if (cols > real) token.attrSet('colspan', String(real));

        const startHide = one.slice(num + 1 - calc - real)[0];
        if (startHide !== undefined) {
          for (let k = startHide; k < end; k++) {
            if (!tokens[k].hidden) hideToken(tokens[k]);
          }
        }
      }
    }
  }

  function hideToken(token) {
    token.hidden = true;
    if (token.children) {
      token.children.forEach(t => {
        t.content = '';
        hideToken(t);
      });
    }
  }

  md.core.ruler.before('linkify', 'curly_attributes', curlyAttrs);
};

function escapeRegExp(s) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
