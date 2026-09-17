# 🐺 Coyote

> **The Ultra-High-Inference Scripting Engine for Text, Math & Terminal Wizardry**

[![Language: Coyote](https://img.shields.io/badge/Language-Coyote-FF6B00?style=for-the-badge&logo=javascript)](https://github.com)
[![Inference: Ultra--High](https://img.shields.io/badge/Inference-Ultra--High-brightgreen?style=for-the-badge)](https://github.com)
[![Runtime: Node.js](https://img.shields.io/badge/Runtime-Node.js-339933?style=for-the-badge&logo=nodedotjs)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](https://opensource.org/licenses/MIT)

---

## ⚡ What is Coyote?

**Coyote**  We've all been there - you're working on a project you're 42 layers deep into the stack, and you find yourself manually editing 24000 files to repair an issue, spending the whole time debating whether it's worth making a one-time script for it... you give in, start making a tool, while desperately trying to maintain the concepts in your mind from your initial task, you do a dry test-run, it's all wrong, now you need to debug 8 stupid issues, because you weren't concentrating when you made it, finally once working, you run it, fix 24,000 files and you realise you've totally, completely forgotten what you were doing before.

This is what Coyote fixes.

a nextgen ultra high inferrence scripting language, with it's own brain to INFER what you wanted, so you can stay focused on your original task 
it is not a speed-demon hyper-secure flagship language, it is a scripting tool designed to aid your use of a flagship Language
these one-time scripts can be coded in seconds, coyote can in some cases directly run pseudocode 
this is the design principle 
you just say "i want THIS, THERE" - it cares not for salt or syntax, it understands, and it executes.

```
               /\
              /  \
             /    \      _
            /      \    / \
           /   /\   \  /   \
          /   /  \   \/     \
         /___/    \_________/
          🐺 COYOTE SCRIPTING ENGINE
```

---

## ✨ Key Features

* **🧠 Contextual Type Inference:** Mix strings, floats, ints, arrays, and JSON without tedious explicit casts. Coyote automatically digest-coerces types based on operation context.
```coyote
; Coyote pairs types by what the operator is trying to do, not by declared type
weight_str := "72.5"
height_str := "1.8"

bmi := weight_str / (height_str * height_str)
print("BMI: " Round(bmi, 1))
; -> BMI: 22.4
; "72.5" and "1.8" were parsed as strings off a form, but the moment they
; hit / and *, Coyote treats them as numbers with zero casting on your part.

verdict := ("22.4" > 18.5) ? "healthy range" : "out of range"
print("Verdict: " verdict)
; -> Verdict: healthy range
```
* **✨ Clean & Frictionless Syntax:** Simple variable assignments with `:=`, automatic statement delimiter handling, and optional space-based string concatenation (`"Hello " name "!"`).
```coyote
name := "Wanderer"
gold := 340
inventory := ["Sword", "Shield", "Potion"]

; No semicolons to manage, no + for concatenation - adjacency is enough
print(name " has " gold " gold and " Count(inventory) " items.")
; -> Wanderer has 340 gold and 3 items.

; := everywhere - variables, no separate "let/const/var" ceremony
gold := gold - 50
print(name " spent 50 gold, now has " gold ".")
; -> Wanderer spent 50 gold, now has 290.
```
* **💻 First-Class TUI & Terminal Primitives:** Direct spatial rendering with `Cell(char, x, y)`, `Cursor(x, y)`, `Clear()`, and reactive environment vars like `A_consoleWidth` and `A_consoleHeight`.
```coyote
Clear()

w := A_consoleWidth
h := A_consoleHeight

; Draw a border using nothing but Cell() placement
loop(w) {
    Cell("─", A_Index, 1)
    Cell("─", A_Index, h)
}
loop(h) {
    Cell("│", 1, A_Index)
    Cell("│", w, A_Index)
}

Cursor(3, 1)
print(" 🐺 COYOTE " A_consoleWidth "x" A_consoleHeight " ")
Cursor(1, 3)
print("Rendering directly onto a " w "-column terminal - no ncurses required.")
```

* **🔋 Batteries-Included Standard Library:** Built-in percentage utilities (`pcChange`, `addPc`), trig functions, regex matchers (`Rem`, `Grep`), string formatters (`Justify`, `Trim`, `StrMid`), and collection operations (`Flatten`, `Purge`, `Slice`).
```coyote
; Finance: how much did the position move, and what's it worth reversed?
old_price := 84.20
new_price := 91.55
print("Move: " Round(PcChange(old_price, new_price), 2) "%")
; -> Move: 8.73%

; Text: pull every "error" line out of a log blob and count them
log := FRead("server.log")
errors := Grep("error", log)
print(Count(errors) " error line(s) found:")
print(Justify(Join(errors, "\n"), "left", 60))

; Collections: dedupe, sort, and summarize in three calls
scores := [88, 72, 91, 72, 65, 88, 100]
clean := Sort(Unique(scores))
print("Unique scores: " Join(clean, ", ") " | avg: " Round(Avg(clean), 1))
; -> Unique scores: 65, 72, 88, 91, 100 | avg: 83.2
```
* **🌉 Seamless JS/Node Bridge & Fluent Chaining:** Run Coyote ASTs directly or build chained Coyote expressions natively in JavaScript via the `CoyoteVar` promise bridge: `x.tohex().upper().print()`.
```coyote
const { ASTExecutor } = require('./coyote.js');

const engine = new ASTExecutor();
engine.set("token", "deadBEEF12");

// Build the AST fluently from JS - each call queues another node until
// you actually need the value, then it resolves the whole chain at once
const label = await engine
    .getvar("token")
    .upper()
    .justify("center", 16);

console.log(`[${label.toString()}]`);
// -> [   DEADBEEF12    ]

// Mix raw Coyote script and JS-side chaining in the same run
await engine.run(`total := AddPc(200, 15)`);
const total = await engine.getvar("total").tohex();
console.log("Hex of total:", total.toString());
// -> Hex of total: E9
```

---

## 🚀 Quick Look

### 1. High-Inference Scripting Syntax

```coyote
; Coyote Script - Intuitive & Zero-Boilerplate

name := "Coyote Engine"
version := 1.5
print("Welcome to " . name . " v" version)

; Dynamic type coercion & implicit space-concatenation
price := "150.50"
discount := 15
final_price := price - discount
print("Original: $" price " | Discounted: $" final_price)

; Built-in financial/statistical helpers
change := pcChange(100, 150)
print("Growth Rate: " change "%")

; High-level loop with built-in iteration context
items := ["Wolf", "Coyote", "Fox"]
loop(items) {
    print("Item #" A_Index " (" A_Key "): " A_Val)
}
```

---

## 🔮 The Core Philosophy: "Extreme Inference"

In traditional languages, mixing types or handling data transformations requires endless `parseInt()`, `.toString()`, and type-checking guards. **Coyote eliminates friction.**

### Automatic Type Pairing & Coercion
When evaluating mathematical operations, comparisons, or data structures, Coyote pairs and promotes operands dynamically:

```coyote
; Compare numeric strings against integers directly
if ("200" > 150) {
    print("Inference engine auto-promoted string to number!")
}

; Flexible operator behaviors
total := "100" + 50        ; Result: 150 (Numeric context)
label := "Score: " 100     ; Result: "Score: 100" (Concatenation context)
pattern := "Hi" * 3        ; Result: "HiHiHi" (String multiplication!)
```

### Dual-Mode Execution (Standalone Engine or JS Bridge)
Coyote works both as an independent scripting engine and as a fluent internal DSL embedded directly in Node.js:

```javascript
// Embedded JavaScript API - Programmatic Chaining via CoyoteVar
const { ASTExecutor } = require('./coyote');

const engine = new ASTExecutor();
engine.set("val", 255);

// Fluent chaining constructs identical AST structures seamlessly!
let result = await engine.getvar("val").tohex().lower();
console.log(result.toString()); // "ff"
```

---

## 🎨 Terminal Graphics (TUI) Primitives

Coyote equips you with low-level ASCII/TUI cell rendering capabilities out of the box:

```coyote
Clear()

w := A_consoleWidth
h := A_consoleHeight

Cursor(1, 1)
print("Terminal Dimensions: " w "x" h)

; Direct coordinate placement
Cell("★", 10, 5)
Cell("🐺", 12, 5)
Cursor(1, 8)
```

---

## 📚 Standard Library At A Glance

### 📐 Math & Analytics
| Function | Description | Example | Result |
| :--- | :--- | :--- | :--- |
| `pcChange(old, new)` | Calculates percentage change | `pcChange(100, 150)` | `50` |
| `addPc(val, pc)` | Adds percentage to value | `addPc(200, -50)` | `100` |
| `subPc(val, pc)` | Subtracts percentage from value | `subPc(100, 50)` | `50` |
| `Round(val, [dec])` | Rounds to whole number or fixed decimal | `Round(123.456)` | `123` |
| `Trunc(val, dec)` | Truncates decimal precision | `Trunc(123.456, 2)` | `"123.45"` |
| `Sin(n, [unit])` | Sine function (Radian or Degree `"D"`) | `Sin(90, "D")` | `1` |
| `Cos(n)` / `Tan(n)` | Cosine and Tangent calculations | `Cos(a_pi)` | `-1` |
| `Rand([min], [max])` | Random floating point generator | `Rand(100)` | `0.0 - 100.0` |
| `Dice(sides)` | Simulates N-sided dice roll | `Dice(6)` | `1` to `6` |

### 🔤 String & Regex Utilities
| Function | Description | Example | Result |
| :--- | :--- | :--- | :--- |
| `StrLen(str)` | Returns string length | `StrLen("Hello")` | `5` |
| `StrMid(str)` | Calculates midpoint character index | `StrMid("test!")` | `3` |
| `InStr(haystack, needle)`| 1-based index position search | `InStr("Hello", "e")` | `2` |
| `Strepl(str, find, rep)` | Global text replacement | `Strepl("Hello World", "World", "Coyote")` | `"Hello Coyote"` |
| `Occur(str, needle)` | Counts occurrences in text | `Occur("Hello", "l")` | `2` |
| `LastOcc(str, needle)` | Finds last index of needle | `LastOcc("Hello", "l")` | `4` |
| `Justify(str, align, w)` | Aligns text within column width | `Justify("Hi", "left", 5)` | `"Hi   "` |
| `Rem(str, pattern)` | Regex match extractor | `Rem("Hello", "e")` | `[{ match: 'e', pos: 1 }]` |
| `Grep(pattern, text)` | Filters lines matching regular expression | `Grep("error", logData)` | Array of lines |

### 🔀 Type Inspection & Base Conversion
| Function | Description | Example |
| :--- | :--- | :--- |
| `isNum(v)` / `isFloat(v)` | Checks if value is numeric or decimal | `isFloat("123.45")` → `1` |
| `isString(v)` | Checks string type | `isString(123)` → `0` |
| `isArray(v)` / `isObject(v)` | Validates collection structures | `isArray("[1, 2, 3]")` → `1` |
| `ToHex(v)` / `FromHex(v)` | Hexadecimal string encoder/decoder | `ToHex(255)` → `"FF"` |
| `ToBin(v)` / `FromBin(v)` | Binary string encoder/decoder | `ToBin(10)` → `"1010"` |

### 🛠 System Environment Variables (`A_*`)
Coyote automatically binds real-time contextual variables:
* **Terminal Specs:** `A_consoleWidth`, `A_consoleHeight`, `A_isTTY`
* **Host System Info:** `A_workingdir`, `A_hostname`, `A_platform`, `A_architecture`, `A_homeDir`, `A_tempDir`
* **Runtime Metrics:** `A_currentTime`, `A_uptime`, `A_totalMemory`, `A_freeMemory`, `A_cpuCount`
* **Loop Iterators:** `A_Index` (1-based index), `A_Key` (map key), `A_Val` (current value)
* **Constants:** `A_pi` ($\pi = 3.141592...$)

---

## 🛠 Getting Started

### Installation & Integration

Ensure you have [Node.js](https://nodejs.org/) installed, then import Coyote into your project:

```bash
# Install dependencies
npm install

# Execute a CoyoteScript (.yote) file
node script.js script.yote
```

---

## 🗺 Roadmap

- [x] High-inference expression engine with operator precedence AST parser
- [x] Dual-scope environment supporting pure Coyote script & JS method binding (`CoyoteVar`)
- [x] Terminal rendering engine (`Cell`, `Cursor`, system metrics)
- [ ] DOCUMENTATION.
- [ ] Relative layout positioning system (`tui.add.button.x := "x+5"`)
- [ ] Extended directory watcher & async file system event hooks
- [ ] Standalone CLI runner (`coyote script.yote`)  (you can pack the js to an executable with ease, however)

---

<p align="center">
  Crafted for expressiveness, rapid macro scripting, and high-inference language design.
</p>
