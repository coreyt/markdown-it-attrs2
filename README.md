# markdown-it-attrs2

A high-performance drop-in replacement for [markdown-it-attrs](https://github.com/arve0/markdown-it-attrs).

**3-7x faster** with 100% compatibility.

## Installation

```bash
npm install markdown-it-attrs2
```

## Usage

```javascript
const md = require('markdown-it')();
const attrs = require('markdown-it-attrs2');

md.use(attrs);

// Now you can use attribute syntax in your markdown
md.render('# Heading {.my-class #my-id}');
// <h1 class="my-class" id="my-id">Heading</h1>
```

## Supported Syntax

```markdown
# Heading {.class #id}

Paragraph with attributes {.highlight data-info="value"}

- List item {.item-class}

Text with *emphasis*{.em-class} and `code`{.code-class}

![image](url){.img-class}

```js {.code-block}
const x = 1;
```

| Table |
|-------|
| Cell  |

{.table-class}

Line with softbreak
{.applied-to-paragraph}
```

## Performance

Benchmarked against [markdown-it-attrs](https://github.com/arve0/markdown-it-attrs):

| Document Size | Original | markdown-it-attrs2 | Speedup |
|---------------|----------|-------------------|---------|
| 100 lines | 2.1 ms | 0.3 ms | **7.0x** |
| 500 lines | 3.8 ms | 1.1 ms | **3.4x** |
| 1000 lines | 6.7 ms | 1.7 ms | **3.9x** |

## Variants

### Default (Full Compatibility)

```javascript
const attrs = require('markdown-it-attrs2');
// or
const attrs = require('markdown-it-attrs2/full');
```

100% compatible with markdown-it-attrs. Handles all patterns including tables, list items, and softbreaks.

### Lite (Maximum Speed)

```javascript
const attrs = require('markdown-it-attrs2/lite');
```

~20% faster than full version. Handles the most common patterns:
- Headings, paragraphs, code fences
- Inline elements (emphasis, code, images)

Does not handle:
- Table attributes
- List item attributes
- Softbreak attributes

## Options

Same options as markdown-it-attrs:

```javascript
md.use(attrs, {
  // Change delimiters (default: { and })
  leftDelimiter: '[[',
  rightDelimiter: ']]',

  // Restrict allowed attributes
  allowedAttributes: ['class', 'id', /^data-/]
});
```

## How It Works

Key optimizations over the original:

1. **Token-type dispatch** - Only checks relevant patterns per token type, reducing O(n×p) to O(n)
2. **Early delimiter detection** - Skips tokens without `{` character (~80% of tokens)
3. **Single-pass regex parsing** - Extracts all attributes in one regex pass
4. **Optimized string operations** - Uses `charCodeAt()` instead of string comparisons

See [PERFORMANCE_ANALYSIS.md](./PERFORMANCE_ANALYSIS.md) for detailed benchmarks and analysis.

## Related Projects

- [markdown-it-attrs](https://github.com/arve0/markdown-it-attrs) - The original implementation
- [markdown-it-attributes](https://github.com/purocean/markdown-it-attributes) - Another optimized TypeScript implementation

## License

MIT
