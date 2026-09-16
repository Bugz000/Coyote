# Coyote Language Reference

> Auto-generated from coyote.js by static inference — nobody typed these signatures by hand. Regenerate any time the source changes. If a signature here is wrong, the fix belongs in the source (name your `values[n]` bindings, even ones you immediately pass into another call), not in this file.

---

## Syntax & Operators

Auto-extracted from the token declarations (`const OPERATOR_*`, `KEYWORD_*`, `LITERAL_*`) at the top of coyote.js. Descriptions come from each token's own `description` property (its second constructor argument), so they're real runtime data, not comments living outside the code.

### Operators

| Symbol | Name | Description |
|---|---|---|
| `?` | Ternary If | Begins the true-branch of a ternary expression |
| `:` | Ternary Else | Separates the true and false branches of a ternary expression |
| `||` | Or | Logical OR |
| `&&` | And | Logical AND |
| `/=|==/` | Equal | Equality comparison |
| `/!=|!==/` | Not Equal | Inequality comparison |
| `<` | Less | Less-than comparison |
| `<=` | Less Equal | Less-than-or-equal comparison |
| `>` | Greater | Greater-than comparison |
| `>=` | Greater Equal | Greater-than-or-equal comparison |
| `/\.|[ \t]+/` | Concat | Joins two values into a string, via `.` or plain whitespace |
| `&` | Bitwise And | Bitwise AND |
| `|` | Bitwise Or | Bitwise OR |
| `^` | Bitwise Xor | Bitwise XOR |
| `>>` | Bit Shift Right | Bitwise right shift |
| `<<` | Bit Shift Left | Bitwise left shift |
| `+` | Add | Addition (also doubled as `++` for increment) |
| `-` | Sub | Subtraction (also doubled as `--` for decrement) |
| `*` | Mul | Multiplication |
| `/` | Div | Division |
| `:=` | Assign | Assigns a value to a variable |
| `(` | Lparen | Opens a function-call argument list or grouped expression |
| `)` | Rparen | Closes a function-call argument list or grouped expression |
| `{` | Lbrace | Opens a block or object literal |
| `}` | Rbrace | Closes a block or object literal |
| `[` | Lbracket | Opens an array literal or index accessor |
| `]` | Rbracket | Closes an array literal or index accessor |
| `,` | Comma | Separates function arguments or list/object items |
| `:` | Colon | Separates a key from its value in an object literal |
| `.` | Dot | Member access (`x.foo`), also doubled as `..` for string append |

### Keywords

| Symbol | Name | Description |
|---|---|---|
| `/if\b/i` | If | Begins a conditional statement |
| `/else\b/i` | Else | Begins the alternate branch of a conditional statement |
| `/loop\b/i` | Loop | Begins a loop statement |
| `/in\b/i` | In | Introduces the collection in a for-in loop |
| `/for\b/i` | For | Begins a for-in loop |
| `/break\b/i` | Break | Exits the innermost loop immediately |
| `/continue\b/i` | Continue | Skips to the next iteration of the innermost loop |
| `/return\b/i` | Return | Returns a value from a function |

### Literals

| Symbol | Name | Description |
|---|---|---|
| `/-?[0-9]+(\.[0-9]+)?/` | Number | Numeric literal, e.g. `42` or `3.14` |
| `/(true|false)\b/i` | Boolean | Boolean literal, `true` or `false` (case-insensitive) |
| `/"[^"]*"/` | String | Double-quoted string literal |

### Special

| Symbol | Name | Description |
|---|---|---|
| `;` | Line Comment | Starts a line comment. |

---

## Standard Library

103 builtins detected.

### print

```
print([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `(none)` — No return value.

---

### Cell

```
Cell([char] [,x] [,y])
```

| Parameter | Optional | Description |
|---|---|---|
| char | yes | The character to set |
| x | yes | X position |
| y | yes | Y position |

**Returns:** `(none)` — No return value.

---

### Cursor

```
Cursor([x] [,y])
```

| Parameter | Optional | Description |
|---|---|---|
| x | yes | X position |
| y | yes | Y position |

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
round([arg1] [,arg2])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |
| arg2 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Rounds a number.

---

### strlen

```
strlen([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `(none)` — No return value.

---

### abs

```
abs([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Absolute value.

---

### Exp

```
Exp([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Log

```
Log([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Floor

```
Floor([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Rounds down.

---

### Sin

```
Sin([arg1] [,degrees])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |
| degrees | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Trigonometric function.

---

### Cos

```
Cos([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

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
Tan([Convert] [,degrees])
```

| Parameter | Optional | Description |
|---|---|---|
| Convert | yes | Optional; omitted value reads as `undefined`. |
| degrees | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Trigonometric function.

---

### Ceil

```
Ceil([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Rounds up.

---

### Cotan

```
Cotan([radians])
```

| Parameter | Optional | Description |
|---|---|---|
| radians | yes | Optional; omitted value reads as `undefined`. |

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
Dice([N])
```

| Parameter | Optional | Description |
|---|---|---|
| N | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Rounds down.

---

### Substr

```
Substr([string] [,start] [,arg3])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Defaults to 0 if omitted. |
| start | yes | Defaults to 0 if omitted. |
| arg3 | yes |  |

**Returns:** `string|array` — Returns a sub-range.

---

### Asc

```
Asc([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Returns a character code.

**Remarks:**
- Throws if argument must be a single character string

---

### Chr

```
Chr([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Builds a string from character codes.

---

### InStr

```
InStr([string1] [,string2])
```

| Parameter | Optional | Description |
|---|---|---|
| string1 | yes | Optional; omitted value reads as `undefined`. |
| string2 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Returns a position/index.

---

### Strepl

```
Strepl([string] [,find] [,replace])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Optional; omitted value reads as `undefined`. |
| find | yes | Optional; omitted value reads as `undefined`. |
| replace | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

### Upper

```
Upper([string])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Converts to uppercase.

---

### Lower

```
Lower([string])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Converts to lowercase.

---

### power

```
power([base] [,exponent])
```

| Parameter | Optional | Description |
|---|---|---|
| base | yes | Optional; omitted value reads as `undefined`. |
| exponent | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Raises to a power.

---

### sqrt

```
sqrt([number])
```

| Parameter | Optional | Description |
|---|---|---|
| number | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number` — Square root.

---

### Rem

```
Rem([string] [,regexPattern] [,numMatches])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Optional; omitted value reads as `undefined`. |
| regexPattern | yes | Optional; omitted value reads as `undefined`. |
| numMatches | yes |  |

**Returns:** `unknown`

**Remarks:**
- Throws if invalid arguments. Expected a string, a regex pattern, and an optional number of matches.

---

### Repl

```
Repl([string] [,regex] [,replace])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Optional; omitted value reads as `undefined`. |
| regex | yes | Optional; omitted value reads as `undefined`. |
| replace | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

### Grep

```
Grep([arg1] [,text])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |
| text | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Trunc

```
Trunc([number] [,decimalPlaces])
```

| Parameter | Optional | Description |
|---|---|---|
| number | yes | Optional; omitted value reads as `undefined`. |
| decimalPlaces | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

**Remarks:**
- Throws if invalid arguments for truncation. Expected a number and a non-negative integer.

---

### Strsplit

```
Strsplit([string] [,separator])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Optional; omitted value reads as `undefined`. |
| separator | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `array` — Splits into an array.

---

### fRead

```
fRead([content])
```

| Parameter | Optional | Description |
|---|---|---|
| content | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### strmid

```
strmid([length])
```

| Parameter | Optional | Description |
|---|---|---|
| length | yes | Optional; omitted value reads as `undefined`. |

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
justify([text] [,justifyType] [,width])
```

| Parameter | Optional | Description |
|---|---|---|
| text | yes | Optional; omitted value reads as `undefined`. |
| justifyType | yes | 1 for Left, 2 for Center, 3 for Right |
| width | yes | Optional; omitted value reads as `undefined`. |

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
strclean([string] [,N])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Optional; omitted value reads as `undefined`. |
| N | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Trims whitespace.

**Remarks:**
- Throws if invalid cleaning type. Use 1 for light, 2 for medium, or 3 for heavy cleaning.

---

### fdelete

```
fdelete([filePath])
```

| Parameter | Optional | Description |
|---|---|---|
| filePath | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string`

---

### fwrite

```
fwrite([data] [,filePath])
```

| Parameter | Optional | Description |
|---|---|---|
| data | yes | Optional; omitted value reads as `undefined`. |
| filePath | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string`

---

### repeat

```
repeat([repeat] [,num])
```

| Parameter | Optional | Description |
|---|---|---|
| repeat | yes | Optional; omitted value reads as `undefined`. |
| num | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `(none)` — No return value.

---

### fappend

```
fappend([data] [,filePath])
```

| Parameter | Optional | Description |
|---|---|---|
| data | yes | Optional; omitted value reads as `undefined`. |
| filePath | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string`

---

### treeprint

```
treeprint([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

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
pcof([part] [,whole])
```

| Parameter | Optional | Description |
|---|---|---|
| part | yes | Optional; omitted value reads as `undefined`. |
| whole | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string`

---

### pct

```
pct([number] [,percent])
```

| Parameter | Optional | Description |
|---|---|---|
| number | yes | Optional; omitted value reads as `undefined`. |
| percent | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### pcChange

```
pcChange([oldValue] [,newValue])
```

| Parameter | Optional | Description |
|---|---|---|
| oldValue | yes | Optional; omitted value reads as `undefined`. |
| newValue | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### addPc

```
addPc([number] [,percent])
```

| Parameter | Optional | Description |
|---|---|---|
| number | yes | Optional; omitted value reads as `undefined`. |
| percent | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### subPc

```
subPc([number] [,percent])
```

| Parameter | Optional | Description |
|---|---|---|
| number | yes | Optional; omitted value reads as `undefined`. |
| percent | yes | Optional; omitted value reads as `undefined`. |

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
sleep([milliseconds])
```

| Parameter | Optional | Description |
|---|---|---|
| milliseconds | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Count

```
Count([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `array` — Splits into an array.

**Remarks:**
- Throws if expected a string or an array

---

### MaxIndex

```
MaxIndex([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `array` — Splits into an array.

**Remarks:**
- Throws if expected a string or an array

---

### Slice

```
Slice([source] [,start] [,arg3])
```

| Parameter | Optional | Description |
|---|---|---|
| source | yes | Optional; omitted value reads as `undefined`. |
| start | yes | Optional; omitted value reads as `undefined`. |
| arg3 | yes |  |

**Returns:** `string|array` — Returns a sub-range.

**Remarks:**
- Throws if expected a string or an array

---

### Join

```
Join([array] [,arg2])
```

| Parameter | Optional | Description |
|---|---|---|
| array | yes | Optional; omitted value reads as `undefined`. |
| arg2 | yes |  |

**Returns:** `string` — Joins an array into a string.

**Remarks:**
- Throws if expected an array as the first argument

---

### Flatten

```
Flatten([array])
```

| Parameter | Optional | Description |
|---|---|---|
| array | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `array` — Flattens nested arrays.

**Remarks:**
- Throws if expected an array as the argument

---

### Push

```
Push([array] [,element])
```

| Parameter | Optional | Description |
|---|---|---|
| array | yes | Optional; omitted value reads as `undefined`. |
| element | yes | Optional; omitted value reads as `undefined`. |

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
IsOdd([number])
```

| Parameter | Optional | Description |
|---|---|---|
| number | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### IsEven

```
IsEven([number])
```

| Parameter | Optional | Description |
|---|---|---|
| number | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Invert

```
Invert([number])
```

| Parameter | Optional | Description |
|---|---|---|
| number | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### IsArray

```
IsArray([Return])
```

| Parameter | Optional | Description |
|---|---|---|
| Return | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### IsObject

```
IsObject([Return])
```

| Parameter | Optional | Description |
|---|---|---|
| Return | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### IsString

```
IsString([Return])
```

| Parameter | Optional | Description |
|---|---|---|
| Return | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### IsNum

```
IsNum([Return])
```

| Parameter | Optional | Description |
|---|---|---|
| Return | yes | Optional; omitted value reads as `undefined`. |

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
IsFloat([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Use

```
Use([name])
```

| Parameter | Optional | Description |
|---|---|---|
| name | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Solve

```
Solve([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Tree

```
Tree([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `(none)` — No return value.

---

### ToHex

```
ToHex([value])
```

| Parameter | Optional | Description |
|---|---|---|
| value | yes | Defaults to 0 if omitted. |

**Returns:** `string` — Converts to uppercase.

---

### FromHex

```
FromHex([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

### ToBin

```
ToBin([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### FromBin

```
FromBin([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### ToString

```
ToString([value])
```

| Parameter | Optional | Description |
|---|---|---|
| value | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Serializes to JSON.

---

### ToNum

```
ToNum([num])
```

| Parameter | Optional | Description |
|---|---|---|
| num | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Uppercase

```
Uppercase([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Converts to uppercase.

---

### Lowercase

```
Lowercase([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Converts to lowercase.

---

### Type

```
Type([value])
```

| Parameter | Optional | Description |
|---|---|---|
| value | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string`

---

### Trim

```
Trim([string] [,arg2])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Optional; omitted value reads as `undefined`. |
| arg2 | yes |  |

**Returns:** `string|array` — Returns a sub-range.

---

### Reverse

```
Reverse([value])
```

| Parameter | Optional | Description |
|---|---|---|
| value | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `array` — Splits into an array.

---

### Contains

```
Contains([haystack] [,arg2])
```

| Parameter | Optional | Description |
|---|---|---|
| haystack | yes | Optional; omitted value reads as `undefined`. |
| arg2 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### StartsWith

```
StartsWith([arg1] [,arg2])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |
| arg2 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### EndsWith

```
EndsWith([arg1] [,arg2])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |
| arg2 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Pad

```
Pad([string] [,arg2] [,arg3] [,arg4])
```

| Parameter | Optional | Description |
|---|---|---|
| string | yes | Optional; omitted value reads as `undefined`. |
| arg2 | yes | Optional; omitted value reads as `undefined`. |
| arg3 | yes |  |
| arg4 | yes |  |

**Returns:** `unknown`

---

### Keys

```
Keys([value])
```

| Parameter | Optional | Description |
|---|---|---|
| value | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Values

```
Values([value])
```

| Parameter | Optional | Description |
|---|---|---|
| value | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Sort

```
Sort([list] [,arg2])
```

| Parameter | Optional | Description |
|---|---|---|
| list | yes | Optional; omitted value reads as `undefined`. |
| arg2 | yes |  |

**Returns:** `array|string` — Reverses order.

---

### Unique

```
Unique([list])
```

| Parameter | Optional | Description |
|---|---|---|
| list | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Sum

```
Sum([list])
```

| Parameter | Optional | Description |
|---|---|---|
| list | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number|any` — Aggregates a collection.

---

### Min

```
Min([list])
```

| Parameter | Optional | Description |
|---|---|---|
| list | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Max

```
Max([list])
```

| Parameter | Optional | Description |
|---|---|---|
| list | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Avg

```
Avg([list])
```

| Parameter | Optional | Description |
|---|---|---|
| list | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `number|any` — Aggregates a collection.

---

### Json

```
Json([arg1] [,arg2])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |
| arg2 | yes |  |

**Returns:** `string` — Serializes to JSON.

---

### Parse

```
Parse([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

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
Date([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `unknown`

---

### Env

```
Env([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

### Exec

```
Exec([arg1])
```

| Parameter | Optional | Description |
|---|---|---|
| arg1 | yes | Optional; omitted value reads as `undefined`. |

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

