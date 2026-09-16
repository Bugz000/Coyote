# Coyote Language Reference

> Auto-generated from coyote.js by static inference — nobody typed these signatures by hand. Regenerate any time the source changes. If a signature here is wrong, the fix belongs in the source (name your `values[n]` bindings, even ones you immediately pass into another call), not in this file.

---

## Syntax & Operators

Auto-extracted from the token declarations (`const OPERATOR_*`, `KEYWORD_*`, `LITERAL_*`) at the top of coyote.js. Add a trailing `// comment` on a declaration to override the auto-generated description.

### Operators

| Symbol | Name | Description |
|---|---|---|
| `?` | Ternary If | _(undocumented — add a trailing comment on the declaration)_ |
| `:` | Ternary Else | _(undocumented — add a trailing comment on the declaration)_ |
| `||` | Or | _(undocumented — add a trailing comment on the declaration)_ |
| `&&` | And | _(undocumented — add a trailing comment on the declaration)_ |
| `/=|==/` | Equal | _(undocumented — add a trailing comment on the declaration)_ |
| `/!=|!==/` | Not Equal | _(undocumented — add a trailing comment on the declaration)_ |
| `<` | Less | _(undocumented — add a trailing comment on the declaration)_ |
| `<=` | Less Equal | _(undocumented — add a trailing comment on the declaration)_ |
| `>` | Greater | _(undocumented — add a trailing comment on the declaration)_ |
| `>=` | Greater Equal | _(undocumented — add a trailing comment on the declaration)_ |
| `/\.|[ \t]+/` | Concat | Joins two values into a string, via `.` or plain whitespace |
| `&` | Bitwise And | _(undocumented — add a trailing comment on the declaration)_ |
| `|` | Bitwise Or | _(undocumented — add a trailing comment on the declaration)_ |
| `^` | Bitwise Xor | _(undocumented — add a trailing comment on the declaration)_ |
| `>>` | Bit Shift Right | _(undocumented — add a trailing comment on the declaration)_ |
| `<<` | Bit Shift Left | _(undocumented — add a trailing comment on the declaration)_ |
| `+` | Add | _(undocumented — add a trailing comment on the declaration)_ |
| `-` | Sub | _(undocumented — add a trailing comment on the declaration)_ |
| `*` | Mul | _(undocumented — add a trailing comment on the declaration)_ |
| `/` | Div | _(undocumented — add a trailing comment on the declaration)_ |
| `:=` | Assign | Assigns a value to a variable |
| `(` | Lparen | _(undocumented — add a trailing comment on the declaration)_ |
| `)` | Rparen | _(undocumented — add a trailing comment on the declaration)_ |
| `{` | Lbrace | _(undocumented — add a trailing comment on the declaration)_ |
| `}` | Rbrace | _(undocumented — add a trailing comment on the declaration)_ |
| `[` | Lbracket | _(undocumented — add a trailing comment on the declaration)_ |
| `]` | Rbracket | _(undocumented — add a trailing comment on the declaration)_ |
| `,` | Comma | _(undocumented — add a trailing comment on the declaration)_ |
| `:` | Colon | _(undocumented — add a trailing comment on the declaration)_ |
| `.` | Dot | _(undocumented — add a trailing comment on the declaration)_ |

### Keywords

| Symbol | Name | Description |
|---|---|---|
| `/if\b/i` | If | _(undocumented — add a trailing comment on the declaration)_ |
| `/else\b/i` | Else | _(undocumented — add a trailing comment on the declaration)_ |
| `/loop\b/i` | Loop | _(undocumented — add a trailing comment on the declaration)_ |
| `/in\b/i` | In | _(undocumented — add a trailing comment on the declaration)_ |
| `/for\b/i` | For | _(undocumented — add a trailing comment on the declaration)_ |
| `/break\b/i` | Break | _(undocumented — add a trailing comment on the declaration)_ |
| `/continue\b/i` | Continue | _(undocumented — add a trailing comment on the declaration)_ |
| `/return\b/i` | Return | _(undocumented — add a trailing comment on the declaration)_ |

### Literals

| Symbol | Name | Description |
|---|---|---|
| `/-?[0-9]+(\.[0-9]+)?/` | Number | _(undocumented — add a trailing comment on the declaration)_ |
| `/(true|false)\b/i` | Boolean | _(undocumented — add a trailing comment on the declaration)_ |
| `/"[^"]*"/` | String | _(undocumented — add a trailing comment on the declaration)_ |

### Special

| Symbol | Name | Description |
|---|---|---|
| `;` | Line Comment | Starts a line comment. |

---

## Standard Library

103 builtins detected.

### print

```
print(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `(none)` — No return value.

---

### Cell

```
Cell(char, x, y)
```

| Parameter | Optional | Description |
|---|---|---|
| char | no | The character to set |
| x | no | X position |
| y | no | Y position |

**Returns:** `(none)` — No return value.

---

### Cursor

```
Cursor(x, y)
```

| Parameter | Optional | Description |
|---|---|---|
| x | no | X position |
| y | no | Y position |

**Returns:** `(none)` — No return value.

---

### clear

```
clear()
```

_Takes no parameters._

**Returns:** `(none)` — No return value.

---

### round

```
round(arg1, arg2)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |

**Returns:** `number` — Rounds a number.

---

### strlen

```
strlen(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `(none)` — No return value.

---

### abs

```
abs(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Absolute value.

---

### Exp

```
Exp(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### Log

```
Log(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### Floor

```
Floor(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Rounds down.

---

### Sin

```
Sin(arg1, degrees)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| degrees | no |

**Returns:** `number` — Trigonometric function.

---

### Cos

```
Cos(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Trigonometric function.

---

### Ticks

```
Ticks()
```

_Takes no parameters._

**Returns:** `unknown`

---

### Tan

```
Tan(arg1, degrees)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| degrees | no |

**Returns:** `number` — Trigonometric function.

---

### Ceil

```
Ceil(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Rounds up.

---

### Cotan

```
Cotan(radians)
```

| Parameter | Optional |
|---|---|
| radians | no |

**Returns:** `unknown`

---

### Rand

```
Rand()
Rand(max)
Rand(bound1, bound2)
```

**`Rand()`** — If no arguments provided, default range is 1 to 100

_Takes no parameters._

**Returns:** `number` — Random value.

**`Rand(max)`** — If one argument provided, range is from 0 to the argument

| Parameter | Optional |
|---|---|
| max | no |

**Returns:** `number` — Random value.

**`Rand(bound1, bound2)`** — If two arguments provided, range is between the arguments (order-independent)

| Parameter | Optional |
|---|---|
| bound1 | no |
| bound2 | no |

**Returns:** `number` — Random value.

---

### Dice

```
Dice(N)
```

| Parameter | Optional |
|---|---|
| N | no |

**Returns:** `number` — Rounds down.

---

### Substr

```
Substr(string, start, [arg3])
```

| Parameter | Optional |
|---|---|
| string | no |
| start | no |
| arg3 | yes |

**Returns:** `string|array` — Returns a sub-range.

---

### Asc

```
Asc(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Returns a character code.

**Remarks:**
- Throws if argument must be a single character string

---

### Chr

```
Chr(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Builds a string from character codes.

---

### InStr

```
InStr(string1, string2)
```

| Parameter | Optional |
|---|---|
| string1 | no |
| string2 | no |

**Returns:** `number` — Returns a position/index.

---

### Strepl

```
Strepl(string, find, replace)
```

| Parameter | Optional |
|---|---|
| string | no |
| find | no |
| replace | no |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

### Upper

```
Upper(string)
```

| Parameter | Optional |
|---|---|
| string | no |

**Returns:** `string` — Converts to uppercase.

---

### Lower

```
Lower(string)
```

| Parameter | Optional |
|---|---|
| string | no |

**Returns:** `string` — Converts to lowercase.

---

### power

```
power(base, exponent)
```

| Parameter | Optional |
|---|---|
| base | no |
| exponent | no |

**Returns:** `number` — Raises to a power.

---

### sqrt

```
sqrt(number)
```

| Parameter | Optional |
|---|---|
| number | no |

**Returns:** `number` — Square root.

---

### Rem

```
Rem(string, regexPattern, [numMatches])
```

| Parameter | Optional |
|---|---|
| string | no |
| regexPattern | no |
| numMatches | yes |

**Returns:** `unknown`

**Remarks:**
- Throws if invalid arguments. Expected a string, a regex pattern, and an optional number of matches.

---

### Repl

```
Repl(string, regex, replace)
```

| Parameter | Optional |
|---|---|
| string | no |
| regex | no |
| replace | no |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

### Grep

```
Grep(arg1, text)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| text | no |

**Returns:** `unknown`

---

### Trunc

```
Trunc(number, decimalPlaces)
```

| Parameter | Optional |
|---|---|
| number | no |
| decimalPlaces | no |

**Returns:** `unknown`

**Remarks:**
- Throws if invalid arguments for truncation. Expected a number and a non-negative integer.

---

### Strsplit

```
Strsplit(string, separator)
```

| Parameter | Optional |
|---|---|
| string | no |
| separator | no |

**Returns:** `array` — Splits into an array.

---

### fRead

```
fRead(content)
```

| Parameter | Optional |
|---|---|
| content | no |

**Returns:** `unknown`

---

### strmid

```
strmid(length)
```

| Parameter | Optional |
|---|---|
| length | no |

**Returns:** `number` — Rounds down.

---

### Occur

```
Occur()
```

_Takes no parameters._

**Returns:** `unknown`

---

### Dir

```
Dir()
```

_Takes no parameters._

**Returns:** `unknown`

---

### justify

```
justify(text, justifyType, width)
```

| Parameter | Optional | Description |
|---|---|---|
| text | no |  |
| justifyType | no | 1 for Left, 2 for Center, 3 for Right |
| width | no |  |

**Returns:** `string`

---

### LastOcc

```
LastOcc()
```

_Takes no parameters._

**Returns:** `unknown`

---

### strclean

```
strclean(string, N)
```

| Parameter | Optional |
|---|---|
| string | no |
| N | no |

**Returns:** `string` — Trims whitespace.

**Remarks:**
- Throws if invalid cleaning type. Use 1 for light, 2 for medium, or 3 for heavy cleaning.

---

### fdelete

```
fdelete(filePath)
```

| Parameter | Optional |
|---|---|
| filePath | no |

**Returns:** `string`

---

### fwrite

```
fwrite(data, filePath)
```

| Parameter | Optional |
|---|---|
| data | no |
| filePath | no |

**Returns:** `string`

---

### repeat

```
repeat(repeat, num)
```

| Parameter | Optional |
|---|---|
| repeat | no |
| num | no |

**Returns:** `(none)` — No return value.

---

### fappend

```
fappend(data, filePath)
```

| Parameter | Optional |
|---|---|
| data | no |
| filePath | no |

**Returns:** `string`

---

### treeprint

```
treeprint(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `array` — Splits into an array.

**Remarks:**
- Throws if expected a string or an array
- Throws if expected a string or an array
- Throws if expected a string or an array
- Throws if expected an array as the first argument
- Throws if expected an array as the argument
- Throws if expected an array or string as the first argument
- Throws if invalid argument for range. Expected a number.
- Throws if invalid arguments for range. Expected two numbers.
- Throws if range expects 1 or 2 arguments.
- Throws if position out of bounds

---

### pcof

```
pcof(part, whole)
```

| Parameter | Optional |
|---|---|
| part | no |
| whole | no |

**Returns:** `string`

---

### pct

```
pct(number, percent)
```

| Parameter | Optional |
|---|---|
| number | no |
| percent | no |

**Returns:** `unknown`

---

### pcChange

```
pcChange(oldValue, newValue)
```

| Parameter | Optional |
|---|---|
| oldValue | no |
| newValue | no |

**Returns:** `unknown`

---

### addPc

```
addPc(number, percent)
```

| Parameter | Optional |
|---|---|
| number | no |
| percent | no |

**Returns:** `unknown`

---

### subPc

```
subPc(number, percent)
```

| Parameter | Optional |
|---|---|
| number | no |
| percent | no |

**Returns:** `unknown`

---

### input

```
input()
```

_Takes no parameters._

**Returns:** `unknown`

---

### sleep

```
sleep(milliseconds)
```

| Parameter | Optional |
|---|---|
| milliseconds | no |

**Returns:** `unknown`

---

### Count

```
Count(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `array` — Splits into an array.

**Remarks:**
- Throws if expected a string or an array

---

### MaxIndex

```
MaxIndex(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `array` — Splits into an array.

**Remarks:**
- Throws if expected a string or an array

---

### Slice

```
Slice(source, start, [arg3])
```

| Parameter | Optional |
|---|---|
| source | no |
| start | no |
| arg3 | yes |

**Returns:** `string|array` — Returns a sub-range.

**Remarks:**
- Throws if expected a string or an array

---

### Join

```
Join(array, [arg2])
```

| Parameter | Optional |
|---|---|
| array | no |
| arg2 | yes |

**Returns:** `string` — Joins an array into a string.

**Remarks:**
- Throws if expected an array as the first argument

---

### Flatten

```
Flatten(array)
```

| Parameter | Optional |
|---|---|
| array | no |

**Returns:** `array` — Flattens nested arrays.

**Remarks:**
- Throws if expected an array as the argument

---

### Push

```
Push(array, element)
```

| Parameter | Optional |
|---|---|
| array | no |
| element | no |

**Returns:** `unknown`

**Remarks:**
- Throws if expected an array or string as the first argument

---

### Purge

```
Purge([arg1])
```

| Parameter | Optional |
|---|---|
| arg1 | yes |

**Returns:** `array` — Filters a collection.

---

### IsOdd

```
IsOdd(number)
```

| Parameter | Optional |
|---|---|
| number | no |

**Returns:** `unknown`

---

### IsEven

```
IsEven(number)
```

| Parameter | Optional |
|---|---|
| number | no |

**Returns:** `unknown`

---

### Invert

```
Invert(number)
```

| Parameter | Optional |
|---|---|
| number | no |

**Returns:** `unknown`

---

### IsArray

```
IsArray(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### IsObject

```
IsObject(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### IsString

```
IsString(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### IsNum

```
IsNum(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### Range

```
Range(end)
Range(start, end)
```

**`Range(end)`** — Single argument: range(25)

| Parameter | Optional |
|---|---|
| end | no |

**Returns:** `unknown`

**Remarks:**
- Throws if invalid argument for range. Expected a number.

**`Range(start, end)`** — Two arguments: range(5, 10)

| Parameter | Optional |
|---|---|
| start | no |
| end | no |

**Returns:** `unknown`

**Remarks:**
- Throws if invalid arguments for range. Expected two numbers.

---

### IsFloat

```
IsFloat(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### Use

```
Use(name)
```

| Parameter | Optional |
|---|---|
| name | no |

**Returns:** `unknown`

---

### Solve

```
Solve(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### Tree

```
Tree(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `(none)` — No return value.

---

### ToHex

```
ToHex(value)
```

| Parameter | Optional |
|---|---|
| value | no |

**Returns:** `string` — Converts to uppercase.

---

### FromHex

```
FromHex(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

### ToBin

```
ToBin(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### FromBin

```
FromBin(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### ToString

```
ToString(value)
```

| Parameter | Optional |
|---|---|
| value | no |

**Returns:** `string` — Serializes to JSON.

---

### ToNum

```
ToNum(num)
```

| Parameter | Optional |
|---|---|
| num | no |

**Returns:** `unknown`

---

### Uppercase

```
Uppercase(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Converts to uppercase.

---

### Lowercase

```
Lowercase(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Converts to lowercase.

---

### Type

```
Type(value)
```

| Parameter | Optional |
|---|---|
| value | no |

**Returns:** `string`

---

### Trim

```
Trim(string, [arg2])
```

| Parameter | Optional |
|---|---|
| string | no |
| arg2 | yes |

**Returns:** `string|array` — Returns a sub-range.

---

### Reverse

```
Reverse(value)
```

| Parameter | Optional |
|---|---|
| value | no |

**Returns:** `array` — Splits into an array.

---

### Contains

```
Contains(haystack, arg2)
```

| Parameter | Optional |
|---|---|
| haystack | no |
| arg2 | no |

**Returns:** `unknown`

---

### StartsWith

```
StartsWith(arg1, arg2)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |

**Returns:** `unknown`

---

### EndsWith

```
EndsWith(arg1, arg2)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |

**Returns:** `unknown`

---

### Pad

```
Pad(string, arg2, [arg3], [arg4])
```

| Parameter | Optional |
|---|---|
| string | no |
| arg2 | no |
| arg3 | yes |
| arg4 | yes |

**Returns:** `unknown`

---

### Keys

```
Keys(value)
```

| Parameter | Optional |
|---|---|
| value | no |

**Returns:** `unknown`

---

### Values

```
Values(value)
```

| Parameter | Optional |
|---|---|
| value | no |

**Returns:** `unknown`

---

### Sort

```
Sort(list, [arg2])
```

| Parameter | Optional |
|---|---|
| list | no |
| arg2 | yes |

**Returns:** `array|string` — Reverses order.

---

### Unique

```
Unique(list)
```

| Parameter | Optional |
|---|---|
| list | no |

**Returns:** `unknown`

---

### Sum

```
Sum(list)
```

| Parameter | Optional |
|---|---|
| list | no |

**Returns:** `number|any` — Aggregates a collection.

---

### Min

```
Min(list)
```

| Parameter | Optional |
|---|---|
| list | no |

**Returns:** `unknown`

---

### Max

```
Max(list)
```

| Parameter | Optional |
|---|---|
| list | no |

**Returns:** `unknown`

---

### Avg

```
Avg(list)
```

| Parameter | Optional |
|---|---|
| list | no |

**Returns:** `number|any` — Aggregates a collection.

---

### Json

```
Json(arg1, [arg2])
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | yes |

**Returns:** `string` — Serializes to JSON.

---

### Parse

```
Parse(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `any` — Parses JSON back into a value.

---

### Now

```
Now()
```

_Takes no parameters._

**Returns:** `unknown`

---

### Date

```
Date(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### Env

```
Env(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

### Exec

```
Exec(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

### credits

```
credits()
```

_Takes no parameters._

**Returns:** `(none)` — No return value.

---

### vars

```
vars()
```

_Takes no parameters._

**Returns:** `(none)` — No return value.

---

### scope

```
scope()
```

_Takes no parameters._

**Returns:** `(none)` — No return value.

---

### funcs

```
funcs()
```

_Takes no parameters._

**Returns:** `(none)` — No return value.

---

