# Coyote Standard Library Reference

> Auto-generated from `INTERNAL_*` methods in coyote.js by static inference — nobody typed these signatures by hand. Regenerate any time the source changes; if a signature here is wrong, the fix belongs in the source's own `values[n]` naming, not in this file.

99 builtins detected.

---

## print

```
print(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `(none)` — No return value.

---

## Cell

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

## Cursor

```
Cursor(x, y)
```

| Parameter | Optional | Description |
|---|---|---|
| x | no | X position |
| y | no | Y position |

**Returns:** `(none)` — No return value.

---

## clear

```
clear()
```

_Takes no parameters._

**Returns:** `(none)` — No return value.

---

## round

```
round(arg1, arg2)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |

**Returns:** `number` — Rounds a number.

---

## strlen

```
strlen(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `(none)` — No return value.

---

## abs

```
abs(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Absolute value.

---

## Exp

```
Exp(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Log

```
Log(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Floor

```
Floor(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Rounds down.

---

## Sin

```
Sin(arg1, degrees)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| degrees | no |

**Returns:** `number` — Trigonometric function.

---

## Cos

```
Cos(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Trigonometric function.

---

## Ticks

```
Ticks()
```

_Takes no parameters._

**Returns:** `unknown`

---

## Tan

```
Tan(arg1, degrees)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| degrees | no |

**Returns:** `number` — Trigonometric function.

---

## Ceil

```
Ceil(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Rounds up.

---

## Cotan

```
Cotan(radians)
```

| Parameter | Optional |
|---|---|
| radians | no |

**Returns:** `unknown`

---

## Rand

```
Rand([arg1], [arg2])
```

| Parameter | Optional |
|---|---|
| arg1 | yes |
| arg2 | yes |

**Returns:** `number` — Random value.

**Remarks:**
- Throws if invalid number of arguments

---

## Dice

```
Dice(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number` — Rounds down.

---

## Substr

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

## Asc

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

## Chr

```
Chr(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Builds a string from character codes.

---

## InStr

```
InStr(string1, string2)
```

| Parameter | Optional |
|---|---|
| string1 | no |
| string2 | no |

**Returns:** `number` — Returns a position/index.

---

## Strepl

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

## Upper

```
Upper(string)
```

| Parameter | Optional |
|---|---|
| string | no |

**Returns:** `string` — Converts to uppercase.

---

## Lower

```
Lower(string)
```

| Parameter | Optional |
|---|---|
| string | no |

**Returns:** `string` — Converts to lowercase.

---

## power

```
power(base, exponent)
```

| Parameter | Optional |
|---|---|
| base | no |
| exponent | no |

**Returns:** `number` — Raises to a power.

---

## sqrt

```
sqrt(number)
```

| Parameter | Optional |
|---|---|
| number | no |

**Returns:** `number` — Square root.

---

## Rem

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

## Repl

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

## Grep

```
Grep(arg1, text)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| text | no |

**Returns:** `unknown`

---

## Trunc

```
Trunc(arg1, arg2)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |

**Returns:** `unknown`

**Remarks:**
- Throws if invalid arguments for truncation. Expected a number and a non-negative integer.

---

## Strsplit

```
Strsplit(string, separator)
```

| Parameter | Optional |
|---|---|
| string | no |
| separator | no |

**Returns:** `array` — Splits into an array.

---

## fRead

```
fRead(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## strmid

```
strmid(length)
```

| Parameter | Optional |
|---|---|
| length | no |

**Returns:** `number` — Rounds down.

---

## Occur

```
Occur()
```

_Takes no parameters._

**Returns:** `unknown`

---

## Dir

```
Dir()
```

_Takes no parameters._

**Returns:** `unknown`

---

## justify

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

## LastOcc

```
LastOcc()
```

_Takes no parameters._

**Returns:** `unknown`

---

## strclean

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

## fdelete

```
fdelete(filePath)
```

| Parameter | Optional |
|---|---|
| filePath | no |

**Returns:** `string`

---

## fwrite

```
fwrite(data, filePath)
```

| Parameter | Optional |
|---|---|
| data | no |
| filePath | no |

**Returns:** `string`

---

## repeat

```
repeat(repeat, num)
```

| Parameter | Optional |
|---|---|
| repeat | no |
| num | no |

**Returns:** `(none)` — No return value.

---

## fappend

```
fappend(data, filePath)
```

| Parameter | Optional |
|---|---|
| data | no |
| filePath | no |

**Returns:** `string`

---

## treeprint

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

## pcof

```
pcof(part, whole)
```

| Parameter | Optional |
|---|---|
| part | no |
| whole | no |

**Returns:** `string`

---

## pct

```
pct(number, percent)
```

| Parameter | Optional |
|---|---|
| number | no |
| percent | no |

**Returns:** `unknown`

---

## pcChange

```
pcChange(oldValue, newValue)
```

| Parameter | Optional |
|---|---|
| oldValue | no |
| newValue | no |

**Returns:** `unknown`

---

## addPc

```
addPc(arg1, arg2)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |

**Returns:** `unknown`

---

## subPc

```
subPc(number, percent)
```

| Parameter | Optional |
|---|---|
| number | no |
| percent | no |

**Returns:** `unknown`

---

## input

```
input()
```

_Takes no parameters._

**Returns:** `unknown`

---

## sleep

```
sleep(milliseconds)
```

| Parameter | Optional |
|---|---|
| milliseconds | no |

**Returns:** `unknown`

---

## Count

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

## MaxIndex

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

## Slice

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

## Join

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

## Flatten

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

## Push

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

## Purge

```
Purge([arg1])
```

| Parameter | Optional |
|---|---|
| arg1 | yes |

**Returns:** `array` — Filters a collection.

---

## IsOdd

```
IsOdd(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## IsEven

```
IsEven(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Invert

```
Invert(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## IsArray

```
IsArray(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## IsObject

```
IsObject(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## IsString

```
IsString(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## IsNum

```
IsNum(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Range

```
Range([arg1], [arg2])
```

| Parameter | Optional |
|---|---|
| arg1 | yes |
| arg2 | yes |

**Returns:** `unknown`

**Remarks:**
- Throws if invalid argument for range. Expected a number.
- Throws if invalid arguments for range. Expected two numbers.
- Throws if range expects 1 or 2 arguments.

---

## IsFloat

```
IsFloat(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Use

```
Use(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Solve

```
Solve(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Tree

```
Tree(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `(none)` — No return value.

---

## ToHex

```
ToHex(value)
```

| Parameter | Optional |
|---|---|
| value | no |

**Returns:** `string` — Converts to uppercase.

---

## FromHex

```
FromHex(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

## ToBin

```
ToBin(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## FromBin

```
FromBin(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## ToString

```
ToString(value)
```

| Parameter | Optional |
|---|---|
| value | no |

**Returns:** `string` — Serializes to JSON.

---

## ToNum

```
ToNum(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Uppercase

```
Uppercase(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Converts to uppercase.

---

## Lowercase

```
Lowercase(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Converts to lowercase.

---

## Type

```
Type(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string`

---

## Trim

```
Trim(arg1, [arg2])
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | yes |

**Returns:** `string|array` — Returns a sub-range.

---

## Reverse

```
Reverse(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `array` — Splits into an array.

---

## Contains

```
Contains(arg1, arg2)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |

**Returns:** `unknown`

---

## StartsWith

```
StartsWith(arg1, arg2)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |

**Returns:** `unknown`

---

## EndsWith

```
EndsWith(arg1, arg2)
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |

**Returns:** `unknown`

---

## Pad

```
Pad(arg1, arg2, [arg3], [arg4])
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | no |
| arg3 | yes |
| arg4 | yes |

**Returns:** `unknown`

---

## Keys

```
Keys(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Values

```
Values(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Sort

```
Sort(arg1, [arg2])
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | yes |

**Returns:** `array|string` — Reverses order.

---

## Unique

```
Unique(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Sum

```
Sum(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number|any` — Aggregates a collection.

---

## Min

```
Min(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Max

```
Max(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Avg

```
Avg(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `number|any` — Aggregates a collection.

---

## Json

```
Json(arg1, [arg2])
```

| Parameter | Optional |
|---|---|
| arg1 | no |
| arg2 | yes |

**Returns:** `string` — Serializes to JSON.

---

## Parse

```
Parse(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `any` — Parses JSON back into a value.

---

## Now

```
Now()
```

_Takes no parameters._

**Returns:** `unknown`

---

## Date

```
Date(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

## Env

```
Env(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `string` — Returns a modified copy with a replacement applied.

---

## Exec

```
Exec(arg1)
```

| Parameter | Optional |
|---|---|
| arg1 | no |

**Returns:** `unknown`

---

