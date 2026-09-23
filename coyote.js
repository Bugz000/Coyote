const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const readlineSync = require('readline-sync');
const { performance } = require('perf_hooks');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

class StringToken {
	constructor(token, description = null) {
		this.token = token
		this.description = description
	}
	scan(haystack, position) {
		return haystack.startsWith(this.token, position) ? this.token : null
	}
	toString() {
		return `'${this.token}'`;
	}
}
class RegexToken {
	constructor(token, description = null) {
		this.token = token;
		this.description = description;
		if (token.global) {
			throw new Error('Global regex not supported: /' + token.source + '/' + token.flags);
		}
		if (!token.sticky) {
			this.token = RegExp(token.source, token.flags + 'y');
		}
	}
	scan(haystack, position) {
		this.token.lastIndex = position;
		const match = haystack.match(this.token);
		return match ? match[0] : null;
	}
	toString() {
		return '/' + this.token.source + '/' + this.token.flags;
	}
}
let debuglogtier = -1
// runs all the assertions every time it starts, turn it off before publishing
let debugassertionsonstartup = true
const VARIABLE = new RegexToken(/[a-zA-Z_][a-zA-Z0-9_]*/);
const OPERATOR_TERNARY_IF = new StringToken('?', 'Begins the true-branch of a ternary expression');
const OPERATOR_TERNARY_ELSE = new StringToken(':', 'Separates the true and false branches of a ternary expression');
const OPERATOR_OR = new StringToken('||', 'Logical OR');
const OPERATOR_AND = new StringToken('&&', 'Logical AND');
const OPERATOR_EQUAL = new RegexToken(/==|=/, 'Equality comparison');
const OPERATOR_NOT_EQUAL = new RegexToken(/!==|!=/, 'Inequality comparison');
const OPERATOR_STRICT_EQUAL = new StringToken('===', 'Strict equality - no coercing a numeric string to a number');
const OPERATOR_STRICT_NOT_EQUAL = new StringToken('!==', 'Strict inequality');
const OPERATOR_CASE_EQUAL = new StringToken('==', 'Case-sensitive equality');
const OPERATOR_LOOSE_EQUAL = new StringToken('=', 'Case-insensitive equality');
const OPERATOR_LOOSE_NOT_EQUAL = new StringToken('!=', 'Case-insensitive inequality');
const OPERATOR_NOT = new RegexToken(/!(?!=)|not\b/i, 'Logical NOT, `!x` or `not x`');
const OPERATOR_LESS = new StringToken('<', 'Less-than comparison');
const OPERATOR_LESS_EQUAL = new StringToken('<=', 'Less-than-or-equal comparison');
const OPERATOR_GREATER = new StringToken('>', 'Greater-than comparison');
const OPERATOR_GREATER_EQUAL = new StringToken('>=', 'Greater-than-or-equal comparison');
const OPERATOR_CONCAT = new RegexToken(/\.|[ \t]+/, 'Joins two values into a string, via `.` or plain whitespace');
const OPERATOR_BITWISE_AND = new RegexToken(/&(?!&)/, 'Bitwise AND');
const OPERATOR_BITWISE_OR = new RegexToken(/\|(?!\|)/, 'Bitwise OR');
const OPERATOR_BITWISE_XOR = new StringToken('^', 'Bitwise XOR');
const OPERATOR_BIT_SHIFT_RIGHT = new StringToken('>>', 'Bitwise right shift');
const OPERATOR_BIT_SHIFT_LEFT = new StringToken('<<', 'Bitwise left shift');
const OPERATOR_ADD = new StringToken('+', 'Addition (also doubled as `++` for increment)');
const OPERATOR_SUB = new StringToken('-', 'Subtraction (also doubled as `--` for decrement)');
const OPERATOR_MUL = new StringToken('*', 'Multiplication');
const OPERATOR_DIV = new StringToken('/', 'Division');
const OPERATOR_ASSIGN = new StringToken(':=', 'Assigns a value to a variable');
const OPERATOR_LPAREN = new StringToken('(', 'Opens a function-call argument list or grouped expression');
const OPERATOR_RPAREN = new StringToken(')', 'Closes a function-call argument list or grouped expression');
const OPERATOR_LBRACE = new StringToken('{', 'Opens a block or object literal');
const OPERATOR_RBRACE = new StringToken('}', 'Closes a block or object literal');
const OPERATOR_LBRACKET = new StringToken('[', 'Opens an array literal or index accessor');
const OPERATOR_RBRACKET = new StringToken(']', 'Closes an array literal or index accessor');
const OPERATOR_COMMA = new StringToken(',', 'Separates function arguments or list/object items');
const OPERATOR_COLON = new StringToken(':', 'Separates a key from its value in an object literal');
const OPERATOR_DOT = new StringToken('.', 'Member access (`x.foo`), also doubled as `..` for string append');
const OPERATOR_PERCENT = new StringToken('%', 'Dynamic variable dereference - %name% or %(expr)%');
const LITERAL_NUMBER = new RegexToken(/-?(0[xX][0-9a-fA-F]+(_[0-9a-fA-F]+)*|0[bB][01]+(_[01]+)*|([0-9]+(_[0-9]+)*(\.[0-9]+(_[0-9]+)*)?|\.[0-9]+(_[0-9]+)*)([eE][+-]?[0-9]+)?)/, 'Numeric literal, e.g. `42`, `3.14`, `.5`, `1e6`, `1_000`, `0xFF` or `0b1010`');
const LITERAL_BOOLEAN = new RegexToken(/(true|false)\b/i, 'Boolean literal, `true` or `false` (case-insensitive)');
const LITERAL_NULL = new RegexToken(/(null|nil|undefined)\b/i, 'Empty literal, `null`, or `nil` / `undefined` for no value (case-insensitive)');
const LITERAL_NAN = new RegexToken(/(nan|infinity)\b/i, 'Special number literal, `NaN` or `Infinity` (case-insensitive)');
const LITERAL_STRING = new RegexToken(/"(?:[^"\\`]|[\\`][\s\S])*"|'(?:[^'\\`]|[\\`][\s\S])*'/, 'Double or single quoted string literal, `\\` or a backtick starts an escape');
const LITERAL_HEREDOC = new RegexToken(/<<([A-Za-z_][A-Za-z0-9_]*)[ \t]*\r?\n(?:[\s\S]*?\r?\n)?[ \t]*\1(?![A-Za-z0-9_])/, 'Heredoc, `<<END` up to a line that starts with END, kept exactly as written');
const ESCAPE = new RegexToken(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|[\s\S])/, 'Backslash escape inside a string, `\\n`, `\\t`, `\\"`, `\\\\`, `\\u{1F600}`');
const OPERATOR_BACKTICK = new StringToken('`', 'Begins and ends a template string, `${expr}` inside it gets worked out');
const KEYWORD_IF = new RegexToken(/if\b/i, 'Begins a conditional statement');
const KEYWORD_ELSE = new RegexToken(/else\b/i, 'Begins the alternate branch of a conditional statement');
const KEYWORD_LOOP = new RegexToken(/loop\b/i, 'Begins a loop statement');
const KEYWORD_in = new RegexToken(/in\b/i, 'Introduces the collection in a for-in loop');
const KEYWORD_FOR = new RegexToken(/for\b/i, 'Begins a for-in or for-of loop');
const KEYWORD_OF = new RegexToken(/of\b/i, 'Introduces the collection in a for-of loop');
const KEYWORD_AWAIT = new RegexToken(/await\b/i, 'Waits for each value in a for await loop');
const KEYWORD_BREAK = new RegexToken(/break\b/i, 'Exits the innermost loop immediately');
const KEYWORD_CONTINUE = new RegexToken(/continue\b/i, 'Skips to the next iteration of the innermost loop');
const KEYWORD_WHILE = new RegexToken(/while\b/i, 'Begins a while loop, or ends a do loop');
const KEYWORD_UNTIL = new RegexToken(/until\b/i, 'Begins an until loop, or ends a do loop');
const KEYWORD_DO = new RegexToken(/do\b/i, 'Begins a do loop that runs once before it looks at its condition');
const KEYWORD_SWITCH = new RegexToken(/switch\b/i, 'Begins a switch statement');
const KEYWORD_CASE = new RegexToken(/case\b/i, 'One or more values in a switch, `case 1, 2:`');
const KEYWORD_DEFAULT = new RegexToken(/default\b/i, 'What a switch does when no case matched');
const KEYWORD_FALLTHROUGH = new RegexToken(/fallthrough\b/i, 'Carries on into the next case of a switch');
const KEYWORD_TRY = new RegexToken(/try\b/i, 'Begins a block that catches errors thrown inside it');
const KEYWORD_CATCH = new RegexToken(/catch\b/i, 'Runs when the try block throws');
const KEYWORD_FINALLY = new RegexToken(/finally\b/i, 'Always runs after a try, whether it threw or not');
const KEYWORD_THROW = new RegexToken(/throw\b/i, 'Raises an error, catchable by an enclosing try');
const KEYWORD_RETURN = new RegexToken(/return\b/i, 'Returns a value from a function');
const KEYWORD_CLASS = new RegexToken(/class\b/i, 'Begins a class definition');
const KEYWORD_NEW = new RegexToken(/new\b/i, 'Constructs a new instance of a class');
const OPERATOR_RANGE = new StringToken('..', 'Range, `1..10` or `1..10..2` for every 2nd');
const OPERATOR_HASH = new StringToken('#', 'Begins a top-of-script directive - #Name(args)');
const LINE_COMMENT = new RegexToken(/;[^\r\n]*/);
const WHITESPACE = new RegexToken(/[ \t]+/);
const NEWLINE = new RegexToken(/\r?\n/);
var ItemType;
(function(ItemType) {
	// statements
	ItemType[ItemType["ASSIGNMENT"] = 0] = "ASSIGNMENT";
	ItemType[ItemType["IF"] = 1] = "IF";
	ItemType[ItemType["LOOP"] = 2] = "LOOP";
	ItemType[ItemType["FOR_IN"] = 31] = "FOR_IN";
	ItemType[ItemType["FOR_OF"] = 44] = "FOR_OF";
	ItemType[ItemType["BREAK"] = 32] = "BREAK";
	ItemType[ItemType["CONTINUE"] = 41] = "CONTINUE";
	ItemType[ItemType["NOT"] = 42] = "NOT";
	ItemType[ItemType["RETURN"] = 3] = "RETURN";
	ItemType[ItemType["FUNCTION_DEFINITION"] = 4] = "FUNCTION_DEFINITION";
	ItemType[ItemType["STATEMENT_MAX"] = 5] = "STATEMENT_MAX";
	// statement and expression
	ItemType[ItemType["FUNCTION_CALL"] = 6] = "FUNCTION_CALL";
	// expressions
	ItemType[ItemType["TERNARY"] = 7] = "TERNARY";
	ItemType[ItemType["OR"] = 8] = "OR";
	ItemType[ItemType["AND"] = 9] = "AND";
	ItemType[ItemType["EQUALS"] = 10] = "EQUALS";
	ItemType[ItemType["NOT_EQUALS"] = 11] = "NOT_EQUALS";
	ItemType[ItemType["GREATER_THAN"] = 12] = "GREATER_THAN";
	ItemType[ItemType["GREATER_EQUAL"] = 13] = "GREATER_EQUAL";
	ItemType[ItemType["LESS_THAN"] = 14] = "LESS_THAN";
	ItemType[ItemType["LESS_EQUAL"] = 15] = "LESS_EQUAL";
	ItemType[ItemType["CONCAT"] = 16] = "CONCAT";
	ItemType[ItemType["BITWISE_AND"] = 17] = "BITWISE_AND";
	ItemType[ItemType["BITWISE_OR"] = 18] = "BITWISE_OR";
	ItemType[ItemType["BITWISE_XOR"] = 19] = "BITWISE_XOR";
	ItemType[ItemType["BIT_SHIFT"] = 20] = "BIT_SHIFT";
	ItemType[ItemType["INC"] = 33] = "INC";
	ItemType[ItemType["DEC"] = 34] = "DEC";
	ItemType[ItemType["APP"] = 35] = "APP";
	ItemType[ItemType["ADD"] = 21] = "ADD";
	ItemType[ItemType["SUB"] = 22] = "SUB";
	ItemType[ItemType["MUL"] = 23] = "MUL";
	ItemType[ItemType["DIV"] = 24] = "DIV";
	ItemType[ItemType["LITERAL"] = 25] = "LITERAL";
	ItemType[ItemType["VARIABLE"] = 26] = "VARIABLE";
	ItemType[ItemType["OBJECT"] = 27] = "OBJECT";
	ItemType[ItemType["ARRAY"] = 28] = "ARRAY";
	ItemType[ItemType["MEMBER_ACCESS"] = 29] = "MEMBER_ACCESS";
	ItemType[ItemType["METHOD_CALL"] = 30] = "METHOD_CALL";
	ItemType[ItemType["VALUE"] = 36] = "VALUE";
	ItemType[ItemType["DEREF"] = 37] = "DEREF";
	ItemType[ItemType["DIRECTIVE"] = 38] = "DIRECTIVE";
	ItemType[ItemType["CLASS_DEFINITION"] = 39] = "CLASS_DEFINITION";
	ItemType[ItemType["NEW_INSTANCE"] = 40] = "NEW_INSTANCE";
	ItemType[ItemType["TEMPLATE"] = 43] = "TEMPLATE";
	ItemType[ItemType["RANGE"] = 45] = "RANGE";
	ItemType[ItemType["WHILE"] = 46] = "WHILE";
	ItemType[ItemType["DO_WHILE"] = 47] = "DO_WHILE";
	ItemType[ItemType["SWITCH"] = 48] = "SWITCH";
	ItemType[ItemType["FALLTHROUGH"] = 49] = "FALLTHROUGH";
	ItemType[ItemType["TRY"] = 50] = "TRY";
	ItemType[ItemType["THROW"] = 51] = "THROW";
})(ItemType || (ItemType = {}));
const BINARY_OPS = [
	ItemType.OR,
	ItemType.AND,
	ItemType.EQUALS,
	ItemType.NOT_EQUALS,
	ItemType.GREATER_THAN,
	ItemType.GREATER_EQUAL,
	ItemType.LESS_THAN,
	ItemType.LESS_EQUAL,
	ItemType.CONCAT,
	ItemType.BITWISE_AND,
	ItemType.BITWISE_OR,
	ItemType.BITWISE_XOR,
	ItemType.BIT_SHIFT,
	ItemType.ADD,
	ItemType.SUB,
	ItemType.MUL,
	ItemType.DIV
];
const EMPTY = '  ';
const LINE = '│ ';
const ITEM = '├─';
const LAST = '└─';
const BINARY_OP_PRECEDENCE = [
	[{
		token: OPERATOR_OR,
		type: ItemType.OR
	}, ],
	[{
		token: OPERATOR_AND,
		type: ItemType.AND
	}, ],
	[{
		token: OPERATOR_STRICT_EQUAL,
		type: ItemType.EQUALS,
		extra: { mode: "strict" }
	}, {
		token: OPERATOR_STRICT_NOT_EQUAL,
		type: ItemType.NOT_EQUALS,
		extra: { mode: "strict" }
	}, {
		token: OPERATOR_CASE_EQUAL,
		type: ItemType.EQUALS,
		extra: { mode: "case" }
	}, {
		token: OPERATOR_LOOSE_NOT_EQUAL,
		type: ItemType.NOT_EQUALS
	}, {
		token: OPERATOR_LOOSE_EQUAL,
		type: ItemType.EQUALS
	}, ],
	[{
		token: OPERATOR_LESS_EQUAL,
		type: ItemType.LESS_EQUAL
	}, {
		token: OPERATOR_GREATER_EQUAL,
		type: ItemType.GREATER_EQUAL
	}, {
		token: OPERATOR_GREATER,
		type: ItemType.GREATER_THAN
	}, {
		token: OPERATOR_LESS,
		type: ItemType.LESS_THAN
	}, ],
	[{
		token: OPERATOR_CONCAT,
		type: ItemType.CONCAT
	}, ],
	[{
		token: OPERATOR_BITWISE_OR,
		type: ItemType.BITWISE_OR
	}, ],
	[{
		token: OPERATOR_BITWISE_XOR,
		type: ItemType.BITWISE_XOR
	}, ],
	[{
		token: OPERATOR_BITWISE_AND,
		type: ItemType.BITWISE_AND
	}, ],
	[{
		token: OPERATOR_BIT_SHIFT_LEFT,
		type: ItemType.BIT_SHIFT,
		extra: { direction: "LEFT" }
	}, {
		token: OPERATOR_BIT_SHIFT_RIGHT,
		type: ItemType.BIT_SHIFT,
		extra: { direction: "RIGHT" }
	}, ],
	[{
		token: OPERATOR_ADD,
		type: ItemType.ADD
	}, {
		token: OPERATOR_SUB,
		type: ItemType.SUB
	}, ],
	[{
		token: OPERATOR_MUL,
		type: ItemType.MUL
	}, {
		token: OPERATOR_DIV,
		type: ItemType.DIV
	}, ],
];
// matches at the end of the input
class EofToken {
	scan(haystack, position) {
		return position >= haystack.length ? '' : null;
	}
	toString() {
		return '<EOF>';
	}
}
class Parser {
	constructor(input, position = 0, copy_depth = 0) {
		this.input = input;
		this.position = position;
		this.copy_depth = copy_depth;
		this.loopmode = false
	}
	scan(token) {
		const result = token.scan(this.input, this.position);
		if (result) {
			this.position += result.length;
			return this.found(result);
		}
		return this.not_found();
	}
	at_end() {
		return this.position >= this.input.length;
	}
	sync_to(other) {
		this.position = other.position;
	}
	found(value) {
		return new ParserResult(this, value);
	}
	not_found() {
		return new ParserResult(this);
	}
	print_current_position() {
		let line_start = this.input.lastIndexOf('\n', this.position) + 1;
		let line_end = this.input.indexOf('\n', this.position + 1);
		if (line_end === -1) line_end = this.input.length;
		const line_num = this.input.substring(0, line_end).split('\n').length;
		const meta = chalk.gray(`pos(${this.position}) = `) + (this.input[this.position] === ' ' ? 'space' : this.input[this.position] === '\n' ? 'newline' : this.input[this.position]) + chalk.gray(`  depth = ${this.copy_depth > 0 ? chalk.yellow(this.copy_depth) : this.copy_depth}`);
		const current_line = line_start >= line_end ? '' : this.input.substring(line_start, line_end);
		return [`${chalk.gray('L' + line_num + ':')} ${current_line}`, `${' '.repeat(String(line_num).length + 2)} ${' '.repeat(Math.max(this.position - line_start, 0))}^ ${meta}`];
	}
}
class ParserResult {
	constructor(parser, value) {
		this.parser = parser;
		this.value = value;
	}
	found() {
		return this.value !== undefined;
	}
	not_found() {
		return this.value === undefined;
	}
	get() {
		if (this.value === undefined) {
			throw new Error('Call to ParserResult.get() with no result. Make sure to check found() first or pass a default value.');
		}
		return this.value;
	}
	get_with_default(default_value) {
		if (this.value === undefined) {
			if (default_value === undefined) {
				throw new Error('Call to ParserResult.get() with no result. Make sure to check found() first or pass a default value.');
			}
			return default_value;
		}
		return this.value;
	}
	or_else_supply(f) {
		return this.value === undefined ? new ParserResult(this.parser, f()) : this;
	}
	or_else_throw(message) {
		if (this.value === undefined) {
			throw Object.assign(
				new Error(),
				{
					summary: message,
					source: "parser Elsethrow",
					position: this.parser.position,
					statement: this.parser.print_current_position()[0],
					loc: this.parser.print_current_position()[1],
				}
			);
		}
		return this.value;
	}
	map(f) {
		return this.value === undefined ? this : new ParserResult(this.parser, f(this.value));
	}
	or(f) {
		return this.value === undefined ? f() : this;
	}
}
class CoyoteParser extends Parser {
	parse() {
		const parse_result = {
			statements: []
		};
		while (!this.at_end()) {
			const statement = this.parse_statement();
			if (statement.found()) {
				parse_result.statements.push(statement.get());
			}
		}
		return parse_result;
	}
	parse_statement() {
		this.log('parse_statement');
		const start = this.position;
		const statement = this.parse_statement_if()
			.or(() => this.parse_statement_loop())
			.or(() => this.parse_statement_for())
			.or(() => this.parse_statement_while())
			.or(() => this.parse_statement_do())
			.or(() => this.parse_statement_switch())
			.or(() => this.parse_statement_fallthrough())
			.or(() => this.parse_statement_try())
			.or(() => this.parse_statement_throw())
			.or(() => this.parse_statement_label())
			.or(() => this.parse_statement_return())
			.or(() => this.parse_statement_break())
			.or(() => this.parse_statement_continue())
			.or(() => this.parse_statement_directive())
			.or(() => this.parse_statement_class_definition())
			.or(() => this.parse_statement_assignment())
			.or(() => this.parse_statement_function_definition())
			.or(() => this.parse_expression_function_call())
			.or(() => this.parse_expression_base())
		this.parse_eol();
		// jank, but stops an infinite loop when a statement won't parse
		if (this.position === start) {
			throw Object.assign(
				new Error(),
				{
					summary: "Failed to parse statement.",
					source: "parser",
					position: this.position,
					statement: this.print_current_position()[0],
					loc: this.print_current_position()[1],
				}
			);
		}
		return statement;
	}
	parse_expression_incdec() {
			this.log("parse_expression_incdec")
			const lookahead_parser = this.copy()
			const varname = lookahead_parser.scan(VARIABLE)
			lookahead_parser.scan(WHITESPACE)
			const cR = (type, delta) => ({
				type,
				variable: { type: ItemType.VARIABLE, name: varname.get() },
				delta
			})
			const cOp = (operator, type, deltaValue) => {
				if (lookahead_parser.scan(operator).found()) {
					if (lookahead_parser.scan(operator).found()) {
						// x.. on its own is an append of nothing, n..10 is a range
						if (operator === OPERATOR_DOT && !/^[ \t]*(\r?\n|$|[,;)}])/.test(lookahead_parser.input.slice(lookahead_parser.position))) {
							return null
						}
						this.sync_to(lookahead_parser)
						return this.found(cR(type, { type: ItemType.LITERAL, value: deltaValue }))
					} else if (lookahead_parser.scan(OPERATOR_EQUAL).found()) {
						this.sync_to(lookahead_parser)
						return this.found(cR(type, this.parse_expression().get()))
					}
				}
				return null
			}
			return (
				cOp(OPERATOR_ADD, ItemType.INC, 1) ||
				cOp(OPERATOR_SUB, ItemType.DEC, 1) ||
				cOp(OPERATOR_DOT, ItemType.APP, "") ||
				this.not_found()
			)
		}
	// %name% or %(expr)% - reads the var, then reads the var named by its value
	parse_expression_deref() {
			this.log("parse_expression_deref")
			const lookahead_parser = this.copy()
			if (lookahead_parser.scan(OPERATOR_PERCENT).not_found()) {
				return this.not_found()
			}
			lookahead_parser.scan(WHITESPACE)
			let target
			if (lookahead_parser.scan(OPERATOR_LPAREN).found()) {
				target = lookahead_parser.parse_expression().or_else_throw(`Expected expression after '%('`)
				lookahead_parser.scan(WHITESPACE)
				lookahead_parser.scan(OPERATOR_RPAREN).or_else_throw(`Expected ')' to close '%(' deref`)
				lookahead_parser.scan(WHITESPACE)
				lookahead_parser.scan(OPERATOR_PERCENT).or_else_throw(`Expected closing '%' after '%(...)'`)
			} else {
				const varname = lookahead_parser.scan(VARIABLE)
				if (varname.not_found()) {
					return this.not_found()
				}
				target = { type: ItemType.VARIABLE, name: varname.get() }
				lookahead_parser.scan(WHITESPACE)
				lookahead_parser.scan(OPERATOR_PERCENT).or_else_throw(`Expected closing '%' after '%name'`)
			}
			this.sync_to(lookahead_parser)
			return this.found({ type: ItemType.DEREF, target })
		}
	// new ClassName(args) - builds an instance and runs __init if there is one
	parse_expression_new() {
			this.log("parse_expression_new")
			const lookahead_parser = this.copy()
			if (lookahead_parser.scan(KEYWORD_NEW).not_found()) {
				return this.not_found()
			}
			lookahead_parser.scan(WHITESPACE)
			const classname = lookahead_parser.scan(VARIABLE)
			if (classname.not_found()) {
				return this.not_found()
			}
			lookahead_parser.scan(WHITESPACE)
			if (lookahead_parser.scan(OPERATOR_LPAREN).not_found()) {
				return this.not_found()
			}
			const params = []
			let expect_more_params = true
			while (expect_more_params) {
				lookahead_parser.scan(WHITESPACE)
				const value = lookahead_parser.parse_expression()
				if (value.not_found()) {
					break
				}
				params.push(value.get())
				lookahead_parser.scan(WHITESPACE)
				expect_more_params = lookahead_parser.scan(OPERATOR_COMMA).found()
			}
			lookahead_parser.scan(WHITESPACE)
			if (lookahead_parser.scan(OPERATOR_RPAREN).not_found()) {
				return this.not_found()
			}
			this.sync_to(lookahead_parser)
			return this.found({ type: ItemType.NEW_INSTANCE, classname: classname.get(), params })
		}
	parse_statement_method_call() {
		this.log('parse_statement_method_call');
		const lookahead_parser = this.copy();

		const object = lookahead_parser.scan(VARIABLE);
		if (object.not_found()) {
			return this.not_found();
		}

		const member_access = lookahead_parser.parse_member_access_expression();
		if (member_access.not_found()) {
			return this.not_found();
		}

		const method_call = lookahead_parser.parse_method_call_expression();
		if (method_call.not_found()) {
			return this.not_found();
		}

		this.sync_to(lookahead_parser);

		return this.found({
			type: ItemType.METHOD_CALL,
			object: object.get(),
			method: member_access.get(),
			arguments: method_call.get()
		});
	}
	parse_statement_assignment() {
		this.log('parse_statement_assignment');
		const lookahead_parser = this.copy();
		const varname = lookahead_parser.scan(VARIABLE);
		// todo: block keywords (if, else, etc) here
		if (varname.not_found()) {
			return this.not_found();
		}
		let left = {
			type: ItemType.VARIABLE,
			name: varname.get()
		};
		while (true) {
			let member = lookahead_parser.parse_member_access_expression();
			if (member.not_found()) {
				break;
			}
			left = {
				type: ItemType.MEMBER_ACCESS,
				value: left,
				member: member.get()
			};
		}
		lookahead_parser.scan(WHITESPACE);
		if (lookahead_parser.scan(OPERATOR_ASSIGN).not_found()) {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		return this.found({
			type: ItemType.ASSIGNMENT,
			left,
			right: this.parse_expression().or_else_throw(`Expected expression after ':='`),
		});
	}
	parse_statement_if() {
		if (this.scan(KEYWORD_IF).not_found()) {
			return this.not_found();
		}
		const condition = this.parse_expression().or_else_throw('Expected condition after if');
		this.parse_eol();
		const if_true = this.parse_block_or_statement().or_else_throw('Expected statement or block after if');
		this.parse_eol();
		const if_false = this.scan(KEYWORD_ELSE).map(() => {
			this.parse_eol();
			return this.parse_block_or_statement().or_else_throw('Expected statement or block after else');
		}).get_with_default([]);
		return this.found({
			type: ItemType.IF,
			condition,
			if_true,
			if_false
		});
	}		
    parse_statement_loop() {
        if (this.scan(KEYWORD_LOOP).not_found()) {
            return this.not_found();
        }
		this.scan(WHITESPACE);
		var lookahead_parser = this.copy();
		if (lookahead_parser.scan(OPERATOR_LPAREN).not_found()) {
			const count = {type: 25, value: -1}
			const statements = this.parse_block_or_statement().or_else_throw('Expected statement or block after loop');
			return this.found({
				type: ItemType.LOOP,
				count,
				statements
			});
		} else {
			const count = this.parse_expression().or_else_throw('loops fucked mate');
			lookahead_parser = this.copy();
			if (lookahead_parser.scan(OPERATOR_LBRACE).not_found()) {
				lookahead_parser.parse_eol()
				this.sync_to(lookahead_parser)
			} 
			const statements = this.parse_block_or_statement().or_else_throw('Expected statement or block after loop');
			return this.found({
				type: ItemType.LOOP,
				count,
				statements
			});
		}
    }
	// for (x in expr), for (x of expr) and for await (x of expr)
	parse_statement_for() {
		this.log('parse_statement_for');
		const lookahead_parser = this.copy();
		if (lookahead_parser.scan(KEYWORD_FOR).not_found()) {
			return this.not_found();
		}
		lookahead_parser.scan(WHITESPACE);
		const wait = lookahead_parser.scan(KEYWORD_AWAIT).found();
		lookahead_parser.scan(WHITESPACE);
		if (lookahead_parser.scan(OPERATOR_LPAREN).not_found()) {
			return this.not_found();
		}
		lookahead_parser.scan(WHITESPACE);
		const varname = lookahead_parser.scan(VARIABLE);
		lookahead_parser.scan(WHITESPACE);
		// looked for before the expression is, whitespace is concat and would swallow "x in"
		const kind = lookahead_parser.scan(KEYWORD_in).or(() => lookahead_parser.scan(KEYWORD_OF));
		if (varname.not_found() || kind.not_found()) {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		const iterable = this.parse_expression().or_else_throw(`Expected expression after '${kind.get()}'`);
		this.scan(OPERATOR_RPAREN).or_else_throw(`Expected ')' after for`);
		const brace = this.copy();
		if (brace.scan(OPERATOR_LBRACE).not_found()) {
			brace.parse_eol()
			this.sync_to(brace)
		}
		const statements = this.parse_block_or_statement().or_else_throw('Expected statement or block after for');
		return this.found({
			type: kind.get().toLowerCase() === 'in' ? ItemType.FOR_IN : ItemType.FOR_OF,
			variable: varname.get(),
			iterable,
			statements,
			wait
		});
	}
	parse_statement_return() {
		if (this.scan(KEYWORD_RETURN).not_found()) {
			return this.not_found();
		}
		return this.parse_expression().map(expression => ({
			type: ItemType.RETURN,
			expression
		})).or_else_supply(() => ({
			type: ItemType.RETURN
		}));
	}
	// the loop a break or continue is for, on the same line: break outer
	parse_jump_target() {
		const lookahead_parser = this.copy();
		lookahead_parser.scan(WHITESPACE);
		const name = lookahead_parser.scan(VARIABLE);
		if (name.not_found() || name.get().toLowerCase() === 'else') {
			return null;
		}
		this.sync_to(lookahead_parser);
		return name.get();
	}
	parse_statement_break() {
		if (this.scan(KEYWORD_BREAK).not_found()) {
			return this.not_found();
		}
		return this.found({type: ItemType.BREAK, target: this.parse_jump_target()});
	}
	parse_statement_continue() {
		if (this.scan(KEYWORD_CONTINUE).not_found()) {
			return this.not_found();
		}
		return this.found({type: ItemType.CONTINUE, target: this.parse_jump_target()});
	}
	// while (cond) and until (cond), until is while the other way round
	parse_statement_while() {
		this.log('parse_statement_while');
		const lookahead_parser = this.copy();
		const kind = lookahead_parser.scan(KEYWORD_WHILE).or(() => lookahead_parser.scan(KEYWORD_UNTIL));
		lookahead_parser.scan(WHITESPACE);
		// while on its own is still a name
		if (kind.not_found() || lookahead_parser.input[lookahead_parser.position] !== '(') {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		const condition = this.parse_expression().or_else_throw(`Expected condition after ${kind.get()}`);
		const brace = this.copy();
		if (brace.scan(OPERATOR_LBRACE).not_found()) {
			brace.parse_eol()
			this.sync_to(brace)
		}
		const statements = this.parse_block_or_statement().or_else_throw(`Expected statement or block after ${kind.get()}`);
		return this.found({
			type: ItemType.WHILE,
			condition,
			statements,
			until: kind.get().toLowerCase() === 'until'
		});
	}
	// do { } while (cond) and do { } until (cond), the body runs before the condition is looked at
	parse_statement_do() {
		this.log('parse_statement_do');
		const lookahead_parser = this.copy();
		if (lookahead_parser.scan(KEYWORD_DO).not_found() || /^[ \t]*(:=|=|\.|\()/.test(lookahead_parser.input.slice(lookahead_parser.position))) {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		const brace = this.copy();
		if (brace.scan(OPERATOR_LBRACE).not_found()) {
			brace.parse_eol()
			this.sync_to(brace)
		}
		const statements = this.parse_block_or_statement().or_else_throw('Expected statement or block after do');
		this.parse_eol();
		const kind = this.scan(KEYWORD_WHILE).or(() => this.scan(KEYWORD_UNTIL)).or_else_throw('Expected while or until after do');
		const condition = this.parse_expression().or_else_throw(`Expected condition after ${kind}`);
		return this.found({
			type: ItemType.DO_WHILE,
			condition,
			statements,
			until: kind.toLowerCase() === 'until'
		});
	}
	// switch (value) { case 1, 2: ... default: ... }, no falling into the next case unless it says fallthrough
	parse_statement_switch() {
		this.log('parse_statement_switch');
		const lookahead_parser = this.copy();
		lookahead_parser.scan(KEYWORD_SWITCH);
		const keyword = lookahead_parser.position > this.position;
		lookahead_parser.scan(WHITESPACE);
		if (!keyword || lookahead_parser.input[lookahead_parser.position] !== '(') {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		const subject = this.parse_expression().or_else_throw('Expected a value after switch');
		const skip = () => {
			while (this.scan(WHITESPACE).found() || this.scan(LINE_COMMENT).found() || this.scan(NEWLINE).found()) {}
		};
		skip();
		this.scan(OPERATOR_LBRACE).or_else_throw(`Expected '{' after switch`);
		const cases = [];
		while (true) {
			skip();
			if (this.scan(OPERATOR_RBRACE).found()) {
				break;
			}
			const isdefault = this.scan(KEYWORD_DEFAULT).found();
			const values = [];
			if (!isdefault) {
				this.scan(KEYWORD_CASE).or_else_throw(`Expected case, default or '}' in switch`);
				do {
					values.push(this.parse_expression().or_else_throw(`Expected a value after case`));
				} while (this.scan(OPERATOR_COMMA).found());
			}
			this.scan(WHITESPACE);
			this.scan(OPERATOR_COLON).or_else_throw(`Expected ':' after case`);
			const statements = [];
			while (true) {
				skip();
				const peek = this.copy();
				if (peek.scan(OPERATOR_RBRACE).found() || peek.scan(KEYWORD_CASE).found() || peek.scan(KEYWORD_DEFAULT).found()) {
					break;
				}
				const statement = this.parse_statement();
				if (statement.found()) {
					statements.push(statement.get());
				}
			}
			cases.push({ values, statements, isdefault });
		}
		return this.found({
			type: ItemType.SWITCH,
			subject,
			cases
		});
	}
	parse_statement_fallthrough() {
		const lookahead_parser = this.copy();
		if (lookahead_parser.scan(KEYWORD_FALLTHROUGH).not_found()) {
			return this.not_found();
		}
		// fallthrough on its own is still a name
		if (/^[ \t]*(:=|=|\.|\()/.test(lookahead_parser.input.slice(lookahead_parser.position))) {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		return this.found({type: ItemType.FALLTHROUGH});
	}
	// try { } catch (e) { } finally { }. catch's (e) is optional, and either catch or finally can stand alone
	parse_statement_try() {
		this.log('parse_statement_try');
		const lookahead_parser = this.copy();
		if (lookahead_parser.scan(KEYWORD_TRY).not_found()) {
			return this.not_found();
		}
		lookahead_parser.scan(WHITESPACE);
		// try on its own is still a name
		if (lookahead_parser.input[lookahead_parser.position] !== '{') {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		const statements = this.parse_block().or_else_throw(`Expected '{' after try`);
		this.parse_eol();
		let catchBlock = null;
		const catchLook = this.copy();
		if (catchLook.scan(KEYWORD_CATCH).found()) {
			this.sync_to(catchLook);
			this.scan(WHITESPACE);
			let variable = null;
			const parenLook = this.copy();
			if (parenLook.scan(OPERATOR_LPAREN).found()) {
				parenLook.scan(WHITESPACE);
				const name = parenLook.scan(VARIABLE);
				parenLook.scan(WHITESPACE);
				parenLook.scan(OPERATOR_RPAREN).or_else_throw(`Expected ')' after catch variable`);
				if (name.found()) {
					variable = name.get();
					this.sync_to(parenLook);
				}
			}
			const statements = this.parse_block().or_else_throw(`Expected '{' after catch`);
			catchBlock = { variable, statements };
			this.parse_eol();
		}
		let finallyBlock = null;
		const finallyLook = this.copy();
		if (finallyLook.scan(KEYWORD_FINALLY).found()) {
			this.sync_to(finallyLook);
			finallyBlock = this.parse_block().or_else_throw(`Expected '{' after finally`);
		}
		if (!catchBlock && !finallyBlock) {
			throw Object.assign(new Error(), {
				summary: `Expected catch or finally after try`,
				source: "parser",
				position: this.position,
				statement: this.print_current_position()[0],
				loc: this.print_current_position()[1],
			});
		}
		return this.found({
			type: ItemType.TRY,
			statements,
			catchBlock,
			finallyBlock
		});
	}
	parse_statement_throw() {
		this.log('parse_statement_throw');
		const lookahead_parser = this.copy();
		if (lookahead_parser.scan(KEYWORD_THROW).not_found()) {
			return this.not_found();
		}
		// throw on its own is still a name
		if (/^[ \t]*(:=|=|\.|\()/.test(lookahead_parser.input.slice(lookahead_parser.position))) {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		const expression = this.parse_expression().or_else_throw(`Expected expression after throw`);
		return this.found({
			type: ItemType.THROW,
			expression
		});
	}
	// outer: loop (3) { break outer }, a name and a colon in front of a loop
	parse_statement_label() {
		this.log('parse_statement_label');
		const lookahead_parser = this.copy();
		const name = lookahead_parser.scan(VARIABLE);
		lookahead_parser.scan(WHITESPACE);
		if (name.not_found() || lookahead_parser.scan(OPERATOR_COLON).not_found() || lookahead_parser.input[lookahead_parser.position] === '=') {
			return this.not_found();
		}
		lookahead_parser.parse_eol();
		const loop = lookahead_parser.parse_statement_loop()
			.or(() => lookahead_parser.parse_statement_for())
			.or(() => lookahead_parser.parse_statement_while())
			.or(() => lookahead_parser.parse_statement_do())
			.or_else_throw('Expected a loop after the label');
		this.sync_to(lookahead_parser);
		loop.label = name.get();
		return this.found(loop);
	}
	parse_statement_function_definition() {
		this.log('parse_statement_function_definition');
		const lookahead_parser = this.copy();
		const funcname = lookahead_parser.scan(VARIABLE);
		// todo: block keywords (if, else, etc) here
		if (funcname.not_found()) {
			return this.not_found();
		}
		if (lookahead_parser.scan(OPERATOR_LPAREN).not_found()) {
			return this.not_found();
		}
		const params = [];
		let expect_more_params = true;
		while (expect_more_params) {
			lookahead_parser.scan(WHITESPACE);
			const param_name = lookahead_parser.scan(VARIABLE);

			if (param_name.not_found()) {
				break;
			}
			let default_value = null;
			lookahead_parser.scan(WHITESPACE);
			if (lookahead_parser.scan(OPERATOR_ASSIGN).found()) {
				lookahead_parser.scan(WHITESPACE);
				default_value = lookahead_parser.parse_expression();
				if (default_value.not_found()) {
					return this.not_found();
				}
			}
			params.push({
				name: param_name.get(),
				default_value: default_value ? default_value.get() : null
			});
			lookahead_parser.scan(WHITESPACE);
			expect_more_params = lookahead_parser.scan(OPERATOR_COMMA).found();
		}
		lookahead_parser.scan(WHITESPACE);
		if (lookahead_parser.scan(OPERATOR_RPAREN).not_found()) {
			return this.not_found();
		}
		lookahead_parser.parse_eol();
		const statements = lookahead_parser.parse_block();
		if (statements.not_found()) {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		return this.found({
			type: ItemType.FUNCTION_DEFINITION,
			name: funcname.get(),
			params,
			statements: statements.get(),
		});
	}
	// #Name(args) - directive, picked up on the pre-scan with functions and classes
	parse_statement_directive() {
		this.log('parse_statement_directive');
		const lookahead_parser = this.copy();
		if (lookahead_parser.scan(OPERATOR_HASH).not_found()) {
			return this.not_found();
		}
		const dname = lookahead_parser.scan(VARIABLE);
		if (dname.not_found()) {
			return this.not_found();
		}
		if (lookahead_parser.scan(OPERATOR_LPAREN).not_found()) {
			return this.not_found();
		}
		const params = [];
		let expect_more_params = true;
		while (expect_more_params) {
			lookahead_parser.scan(WHITESPACE);
			const value = lookahead_parser.parse_expression();
			if (value.not_found()) {
				break;
			}
			params.push(value.get());
			lookahead_parser.scan(WHITESPACE);
			expect_more_params = lookahead_parser.scan(OPERATOR_COMMA).found();
		}
		lookahead_parser.scan(WHITESPACE);
		if (lookahead_parser.scan(OPERATOR_RPAREN).not_found()) {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		return this.found({
			type: ItemType.DIRECTIVE,
			name: dname.get(),
			params,
		});
	}
	// class Name { __init() {...} func() {...} } - the body is just function definitions
	parse_statement_class_definition() {
		this.log('parse_statement_class_definition');
		const lookahead_parser = this.copy();
		if (lookahead_parser.scan(KEYWORD_CLASS).not_found()) {
			return this.not_found();
		}
		lookahead_parser.scan(WHITESPACE);
		const classname = lookahead_parser.scan(VARIABLE);
		if (classname.not_found()) {
			return this.not_found();
		}
		lookahead_parser.scan(WHITESPACE);
		const body = lookahead_parser.parse_block();
		if (body.not_found()) {
			return this.not_found();
		}
		const methods = {};
		for (const stmt of body.get()) {
			if (stmt.type === ItemType.FUNCTION_DEFINITION) {
				methods[stmt.name.toLowerCase()] = stmt;
			}
		}
		this.sync_to(lookahead_parser);
		return this.found({
			type: ItemType.CLASS_DEFINITION,
			name: classname.get(),
			methods,
		});
	}
	parse_block() {
		this.scan(WHITESPACE);
		if (this.scan(OPERATOR_LBRACE).not_found()) {
			return this.not_found();
		}
		const statements = [];
		while (this.scan(OPERATOR_RBRACE).not_found()) {
			const statement = this.parse_statement();
			if (statement.found()) {
				statements.push(statement.get());
			}
		}
		this.scan(WHITESPACE);
		return this.found(statements);
	}
	parse_block_or_statement() {
		const block = this.parse_block();
		if (block.found()) {
			return block;
		}
		const statement = this.parse_statement();
		if (statement.get()) {
			return this.found([statement.get()]);
		}
		return this.not_found();
	}
	parse_expression() {
		// this.log('parse_expression');
		this.scan(WHITESPACE);
		// var := expr showing up mid-expression (function params, array
		// var := expr inside params, array items etc - try it as an assignment first
		const assign = this.parse_expression_assignment();
		if (assign.found()) {
			return assign;
		}
		let expr = this.parse_binary_op(0);
		this.scan(WHITESPACE);
		// 1..10 and 1..10..2, the step is the last part
		if (expr.found() && this.scan(OPERATOR_RANGE).found()) {
			this.scan(WHITESPACE);
			const end = this.parse_binary_op(0).or_else_throw(`Expected expression after '..'`);
			this.scan(WHITESPACE);
			const step = this.scan(OPERATOR_RANGE).found() ? (this.scan(WHITESPACE), this.parse_binary_op(0)).or_else_throw(`Expected expression after '..'`) : null;
			this.scan(WHITESPACE);
			expr = this.found({ type: ItemType.RANGE, start: expr.get(), end, step });
		}
		//console.log(expr)
		// cond ? a : b sits below everything else
		if (expr.found() && this.scan(OPERATOR_TERNARY_IF).found()) {
			const if_true = this.parse_expression().or_else_throw(`Expected expression after '?'`);
			this.scan(OPERATOR_TERNARY_ELSE).or_else_throw(`Expected ':' after '?' expression`);
			return this.found({
				type: ItemType.TERNARY,
				condition: expr.get(),
				if_true,
				if_false: this.parse_expression().or_else_throw(`Expected expression after ':'`),
			});
		}
		return expr;
	}
	parse_expression_assignment() {
		const lookahead_parser = this.copy();
		const varname = lookahead_parser.scan(VARIABLE);
		if (varname.not_found()) {
			return this.not_found();
		}
		let left = {
			type: ItemType.VARIABLE,
			name: varname.get()
		};
		while (true) {
			let member = lookahead_parser.parse_member_access_expression();
			if (member.not_found()) {
				break;
			}
			left = {
				type: ItemType.MEMBER_ACCESS,
				value: left,
				member: member.get()
			};
		}
		lookahead_parser.scan(WHITESPACE);
		if (lookahead_parser.scan(OPERATOR_ASSIGN).not_found()) {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		return this.found({
			type: ItemType.ASSIGNMENT,
			left,
			right: this.parse_expression().or_else_throw(`Expected expression after ':='`),
		});
	}
	parse_binary_op(op_index) {
		const has_ops_left = op_index < BINARY_OP_PRECEDENCE.length;
		// bitwise takes concat as its operand, everything else the next level down
		const operand = () => op_index === 7 ? this.parse_operator_concat() : has_ops_left ? this.parse_binary_op(op_index + 1) : this.parse_unary_expression();
		let left = operand();
		// loops so 10 - 3 - 2 groups from the left
		while (has_ops_left && left.found()) {
			let matched = false;
			for (const op of BINARY_OP_PRECEDENCE[op_index]) {
				const lookahead_parser = this.copy();
				lookahead_parser.scan(WHITESPACE);
				if (lookahead_parser.scan(op.token).found()) {
					// a dot straight after a dot is a range, not a concat
					if (op.type === ItemType.CONCAT && lookahead_parser.input[lookahead_parser.position] === '.') {
						continue;
					}
									//console.log(op)
					this.sync_to(lookahead_parser);
					this.scan(WHITESPACE);
					left = this.found({
						type: op.type,
						left: left.get(),
						right: operand().or_else_throw(`Expected expression after '${op.token}'`),
						...op.extra,
					});
					matched = true;
					break;
				}
			}
			if (!matched) {
				break;
			}
		}
		return left;
	}
	parse_operator_concat() {
		const left = this.parse_binary_op(8);
		if (left.found()) {
			const lookahead_parser = this.copy();
			const concat_op = lookahead_parser.scan(OPERATOR_CONCAT);
			if (concat_op.found()) {
				// a dot straight after a dot is a range
				if (concat_op.get() === '.' && lookahead_parser.input[lookahead_parser.position] === '.') {
					return left;
				}
				// a space on its own isn't necessarily concat, could be trailing whitespace
				const right = lookahead_parser.parse_operator_concat();
				if (concat_op.get() === '.') {
					right.or_else_throw(`Expected expression after '.'`);
				}
				if (right.found()) {
					this.sync_to(lookahead_parser);
					return this.found({
						type: ItemType.CONCAT,
						left: left.get(),
						right: right.get(),
					});
				}
			}
		}
		return left;
	}
	parse_unary_expression() {
		if (this.scan(OPERATOR_NOT).found()) {
			this.scan(WHITESPACE);
			const expr = this.parse_unary_expression();
			expr.or_else_throw("Expected expression after '!'");
			return this.found({
				type: ItemType.NOT,
				expression: expr.get()
			});
		}
		if (this.scan(OPERATOR_SUB).found()) {
			const expr = this.parse_unary_expression();
			expr.or_else_throw("Expected expression after '-'");
			return this.found({
				type: ItemType.SUB,
				left: { type: ItemType.LITERAL, value: 0 },
				right: expr.get()
			});
		}

		if (this.scan(OPERATOR_ADD).found()) {
			const expr = this.parse_unary_expression();
			expr.or_else_throw("Expected expression after '+'");
			return this.found({
				type: ItemType.ADD,
				left: { type: ItemType.LITERAL, value: 0 },
				right: expr.get()
			});
		}

		return this.parse_expression_base();
	}
	parse_expression_function_call() {
		this.log('parse_expression_function_call');
		const lookahead_parser = this.copy();
		const funcname = lookahead_parser.scan(VARIABLE);
		// todo: block keywords (if, else, etc) here
		if (funcname.not_found()) {
			return this.not_found();
		}
		if (lookahead_parser.scan(OPERATOR_LPAREN).not_found()) {
			return this.not_found();
		}
		const params = [];
		let expect_more_params = true;
		while (expect_more_params) {
			lookahead_parser.scan(WHITESPACE);
			const expr = lookahead_parser.parse_expression();
			if (expr.not_found()) {
				break;
			}
			params.push(expr.get());
			lookahead_parser.scan(WHITESPACE);
			expect_more_params = lookahead_parser.scan(OPERATOR_COMMA).found();
		}
		lookahead_parser.scan(WHITESPACE);
		if (lookahead_parser.scan(OPERATOR_RPAREN).not_found()) {
			return this.not_found();
		}
		this.sync_to(lookahead_parser);
		return this.found({
			type: ItemType.FUNCTION_CALL,
			name: funcname.get(),
			params,
		});
	}
	parse_expression_base() {
		let value = this.parse_expression_value();
		if (value.not_found()) {
			return this.not_found();
		}
		let expr = value.get();
		while (true) {
			const member = this.parse_member_access_expression();
			if (member.found()) {
				expr = {
					type: ItemType.MEMBER_ACCESS,
					value: expr,
					member: member.get()
				};
				continue;
			}
			const params = this.parse_method_call_expression();
			if (params.found()) {
				expr = {
					type: ItemType.METHOD_CALL,
					func: expr,
					params: params.get()
				};
				continue;
			}
			break;
		}
		return this.found(expr);
	}
	parse_expression_value() {
		if (this.scan(OPERATOR_LPAREN).found()) {
			const expr = this.parse_expression().or_else_throw(`Expected expression after '('`);
			this.scan(OPERATOR_RPAREN).or_else_throw(`Expected ')' after expression`);
			return this.found(expr);
		}
		const number = this.scan(LITERAL_NUMBER);
		if (number.found()) {
			// underscores are only for reading, the sign is peeled off first so hex and binary keep working
			const text = number.get().replace(/_/g, '');
			return this.found({
				type: ItemType.LITERAL,
				value: text[0] === '-' ? -text.slice(1) : +text,
			});
		}
		const boolean = this.scan(LITERAL_BOOLEAN);
		if (boolean.found()) {
			return this.found({
				type: ItemType.LITERAL,
				value: boolean.get().toLowerCase() === 'true',
			});
		}
		const nothing = this.scan(LITERAL_NULL);
		if (nothing.found()) {
			return this.found({
				type: ItemType.LITERAL,
				value: nothing.get().toLowerCase() === 'null' ? null : undefined,
			});
		}
		const special = this.scan(LITERAL_NAN);
		if (special.found()) {
			return this.found({
				type: ItemType.LITERAL,
				value: special.get().toLowerCase() === 'nan' ? NaN : Infinity,
			});
		}
		const string = this.scan(LITERAL_STRING);
		if (string.found()) {
			return this.found({
				type: ItemType.LITERAL,
				value: string.get(),
			});
		}
		if (this.input[this.position] === '"' || this.input[this.position] === "'") {
			this.not_found().or_else_throw('Unterminated string');
		}
		const heredoc = this.scan(LITERAL_HEREDOC);
		if (heredoc.found()) {
			// everything between the <<NAME line and the NAME line, minus the last newline
			const body = heredoc.get().match(/^<<(\w+)[ \t]*\r?\n((?:[\s\S]*?\r?\n)?)[ \t]*\1$/)[2].replace(/\r?\n$/, '').replace(/\r\n/g, '\n');
			return this.found({
				type: ItemType.TEMPLATE,
				parts: body === '' ? [] : [body],
			});
		}
		//if (this.loopmode == true) {
			return this.parse_expression_function_call().or(() => this.parse_expression_array()).or(() => this.parse_expression_object()).or(() => this.parse_expression_template()).or(() => this.parse_expression_incdec()).or(() => this.parse_expression_deref()).or(() => this.parse_expression_new()).or(() => this.parse_expression_variable())
		//} else {
		//	console.log(this.loopmode)
		//	return this.parse_expression_function_call().or(() => this.parse_expression_variable());
		//}
	}
	// `text ${expr} text` - the text part takes the same escapes as a string, \${ is a plain ${
	parse_expression_template() {
		this.log("parse_expression_template")
		if (this.scan(OPERATOR_BACKTICK).not_found()) {
			return this.not_found();
		}
		const parts = [];
		let text = '';
		while (true) {
			if (this.at_end()) {
				this.not_found().or_else_throw('Unterminated template string');
			}
			const ch = this.input[this.position];
			if (ch === '`') {
				this.position++;
				break;
			}
			const escape = this.scan(ESCAPE);
			if (escape.found()) {
				text += unescape_seq(escape.get());
				continue;
			}
			if (ch === '$' && this.input[this.position + 1] === '{') {
				if (text !== '') {
					parts.push(text);
					text = '';
				}
				this.position += 2;
				parts.push(this.parse_expression().or_else_throw(`Expected expression after '\${'`));
				this.scan(WHITESPACE);
				this.scan(OPERATOR_RBRACE).or_else_throw(`Expected '}' to close '\${'`);
				continue;
			}
			// files with windows line endings still give \n inside a template
			if (ch !== '\r' || this.input[this.position + 1] !== '\n') {
				text += ch;
			}
			this.position++;
		}
		if (text !== '') {
			parts.push(text);
		}
		return this.found({
			type: ItemType.TEMPLATE,
			parts,
		});
	}
	parse_expression_variable() {
		return this.scan(VARIABLE).map(name => ({
			type: ItemType.VARIABLE,
			name
		}));
	}
	parse_expression_array() {
		if (this.scan(OPERATOR_LBRACKET).not_found()) {
			return this.not_found();
		}

		const items = [];

		// arrays can span lines, so skip whitespace, comments and newlines before each item
		const skip_array_trivia = () => {
			while (this.scan(WHITESPACE).found() || this.scan(LINE_COMMENT).found() || this.scan(NEWLINE).found()) {}
		};
		skip_array_trivia();

		if (this.scan(OPERATOR_RBRACKET).found()) {
			return this.found({
				type: ItemType.ARRAY,
				items
			});
		}

		while (true) {
			skip_array_trivia();
			const value = this.parse_expression();
			if (value.not_found()) {
				throw new Error(`Expected value or expression in array`);
			}
			
			items.push(value.get());
			skip_array_trivia();

			if (!this.scan(OPERATOR_COMMA).found()) {
				break;
			}
		}

		skip_array_trivia();
		this.scan(OPERATOR_RBRACKET).or_else_throw(`Expected ']' to close array`);

		return this.found({
			type: ItemType.ARRAY,
			items
		});
	}
    parse_expression_object() {
        const lookahead_parser = this.copy();
        if (lookahead_parser.scan(OPERATOR_LBRACE).not_found()) {
            return this.not_found();
        }
        //console.log(lookahead_parser)
        let valid_object = false;
        while (!lookahead_parser.scan(OPERATOR_RBRACE).found()) {
            lookahead_parser.scan(WHITESPACE);
            const key = lookahead_parser.scan(LITERAL_STRING);
            if (key.not_found()) {
                break;
            }
            lookahead_parser.scan(WHITESPACE);
            if (lookahead_parser.scan(OPERATOR_COLON).not_found()) {
                break;
            }
            lookahead_parser.parse_expression();
            if (!lookahead_parser.scan(OPERATOR_COMMA).found() && lookahead_parser.scan(OPERATOR_RBRACE).not_found()) {
                break;
            }
            valid_object = true;
        }
       // console.log(valid_object)
        if (!valid_object) {
            return this.not_found();
        }
        if (this.scan(OPERATOR_LBRACE).not_found()) {
            return this.not_found();
        }

        const items = new Map();
        let keep_going = true;
        while (keep_going) {
            this.scan(WHITESPACE);
            const key = this.scan(LITERAL_STRING);
            if (key.not_found()) {
                break;
            }
            this.scan(WHITESPACE);
            this.scan(OPERATOR_COLON).or_else_throw(`Expected ':' after object key`);
            const value = this.parse_expression().or_else_throw(`Expected expression after object key and ':'`);
            items.set(key.get(), value);
            keep_going = this.scan(OPERATOR_COMMA).found();
        }
        this.scan(OPERATOR_RBRACE).or_else_throw(`Expected '}' to close object definition.`);
        return this.found({
            type: ItemType.OBJECT,
            items
        });
    }
	parse_member_access_expression() {
		this.log("parse_member_access_expression");
		if (this.input.startsWith('..', this.position)) {
			return this.not_found();
		}
		var lookahead_parser = this.copy();
		if (lookahead_parser.scan(OPERATOR_DOT).found()) {
			this.sync_to(lookahead_parser);
			const string = this.scan(VARIABLE).or_else_throw(`Expected property name after '.'`);
			return this.found({
				type: ItemType.LITERAL,
				value: string
			});
		}
		if (lookahead_parser.scan(OPERATOR_LBRACKET).found()) {
			this.sync_to(lookahead_parser);
			const params = [];
			let keep_going = true;
			while (keep_going) {
				this.scan(WHITESPACE);
				const expr = this.parse_expression();
				if (expr.not_found()) {
					break;
				}
				//console.log(expr.get())
				params.push(expr.get());
				this.scan(WHITESPACE);
				keep_going = this.scan(OPERATOR_COMMA).found();
			}
			this.scan(WHITESPACE);
			this.scan(OPERATOR_RBRACKET).or_else_throw(`Expected ']' after property expression`);
			return this.found(params);
		}
		return this.not_found();
	}
	parse_method_call_expression() {
		this.log("parse_method_call_expression");
		if (this.scan(OPERATOR_LPAREN).not_found()) {
			return this.not_found();
		}
		const params = [];
		let keep_going = true;
		while (keep_going) {
			this.scan(WHITESPACE);
			const expr = this.parse_expression();
			if (expr.not_found()) {
				break;
			}
			params.push(expr.get());
			this.scan(WHITESPACE);
			keep_going = this.scan(OPERATOR_COMMA).found();
		}
		this.scan(WHITESPACE);
		this.scan(OPERATOR_RPAREN).or_else_throw(`Expected ')' after method call`);
		return this.found(params);
	}
	parse_eol() {
		this.scan(WHITESPACE);
		this.scan(LINE_COMMENT);
		// comma separated statements on one line: var := 5, var2 := 10
		if (this.scan(OPERATOR_COMMA).found()) {
			this.scan(WHITESPACE);
			this.scan(LINE_COMMENT);
		}
		this.scan(NEWLINE);
	}
	copy() {
		if (this.copy_depth > 100) {
			throw new Error('Recursed into 100+ lookahead parsers. Maybe something is broken?');
		}
		return new CoyoteParser(this.input, this.position, this.copy_depth + 1);
	}
	not_found() {
		//let caller = stacktrace(2);
		//let is_scan = caller.function === 'scan';
		//if (is_scan) {
		//    //caller = stacktrace(3);
		//}
		//console.log(chalk.gray('not_found ' + (is_scan ? 'scan@ ' : '      ') + caller.function + ':' + caller.line));
		//console.log(this.print_current_position());
		return new ParserResult(this);
	}
	found(value) {
		const type = value?.type;
		if (typeof type === 'number') {
			//console.log(chalk.green("found " + ItemType[type] + ' @depth ' + this.copy_depth));
			// console.log(this.print_current_position());
			if (type < ItemType.STATEMENT_MAX) {
				//console.log(print_Coyote_statement(value));
			}
			if (type > ItemType.STATEMENT_MAX) {
				//console.log(print_Coyote_expression(value));
			}
		}
		return new ParserResult(this, value);
	}
	log(message) {
		//console.log(message);
		//console.log(this.print_current_position()[0]);
		//console.log(this.print_current_position()[1]);
	}
}
// edit distance, for the did you mean suggestions
function levenshtein(a, b) {
	a = String(a);
	b = String(b);
	const row = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let prev = row[0];
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const keep = row[j];
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
			prev = keep;
		}
	}
	return row[b.length];
}
// the closest name, if it is near enough to be a typo (case doesn't count)
function nearest(name, names) {
	name = String(name).toLowerCase();
	let best = null;
	let bestd = Math.floor((name.length + 1) / 3) + 1;
	for (const n of names) {
		const d = levenshtein(name, String(n).toLowerCase());
		if (d < bestd) {
			best = n;
			bestd = d;
		}
	}
	return best;
}
// 1 based line and column of a position, the line starts are kept for the last input
let line_input = null;
let line_starts = null;
function locate(input, pos) {
	if (input !== line_input) {
		line_input = input;
		line_starts = [0];
		for (let i = 0; i < input.length; i++) {
			if (input[i] === '\n') {
				line_starts.push(i + 1);
			}
		}
	}
	let lo = 0;
	let hi = line_starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (line_starts[mid] <= pos) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}
	return { line: lo + 1, col: pos - line_starts[lo] + 1 };
}
// a node without a place gets its parent's, so inline ones like the variable in x++ have one too
function place(node, where) {
	if (node === null || typeof node !== 'object') {
		return;
	}
	if (Array.isArray(node) || node instanceof Map) {
		for (const child of node.values()) {
			place(child, where);
		}
		return;
	}
	if (typeof node.type === 'number') {
		if (node.line !== undefined) {
			return;
		}
		Object.assign(node, where);
	}
	for (const child of Object.values(node)) {
		place(child, where);
	}
}
// every node remembers where it started, runtime errors use that to say where they happened
for (const name of Object.getOwnPropertyNames(CoyoteParser.prototype)) {
	const parse = CoyoteParser.prototype[name];
	if (!name.startsWith('parse_') || typeof parse !== 'function') {
		continue;
	}
	CoyoteParser.prototype[name] = function (...args) {
		let start = this.position;
		while (this.input[start] === ' ' || this.input[start] === '\t') {
			start++;
		}
		const result = parse.apply(this, args);
		if (result && result.value !== undefined) {
			place(result.value, locate(this.input, start));
		}
		return result;
	};
}
const ESCAPES = { n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', "'": "'", '\\': '\\', '`': '`', '$': '$' };
// one escape, \n or `n, \u{41} etc. anything unknown stays as written so \d still reaches a regex
function unescape_seq(seq) {
	if (seq[1] === 'u' && seq.length > 2) {
		const code = parseInt(seq.slice(2).replace(/[{}]/g, ''), 16);
		return code <= 0x10FFFF ? String.fromCodePoint(code) : seq;
	}
	return seq[1] in ESCAPES ? ESCAPES[seq[1]] : seq;
}
function unescape_string(text) {
	return text.replace(/[\\`](u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|[\s\S])/g, unescape_seq);
}
// a quoted literal as the parser kept it, minus the quotes and with the escapes worked out
function unquote(text) {
	const quote = text[0];
	if (text.length > 1 && (quote === '"' || quote === "'") && text[text.length - 1] === quote) {
		return unescape_string(text.slice(1, -1).replace(/\r\n/g, '\n'));
	}
	return text;
}
function critical(err) {
	console.log("ERROR: " + err)
	throw new Error("Halting execution");
}
function print_tree(node, prefix = '', is_last_child = false) {
	let output = '';
	output += `${node.name}\n`;
	if (node.children) {
		output += print_nodes(node.children, prefix + (is_last_child ? EMPTY : LINE));
	}
	return output;
}
function print_nodes(nodes, prefix = '') {
	let output = '';
	for (let i = 0; i < nodes.length; i++) {
		output += `${prefix + (i < nodes.length - 1 ? ITEM : LAST)}${print_tree(nodes[i], prefix, i === nodes.length - 1)}`;
	}
	return output;
}
// the label a loop was given, for the tree
function labelled(s) {
	return s.label ? chalk.gray(' ' + s.label + ':') : '';
}
function print_Coyote_tree(t) {
	return print_nodes(convert_statements(t.statements));
}
function print_Coyote_statement(s) {
	return print_tree(convert_statement(s));
}
function print_Coyote_expression(e) {
	return print_tree(convert_expression(e));
}
function convert_statements(statements) {
	return statements.map(convert_statement);
}
function convert_statement(s) {
	if (s.type === ItemType.ASSIGNMENT) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [{
				name: chalk.gray('left'),
				children: [convert_expression(s.left)]
			}, {
				name: chalk.gray('right'),
				children: [convert_expression(s.right)]
			}, ],
		};
	}
	if (s.type === ItemType.IF) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [{
				name: chalk.gray('condition'),
				children: [convert_expression(s.condition)]
			}, {
				name: chalk.gray('if_true'),
				children: convert_statements(s.if_true),
			}, {
				name: chalk.gray('if_false'),
				children: convert_statements(s.if_false),
			}, ],
		};
	}
	if (s.type === ItemType.WHILE || s.type === ItemType.DO_WHILE) {
		return {
			name: chalk.cyan(ItemType[s.type]) + (s.until ? chalk.gray(' until') : '') + labelled(s),
			children: [{
				name: chalk.gray('condition'),
				children: [convert_expression(s.condition)]
			}, {
				name: chalk.gray('statements'),
				children: convert_statements(s.statements),
			}, ],
		};
	}
	if (s.type === ItemType.SWITCH) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [{
				name: chalk.gray('subject'),
				children: [convert_expression(s.subject)]
			}].concat(s.cases.map(c => ({
				name: chalk.gray(c.isdefault ? 'default' : 'case'),
				children: c.values.map(convert_expression).concat([{
					name: chalk.gray('statements'),
					children: convert_statements(c.statements),
				}]),
			}))),
		};
	}
	if (s.type === ItemType.LOOP) {
		return {
			name: chalk.cyan(ItemType[s.type]) + labelled(s),
			children: [{
				name: chalk.gray('count'),
				children: [convert_expression(s.count)]
			}, {
				name: chalk.gray('statements'),
				children: convert_statements(s.statements),
			}, ],
		};
	}
	if (s.type === ItemType.RETURN) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: s.expression ? [{
				name: chalk.gray('expression'),
				children: [convert_expression(s.expression)]
			}] : []
		};
	}
	if (s.type === ItemType.FOR_IN || s.type === ItemType.FOR_OF) {
		return {
			name: chalk.cyan(ItemType[s.type]) + (s.wait ? chalk.gray(' await') : '') + labelled(s),
			children: [{
				name: chalk.gray('variable') + ' ' + s.variable
			}, {
				name: chalk.gray('iterable'),
				children: [convert_expression(s.iterable)]
			}, {
				name: chalk.gray('statements'),
				children: convert_statements(s.statements),
			}, ],
		};
	}
	if (s.type === ItemType.BREAK || s.type === ItemType.CONTINUE) {
		return {
			name: chalk.cyan(ItemType[s.type]) + (s.target ? ' ' + s.target : ''),
		};
	}
	if (s.type === ItemType.FALLTHROUGH) {
		return {
			name: chalk.cyan(ItemType[s.type]),
		};
	}
	if (s.type === ItemType.TRY) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [{
				name: chalk.gray('try'),
				children: convert_statements(s.statements),
			}].concat(s.catchBlock ? [{
				name: chalk.gray('catch') + (s.catchBlock.variable ? ' ' + s.catchBlock.variable : ''),
				children: convert_statements(s.catchBlock.statements),
			}] : []).concat(s.finallyBlock ? [{
				name: chalk.gray('finally'),
				children: convert_statements(s.finallyBlock),
			}] : []),
		};
	}
	if (s.type === ItemType.THROW) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [convert_expression(s.expression)]
		};
	}
	if (s.type === ItemType.FUNCTION_DEFINITION) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [{
				name: chalk.gray('name') + ' ' + s.name
			}, {
				name: chalk.gray('params'),
				children: s.params.map(p => ({
					name: p.name,
					children: p.default_value !== null ? 
						[{
							name: chalk.gray('default_value'),
							children: [convert_expression(p.default_value)]
						}] : []
				})),
			}, {
				name: chalk.gray('statements'),
				children: convert_statements(s.statements),
			}]
		};
	}
	if (s.type === ItemType.METHOD_CALL) {
		//console.log(JSON.stringify(s))
		//console.log(s)
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [{
				name: chalk.gray('func'),
				children: [convert_expression(s.func)]
			}, {
				name: chalk.gray('params'),
				children: s.params.map(convert_expression)
			}, ],
		};
	}
	if (s.type === ItemType.INC) {
		console.log(s)
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [
				convert_expression(s.variable),
				convert_expression(s.delta)
			]
		};
	}
	if (s.type === ItemType.DEC) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [
				convert_expression(s.variable),
				convert_expression(s.delta)
			]
		};
	}
	if (s.type === ItemType.APP) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [
				convert_expression(s.variable),
				convert_expression(s.delta)
			]
		};
	}
	if (s.type === ItemType.FUNCTION_CALL) {
		return convert_expression(s);
	}
	if (s.type === ItemType.CLASS_DEFINITION) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [{
				name: chalk.gray('name') + ' ' + s.name
			}, {
				name: chalk.gray('methods'),
				children: Object.values(s.methods).map(m => convert_statement(m)),
			}]
		};
	}
	if (s.type === ItemType.DIRECTIVE) {
		return {
			name: chalk.cyan(ItemType[s.type]),
			children: [{
				name: chalk.gray('name') + ' ' + s.name
			}, {
				name: chalk.gray('params'),
				children: s.params.map(p => convert_expression(p)),
			}]
		};
	}
	return {
		name: chalk.red(`Unknown statement (${ItemType[s.type]})`)
	};
}
function convert_expression(e) {
	//console.log("ce call")
	//console.log(e)
	if (BINARY_OPS.includes(e.type)) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [
				convert_expression(e.left),
				convert_expression(e.right),
			]
		};
	}
	if (e.type === ItemType.NOT) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [convert_expression(e.expression)]
		};
	}
	if (e.type === ItemType.TERNARY) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [
				convert_expression(e.condition),
				convert_expression(e.if_true),
				convert_expression(e.if_false),
			]
		};
	}
	if (e.type === ItemType.LITERAL) {
		return {
			name: chalk.yellow(e.value)
			
		};
	}
	if (e.type === ItemType.VARIABLE) {
		return {
			name: chalk.cyanBright('VAR') + ' ' + e.name
		};
	}
	if (e.type === ItemType.ASSIGNMENT) {
		// inline assignments (buf := SubStr(..., pos := ...)) need drawing too
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [{
				name: chalk.gray('left'),
				children: [convert_expression(e.left)]
			}, {
				name: chalk.gray('right'),
				children: [convert_expression(e.right)]
			}, ],
		};
	}
	if (e.type === ItemType.FUNCTION_CALL) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [{
				name: chalk.gray('name') + ' ' + e.name
			}, {
				name: chalk.gray('params'),
				children: e.params.map(p => convert_expression(p)),
			}, ]
		};
	}
	if (e.type === ItemType.OBJECT) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [...e.items.entries()].map(([name, value]) => ({
				name,
				children: [convert_expression(value)]
			})),
		};
	}
	if (e.type === ItemType.ARRAY) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: e.items.map((value) => convert_expression(value)),
		};
	}
	if (e.type === ItemType.MEMBER_ACCESS) {
		//console.log(e);
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [{
				name: chalk.gray('value'),
				children: [convert_expression(e.value)],
			}, {
				name: chalk.gray('member'),
				children: (Array.isArray(e.member) ? e.member : [e.member])
					.flatMap((member) => convert_expression(member)),
			}],
		};
	}
	if (e.type === ItemType.METHOD_CALL) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [{
				name: chalk.gray('func'),
				children: [convert_expression(e.func)]
			}, {
				name: chalk.gray('params'),
				children: e.params.map(convert_expression)
			}, ],
		};
	}
	if (e.type === ItemType.DEREF) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [{
				name: chalk.gray('target'),
				children: [convert_expression(e.target)],
			}],
		};
	}
	if (e.type === ItemType.RANGE) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [convert_expression(e.start), convert_expression(e.end)].concat(e.step ? [convert_expression(e.step)] : []),
		};
	}
	if (e.type === ItemType.TEMPLATE) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: e.parts.map(p => typeof p === 'string' ? { name: chalk.yellow(JSON.stringify(p)) } : convert_expression(p)),
		};
	}
	if (e.type === ItemType.NEW_INSTANCE) {
		return {
			name: chalk.cyanBright(ItemType[e.type]),
			children: [{
				name: chalk.gray('classname') + ' ' + e.classname
			}, {
				name: chalk.gray('params'),
				children: e.params.map(convert_expression),
			}, ]
		};
	}
	//console.log(e)
	return {
		name: chalk.red(`Unknown expression (${ItemType[e.type]})`)
	};
}
class CoyoteVar {
	constructor(owner, name, ast) {
		this.owner = owner;
		this.name = name;
		this.ast = ast;
		this.solved = null;
	}
	// a var starts from a raw js value or another var, held in a VALUE node
	static from(owner, name, value) {
		if (value instanceof CoyoteVar) {
			return new CoyoteVar(owner, name, value.ast);
		}
		return new CoyoteVar(owner, name, { type: ItemType.VALUE, value: value });
	}
	// chaining just grows the tree, solve() runs it in whatever format the chain ended with
	stack(func, params) {
		const nodes = (params || []).map(p => CoyoteVar.from(this.owner, this.name, p).ast);
		return new CoyoteVar(this.owner, this.name, {
			type: ItemType.FUNCTION_CALL,
			name: func,
			params: [this.ast, ...nodes]
		});
	}
	// a var that works itself out every time it is read, A_currentTime and the like
	static live(owner, name, getter) {
		const live = new CoyoteVar(owner, name, { type: ItemType.VALUE, value: undefined });
		live.getter = getter;
		return live;
	}
	async solve() {
		if (this.getter) {
			this.solved = this.getter();
			return this.solved;
		}
		if (this.ast.type === ItemType.VALUE) {
			this.solved = this.ast.value;
			return this.solved;
		}
		this.solved = await this.owner.execute_ast(this.ast);
		return this.solved;
	}
	// thenable, so await x.tohex().upper() works
	then(good, bad) {
		return this.solve().then(good, bad);
	}
	raw() {
		if (this.getter) {
			return this.getter();
		}
		return this.ast.type === ItemType.VALUE ? this.ast.value : this.solved;
	}
	store(value) {
		this.getter = null;
		this.ast = { type: ItemType.VALUE, value: value };
		this.solved = value;
		return this;
	}
	pending() {
		return this.ast.type !== ItemType.VALUE;
	}
	clone(owner) {
		return new CoyoteVar(owner ? owner : this.owner, this.name, this.ast);
	}
	tree() {
		return print_Coyote_expression(this.ast);
	}
	toString() {
		return String(this.raw());
	}
	// every INTERNAL_ gets a lowercase method, so x.tohex().upper() in js builds the same tree as in coyote
	static bind(proto) {
		for (const key of Object.getOwnPropertyNames(proto)) {
			if (!key.startsWith('INTERNAL_')) {
				continue;
			}
			const name = key.substring(9);
			const low = name.toLowerCase();
			if (CoyoteVar.prototype[low]) {
				continue;
			}
			CoyoteVar.prototype[low] = function (...params) {
				return this.stack(name, params);
			};
		}
	}
}

class ASTExecutor {
	constructor(parent = null, quiet = false) {
		this.parent = parent;
		this.vars = {};
		this.returning = false;
		this.breaking = false;
		this.continuing = false;
		this.returned = undefined;
		this.localfuncvars = {};
		this.functions = parent ? parent.functions : {};
		this.natives = parent ? parent.natives : {};
		this.classes = parent ? parent.classes : {};
		this.settings = parent ? parent.settings : { arrayStartIndex: 0, batchLines: null, batchOps: null, strict: false, maxDepth: 1000 };
		this.onerrorhandler = parent ? parent.onerrorhandler : null;
		this.frames = parent ? parent.frames : [];
		// which loop a break or continue is heading for, and the labels of the loops it is inside
		this.jumplabel = null;
		this.labels = [];
		this.falling = false;
		this.debug = 11111111111110;
		this.initialising = true;
		this.methods = parent ? parent.methods : Object.getOwnPropertyNames(ASTExecutor.prototype)
            .filter(key => typeof this[key] === 'function' && key !== 'constructor')
            .reduce((map, key) => {
                map[key.toLowerCase()] = key;
                return map;
            }, {});
		// spawned scopes just inherit the parent's tables, no asserts or banner
		if (parent) {
			return;
		}
		CoyoteVar.bind(ASTExecutor.prototype);
		// asserts read A_pi, so it has to exist first
		this.set("A_pi", 3.141592653589793238462643383279502288419716939937);
		// what run() was given, PrintScript, PrintAST and the A_script vars read it from the root
		this.ast = null;
		this.source = "";
		this.script = "";
		// the run() function has no use for the asserts or the banner
		if (quiet) {
			this.verified = Promise.resolve()
			return;
		}
		if (debugassertionsonstartup) {
			console.log("Verifying asserts")
			// they swap console.log, so each worker has its own
			this.verified = this.verifyInWorkers()
		} else {
			this.verified = Promise.resolve()
		}
		console.log("AST Executor Initialised.")
		console.log("Script Start.")
		console.log(" ")
	}
	async make_ast(code) {
		const parser = new CoyoteParser(code);
		const r = parser.parse();
		return r
	}
	// own function and class tables per assertion, so nothing they define leaks out
	sandbox() {
		const scope = this.spawn()
		scope.functions = { ...this.functions }
		scope.classes = { ...this.classes }
		return scope
	}
	async assert_code(ast) {
		// asserts get their own scope
		const statements = (await this.make_ast(ast))['statements']
		if (statements.length === 1) {
			return (await this.sandbox().execute_ast(statements[0]))
		}
		// multi-line: one shared scope so later lines see earlier ones, print() output is captured
		const scope = this.sandbox()
		// settings are shared by reference, so each assertion gets its own copy of the defaults
		scope.settings = { ...(this.__defaultSettings || this.settings) }
		// same pre-scan run() does
		statements.forEach(statement => {
			if (statement.type === 4) {
				scope.functions[statement.name] = statement
			}
			if (statement.type === ItemType.CLASS_DEFINITION) {
				scope.classes[statement.name.toLowerCase()] = statement
			}
		})
		for (const statement of statements) {
			if (statement.type === ItemType.DIRECTIVE) {
				await scope.applyDirective(statement)
			}
		}
		const printed = []
		const realLog = console.log
		console.log = (...args) => printed.push(args.join(' '))
		let result
		try {
			result = await scope.execute_ast(statements)
		} finally {
			console.log = realLog
		}
		return printed.length ? printed.join('\n') : result[result.length - 1]
	}
	// the assertions get shared out between workers, one per core, so they run alongside the script
	verifyInWorkers() {
		const parts = Math.min(require("os").cpus().length, 8);
		return Promise.all(Array.from({ length: parts }, (_, part) => new Promise((resolve, reject) => {
			const worker = new Worker(__filename, { workerData: { part, parts } });
			worker.on('message', (result) => result.ok ? resolve() : reject({ summary: result.message }));
			worker.on('error', reject);
			worker.on('exit', resolve);
		})));
	}
	// part and parts are which share of the assertions this one runs, all of them by default
	async verifyInternalFunctions(part = 0, parts = 1) {
		// snapshot of the default settings for the assertions
		this.__defaultSettings = { ...this.settings };
		// unit tests
		const assertions = [
			{ code: 'pcChange(100, 150)', expected: 50 },
			{ code: 'pcChange(200, 100)', expected: -50 },
			{ code: 'pcChange("200", "100")', expected: -50 },
			{ code: 'addPc(100, 50)', expected: 150 },
			{ code: 'addPc(200, -50)', expected: 100 },
			{ code: 'addPc("200", "-50")', expected: 100 },
			{ code: 'subPc("100", "50")', expected: 50 },
			{ code: 'subPc(100, 50)', expected: 50 },
			{ code: 'subPc(200, -50)', expected: 300 },
			{ code: 'Round("123.456")', expected: 123 },
			{ code: 'Round(123.456)', expected: 123 },
			{ code: 'Round(123.654)', expected: 124 },
			{ code: 'StrLen("Hello")', expected: 5 },
			{ code: 'isString("Hello")', expected: 1 },
			{ code: 'isString("123")', expected: 0 },
			{ code: 'isString(123)', expected: 0 },
			{ code: 'isNum("123")', expected: 1 },
			{ code: 'isNum(123)', expected: 1 },
			{ code: 'isNum("Hello")', expected: 0 },
			{ code: 'isFloat(123.456)', expected: 1 },
			{ code: 'isFloat("123.456")', expected: 1 },
			{ code: 'isFloat(123)', expected: 0 },
			{ code: 'isFloat("123")', expected: 0 },
			{ code: 'isArray([1, 2, 3])', expected: 1 },
			{ code: 'isArray("[1, 2, 3]")', expected: 1 },
			{ code: 'isArray(123)', expected: 0 },
			{ code: 'isArray("123")', expected: 0 },
			{ code: 'isArray("123.99")', expected: 0 },
			{ code: 'isObject({"a": "1"})', expected: 1 },
			{ code: 'isObject([1, 2, 3])', expected: 0 },
			{ code: 'isODD(1)', expected: 1 },
			{ code: 'isODD(2)', expected: 0 },
			{ code: 'isEVEN(2)', expected: 1 },
			{ code: 'isEVEN(1)', expected: 0 },
			{ code: 'Invert(-1)', expected: 1 },
			{ code: 'Invert(1)', expected: -1 },
			{ code: 'Abs(-123.456)', expected: 123.456 },
			{ code: 'Abs(123.456)', expected: 123.456 },
			{ code: 'Exp(1)', expected: Math.exp(1) },
			{ code: 'Log(100)', expected: 4.605170185988092 },
			{ code: 'Floor(123.456)', expected: 123 },
			{ code: 'Sin(3.14159 / 2)', expected: 0.9999999999991198 },
			{ code: 'Sin(a_pi / 2)', expected: 1 },
			{ code: 'Sin(90, "D")', expected: 1 },
			{ code: 'Cos(3.14159)', expected: -0.9999999999964793 },
			{ code: 'Cos(a_pi)', expected: -1 },
			{ code: 'Ceil(123.456)', expected: 124 },
			{ code: 'Substr("Hello", 1, 3)', expected: 'ell' },
			{ code: 'Asc("A")', expected: 65 },
			{ code: 'Chr(65)', expected: 'A' },
			{ code: 'InStr("Hello", "e")', expected: 2 },
			{ code: 'Strepl("Hello World", "World", "Universe")', expected: 'Hello Universe' },
			{ code: 'Upper("hello")', expected: 'HELLO' },
			{ code: 'Lower("HELLO")', expected: 'hello' },
			{ code: 'Repeat("Hi", 3)', expected: 'HiHiHi' },
			{ code: 'Power(2, 3)', expected: 8 },
			{ code: 'Sqrt(16)', expected: 4 },
			{ code: 'Trunc(123.456, 2)', expected: "123.45" },
			{ code: 'Trunc(123.000000, 2)', expected: "123.00" },
			{ code: 'StrMid("test!")', expected: 3 },
			{ code: 'Occur("Hello", "l")', expected: 2 },
			{ code: 'LastOcc("wwwwwww", "w")', expected: 7 },
			{ code: 'LastOcc("Hello", "l")', expected: 4 },
			{ code: 'Pcof(50, 100)', expected: 50 },
			{ code: 'Pct(100, 50)', expected: 50 },
			{ code: 'PcChange(100, 150)', expected: 50 },
			{ code: 'AddPc(100, 50)', expected: 150 },
			{ code: 'SubPc(100, 50)', expected: 50 },
			{ code: 'ToHex(255)', expected: 'FF' },
			{ code: 'ToHex(16)', expected: '10' },
			{ code: 'FromHex("FF")', expected: 255 },
			{ code: 'ToBin(10)', expected: '1010' },
			{ code: 'FromBin("1010")', expected: 10 },
			{ code: 'ToString(123)', expected: '123' },
			{ code: 'ToNum("12.5")', expected: 12.5 },
			{ code: 'ToNum("nope")', expected: 0 },
			{ code: 'Uppercase("hi")', expected: 'HI' },
			{ code: 'Lowercase("HI")', expected: 'hi' },
			{ code: 'Type(1)', expected: 'int' },
			{ code: 'Type(1.5)', expected: 'float' },
			{ code: 'Type("a")', expected: 'string' },
			{ code: 'Trim("  pad  ")', expected: 'pad' },
			{ code: 'Trim("xxhixx", "x")', expected: 'hi' },
			{ code: 'Reverse("abc")', expected: 'cba' },
			{ code: 'Contains("hello", "ell")', expected: 1 },
			{ code: 'Contains("hello", "zz")', expected: 0 },
			{ code: 'StartsWith("hello", "he")', expected: 1 },
			{ code: 'EndsWith("hello", "lo")', expected: 1 },
			{ code: 'Pad("ab", 5, "-")', expected: 'ab---' },
			{ code: 'Pad("ab", 5, "-", "L")', expected: '---ab' },
			{ code: 'Sum([1,2,3,4])', expected: 10 },
			{ code: 'Min([5,2,9])', expected: 2 },
			{ code: 'Max([5,2,9])', expected: 9 },
			{ code: 'Avg([2,4,6])', expected: 4 },
			{ code: 'Json({"a": "1"})', expected: '{"a":"1"}' },
			{ code: 'Exec("return 6 * 7")', expected: 42 },
			{ code: 'Round(0)', expected: 0 },
			{ code: 'Round(0.5)', expected: 1 },
			{ code: 'Round(0.4)', expected: 0 },
			{ code: 'Round(-0.5)', expected: 0 },
			{ code: 'Round(-0.4)', expected: 0 },
			{ code: 'Round(2.5)', expected: 3 },
			{ code: 'Round(-2.5)', expected: -2 },
			{ code: 'Round("45.2")', expected: 45 },
			{ code: 'Round(99.999)', expected: 100 },
			{ code: 'Round(100)', expected: 100 },
			{ code: 'Round(3.14159, 2)', expected: 3.14 },
			{ code: 'Round(3.14159, 0)', expected: 3 },
			{ code: 'Round(1, 3)', expected: 1 },
			{ code: 'Round(2.995, 2)', expected: 3 },
			{ code: 'StrLen("")', expected: 0 },
			{ code: 'StrLen("a")', expected: 1 },
			{ code: 'StrLen("Hello World")', expected: 11 },
			{ code: 'StrLen(12345)', expected: 5 },
			{ code: 'StrLen("   ")', expected: 3 },
			{ code: 'StrLen("Ünïcødé")', expected: 7 },
			{ code: 'isString("")', expected: 0 },
			{ code: 'isString("0")', expected: 0 },
			{ code: 'isString("abc123")', expected: 1 },
			{ code: 'isString(" 123")', expected: 0 },
			{ code: 'isString("-5")', expected: 0 },
			{ code: 'isNum("")', expected: 1 },
			{ code: 'isNum("0")', expected: 1 },
			{ code: 'isNum("-5")', expected: 1 },
			{ code: 'isNum("5.5")', expected: 1 }, // isNum is any number, isInt is for whole numbers
			{ code: 'isNum(0)', expected: 1 },
			{ code: 'isNum(-5)', expected: 1 },
			{ code: 'isNum("abc")', expected: 0 },
			{ code: 'isInt("123")', expected: 1 },
			{ code: 'isInt(123)', expected: 1 },
			{ code: 'isInt("-5")', expected: 1 },
			{ code: 'isInt(-5)', expected: 1 },
			{ code: 'isInt("0")', expected: 1 },
			{ code: 'isInt("5.5")', expected: 0 },
			{ code: 'isInt(5.5)', expected: 0 },
			{ code: 'isInt("abc")', expected: 0 },
			{ code: 'isFloat(0)', expected: 0 },
			{ code: 'isFloat(-1.5)', expected: 1 },
			{ code: 'isFloat("0")', expected: 0 },
			{ code: 'isFloat("-1.5")', expected: 1 },
			{ code: 'isFloat("abc")', expected: 0 },
			{ code: 'isArray([])', expected: 1 },
			{ code: 'isArray([1])', expected: 0 },
			{ code: 'isArray("[]")', expected: 1 },
			{ code: 'isArray("")', expected: 0 },
			{ code: 'isArray({"a":"1"})', expected: 0 },
			{ code: 'isObject("{}")', expected: 0 }, // isObject never parses strings
			{ code: 'isObject("")', expected: 0 },
			{ code: 'isObject(123)', expected: 0 },
			{ code: 'isODD(0)', expected: 0 },
			{ code: 'isODD(-1)', expected: 1 },
			{ code: 'isODD(-2)', expected: 0 },
			{ code: 'isODD(3)', expected: 1 },
			{ code: 'isODD("5")', expected: 1 },
			{ code: 'isEVEN(0)', expected: 1 },
			{ code: 'isEVEN(-1)', expected: 0 },
			{ code: 'isEVEN(-2)', expected: 1 },
			{ code: 'isEVEN("4")', expected: 1 },
			{ code: 'Invert(0)', expected: 0 },
			{ code: 'Invert(0.5)', expected: -0.5 },
			{ code: 'Invert(-0.5)', expected: 0.5 },
			{ code: 'Invert("10")', expected: -10 },
			{ code: 'Abs(0)', expected: 0 },
			{ code: 'Abs(-0)', expected: 0 },
			{ code: 'Abs(5)', expected: 5 },
			{ code: 'Abs(-5)', expected: 5 },
			{ code: 'Abs(-3.5)', expected: 3.5 },
			{ code: 'Exp(0)', expected: 1 },
			{ code: 'Exp(2)', expected: 7.38905609893065 },
			{ code: 'Log(1)', expected: 0 },
			{ code: 'Log(1000)', expected: 6.907755278982137 },
			{ code: 'Floor(0)', expected: 0 },
			{ code: 'Floor(-1.5)', expected: -2 },
			{ code: 'Floor(1.999)', expected: 1 },
			{ code: 'Floor(-0.001)', expected: -1 },
			{ code: 'Ceil(0)', expected: 0 },
			{ code: 'Ceil(-1.5)', expected: -1 },
			{ code: 'Ceil(1.001)', expected: 2 },
			{ code: 'Sqrt(0)', expected: 0 },
			{ code: 'Sqrt(1)', expected: 1 },
			{ code: 'Sqrt(2)', expected: 1.4142135623730951 },
			{ code: 'Sqrt(100)', expected: 10 },
			{ code: 'Sqrt(81)', expected: 9 },
			{ code: 'Power(2, 0)', expected: 1 },
			{ code: 'Power(2, 10)', expected: 1024 },
			{ code: 'Power(5, 2)', expected: 25 },
			{ code: 'Power(2, -1)', expected: 0.5 },
			{ code: 'Power(-2, 2)', expected: 4 },
			{ code: 'Power(-2, 3)', expected: -8 },
			{ code: 'Power(9, 0.5)', expected: 3 },
			{ code: 'Sin(0)', expected: 0 },
			{ code: 'Sin(0, "D")', expected: 0 },
			{ code: 'Sin(180, "D")', expected: 1.2246467991473532e-16 },
			{ code: 'Cos(0)', expected: 1 },
			{ code: 'Cos(0, "D")', expected: 1 },
			{ code: 'Tan(0)', expected: 0 },
			{ code: 'Tan(0, "D")', expected: 0 },
			{ code: 'Tan(45, "D")', expected: 0.9999999999999999 },
			{ code: 'Cotan(45)', expected: 1 },
			{ code: 'Substr("Hello World", 0, 5)', expected: "Hello" },
			{ code: 'Substr("Hello World", 6)', expected: "World" },
			{ code: 'Substr("Hello World", 6, 5)', expected: "World" },
			{ code: 'Substr("Hello", 0, 0)', expected: "" },
			{ code: 'Substr("Hello", 10, 5)', expected: "" },
			{ code: 'Substr("Hello", 2)', expected: "llo" },
			{ code: 'Substr("48", 1)', expected: "8" }, // all-digit string stays a string
			{ code: 'Substr("48", 1, 1)', expected: "8" },
			{ code: 'Substr("12345", 0, 3)', expected: "123" },
			{ code: 'Substr("007", 1)', expected: "07" },
			{ code: 'Asc("Z")', expected: 90 },
			{ code: 'Asc("0")', expected: 48 },
			{ code: 'Asc(" ")', expected: 32 },
			{ code: 'Chr(97)', expected: "a" },
			{ code: 'Chr(32)', expected: " " },
			{ code: 'Chr(48)', expected: "0" },
			{ code: 'InStr("Hello World", "World")', expected: 7 },
			{ code: 'InStr("Hello World", "xyz")', expected: 0 },
			{ code: 'InStr("Hello", "H")', expected: 1 },
			{ code: 'InStr("Hello", "o")', expected: 5 },
			{ code: 'InStr("", "a")', expected: 0 },
			{ code: 'Strepl("aaa", "a", "b")', expected: "bbb" },
			{ code: 'Strepl("Hello", "l", "L")', expected: "HeLLo" },
			{ code: 'Strepl("no match", "zzz", "x")', expected: "no match" },
			{ code: 'Strepl("abc", ".", "-")', expected: "---" }, // find is a regex, "." matches anything
			{ code: 'Upper("MiXeD")', expected: "MIXED" },
			{ code: 'Lower("MiXeD")', expected: "mixed" },
			{ code: 'Uppercase("MiXeD case 123")', expected: "MIXED CASE 123" },
			{ code: 'Lowercase("MiXeD CASE 123")', expected: "mixed case 123" },
			{ code: 'Upper("")', expected: "" },
			{ code: 'Repeat("ab", 0)', expected: "" },
			{ code: 'Repeat("ab", 1)', expected: "ab" },
			{ code: 'Repeat("x", 5)', expected: "xxxxx" },
			{ code: 'Repeat("", 5)', expected: "" },
			{ code: 'Trunc(1.999, 0)', expected: "1" },
			{ code: 'Trunc(1.999, 2)', expected: "1.99" },
			{ code: 'Trunc(-1.999, 2)', expected: "-1.99" },
			{ code: 'Trunc(0, 2)', expected: "0.00" },
			{ code: 'Trunc(100, 0)', expected: "100" },
			{ code: 'StrMid("")', expected: 0.5 },
			{ code: 'StrMid("a")', expected: 1 },
			{ code: 'StrMid("ab")', expected: 1.5 },
			{ code: 'StrMid("abcd")', expected: 2.5 },
			{ code: 'StrMid("abcde")', expected: 3 },
			{ code: 'Occur("aaaa", "a")', expected: 4 },
			{ code: 'Occur("Hello", "L")', expected: 2 },
			{ code: 'Occur("Hello", "L", 2)', expected: 0 }, // 2 is case-sensitive, and there is no capital L
			{ code: 'Occur("abcabcabc", "abc")', expected: 3 },
			{ code: 'Occur("no match", "zzz")', expected: 0 },
			{ code: 'LastOcc("abcabc", "a")', expected: 4 },
			{ code: 'LastOcc("Hello", "L", 2)', expected: 0 }, // same as Occur
			{ code: 'LastOcc("no match", "zzz")', expected: 0 },
			{ code: 'Pcof(25, 200)', expected: 12.5 },
			{ code: 'Pcof(0, 100)', expected: 0 },
			{ code: 'Pcof(50, 0)', expected: "Error: Division by zero" }, // whole is a real 0, so the guard fires
			{ code: 'Pct(200, 25)', expected: 50 },
			{ code: 'Pct(50, 0)', expected: 0 },
			{ code: 'Pct(0, 50)', expected: 0 },
			{ code: 'PcChange(50, 50)', expected: 0 },
			{ code: 'PcChange(50, 25)', expected: -50 },
			{ code: 'AddPc(50, 0)', expected: 50 },
			{ code: 'AddPc(0, 50)', expected: 0 },
			{ code: 'SubPc(50, 0)', expected: 50 },
			{ code: 'SubPc(50, 100)', expected: 0 },
			{ code: 'ToHex(0)', expected: "00" },
			{ code: 'ToHex(1)', expected: "01" },
			{ code: 'ToHex(255)', expected: "FF" },
			{ code: 'ToHex(-255)', expected: "-FF" },
			{ code: 'ToHex(4096)', expected: "1000" },
			{ code: 'FromHex("ff")', expected: 255 },
			{ code: 'FromHex("0xFF")', expected: 255 },
			{ code: 'FromHex("00")', expected: 0 },
			{ code: 'ToBin(0)', expected: "0" },
			{ code: 'ToBin(1)', expected: "1" },
			{ code: 'ToBin(255)', expected: "11111111" },
			{ code: 'FromBin("0")', expected: 0 },
			{ code: 'FromBin("11111111")', expected: 255 },
			{ code: 'ToString(0)', expected: "0" },
			{ code: 'ToString(3.5)', expected: "3.5" },
			{ code: 'ToString([1,2,3])', expected: "[1,2,3]" },
			{ code: 'ToString({"a":"1"})', expected: "{\"a\":\"1\"}" },
			{ code: 'ToNum("")', expected: 0 },
			{ code: 'ToNum("3.14")', expected: 3.14 },
			{ code: 'ToNum("  42  ")', expected: 42 },
			{ code: 'ToNum("42abc")', expected: 42 },
			{ code: 'ToNum(0)', expected: 0 },
			{ code: 'Type(0)', expected: "int" },
			{ code: 'Type(-5)', expected: "int" },
			{ code: 'Type(0.1)', expected: "float" },
			{ code: 'Type("")', expected: "int" },
			{ code: 'Type([1,2])', expected: "array" },
			{ code: 'Type({"a":"1"})', expected: "object" },
			{ code: 'Trim("")', expected: "" },
			{ code: 'Trim("no-pad")', expected: "no-pad" },
			{ code: 'Trim("\t\n pad \n\t")', expected: "pad" },
			{ code: 'Trim("xxxhixxx", "x")', expected: "hi" },
			{ code: 'Trim("--hi--", "-")', expected: "hi" },
			{ code: 'Trim("  ")', expected: "" },
			{ code: 'Reverse("")', expected: "" },
			{ code: 'Reverse("a")', expected: "a" },
			{ code: 'Reverse("racecar")', expected: "racecar" },
			{ code: 'Reverse("hello")', expected: "olleh" },
			{ code: 'Reverse([1,2,3])', expected: [3, 2, 1] },
			{ code: 'Reverse([])', expected: [] },
			{ code: 'Contains("", "")', expected: 1 },
			{ code: 'Contains("abc", "")', expected: 1 },
			{ code: 'Contains([1,2,3], 2)', expected: 1 },
			{ code: 'Contains([1,2,3], 9)', expected: 0 },
			{ code: 'StartsWith("", "")', expected: 1 },
			{ code: 'StartsWith("abc", "abcd")', expected: 0 },
			{ code: 'StartsWith("abc", "")', expected: 1 },
			{ code: 'EndsWith("abc", "c")', expected: 1 },
			{ code: 'EndsWith("abc", "abcd")', expected: 0 },
			{ code: 'EndsWith("abc", "")', expected: 1 },
			{ code: 'Pad("x", 1, "-")', expected: "x" },
			{ code: 'Pad("toolong", 3, "-")', expected: "toolong" },
			{ code: 'Pad("ab", 6, "*", "C")', expected: "**ab**" },
			{ code: 'Pad("ab", 5, "*", "c")', expected: "*ab**" },
			{ code: 'Pad("", 4, "-")', expected: "----" },
			{ code: 'Sum([])', expected: 0 },
			{ code: 'Sum([1])', expected: 1 },
			{ code: 'Sum([1,2,3])', expected: 6 },
			{ code: 'Sum(["1","2","3"])', expected: 6 },
			{ code: 'Sum([1,"x",3])', expected: 4 },
			{ code: 'Min([1])', expected: 1 },
			{ code: 'Min([-5,0,5])', expected: -5 },
			{ code: 'Min([3,1,2])', expected: 1 },
			{ code: 'Max([-5,0,5])', expected: 5 },
			{ code: 'Max([3,1,2])', expected: 3 },
			{ code: 'Avg([1])', expected: 1 },
			{ code: 'Avg([1,2,3,4])', expected: 2.5 },
			{ code: 'Avg([0,0,0])', expected: 0 },
			{ code: 'Json([1,2,3])', expected: "[1,2,3]" },
			{ code: 'Json({"a":"1","b":"2"})', expected: "{\"a\":\"1\",\"b\":\"2\"}" },
			{ code: 'Json("plain")', expected: "\"plain\"" },
			{ code: 'Parse("[1,2,3]")', expected: [1, 2, 3] },
			{ code: 'Parse("not json")', expected: "" },
			{ code: 'Range(0)', expected: [0] },
			{ code: 'Range(3)', expected: [0, 1, 2, 3] },
			{ code: 'Range(2, 5)', expected: [2, 3, 4, 5] },
			{ code: 'Range(5, 2)', expected: [] },
			{ code: 'Slice([1,2,3,4,5], 1, 3)', expected: [2, 3] },
			{ code: 'Slice([1,2,3,4,5], 2)', expected: [3, 4, 5] },
			{ code: 'Slice("Hello", 1, 3)', expected: "el" },
			{ code: 'Join([1,2,3], "-")', expected: "1-2-3" },
			{ code: 'Join(["a","b","c"], "")', expected: "abc" },
			{ code: 'Flatten([1,[2,3],[4,[5]]])', expected: [1, 2, 3, 4, [5]] },
			{ code: 'Push([1,2], 3)', expected: [1, 2, 3] },
			{ code: 'Push("ab", "c")', expected: "abc" },
			{ code: 'Count([1,2,3])', expected: 3 },
			{ code: 'Count("hello")', expected: 5 },
			{ code: 'Count([])', expected: 0 },
			{ code: 'MaxIndex([1,2,3])', expected: 2 },
			{ code: 'MaxIndex("hello")', expected: 4 },
			{ code: 'MaxIndex([])', expected: -1 },
			{ code: 'Keys({"a":"1","b":"2"})', expected: ["a", "b"] },
			{ code: 'Values({"a":"1","b":"2"})', expected: ["1", "2"] },
			{ code: 'Keys([1,2,3])', expected: ["0", "1", "2"] },
			{ code: 'Sort([3,1,2])', expected: [1, 2, 3] },
			{ code: 'Sort([3,1,2], "D")', expected: [3, 2, 1] },
			{ code: 'Sort(["banana","apple","cherry"])', expected: ["apple", "banana", "cherry"] },
			{ code: 'Unique([1,1,2,2,3])', expected: [1, 2, 3] },
			{ code: 'Unique(["a","a","b"])', expected: ["a", "b"] },
			{ code: 'Repl("Hello", "l", "L")', expected: "HeLlo" },
			{ code: 'Repl("aaa", "a", "b")', expected: "baa" },
			{ code: 'StrSplit("a,b,c", ",")', expected: ["a", "b", "c"] },
			{ code: 'StrSplit("a-b-c", "-")', expected: ["a", "b", "c"] },
			{ code: 'Justify("Hi", 1, 5)', expected: "Hi   " },
			{ code: 'Justify("Hi", 3, 5)', expected: "   Hi" },
			{ code: 'Justify("Hi", 2, 6)', expected: "  Hi  " },
			{ code: 'StrClean("  a   b  ", 1+0)', expected: "a b" },
			{ code: 'StrClean("  a   b  ", 2+0)', expected: "a b" },
			{ code: 'StrClean("  a   b  ", 3+0)', expected: "ab" },
			{ code: 'Exec("return 1 + 1")', expected: 2 },
			{ code: 'Exec("return 6 * 9")', expected: 54 },
			{ code: 'Contains("hello world", "world")', expected: 1 },
			{ code: 'StartsWith("HELLO", "HE")', expected: 1 },
			{ code: 'Tan(3.14159 / 4)', expected: 0.9999986732059836 },
			{ code: 'CoTan(30)', expected: 1.7320508075688774 }, // Cotan takes degrees
			{ code: 'isNum(Rand(100))', expected: 1 }, // random, just check it's a number
			{ code: 'isNum(Dice(6))', expected: 1 }, // same
			{ code: 'Rem("Hello", "e")', expected: [ { match: 'e', pos: 1 } ] },
			{ code: 'Repl("Hello", "l", "x")', expected: 'Hexlo' }, // only the first match
			{ code: 'Repl("Hello", "l", "x", 1)', expected: 'Hexxo' }, // 4th param replaces all
			{ code: 'Repl("aaa", "a", "b", 1)', expected: 'bbb' },
			{ code: 'Grep("e", "Hello")', expected: ["Hello"] },
			{ code: 'StrSplit("Hello,World", ",")', expected: ["Hello", "World"] },
			{ code: 'Justify("Hello", 1, 10)', expected: 'Hello     ' }, // justify type is 1/2/3
			{ code: 'StrClean("  Hello  ", 1+0)', expected: 'Hello' },
			{ code: 'var := 123\nprint(var)', expected: '123' },

			// operators
			{ code: 'x := 1 + 2\nprint(x)', expected: '3' },
			{ code: 'x := 2 + 3 * 4\nprint(x)', expected: '14' },
			{ code: 'x := (2 + 3) * 4\nprint(x)', expected: '20' },
			{ code: 'x := 10 - 20\nprint(x)', expected: '-10' },
			{ code: 'x := 3.5 + 1.5\nprint(x)', expected: '5' },
			{ code: 'x := -5\nprint(x)', expected: '-5' },
			{ code: 'x := 5 == 5\nprint(x)', expected: 'true' },
			{ code: 'x := 5 == 6\nprint(x)', expected: 'false' },
			{ code: 'x := 5 != 6\nprint(x)', expected: 'true' },
			{ code: 'x := 5 > 3\nprint(x)', expected: 'true' },
			{ code: 'x := 5 < 3\nprint(x)', expected: 'false' },
			{ code: 'x := 5 >= 5\nprint(x)', expected: 'true' },
			{ code: 'x := 5 <= 4\nprint(x)', expected: 'false' },
			{ code: 'x := "abc" == "abc"\nprint(x)', expected: 'true' },
			{ code: 'x := "abc" == "abd"\nprint(x)', expected: 'false' },
			{ code: 'x := 2 & 3 | 4\nprint(x)', expected: '6' }, // & binds tighter than |
			{ code: 'x := "Hello" . " " . "World"\nprint(x)', expected: 'Hello World' },
			{ code: 'x := "a" "b" "c" "d"\nprint(x)', expected: 'abcd' },
			{ code: 'x := "a" . 5\nprint(x)', expected: 'a5' },
			{ code: 'x := 5 . "a"\nprint(x)', expected: '5a' },
			{ code: 'x := 5\nx++\nprint(x)', expected: '6' },
			{ code: 'x := 5\nx--\nprint(x)', expected: '4' },
			{ code: 'x := 5\nx+=3\nprint(x)', expected: '8' },
			{ code: 'x := 5\nx-=2\nprint(x)', expected: '3' },
			{ code: 'X := 5\nprint(x)', expected: '5' }, // variable names are case-insensitive
			{ code: 'x := 5\ny := 10\nz := x + y\nprint(z)', expected: '15' },

			// if/else and loop
			{ code: 'x := 1\nif (x == 1) { print("one") } else { if (x == 2) { print("two") } else { print("other") } }', expected: 'one' },
			{ code: 'x := 2\nif (x == 1) { print("one") } else { if (x == 2) { print("two") } else { print("other") } }', expected: 'two' },
			{ code: 'x := 99\nif (x == 1) { print("one") } else { if (x == 2) { print("two") } else { print("other") } }', expected: 'other' },
			{ code: 'sum := 0\nloop (10) { sum++ }\nprint(sum)', expected: '10' },
			{ code: 'result := ""\nloop (3) { result := result . "x" }\nprint(result)', expected: 'xxx' },
			{ code: 'count := 0\nloop (5) { count++\nif (count == 3) { break } }\nprint(count)', expected: '3' }, // break stops the loop early
			{ code: 'outer := 0\nloop (3) { inner := 0\nloop (3) { inner++ }\nouter := outer + inner }\nprint(outer)', expected: '9' }, // nested loops
			
			// break through nested ifs and blocks
			{ code: 'n := 0\nloop (10) { n++\nif (n > 2) { if (n == 4) { break } } }\nprint(n)', expected: '4' }, // break through two levels of if
			{ code: 'n := 0\nloop (10) { n++\nif (n > 1) { if (n > 2) { if (n == 5) { break } } } }\nprint(n)', expected: '5' }, // three levels deep
			{ code: 's := ""\nloop (5) { if (A_Index == 3) { break }\ns := s . A_Index }\nprint(s)', expected: '12' }, // break skips the rest of its own block, not just the next pass
			{ code: 's := ""\nloop (5) { if (A_Index == 3) { s := s . "x"\nbreak\ns := s . "y" }\ns := s . A_Index }\nprint(s)', expected: '12x' }, // and the rest of the if block it sits in
			{ code: 'n := 0\nloop (10) { n++\nif (n == 3) { print("three") } else { if (n == 4) { break } } }\nprint(n)', expected: 'three\n4' }, // break in an else branch
			{ code: 'n := 0\nloop (10) { n++\nif (n == 2)\nbreak }\nprint(n)', expected: '2' }, // brace-less if
			{ code: 's := "a"\nloop ([]) { break\ns := "b" }\nprint(s)', expected: 'a' }, // a loop over nothing never sees the break
			{ code: 'n := 0\nloop (3) { break }\nprint("after")', expected: 'after' }, // break is spent by the loop, the script carries on
			{ code: 'n := 0\nloop (5) { n++\nbreak }\nprint(n)', expected: '1' }, // unconditional break on the first pass
			{ code: 't := 0\nloop (3) { loop (5) { if (A_Index == 2) { break }\nt++ } }\nprint(t)', expected: '3' }, // break only leaves the innermost loop
			{ code: 'a := 0\nb := 0\nloop (5) { a++\nif (a == 2) { break } }\nloop (5) { b++ }\nprint(a . "," . b)', expected: '2,5' }, // a spent break does not leak into the next loop
			{ code: 'sum := 0\nloop ([5,6,7,8]) { if (A_Val == 7) { break }\nsum := sum + A_Val }\nprint(sum)', expected: '11' }, // break over an array
			{ code: 's := ""\nloop ("abcd") { if (A_Val == "c") { break }\ns := s . A_Val }\nprint(s)', expected: 'ab' }, // break over a string
			{ code: 's := ""\nloop ({"a": 1, "b": 2, "c": 3}) { if (A_Key == "c") { break }\ns := s . A_Key }\nprint(s)', expected: 'ab' }, // break over an object
			{ code: 'BREAK_TEST := 0\nloop (3) { BREAK_TEST++\nBreak }\nprint(BREAK_TEST)', expected: '1' }, // keywords are case-insensitive
			
			// continue
			{ code: 's := ""\nloop (5) { if (A_Index == 3) { continue }\ns := s . A_Index }\nprint(s)', expected: '1245' }, // continue skips just that pass
			{ code: 's := ""\nloop (6) { if (A_Index > 1) { if (A_Index < 5) { continue } }\ns := s . A_Index }\nprint(s)', expected: '156' }, // continue through two levels of if
			{ code: 'n := 0\nloop (4) { continue\nn++ }\nprint(n)', expected: '0' }, // nothing after a continue runs
			{ code: 'iters := 0\nloop (5) { iters++\ncontinue }\nprint(iters)', expected: '5' }, // continue still lets the loop run every pass
			{ code: 's := ""\nloop (5) { if (A_Index == 2) { s := s . "x" } else { continue }\ns := s . "y" }\nprint(s)', expected: 'xy' }, // continue in an else branch
			{ code: 's := ""\nloop (5) { if (A_Index == 2) { continue\ns := s . "x" }\ns := s . A_Index }\nprint(s)', expected: '1345' }, // the rest of the if block it sits in is skipped too
			{ code: 's := ""\nloop (10) { if (A_Index == 2) { continue }\nif (A_Index == 5) { break }\ns := s . A_Index }\nprint(s)', expected: '134' }, // continue and break together
			{ code: 's := ""\nloop (3) { s := s . A_Index\nloop (3) { if (A_Index == 2) { continue }\ns := s . "x" } }\nprint(s)', expected: '1xx2xx3xx' }, // continue only affects the innermost loop
			{ code: 'loop (3) { continue }\nprint("after")', expected: 'after' }, // continue is spent by the loop, the script carries on
			{ code: 'n := 0\nloop (3) { continue }\nloop (3) { n++ }\nprint(n)', expected: '3' }, // a spent continue does not leak into the next loop
			{ code: 's := ""\nloop (["a","b","c"]) { if (A_Val == "b") { continue }\ns := s . A_Val }\nprint(s)', expected: 'ac' }, // continue over an array
			{ code: 's := ""\nloop ("abc") { if (A_Val == "b") { continue }\ns := s . A_Val }\nprint(s)', expected: 'ac' }, // continue over a string
			{ code: 's := ""\nloop ({"a": 1, "b": 2, "c": 3}) { if (A_Key == "b") { continue }\ns := s . A_Key }\nprint(s)', expected: 'ac' }, // continue over an object
			{ code: 's := ""\nloop (3) { s := s . A_Index\nContinue\ns := s . "x" }\nprint(s)', expected: '123' }, // keywords are case-insensitive
			
			// neither is swallowed by names that merely start with the keyword
			{ code: 'breakfast := 1\ncontinued := 2\nbreaker := 3\ncontinue_count := 4\nprint(breakfast + continued + breaker + continue_count)', expected: '10' }, // keyword regexes stop at a word boundary
			{ code: 'breakfast := 5\nloop (3) { breakfast++ }\nprint(breakfast)', expected: '8' }, // a variable that starts with break is still a variable
			
			// a plain string "BREAK" is just a string
			{ code: 'n := 0\nloop (3) { x := "BREAK"\nn++ }\nprint(n)', expected: '3' }, // the old sentinel
			{ code: 'n := 0\nloop (3) { "BREAK"\nn++ }\nprint(n)', expected: '3' }, // as a bare expression statement
			{ code: 'n := 0\nloop (3) { print("BREAK")\nn++ }\nprint(n)', expected: 'BREAK\nBREAK\nBREAK\n3' }, // printed
			{ code: 'f() { return "BREAK" }\nn := 0\nloop (3) { r := f()\nn++ }\nprint(n . r)', expected: '3BREAK' }, // returned from a function
			{ code: 'n := 0\nloop (["BREAK", "BREAK", "BREAK"]) { n++ }\nprint(n)', expected: '3' }, // as array items being looped over
			{ code: 'n := 0\nloop (3) { x := "break"\ny := "Continue"\nn++ }\nprint(n)', expected: '3' }, // and the lower-case keywords as strings
			{ code: 'n := 0\nloop (3) { if (1) { "BREAK" }\nn++ }\nprint(n)', expected: '3' }, // as the last value of an if block
			{ code: 'x := "BREAK"\nprint(x)', expected: 'BREAK' }, // outside a loop
			
			// break / continue inside a function called from a loop
			{ code: 'f() { break }\nn := 0\nloop (3) { f()\nn++ }\nprint(n)', expected: '3' }, // a stray break in a function can't reach the caller's loop
			{ code: 'f() { continue\nreturn 1 }\nn := 0\nloop (3) { f()\nn++ }\nprint(n)', expected: '3' }, // a stray continue can't either
			{ code: 'f() { if (1) { break } }\nn := 0\nloop (3) { r := f()\nn++ }\nprint(n)', expected: '3' }, // nested inside an if in the function
			{ code: 'f() { break\nreturn 5 }\nprint(f() == 5)', expected: 'false' }, // a stray break ends the function body, the return after it never runs
			{ code: 'firstOver(limit) { r := 0\nloop (10) { r++\nif (r == limit) { break } }\nreturn r }\ntotal := 0\nloop (3) { total := total + firstOver(4) }\nprint(total)', expected: '12' }, // a function's own loop breaking leaves the caller's loop alone
			{ code: 'skipOdd(max) { s := ""\nloop (max) { if (isODD(A_Index)) { continue }\ns := s . A_Index }\nreturn s }\nout := ""\nloop (2) { out := out . skipOdd(6) . "|" }\nprint(out)', expected: '246|246|' }, // same with continue
			{ code: 'f() { loop (5) { break }\nreturn "done" }\nprint(f())', expected: 'done' }, // the function carries on after its own loop breaks
			{ code: 'f() { loop (5) { continue }\nreturn "done" }\nprint(f())', expected: 'done' }, // and after its own loop continues
			{ code: 'f(n) { if (n == 0) { return 0 }\nloop (3) { if (A_Index == 2) { break } }\nreturn n + f(n - 1) }\nprint(f(4))', expected: '10' }, // break inside a recursive function
			
			// return inside a loop
			{ code: 'find(x) { loop (10) { if (A_Index == x) { return A_Index * 10 } }\nreturn -1 }\nprint(find(3))', expected: '30' }, // return leaves the loop and the function
			{ code: 'find(x) { loop (10) { if (A_Index == x) { return A_Index * 10 } }\nreturn -1 }\nprint(find(11))', expected: '-1' }, // no hit, falls through to the last return
			{ code: 'f() { loop (3) { loop (3) { if (A_Index == 2) { return "hit" } } }\nreturn "miss" }\nprint(f())', expected: 'hit' }, // return out of two loops
			{ code: 'f() { n := 0\nloop (5) { n++\nif (n == 2) { continue }\nif (n == 4) { return n } }\nreturn "miss" }\nprint(f())', expected: '4' }, // return after a continue
			{ code: 'f() { n := 0\nloop (5) { n++\nif (n == 2) { break } }\nreturn n }\nprint(f())', expected: '2' }, // return after a break
			{ code: 'f() { loop (["a","b","c"]) { if (A_Val == "b") { return A_Key } } }\nprint(f())', expected: '1' }, // return from an array loop
			{ code: 'f() { loop (3) { return "first" }\nreturn "second" }\nprint(f())', expected: 'first' }, // unconditional return in a loop
			{ code: 'f() { loop (3) { if (A_Index == 2) { continue }\nif (A_Index == 3) { return "three" } }\nreturn "none" }\nn := 0\nloop (2) { n++\nx := f() }\nprint(n . x)', expected: '2three' }, // a return in a function's loop doesn't end the caller's loop
			
			// Exec hands the flags back as it found them
			{ code: 'n := 0\nloop (3) { Exec("break")\nn++ }\nprint(n)', expected: '3' }, // a break in an Exec string is just spent inside it
			{ code: 'Exec("break")\nprint("after")', expected: 'after' }, // even at the top level of the script
			{ code: 'Exec("continue")\nprint("after")', expected: 'after' }, // same for continue
			{ code: 'Exec("loop (5) { if (A_Index == 3) { break } }")\nprint("after")', expected: 'after' }, // a whole loop inside an Exec string
			{ code: 'n := 0\nloop (3) { Exec("loop (5) { if (A_Index == 2) { continue } }")\nn++ }\nprint(n)', expected: '3' }, // and inside a loop
			
			// instances keep their scope, so a stray break/continue mustn't stick
			{ code: 'class T { stray() { break }\nval() { a := 1\nb := 2\nreturn a + b } }\nt := new T()\nt.stray()\nprint(t.val())', expected: '3' }, // stray break in a method
			{ code: 'class T { stray() { continue }\nval() { a := 1\nb := 2\nreturn a + b } }\nt := new T()\nt.stray()\nprint(t.val())', expected: '3' }, // stray continue in a method
			{ code: 'class T { __init() { break\nx := 5 }\nval() { a := 1\nb := 2\nreturn a + b } }\nt := new T()\nprint(t.val())', expected: '3' }, // stray break in __init
			{ code: 'class T { run() { n := 0\nloop (5) { n++\nif (n == 3) { break } }\nreturn n } }\nt := new T()\nprint(t.run())\nprint(t.run())', expected: '3\n3' }, // a loop with break inside a method, twice
			{ code: 'class T { run() { s := ""\nloop (5) { if (A_Index == 2) { continue }\ns := s . A_Index }\nreturn s } }\nt := new T()\nprint(t.run())', expected: '1345' }, // a loop with continue inside a method
			{ code: 'class T { find(x) { loop (5) { if (A_Index == x) { return "hit" } }\nreturn "miss" } }\nt := new T()\nprint(t.find(2) . t.find(9))', expected: 'hitmiss' }, // return from a loop inside a method
			{ code: 'class T { stray() { break } }\nt := new T()\nn := 0\nloop (3) { t.stray()\nn++ }\nprint(n)', expected: '3' }, // a stray break in a method can't reach the caller's loop
			
			// bare return used to crash
			{ code: 'f() { return\nx := 1 }\nf()\nprint("ok")', expected: 'ok' }, // bare return at the top of a function
			{ code: 'f() { loop (3) { return } }\nf()\nprint("ok")', expected: 'ok' }, // bare return inside a loop
			{ code: 'f() { n := 0\nloop (5) { n++\nif (n == 3) { return } }\nreturn "no" }\nprint(f() == "no")', expected: 'false' }, // bare return in nested if in a loop still stops the function
			{ code: 'f() { return }\nprint(f() . "|")', expected: '0|' }, // and hands back the same nothing an empty function does
			
			// loops, previously untested
			{ code: 'loop ([10, 20]) { print(A_Index . ":" . A_Key . ":" . A_Val) }\nprint("end")', expected: '1:0:10\n2:1:20\nend' }, // array loop sets A_Index, A_Key and A_Val
			{ code: 'n := 0\nloop ([]) { n++ }\nprint(n)', expected: '0' }, // empty array
			{ code: 'n := 0\nloop ("3") { n++ }\nprint(n)', expected: '3' }, // a numeric string counts
			{ code: 's := ""\nloop ("ab") { s := s . A_Index . A_Val }\nprint(s)', expected: '1a2b' }, // string loop
			{ code: 's := ""\nloop ({"x": 1, "y": 2}) { s := s . A_Key . A_Val }\nprint(s)', expected: 'x1y2' }, // object loop
			{ code: 's := ""\nloop (2) { loop (2) { s := s . A_Index } }\nprint(s)', expected: '1212' }, // A_Index restarts for the inner loop and the outer one picks itself back up
			{ code: 'n := 0\nloop (5) { n++\nif (n == 2) { break } else { continue } }\nprint(n)', expected: '2' }, // break and continue either side of one if/else
			
			// same level groups from the left
			{ code: 'r := 10 - 3 - 2\nprint(r)', expected: '5' },
			{ code: 'r := 20 / 5 / 2\nprint(r)', expected: '2' },
			{ code: 'r := 1 + 2 - 3 + 4\nprint(r)', expected: '4' },
			{ code: 'r := 2 * 3 / 2\nprint(r)', expected: '3' },
			{ code: 'r := 100 / 10 / 5 / 2\nprint(r)', expected: '1' },
			{ code: 'r := 10 - 2 * 3 - 1\nprint(r)', expected: '3' },
			{ code: 'r := 8 >> 1 >> 1\nprint(r)', expected: '2' },
			{ code: 'r := 1 << 1 << 2\nprint(r)', expected: '8' },
			{ code: 'r := 16 >> 2 << 1\nprint(r)', expected: '8' },
			{ code: 'r := "a" . "b" . "c"\nprint(r)', expected: 'abc' }, // concat chains
			
			// precedence: mul > add > shift > concat > & > ^ > | > comparison > equality > && > || > ternary
			{ code: 'r := 1 + 2 * 3\nprint(r)', expected: '7' },
			{ code: 'r := (1 + 2) * 3\nprint(r)', expected: '9' },
			{ code: 'a := 2\nr := a + 1 = 3\nprint(r)', expected: 'true' }, // equality is below add (it used to be tighter than everything: a + (1 = 3))
			{ code: 'r := 1 + 2 * 3 = 7\nprint(r)', expected: 'true' },
			{ code: 'r := 2 + 3 = 5\nprint(r)', expected: 'true' },
			{ code: 'r := 1 < 2 = 3 < 4\nprint(r)', expected: 'true' }, // comparison is tighter than equality
			{ code: 'r := 1 < 2 = 4 < 3\nprint(r)', expected: 'false' },
			{ code: 'r := 1 + 1 << 2\nprint(r)', expected: '8' }, // add is tighter than shift
			{ code: 'r := 2 << 1 + 1\nprint(r)', expected: '8' },
			{ code: 'r := 1 << 2 | 1\nprint(r)', expected: '5' }, // shift is tighter than |
			{ code: 'r := 1 | 1 << 2\nprint(r)', expected: '5' },
			{ code: 'r := 1 << 2 = 4\nprint(r)', expected: 'true' }, // and shift is tighter than equality
			{ code: 'r := 1 < 1 << 1\nprint(r)', expected: 'true' }, // and comparison
			{ code: 'r := 8 >> 1 > 3\nprint(r)', expected: 'true' },
			{ code: 'r := 2 & 3 | 4\nprint(r)', expected: '6' }, // & is tighter than |
			{ code: 'r := 1 | 2 & 3\nprint(r)', expected: '3' },
			{ code: 'r := 6 ^ 3 & 1\nprint(r)', expected: '7' }, // & is tighter than ^
			{ code: 'r := 1 | 6 ^ 3\nprint(r)', expected: '5' }, // ^ is tighter than |
			{ code: 'r := 6 & 3 = 2\nprint(r)', expected: 'true' }, // bitwise is tighter than equality
			{ code: 'r := "a" . 1 + 2\nprint(r)', expected: 'a3' }, // concat is below add
			{ code: 'r := 1 << 2 . 3\nprint(r)', expected: '43' }, // and below shift
			{ code: 'r := "x" . 1 = "x1"\nprint(r)', expected: 'true' }, // concat is tighter than equality
			{ code: 'r := 1 . 2 = 12\nprint(r)', expected: 'true' },
			{ code: 'r := "a" . "b" ? "yes" : "no"\nprint(r)', expected: 'yes' }, // and the ternary is below concat
			
			// && and ||
			{ code: 'r := 6 & 3\nprint(r)', expected: '2' }, // & alone is still bitwise
			{ code: 'r := 6 | 1\nprint(r)', expected: '7' }, // | alone is still bitwise
			{ code: 'r := 6 && 3\nprint(r)', expected: '3' },
			{ code: 'r := "" && 3\nprint(r)', expected: '' }, // a falsy left comes back as it is
			{ code: 'r := "a" || "b"\nprint(r)', expected: 'a' },
			{ code: 'r := "" || "b"\nprint(r)', expected: 'b' },
			{ code: 'r := "" || "a" && "b"\nprint(r)', expected: 'b' }, // && binds tighter than ||
			{ code: 'r := "a" || "" && "b"\nprint(r)', expected: 'a' }, // so the right side here is ("" && "b")
			{ code: 'r := 1 = 1 && 2 = 2\nprint(r)', expected: 'true' }, // equality is tighter than &&
			{ code: 'r := 1 = 2 || 2 = 2\nprint(r)', expected: 'true' },
			{ code: 'r := 1 = 2 || 3 = 3 && 4 = 4\nprint(r)', expected: 'true' },
			{ code: 'i := 0\nr := "a" || i++\nprint(i)', expected: '0' }, // || short-circuits
			{ code: 'i := 0\nr := "" && i++\nprint(i)', expected: '0' }, // && short-circuits
			{ code: 'i := 0\nr := "" || i++\nprint(i)', expected: '1' }, // and does run the right side when it has to
			{ code: 'i := 0\nr := "a" && i++\nprint(i)', expected: '1' },
			{ code: 'r := "" || "" || "c"\nprint(r)', expected: 'c' },
			{ code: 'r := "a" && "b" && "c"\nprint(r)', expected: 'c' },
			
			// ternary
			{ code: 'r := 1 ? 2 : 3\nprint(r)', expected: '2' },
			{ code: 'r := "" ? 2 : 3\nprint(r)', expected: '3' },
			{ code: 'r := "" ? 1 : "" ? 2 : 3\nprint(r)', expected: '3' }, // chains to the right
			{ code: 'r := "a" ? "" ? 1 : 2 : 3\nprint(r)', expected: '2' }, // nests in the true branch
			{ code: 'r := 1 = 1 ? "y" : "n"\nprint(r)', expected: 'y' },
			{ code: 'r := 5 > 3 ? "big" : "small"\nprint(r)', expected: 'big' },
			{ code: 'r := 1 + 1 = 3 ? "y" : "n"\nprint(r)', expected: 'n' },
			{ code: 'i := 0\nr := 1 ? "a" : i++\nprint(i)', expected: '0' }, // only the branch it takes runs
			{ code: 'i := 0\nr := "" ? i++ : "b"\nprint(i)', expected: '0' },
			{ code: 'x := 4\nr := x > 3 ? x * 2 : x\nprint(r)', expected: '8' }, // branches are full expressions
			{ code: 'a := 1\nb := 2\nr := "" ? a : b\nprint(r)', expected: '2' },
			{ code: 'r := [1 ? 2 : 3, 4 ? 5 : 6]\nprint(r[0] . r[1])', expected: '25' }, // inside an array literal
			{ code: 'print(1 ? "a" : "b")\nprint("" ? "a" : "b")', expected: 'a\nb' }, // as a function argument
			
			// unary
			{ code: 'r := !1\nprint(r)', expected: 'false' },
			{ code: 'r := !""\nprint(r)', expected: 'true' },
			{ code: 'r := !"a"\nprint(r)', expected: 'false' },
			{ code: 'r := !!"a"\nprint(r)', expected: 'true' },
			{ code: 'r := !!""\nprint(r)', expected: 'false' },
			{ code: 'r := not ""\nprint(r)', expected: 'true' },
			{ code: 'r := NOT "a"\nprint(r)', expected: 'false' }, // case-insensitive
			{ code: 'r := not(1)\nprint(r)', expected: 'false' },
			{ code: 'r := !(1 = 2)\nprint(r)', expected: 'true' },
			{ code: 'r := !(1 = 1)\nprint(r)', expected: 'false' },
			{ code: 'x := "a"\nr := !x\nprint(r)', expected: 'false' }, // on a variable
			{ code: 'x := ""\nr := !x\nprint(r)', expected: 'true' },
			{ code: 'x := "a"\nif (x) { a := "t" } else { a := "f" }\nif (!x) { b := "t" } else { b := "f" }\nprint(a . b)', expected: 'tf' }, // ! is always the opposite of if
			{ code: 'x := ""\nif (x) { a := "t" } else { a := "f" }\nif (!x) { b := "t" } else { b := "f" }\nprint(a . b)', expected: 'ft' },
			{ code: 'r := !"" && "b"\nprint(r)', expected: 'b' }, // ! is tighter than &&
			{ code: 'r := !1 || "z"\nprint(r)', expected: 'z' }, // and than ||
			{ code: 'r := 1 != 2\nprint(r)', expected: 'true' }, // != is still not-equal
			{ code: 'r := 1 != 1\nprint(r)', expected: 'false' },
			{ code: 'notify := 5\nnothing := 6\nnot_x := 7\nr := notify + nothing + not_x\nprint(r)', expected: '18' }, // names that start with not are still names
			{ code: 'r := -3\nprint(r)', expected: '-3' },
			{ code: 'r := -(2 + 3)\nprint(r)', expected: '-5' },
			{ code: 'r := 5 - -1\nprint(r)', expected: '6' },
			{ code: 'r := 2 * -3\nprint(r)', expected: '-6' },
			{ code: 'r := -2 * 3\nprint(r)', expected: '-6' },
			{ code: 'x := 5\nprint(-x)\nprint(x -1)\nprint(x - 1)\nprint(x-1)\nprint(3 -x)\nprint(-x + 10)\nprint(+x)', expected: '-5\n4\n4\n4\n-2\n5\n5' }, // unary minus, and a minus with no space that is still subtraction
			
			// equality: = ignores case, == doesn't, === also refuses to coerce
			{ code: 'r := "a" = "A"\nprint(r)', expected: 'true' },
			{ code: 'r := "a" == "A"\nprint(r)', expected: 'false' },
			{ code: 'r := "a" === "A"\nprint(r)', expected: 'false' },
			{ code: 'r := "a" != "A"\nprint(r)', expected: 'false' }, // != goes with =
			{ code: 'r := "a" !== "A"\nprint(r)', expected: 'true' }, // !== goes with ===
			{ code: 'r := "abc" = "abc"\nprint(r)', expected: 'true' },
			{ code: 'r := "abc" == "abc"\nprint(r)', expected: 'true' },
			{ code: 'r := "abc" === "abc"\nprint(r)', expected: 'true' },
			{ code: 'r := "abc" = "abd"\nprint(r)', expected: 'false' },
			{ code: 'r := "abc" !== "abc"\nprint(r)', expected: 'false' },
			{ code: 'r := "1" = 1\nprint(r)', expected: 'true' }, // loose: a numeric string is a number
			{ code: 'r := "1" == 1\nprint(r)', expected: 'true' },
			{ code: 'r := "1" === 1\nprint(r)', expected: 'false' }, // strict: it is not
			{ code: 'r := 1 === 1\nprint(r)', expected: 'true' },
			{ code: 'r := 1 === 1.0\nprint(r)', expected: 'true' },
			{ code: 'r := 1 === 2\nprint(r)', expected: 'false' },
			{ code: 'r := "1" === "1"\nprint(r)', expected: 'true' },
			{ code: 'r := "1" === "1.0"\nprint(r)', expected: 'false' }, // two strings are compared as text
			{ code: 'r := "1" == "1.0"\nprint(r)', expected: 'true' }, // but loosely they are both numbers
			{ code: 'r := "1" = "1.0"\nprint(r)', expected: 'true' },
			{ code: 'r := "01" == 1\nprint(r)', expected: 'true' },
			{ code: 'r := "01" === 1\nprint(r)', expected: 'false' },
			{ code: 'r := 1 !== "1"\nprint(r)', expected: 'true' },
			{ code: 'r := 1 !== 1\nprint(r)', expected: 'false' },
			{ code: 'r := "a" !== "a"\nprint(r)', expected: 'false' },
			{ code: 'r := 1 != 2\nprint(r)', expected: 'true' },
			{ code: 'r := "a" != "b"\nprint(r)', expected: 'true' },
			{ code: 'r := true === true\nprint(r)', expected: 'true' },
			{ code: 'r := true === "true"\nprint(r)', expected: 'false' }, // a boolean is not its name
			{ code: 'r := true == "true"\nprint(r)', expected: 'true' },
			{ code: 'r := true !== false\nprint(r)', expected: 'true' },
			{ code: 'r := "" === ""\nprint(r)', expected: 'true' },
			{ code: 'x := 1\nprint(x === 1)\nprint(x == 1)\nprint(x = 1)\nprint(x === 2)', expected: 'true\ntrue\ntrue\nfalse' }, // variables holding a number
			{ code: 'x := 1\nprint(x === "1")\nprint(x === "1.0")\nprint(x === 1.0)', expected: 'false\nfalse\ntrue' }, // a variable keeps the type it was given, so a number is never a string
			{ code: 'y := 1 + 1\nprint(y === 2)\nprint(y !== 2)', expected: 'true\nfalse' }, // a computed number
			{ code: 's := "abc"\nprint(s === "abc")\nprint(s === "ABC")\nprint(s == "ABC")\nprint(s = "ABC")\nprint(s != "ABC")', expected: 'true\nfalse\nfalse\ntrue\nfalse' }, // a variable holding a string
			{ code: 'if ("1" === 1) { print("y") } else { print("n") }\nif ("1" == 1) { print("y") } else { print("n") }', expected: 'n\ny' }, // in an if condition
			{ code: 'x := 5\nif (x === 5) { print("y") } else { print("n") }\nif (x !== 5) { print("y") } else { print("n") }', expected: 'y\nn' },
			
			// operators sharing a first character still work
			{ code: 'r := 1 <= 1\nprint(r)', expected: 'true' },
			{ code: 'r := 2 >= 3\nprint(r)', expected: 'false' },
			{ code: 'r := 1 < 2\nprint(r)', expected: 'true' },
			{ code: 'r := 2 > 1\nprint(r)', expected: 'true' },
			{ code: 'r := 1 << 3\nprint(r)', expected: '8' },
			{ code: 'r := 16 >> 2\nprint(r)', expected: '4' },
			{ code: 'x := 3\nx += 2\nx -= 1\nprint(x)', expected: '4' }, // compound assignment (uses the = token too)
			{ code: 'x := 5\nx++\nx--\nx++\nprint(x)', expected: '6' },
			{ code: 'r := !"a" . "x"\nprint(r)', expected: 'falsex' }, // a unary in front of a concat

			// arrays and objects
			{ code: 'arr := [10, 20, 30]\nprint(arr[1])', expected: '20' },
			{ code: 'arr := [1,[2,3],4]\nprint(arr[1][0])', expected: '2' }, // nested array indexing
			{ code: 'obj := {"a": "1", "b": "2"}\nprint(obj.a)', expected: '1' },
			{ code: 'obj := {"a": "1", "b": "2"}\nprint(obj["a"])', expected: '1' },
			{ code: 'obj := {"a": {"b": "1"}}\nprint(obj.a.b)', expected: '1' }, // nested object dot-chain
			{ code: 'obj := {"name": "Neo", "age": "30"}\nprint(obj.name . " is " . obj.age)', expected: 'Neo is 30' },
			{ code: 'x := [1,2,3]\nprint(x.push(4))', expected: '1,2,3,4' }, // method-call sugar for Push

			// functions: definitions, defaults, recursion, combinations
			{ code: 'add(a, b) { return a + b }\nprint(add(3,4))', expected: '7' },
			{ code: 'greet(name := "World") { return "Hello " . name }\nprint(greet())', expected: 'Hello World' }, // default parameter
			{ code: 'greet(name := "World") { return "Hello " . name }\nprint(greet("Claude"))', expected: 'Hello Claude' },
			{ code: 'fact(n) { if (n <= 1) { return 1 } return n * fact(n - 1) }\nprint(fact(5))', expected: '120' }, // recursion
			{ code: 'fib(n) { if (n < 2) { return n } return fib(n-1) + fib(n-2) }\nprint(fib(10))', expected: '55' },
			{ code: 'double(n) { return n * 2 }\ntriple(n) { return n * 3 }\nprint(double(triple(2)))', expected: '12' }, // one function's result fed into another
			{ code: 'double(n) { return n * 2 }\nprint(Sum([double(1), double(2), double(3)]))', expected: '12' }, // function calls as array elements
			{ code: 'classify(n) { if (n > 0) { return "positive" }\nif (n < 0) { return "negative" }\nreturn "zero" }\nprint(classify(5))', expected: 'positive' },
			{ code: 'classify(n) { if (n > 0) { return "positive" }\nif (n < 0) { return "negative" }\nreturn "zero" }\nprint(classify(-5))', expected: 'negative' },
			{ code: 'classify(n) { if (n > 0) { return "positive" }\nif (n < 0) { return "negative" }\nreturn "zero" }\nprint(classify(0))', expected: 'zero' },
			{ code: 'sumTo(n) { total := 0\ni := 1\nloop (n) { total := total + i\ni++ }\nreturn total }\nprint(sumTo(5))', expected: '15' }, // function body using its own loop + accumulator
			{ code: 'greeting(name) { return "Hi " . name . "!" }\nnames := ["Alice","Bob"]\nprint(greeting(names[0]))', expected: 'Hi Alice!' }, // array element fed into a function

			// nested resolution: chains of function calls resolving into each other
			{ code: 'Sum(Range(1,5))', expected: 15 },
			{ code: 'Max(Range(1,10))', expected: 10 },
			{ code: 'Avg(Range(1,5))', expected: 3 },
			{ code: 'Join(Sort([3,1,2]), ",")', expected: '1,2,3' },
			{ code: 'Upper(Substr("Hello World", 6, 5))', expected: 'WORLD' },
			{ code: 'Contains(Lower("HELLO"), "ell")', expected: 1 },
			{ code: 'StrLen(Trim("  padded  "))', expected: 6 },
			{ code: 'Reverse(Join([1,2,3], ""))', expected: '321' },
			{ code: 'Sum(Flatten([[1,2],[3,4]]))', expected: 10 },
			{ code: 'Count(Unique([1,1,2,2,3,3]))', expected: 3 },
			{ code: 'ToNum(Substr("abc123", 3, 3))', expected: 123 },
			{ code: 'Pad(ToString(5), 3, "0", "L")', expected: '005' },
			{ code: 'isEVEN(Sum([1,2,3]))', expected: 1 },
			{ code: 'Type(ToNum("5"))', expected: 'int' },
			{ code: 'Sort(Keys({"b":"2","a":"1"}))', expected: ["a", "b"] },
			{ code: 'Round(Sqrt(50))', expected: 7 },
			{ code: 'Abs(Invert(5))', expected: 5 },
			{ code: 'Reverse(Upper("abc"))', expected: 'CBA' },
			{ code: 'Sort(Unique([3,1,2,1,3]))', expected: [1, 2, 3] },
			{ code: 'nums := [5,3,8,1,9]\nprint(Max(nums) - Min(nums))', expected: '8' },

			// values with no fixed expected result
			{ code: 'isNum(Ticks())', expected: 1 }, // Ticks is a live counter, so just check it's a number
			{ code: 'isNum(Now())', expected: 1 }, // just check it's a number
			{ code: 'Date(0)', expected: '1970-01-01T00:00:00.000Z' },
			{ code: 'Env("DEFINITELY_NOT_A_REAL_ENV_VAR_XYZ123")', expected: '' },
			{ code: 'Sleep(0)', expected: true },
			{ code: 'Purge([1, "", 2, 0, 3])', expected: [1, 2, 0, 3] }, // only the empty string gets dropped
			{ code: 'Purge({"a": "", "b": "1"})', expected: { b: '1' } },

			// comma-separated statements on one line: var := 5, var2 := 10, var3 := 30
			{ code: 'var := 5, var2 := 10, var3 := 30\nprint(var + var2 + var3)', expected: '45' },
			{ code: 'x := 1, y := 2\nprint(x)', expected: '1' }, // only the first of a comma-chain should bind here
			{ code: 'x := 1, y := 2\nprint(y)', expected: '2' },
			{ code: 'x := 1,\ny := 2\nprint(x + y)', expected: '3' }, // trailing comma followed by a real newline
			{ code: 'x := 1 , y := 2\nprint(x+y)', expected: '3' }, // whitespace around the comma
			{ code: 'x := 1, y := 2, z := 3\nif (x == 1) { print("yes") }\nprint(y + z)', expected: 'yes\n5' }, // still parses
			{ code: 'x := 0\nloop (3) { x := x + 1, print(x) }', expected: '1\n2\n3' }, // comma-chain works inside a block, not just top-level
			// commas still work in params, arrays, objects, defaults
			{ code: 'add(a, b) { return a + b }\nprint(add(3, 4))', expected: '7' },
			{ code: 'arr := [1, 2, 3]\nprint(Sum(arr))', expected: '6' },
			{ code: 'obj := {"a": "1", "b": "2"}\nprint(obj.a . obj.b)', expected: '12' },
			{ code: 'greet(name := "World") { return "Hello " . name }\nprint(greet())', expected: 'Hello World' },

			// Mod / Sign / Clamp / RandRange
			{ code: 'Mod(7, 3)', expected: 1 },
			{ code: 'Mod(10, 5)', expected: 0 },
			{ code: 'Mod(-7, 3)', expected: -1 }, // sign follows the dividend
			{ code: 'Sign(-5)', expected: -1 },
			{ code: 'Sign(5)', expected: 1 },
			{ code: 'Sign(0)', expected: 0 },
			{ code: 'Clamp(15, 0, 10)', expected: 10 },
			{ code: 'Clamp(-5, 0, 10)', expected: 0 },
			{ code: 'Clamp(5, 0, 10)', expected: 5 },
			{ code: 'Clamp(5.5, 0, 10)', expected: 5.5 },
			// random, so check the range
			{ code: 'x := RandRange(1, 10)\nresult := 0\nif (x >= 1) { if (x <= 10) { result := 1 } }\nprint(result)', expected: '1' },

			// array utilities: IndexOf / Pop / Shift / Unshift / Concat / First / Last / Shuffle
			{ code: 'IndexOf([10,20,30], 20)', expected: 1 },
			{ code: 'IndexOf([10,20,30], 99)', expected: -1 },
			{ code: 'IndexOf(["a","b","c"], "b")', expected: 1 },
			{ code: 'arr := [1,2,3]\nprint(Pop(arr))', expected: '3' }, // Pop returns the removed element
			{ code: 'arr := [1,2,3]\nPop(arr)\nprint(arr)', expected: '1,2' }, // and it mutates the array in place, same as Push
			{ code: 'arr := [1,2,3]\nprint(Shift(arr))', expected: '1' },
			{ code: 'arr := [1,2,3]\nShift(arr)\nprint(arr)', expected: '2,3' },
			{ code: 'arr := [1,2,3]\nprint(Unshift(arr, 0))', expected: '0,1,2,3' }, // Unshift returns the (mutated) array, same shape as Push
			{ code: 'Concat([1,2],[3,4])', expected: [1, 2, 3, 4] },
			{ code: 'First([1,2,3])', expected: 1 },
			{ code: 'Last([1,2,3])', expected: 3 },
			// random, so check the contents, not the order
			{ code: 'a := Shuffle([1,2,3,4,5])\nprint(Count(a))', expected: '5' },
			{ code: 'a := Shuffle([1,2,3,4,5])\nprint(Sum(a))', expected: '15' },

			// string utilities: Left / Right / Capitalize
			{ code: 'Left("Hello World", 5)', expected: 'Hello' },
			{ code: 'Right("Hello World", 5)', expected: 'World' },
			{ code: 'Right("Hi", 10)', expected: 'Hi' }, // returns the whole thing
			{ code: 'Right("Hello", 0)', expected: '' }, // 0 is special-cased, slice(-0) is slice(0)
			{ code: 'Capitalize("hELLO")', expected: 'Hello' },
			{ code: 'Capitalize("")', expected: '' },

			// object utilities: HasKey / Merge
			{ code: 'HasKey({"a":"1"}, "a")', expected: 1 },
			{ code: 'HasKey({"a":"1"}, "b")', expected: 0 },
			{ code: 'HasKey({"a":"1"}, "toString")', expected: 0 }, // inherited prototype methods don't count as keys
			{ code: 'Merge({"a":"1"}, {"b":"2"})', expected: { a: '1', b: '2' } },
			{ code: 'Merge({"a":"1"}, {"a":"2"})', expected: { a: '2' } }, // 2nd object wins on key conflicts

			// IsEmpty - works across strings, arrays and objects
			{ code: 'IsEmpty("")', expected: 1 },
			{ code: 'IsEmpty("x")', expected: 0 },
			{ code: 'IsEmpty([])', expected: 1 },
			{ code: 'IsEmpty([1])', expected: 0 },
			{ code: 'IsEmpty({"a":"1"})', expected: 0 }, // {} doesn't parse, so no empty-object case
			{ code: 'b := (c := 10) + 1\nprint(b)\nprint(c)', expected: '11\n10' }, // assignment as an expression
			{ code: 'Double(n) { return n * 2 }\nprint(Double(d := 7))\nprint(d)', expected: '14\n7' },
			{ code: 'buf := "................"\nprint(SubStr(buf, 1, pos := 5))\nprint(pos)', expected: '.....\n5' },
			{ code: 'arr := [1,2,3]\nIdent(n) { return n }\nprint(Ident(arr[0] := 99))\nprint(arr[0])', expected: '99\n99' }, // member-access targets inline too, not just plain vars

			// %name% and %(expr)% - read the var, then read the var named by its value
			{ code: 'world := "hello"\nhello := "world"\nprint(%world% %hello%)', expected: 'worldhello' }, // no space, bare whitespace concat doesn't add one
			{ code: 'a := "hello"\nb := "world"\nprint(a b)', expected: 'helloworld' }, // same with plain variables
			{ code: 'x := "y"\ny := "z"\nz := "final"\nprint(%x%)', expected: 'z' },
			{ code: 'a := "b"\nb := "the value"\nprint(%a%)', expected: 'the value' },
			{ code: 'x := "doesNotExist"\nprint(%x%)', expected: '' }, // undeclared name gives empty, not an error
			// derefs chain with indexing and member access
			{ code: 'var := ["foo", "man", "chu"]\nname := "var"\nprint(%name%[1])', expected: 'man' },
			{ code: 'name := "var"\nvar := ["foo","man","chu"]\nprint(Upper(%name%[0]))', expected: 'FOO' },
			// %(expr)% takes the name from any expression
			{ code: 'greeting := "hi"\nhi := "there"\nprint(%("g" . "r" . "eeting")%)', expected: 'hi' },
			{ code: 'foo := "picked foo"\na1 := "f"\na2 := "oo"\nprint(%(a1 a2)%)', expected: 'picked foo' }, // whitespace concat works inside %( )% too
			{ code: 'letters := ["p","q","r"]\nkey := "letters"\nprint(%(key)%[2])', expected: 'r' }, // and %( )% chains with [index]/.member afterward too

			// #ArrayStartIndex - default 0, 1 shifts every [N] read and write
			{ code: 'arr := [10,20,30]\nprint(arr[1])', expected: '20' }, // default, unchanged
			{ code: '#ArrayStartIndex(1)\narr := [10,20,30]\nprint(arr[1])', expected: '10' },
			{ code: '#ArrayStartIndex(1)\narr := [10,20,30]\nprint(arr[3])', expected: '30' },
			{ code: '#ArrayStartIndex(1)\narr := [1,2,3]\narr[1] := 99\nprint(arr)', expected: '99,2,3' }, // the write side shifts too, not just reads
			// deref plus #ArrayStartIndex(1), builds "heybongohello"
			{ code: '#ArrayStartIndex(1)\nvar1 := "h"\nvar2 := "e"\nvar3 := "y"\nvar4 := ["bingo", "bango", "bongo"]\nworld := "hello"\nhello := "world"\nheybongohello := ["yes", "this", "works"]\nprint(%(var1 var2 var3 var4[3] %hello%)%[1])', expected: 'yes' }, // [1] under #ArrayStartIndex(1) is the 1st element
			// #SetBatchLines / #SetBatchOps - parsed and stored only
			{ code: '#SetBatchLines(5)\nprint(isNum(5))', expected: '1' },
			{ code: '#SetBatchOps(3)\nprint(isNum(5))', expected: '1' },

			// classes: class Name { __init(params) {...} method(args) {...} }
			{ code: 'class Counter { __init(start) { count := start }\nadd(n) { count := count + n\nreturn count } }\nc := new Counter(10)\nprint(c.add(5))', expected: '15' },
			{ code: 'class Counter { __init(start) { count := start }\nadd(n) { count := count + n\nreturn count } }\nc := new Counter(10)\nc.add(5)\nprint(c.add(5))', expected: '20' }, // instance state persists across separate method calls
			{ code: 'class Greeter { __init(name) { myname := name }\ngreet() { return "Hello " . myname } }\ng := new Greeter("World")\nprint(g.greet())', expected: 'Hello World' },
			{ code: 'class Thing { double(n) { return n * 2 } }\nt := new Thing()\nprint(t.double(21))', expected: '42' }, // __init is optional
			{ code: 'class Box { __init(v) { val := v }\nget() { return val } }\nb1 := new Box(1)\nb2 := new Box(2)\nprint(b1.get())\nprint(b2.get())', expected: '1\n2' }, // separate instances don't share state
			// Var.func(param).round() - a class method chained into a global
			// built-in once its return value isn't a class instance anymore
			{ code: 'class Calc { addFive(n) { return n + 5 } }\nc := new Calc()\nprint(c.addFive(10).round())', expected: '15' },
			
			// typed values: a literal keeps its type through variables, arrays and objects
			{ code: 'Json([5, "5", true, null])', expected: '[5,"5",true,null]' },
			{ code: 'Json([1.5, "1.5", false])', expected: '[1.5,"1.5",false]' },
			{ code: 'arr := [1, "1", true, null, 1.5]\nprint(Json(arr))', expected: '[1,"1",true,null,1.5]' },
			{ code: 'Json({"a": 1, "b": "1", "c": true, "d": null})', expected: '{"a":1,"b":"1","c":true,"d":null}' },
			{ code: 'x := 5\ny := "5"\nz := x\nprint(Json([x, y, z]))', expected: '[5,"5",5]' },
			{ code: 'x := [1, 2]\nx[0] := "a"\nx[1] := 5\nprint(Json(x))', expected: '["a",5]' }, // array writes too
			{ code: 'Json([TRUE, True, FALSE, False])', expected: '[true,true,false,false]' }, // boolean literals ignore case
			{ code: 'x := TRUE\nprint(x === true)', expected: 'true' },
			{ code: 'x := False\nprint(x === false)', expected: 'true' },
			{ code: 'Type(true)', expected: 'boolean' },
			{ code: 'Type(2.5)', expected: 'float' },
			{ code: 'f() { return 2.5 }\nprint(Type(f()))', expected: 'float' }, // a function hands back what it was given
			{ code: 'f() { return 1.5 + 1 }\nprint(f())', expected: '2.5' }, // Core() used to floor this to 2
			{ code: 'f() { return true }\nprint(f() === true)', expected: 'true' },
			{ code: 'f() { return false }\nprint(f() === false)', expected: 'true' },
			{ code: 'Log(2.5)', expected: Math.log(2.5) }, // same, Log() used to floor its argument
			
			// numeric literal forms
			{ code: '0xFF', expected: 255 },
			{ code: '0XfF', expected: 255 },
			{ code: '0x1_F', expected: 31 },
			{ code: '0b1010', expected: 10 },
			{ code: '0B11', expected: 3 },
			{ code: '0b1_0', expected: 2 },
			{ code: '1e6', expected: 1000000 },
			{ code: '1E3', expected: 1000 },
			{ code: '1e-3', expected: 0.001 },
			{ code: '1e+3', expected: 1000 },
			{ code: '1.5e-3', expected: 0.0015 },
			{ code: '0.5e1', expected: 5 },
			{ code: '1_000', expected: 1000 },
			{ code: '1_000_000', expected: 1000000 },
			{ code: '1_0', expected: 10 },
			{ code: '1_000.5', expected: 1000.5 },
			{ code: '.5', expected: 0.5 },
			{ code: '0.50', expected: 0.5 },
			{ code: '007', expected: 7 },
			{ code: '-0xFF', expected: -255 },
			{ code: '-.5', expected: -0.5 },
			{ code: 'x := -0x10\nprint(x + 1)', expected: '-15' },
			{ code: 'x := 5\nprint(x -0x1)', expected: '4' }, // still a subtraction with no space
			{ code: 'r := 2e3 + 1\nprint(r)', expected: '2001' },
			{ code: 'r := .5 + .5\nprint(r)', expected: '1' },
			{ code: 'r := 0x10 + 0b10\nprint(r)', expected: '18' },
			{ code: 'r := 1_000 * 2\nprint(r)', expected: '2000' },
			{ code: 'r := 0xFF = 255\nprint(r)', expected: 'true' },
			{ code: 'r := 0xFF === 255\nprint(r)', expected: 'true' },
			{ code: 'arr := [0x10, 0b11, 1e2, 1_000]\nprint(Sum(arr))', expected: '1119' },
			{ code: 'arr := [0x10, .5]\nprint(Json(arr))', expected: '[16,0.5]' },
			{ code: 'r := "x" . 0x10 . 1e3\nprint(r)', expected: 'x161000' },
			{ code: 'e1 := 5\nx1e3 := 6\nx0b1 := 3\nx0x1 := 1\nprint(e1 + x1e3 + x0b1 + x0x1)', expected: '15' }, // names that look like numbers are still names
			
			// null, undefined / nil, NaN and Infinity
			{ code: 'null', expected: null },
			{ code: 'NULL', expected: null },
			{ code: 'undefined', expected: undefined },
			{ code: 'UNDEFINED', expected: undefined },
			{ code: 'nil', expected: undefined }, // nil is undefined
			{ code: 'Nil', expected: undefined },
			{ code: 'NaN', expected: NaN },
			{ code: 'nan', expected: NaN },
			{ code: 'Infinity', expected: Infinity },
			{ code: 'INFINITY', expected: Infinity },
			{ code: 'x := -Infinity\nprint(x)', expected: '-Infinity' },
			{ code: 'x := NaN\nprint(x)', expected: 'NaN' },
			{ code: 'x := Infinity\nprint(x)', expected: 'Infinity' },
			{ code: 'x := null\nprint(x)', expected: '' }, // null and undefined print as nothing
			{ code: 'x := undefined\nprint(x)', expected: '' },
			{ code: 'x := 1\nprint()', expected: '' },
			{ code: 'x := "a" . null . "b" . undefined . "c"\nprint(x)', expected: 'abc' }, // and add nothing to a concat
			{ code: 'x := null\nx .= "a"\nprint(x)', expected: 'a' },
			{ code: 'x := undefined\nx .= 5\nprint(x)', expected: '5' },
			{ code: 'x := "a" . NaN . Infinity . true . false\nprint(x)', expected: 'aNaNInfinitytruefalse' },
			{ code: 'x := null\nprint(Type(x))', expected: 'null' },
			{ code: 'Type(null)', expected: 'null' },
			{ code: 'Type(undefined)', expected: 'undefined' },
			{ code: 'Type(nil)', expected: 'undefined' },
			{ code: 'o := {"a": null}\nprint(Type(o.a))', expected: 'null' },
			{ code: 'o := {"a": null}\nprint(HasKey(o, "a"))', expected: '1' }, // a null value is still a key
			{ code: 'a := [null, 1]\nprint(IsNull(a[0]))', expected: '1' },
			{ code: 'nullable := 1\nnilly := 2\nnan_x := 3\ninfinity2 := 4\nundefinedVar := 5\nprint(nullable + nilly + nan_x + infinity2 + undefinedVar)', expected: '15' }, // names that start with a keyword are still names
			{ code: 'o := {"null": 1, "nil": 2}\nprint(o.null + o.nil)', expected: '3' }, // and so are property names
			{ code: 'f() { return null }\nprint(IsNull(f()))', expected: '1' },
			{ code: 'f() { return NaN }\nprint(f() = f())', expected: 'false' },
			{ code: 'class T { f() { return null }\ng() { return true }\nh() { return 1.5 + 1 } }\nt := new T()\nprint(IsNull(t.f()))\nprint(t.g() === true)\nprint(t.h())', expected: '1\ntrue\n2.5' }, // methods too
			{ code: 'n := 0\nloop (null) { n++ }\nprint(n)', expected: '0' }, // looping over nothing runs nothing
			{ code: 'n := 0\nloop (undefined) { n++ }\nprint(n)', expected: '0' },
			{ code: 'n := 0\nloop (NaN) { n++ }\nprint(n)', expected: '0' },
			{ code: 'n := 0\nx := null\nloop (x) { n++ }\nprint(n)', expected: '0' },
			{ code: 'n := 0\nloop (false) { n++ }\nprint(n)', expected: '0' },
			
			// arithmetic: nothing is 0, a boolean is 1/0, NaN wins, Infinity works
			{ code: 'r := 1 + NaN\nprint(r)', expected: 'NaN' },
			{ code: 'r := NaN + 1\nprint(r)', expected: 'NaN' },
			{ code: 'r := 1 - NaN\nprint(r)', expected: 'NaN' },
			{ code: 'r := NaN * 2\nprint(r)', expected: 'NaN' },
			{ code: 'r := 2 * NaN\nprint(r)', expected: 'NaN' },
			{ code: 'r := NaN / 2\nprint(r)', expected: 'NaN' },
			{ code: 'r := 2 / NaN\nprint(r)', expected: 'NaN' },
			{ code: 'r := Infinity + 1\nprint(r)', expected: 'Infinity' },
			{ code: 'r := 1 / Infinity\nprint(r)', expected: '0' },
			{ code: 'r := 1 / 0\nprint(r)', expected: 'Infinity' },
			{ code: 'r := Infinity > 1e308\nprint(r)', expected: 'true' },
			{ code: 'r := -Infinity < 0\nprint(r)', expected: 'true' },
			{ code: 'r := null + 1\nprint(r)', expected: '1' },
			{ code: 'r := undefined + 1\nprint(r)', expected: '1' },
			{ code: 'r := 5 - null\nprint(r)', expected: '5' },
			{ code: 'r := null * 3\nprint(r)', expected: '0' },
			{ code: 'r := 3 * undefined\nprint(r)', expected: '0' },
			{ code: 'r := true + 1\nprint(r)', expected: '2' },
			{ code: 'r := false + 1\nprint(r)', expected: '1' },
			{ code: 'r := true * 3\nprint(r)', expected: '3' },
			{ code: 'r := 5 - true\nprint(r)', expected: '4' },
			{ code: 'r := 6 / true\nprint(r)', expected: '6' },
			
			// truthiness: false, null, undefined, NaN, "" and anything that reads as 0 are false, everything else is true
			{ code: 'x := 1\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'x := -1\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'x := 0.5\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'x := Infinity\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'x := true\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'x := "a"\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'x := "abc0"\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'x := "false"\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' }, // only the text, so still true
			{ code: 'x := "null"\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'x := " "\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' }, // blank is not empty
			{ code: 'x := []\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' }, // objects are always true, IsEmpty() is for those
			{ code: 'x := [0]\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'x := {"a": 0}\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 't\nfalse' },
			{ code: 'class T { }\nt := new T()\nif (t) { print("t") } else { print("f") }', expected: 't' },
			{ code: 'x := 0\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := "0"\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' }, // a numeric string reads as its number
			{ code: 'x := "0.0"\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := " 0 "\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := 0x0\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := 0b0\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := .0\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := ""\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := false\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := null\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := undefined\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'x := NaN\nif (x) { print("t") } else { print("f") }\nprint(!x)', expected: 'f\ntrue' },
			{ code: 'if (missing) { print("t") } else { print("f") }\nprint(!missing)', expected: 'f\ntrue' }, // a variable that was never set
			{ code: 'r := 0 ? "t" : "f"\nprint(r)', expected: 'f' }, // the same table for ternary, && and ||
			{ code: 'r := "0" ? "t" : "f"\nprint(r)', expected: 'f' },
			{ code: 'r := "" ? "t" : "f"\nprint(r)', expected: 'f' },
			{ code: 'r := null ? "t" : "f"\nprint(r)', expected: 'f' },
			{ code: 'r := NaN ? "t" : "f"\nprint(r)', expected: 'f' },
			{ code: 'r := false ? "t" : "f"\nprint(r)', expected: 'f' },
			{ code: 'r := [] ? "t" : "f"\nprint(r)', expected: 't' },
			{ code: 'r := "false" ? "t" : "f"\nprint(r)', expected: 't' },
			{ code: 'r := 2 ? "t" : "f"\nprint(r)', expected: 't' },
			{ code: 'x := "0"\nr := x || "d"\nprint(r)', expected: 'd' },
			{ code: 'x := "0"\nr := x && "y"\nprint(r)', expected: '0' }, // a falsy left side comes back as it is
			{ code: 'x := 5\nr := x && "y"\nprint(r)', expected: 'y' },
			{ code: 'x := null\nr := x || "d"\nprint(r)', expected: 'd' },
			{ code: 'x := null\nr := x && "y"\nprint(IsNull(r))', expected: '1' },
			{ code: 'x := 0\nr := x || null\nprint(IsNull(r))', expected: '1' },
			
			// equality table, loose (= ignores case, == doesn't): numbers by value, nothing only matches nothing and "", a boolean is 1/0 or true/false
			{ code: 'r := 1 = 1.0\nprint(r)', expected: 'true' },
			{ code: 'r := "1" = 1\nprint(r)', expected: 'true' },
			{ code: 'r := "1" = "1.0"\nprint(r)', expected: 'true' },
			{ code: 'r := "01" = 1\nprint(r)', expected: 'true' },
			{ code: 'r := "abc" = "ABC"\nprint(r)', expected: 'true' },
			{ code: 'r := "abc" == "ABC"\nprint(r)', expected: 'false' },
			{ code: 'r := "" = 0\nprint(r)', expected: 'false' },
			{ code: 'r := "" = ""\nprint(r)', expected: 'true' },
			{ code: 'r := 0 = false\nprint(r)', expected: 'true' },
			{ code: 'r := 1 = true\nprint(r)', expected: 'true' },
			{ code: 'r := 2 = true\nprint(r)', expected: 'false' },
			{ code: 'r := "0" = false\nprint(r)', expected: 'true' },
			{ code: 'r := "1" = true\nprint(r)', expected: 'true' },
			{ code: 'r := "true" = true\nprint(r)', expected: 'true' },
			{ code: 'r := "TRUE" = true\nprint(r)', expected: 'true' },
			{ code: 'r := "TRUE" == true\nprint(r)', expected: 'false' },
			{ code: 'r := "yes" = true\nprint(r)', expected: 'false' },
			{ code: 'r := true = 1\nprint(r)', expected: 'true' }, // and with the boolean on the left
			{ code: 'r := false = 0\nprint(r)', expected: 'true' },
			{ code: 'r := true = "1"\nprint(r)', expected: 'true' },
			{ code: 'r := true = 2\nprint(r)', expected: 'false' },
			{ code: 'r := true == "TRUE"\nprint(r)', expected: 'false' },
			{ code: 'r := true = "TRUE"\nprint(r)', expected: 'true' },
			{ code: 'r := true = true\nprint(r)', expected: 'true' },
			{ code: 'r := true = false\nprint(r)', expected: 'false' },
			{ code: 'r := false = false\nprint(r)', expected: 'true' },
			{ code: 'r := false = ""\nprint(r)', expected: 'false' },
			{ code: 'r := null = null\nprint(r)', expected: 'true' },
			{ code: 'r := null = undefined\nprint(r)', expected: 'true' },
			{ code: 'r := null = nil\nprint(r)', expected: 'true' },
			{ code: 'r := null = ""\nprint(r)', expected: 'true' },
			{ code: 'r := undefined = ""\nprint(r)', expected: 'true' },
			{ code: 'r := null = 0\nprint(r)', expected: 'false' },
			{ code: 'r := null = false\nprint(r)', expected: 'false' },
			{ code: 'r := null = "null"\nprint(r)', expected: 'false' },
			{ code: 'r := null = []\nprint(r)', expected: 'false' },
			{ code: 'r := null == ""\nprint(r)', expected: 'true' },
			{ code: 'r := NaN = NaN\nprint(r)', expected: 'false' },
			{ code: 'r := NaN == NaN\nprint(r)', expected: 'false' },
			{ code: 'r := NaN = 1\nprint(r)', expected: 'false' },
			{ code: 'r := NaN = "NaN"\nprint(r)', expected: 'false' },
			{ code: 'r := NaN != NaN\nprint(r)', expected: 'true' },
			{ code: 'r := Infinity = Infinity\nprint(r)', expected: 'true' },
			{ code: 'r := Infinity = -Infinity\nprint(r)', expected: 'false' },
			{ code: 'r := Infinity = 1e999\nprint(r)', expected: 'true' },
			{ code: 'r := [1] = [1]\nprint(r)', expected: 'false' }, // arrays and objects only match themselves
			{ code: 'a := [1]\nb := a\nc := [1]\nprint(a = b)\nprint(a = c)', expected: 'true\nfalse' },
			{ code: 'a := {"x": 1}\nb := a\nc := {"x": 1}\nprint(a == b)\nprint(a == c)', expected: 'true\nfalse' },
			{ code: 'r := 1 != "1"\nprint(r)', expected: 'false' },
			{ code: 'r := "a" != "A"\nprint(r)', expected: 'false' },
			{ code: 'r := null != 0\nprint(r)', expected: 'true' },
			{ code: 'r := null != ""\nprint(r)', expected: 'false' },
			// strict: kind and value, nothing coerced
			{ code: 'r := null === null\nprint(r)', expected: 'true' },
			{ code: 'r := undefined === undefined\nprint(r)', expected: 'true' },
			{ code: 'r := nil === undefined\nprint(r)', expected: 'true' },
			{ code: 'r := null === undefined\nprint(r)', expected: 'false' },
			{ code: 'r := null !== undefined\nprint(r)', expected: 'true' },
			{ code: 'r := "" === null\nprint(r)', expected: 'false' },
			{ code: 'r := 0 === false\nprint(r)', expected: 'false' },
			{ code: 'r := 0 === null\nprint(r)', expected: 'false' },
			{ code: 'r := true === 1\nprint(r)', expected: 'false' },
			{ code: 'r := NaN === NaN\nprint(r)', expected: 'false' },
			{ code: 'r := NaN !== NaN\nprint(r)', expected: 'true' },
			{ code: 'r := Infinity === Infinity\nprint(r)', expected: 'true' },
			{ code: 'r := [] === []\nprint(r)', expected: 'false' },
			{ code: 'a := []\nb := a\nprint(a === b)', expected: 'true' },
			{ code: 'x := 1\nprint(x === "1")', expected: 'false' }, // variables now know what they hold
			{ code: 'x := "1"\nprint(x === 1)', expected: 'false' },
			{ code: 'x := "1"\nprint(x === "1")', expected: 'true' },
			{ code: 'x := "1"\nprint(x == 1)', expected: 'true' },
			{ code: 'x := 1\ny := 1.0\nprint(x === y)', expected: 'true' },
			{ code: 'x := 1 + 1\nprint(x === 2)', expected: 'true' },
			{ code: 'x := "1" . "1"\nprint(x === "11")\nprint(x === 11)\nprint(x == 11)', expected: 'true\nfalse\ntrue' }, // concat gives a string
			{ code: 'x := 5\ny := x\nprint(y === 5)', expected: 'true' },
			{ code: 'x := "5"\ny := x\nprint(y === "5")', expected: 'true' },
			
			// objects evaluate their values, so variables, calls, arrays and objects all work
			{ code: 'x := 5\no := {"v": x}\nprint(o.v)', expected: '5' }, // used to be "undefined"
			{ code: 'o := {"a": [1, 2, 3]}\nprint(o.a[1])', expected: '2' }, // arrays were "undefined" too
			{ code: 'o := {"a": {"b": {"c": 1}}}\nprint(o.a.b.c)', expected: '1' },
			{ code: 'o := {"list": [{"n": 1}, {"n": 2}]}\nprint(o.list[1].n)', expected: '2' },
			{ code: 'o := {"s": 1 + 2, "f": Upper("a")}\nprint(o.s . o.f)', expected: '3A' },
			{ code: 'f() { return 7 }\no := {"r": f()}\nprint(o.r)', expected: '7' },
			{ code: 'o := {"a": [1, 2]}\no.a[0] := 9\nprint(o.a[0])', expected: '9' },
			{ code: '#ArrayStartIndex(1)\no := {"a": [10, 20]}\nprint(o.a[1])', expected: '10' },
			{ code: 'o := {"a": 1}\nprint(Type(o.a))', expected: 'int' }, // numbers stay numbers
			{ code: 'o := {"a": "1"}\nprint(Json(o))', expected: '{"a":"1"}' }, // and strings stay strings
			{ code: 'Json({"a": [1, {"b": 2}]})', expected: '{"a":[1,{"b":2}]}' },
			{ code: 'isArray({"a": [1, 2]})', expected: 0 },
			{ code: 'isObject({"a": [1, 2]})', expected: 1 },
			{ code: 'o := {"a": [1, 2]}\nprint(isArray(o.a))', expected: '1' },
			{ code: 'Type({"a": 1})', expected: 'object' },
			{ code: 'f() { return {"a": [1, 2]} }\nr := f()\nprint(r.a[1])', expected: '2' }, // objects come back out of functions intact
			{ code: 'class P { v() { return 5 } }\nmk() { return new P() }\np := mk()\nprint(p.v())', expected: '5' }, // and so do instances
			
			// IsNull and Default
			{ code: 'IsNull(null)', expected: 1 },
			{ code: 'IsNull(undefined)', expected: 1 },
			{ code: 'IsNull(nil)', expected: 1 },
			{ code: 'IsNull("")', expected: 0 },
			{ code: 'IsNull(0)', expected: 0 },
			{ code: 'IsNull(false)', expected: 0 },
			{ code: 'IsNull(NaN)', expected: 0 },
			{ code: 'IsNull([])', expected: 0 },
			{ code: 'IsNull(missing)', expected: 1 }, // a variable that was never set
			{ code: 'x := null\nprint(IsNull(x))', expected: '1' },
			{ code: 'x := undefined\nprint(IsNull(x))', expected: '1' },
			{ code: 'x := 5\nprint(IsNull(x))', expected: '0' },
			{ code: 'x := ""\nprint(IsNull(x))', expected: '0' }, // set to nothing is not unset
			{ code: 'X := null\nprint(IsNull(x))', expected: '1' },
			{ code: 'Default(null, "d")', expected: 'd' },
			{ code: 'Default(undefined, 1)', expected: 1 },
			{ code: 'Default("x", "d")', expected: 'x' },
			{ code: 'Default("", "d")', expected: '' }, // only null, undefined and unset get replaced
			{ code: 'Default(0, 5)', expected: 0 },
			{ code: 'Default(false, 1)', expected: false },
			{ code: 'Default(missing, "d")', expected: 'd' },
			{ code: 'Default(null, null)', expected: null },
			{ code: 'Default(null, [1, 2])', expected: [1, 2] },
			{ code: 'Default(Default(null, undefined), 3)', expected: 3 },
			{ code: 'x := 5\nprint(Default(x, 9))', expected: '5' },
			{ code: 'x := null\nprint(Default(x, 9))', expected: '9' },
			{ code: 'name := Default(name, "anon")\nprint(name)', expected: 'anon' },
			{ code: 'name := "bob"\nname := Default(name, "anon")\nprint(name)', expected: 'bob' },
			{ code: 'f(a := 5) { return a }\nprint(f(undefined))', expected: '5' }, // undefined takes the parameter default
			{ code: 'f(a := 5) { return a }\nprint(f())', expected: '5' },
			{ code: 'f(a := 5) { return a }\nprint(IsNull(f(null)))', expected: '1' }, // null doesn't
			
			// builtins that used to get everything as a string
			{ code: 'Upper(5)', expected: '5' },
			{ code: 'Lower(5)', expected: '5' },
			{ code: 'Repeat(5, 3)', expected: '555' },
			{ code: 'InStr(12345, 3)', expected: 3 },
			{ code: 'Strepl(1234, 2, 9)', expected: '1934' },
			{ code: 'Repl(12345, 3, 9)', expected: '12945' },
			{ code: 'Repl(1233, 3, 9, 1)', expected: '1299' },
			{ code: 'Grep(2, 12)', expected: ['12'] },
			{ code: 'StrSplit(1.5, ".")', expected: ['1', '5'] },
			{ code: 'Occur(1231, 1)', expected: 2 },
			{ code: 'Occur("Hello", "L", 1)', expected: 2 }, // only 2 makes it case-sensitive
			{ code: 'Occur("Hello", "l", 2)', expected: 2 },
			{ code: 'LastOcc(1231, 1)', expected: 4 },
			{ code: 'LastOcc("Hello", "l", 2)', expected: 4 },
			{ code: 'Justify(5, 1, 3)', expected: '5  ' },
			{ code: 'StrClean(5, 1)', expected: '5' },
			{ code: 'StrClean("  a   b  ", 3)', expected: 'ab' }, // the mode is a real number now
			{ code: 'Count(12345)', expected: 5 },
			{ code: 'MaxIndex(12345)', expected: 4 },
			{ code: 'Slice(12345, 1, 3)', expected: '23' },
			{ code: 'Asc(5)', expected: 53 },
			{ code: 'Rem(12345, "3")', expected: [ { match: '3', pos: 2 } ] },
			{ code: 'Contains(FWrite(123, ""), "ENOENT")', expected: 1 }, // gets as far as opening the (missing) file, so the data was fine
			{ code: 'Contains(FAppend(123, ""), "ENOENT")', expected: 1 },
			{ code: 'IndexOf([10, 20, 30], "20")', expected: 1 }, // lookups still ignore the type
			{ code: 'Contains([1, 2, 3], "2")', expected: 1 },
			{ code: 'Unique([1, "1", 2])', expected: [1, 2] },
			{ code: 'Sort([10, 9, "8"])', expected: ["8", 9, 10] }, // sorts by number, hands the items back as they were
			{ code: 'Max(["10", 9])', expected: 10 },
			
			// builtins that meet the special values
			{ code: 'IsEmpty(null)', expected: 1 },
			{ code: 'IsEmpty(nil)', expected: 1 },
			{ code: 'IsEmpty(0)', expected: 0 },
			{ code: 'StrLen(null)', expected: 0 },
			{ code: 'StrLen(undefined)', expected: 0 },
			{ code: 'IsNum(null)', expected: 0 },
			{ code: 'IsNum(undefined)', expected: 0 },
			{ code: 'IsNum(true)', expected: 0 },
			{ code: 'IsNum(NaN)', expected: 0 },
			{ code: 'IsNum(Infinity)', expected: 1 },
			{ code: 'IsNum(0x10)', expected: 1 },
			{ code: 'IsString(null)', expected: 0 },
			{ code: 'IsString(true)', expected: 0 },
			{ code: 'IsObject(null)', expected: 0 },
			{ code: 'IsArray(null)', expected: 0 },
			{ code: 'IsInt(null)', expected: 0 },
			{ code: 'IsInt(true)', expected: 0 },
			{ code: 'IsFloat(null)', expected: 0 },
			{ code: 'ToString(null)', expected: '' },
			{ code: 'ToString(true)', expected: 'true' },
			{ code: 'ToString(NaN)', expected: 'NaN' },
			{ code: 'ToString(0x10)', expected: '16' },
			{ code: 'Json(null)', expected: 'null' },
			{ code: 'Json(true)', expected: 'true' },
			
			// string escapes
			{ code: '"a\\nb"', expected: 'a\nb' },
			{ code: '"a\\tb"', expected: 'a\tb' },
			{ code: '"a\\rb"', expected: 'a\rb' },
			{ code: '"\\0"', expected: '\0' },
			{ code: '"say \\"hi\\""', expected: 'say "hi"' },
			{ code: '"\\""', expected: '"' },
			{ code: '"\\"\\""', expected: '""' },
			{ code: '"\\\\"', expected: '\\' },
			{ code: '"a\\\\nb"', expected: 'a\\nb' }, // an escaped backslash then an n, not a newline
			{ code: '"\\$"', expected: '$' },
			{ code: '"\\`"', expected: '`' },
			{ code: '"\\\'"', expected: "'" },
			{ code: '"\\u{41}"', expected: 'A' },
			{ code: '"\\u{1F600}"', expected: '\u{1F600}' },
			{ code: '"\\u0041"', expected: 'A' },
			{ code: '"\\u{110000}"', expected: '\\u{110000}' }, // out of range stays as written
			{ code: '"\\u"', expected: '\\u' },
			{ code: '"\\d+"', expected: '\\d+' }, // an unknown escape stays as written, so regexes still work
			{ code: '"\\x"', expected: '\\x' },
			{ code: '"\\\\d+"', expected: '\\d+' },
			{ code: '"C:\\Users\\bob"', expected: 'C:\\Users\\bob' },
			{ code: '"C:\\temp"', expected: 'C:\temp' }, // a windows path with a \t in it needs its slash doubled
			{ code: '"C:\\\\temp"', expected: 'C:\\temp' },
			{ code: 'x := "a\\nb"\nprint(x)', expected: 'a\nb' },
			{ code: 'StrLen("a\\nb")', expected: 3 },
			{ code: 'x := "a\\tb"\nprint(Asc(Substr(x, 1, 1)))', expected: '9' },
			{ code: 'Strepl("a.b.c", "\\.", "-")', expected: 'a-b-c' },
			{ code: 'Strepl("a.b.c", "\\\\.", "-")', expected: 'a-b-c' },
			{ code: 'Strepl("a1b22", "\\d+", "#")', expected: 'a#b#' },
			{ code: 'Occur("a\nb\nc", "\\n")', expected: 2 },
			{ code: 'x := "a,b\\nc,d"\nprint(Count(StrSplit(x, "\\n")))', expected: '2' },
			
			// the backtick escapes the same way as the backslash
			{ code: '"a`nb"', expected: 'a\nb' },
			{ code: '"a`tb"', expected: 'a\tb' },
			{ code: '"a`rb"', expected: 'a\rb' },
			{ code: '"`0"', expected: '\0' },
			{ code: '"say `"hi`""', expected: 'say "hi"' },
			{ code: '"`""', expected: '"' },
			{ code: '"`\'"', expected: "'" },
			{ code: '"a``b"', expected: 'a`b' }, // two backticks give one
			{ code: '"a`\\b"', expected: 'a\\b' },
			{ code: '"`$"', expected: '$' },
			{ code: '"`u{41}`u0042"', expected: 'AB' },
			{ code: '"a`xb"', expected: 'a`xb' }, // an unknown one stays as written
			{ code: '"(`hi`)"', expected: '(`hi`)' }, // so most backticks in js source survive
			{ code: '"a`nb\\nc"', expected: 'a\nb\nc' }, // both kinds in one string
			{ code: '"\\`n"', expected: '`n' }, // an escaped backtick is just a backtick
			{ code: '"``n"', expected: '`n' },
			{ code: "'a`nb'", expected: 'a\nb' },
			{ code: "'it`'s'", expected: "it's" },
			{ code: 'x := "a`nb"\nprint(x)', expected: 'a\nb' },
			{ code: 'x := "``n"\nprint(x)', expected: '`n' }, // print no longer escapes a second time
			{ code: 'x := <<END\na`nb\nEND\nprint(x)', expected: 'a`nb' }, // and a heredoc stays as written
			{ code: 'x := "a`nb"\nprint(x === "a\\nb")', expected: 'true' },
			{ code: 'StrLen("a`nb")', expected: 3 },
			{ code: 'Occur("a`nb`nc", "`n")', expected: 2 },
			{ code: 'x := "a,b`nc,d"\nprint(Count(StrSplit(x, "`n")))', expected: '2' },
			{ code: 'x := "a`tb"\nprint(Asc(Substr(x, 1, 1)))', expected: '9' },
			{ code: 'o := {"k`ney": 5}\nprint(o["k\\ney"])', expected: '5' },
			{ code: "x := \"a\" . \"`n\" . 'b'\nprint(x)", expected: 'a\nb' },
			
			// #Strict: undefined variables and missing functions give "" until it is on
			{ code: 'x := missing\nprint(x . "|")', expected: '|' },
			{ code: 'x := nope(1)\nprint(x . "|")', expected: '|' },
			{ code: '#Strict(0)\nx := missing\nprint(x . "|")', expected: '|' },
			{ code: '#Strict(false)\nx := nope(1)\nprint(x . "|")', expected: '|' },
			{ code: '#Strict()\nx := 1\nprint(x)', expected: '1' },
			{ code: '#Strict()\nx := 5\nf() { return x }\nprint(f())', expected: '5' }, // outer variables are in scope
			{ code: '#Strict()\nf(a, b := 2) { return a + b }\nprint(f(1))', expected: '3' },
			{ code: '#Strict()\nloop (2) { print(A_Index) }', expected: '1\n2' },
			{ code: '#Strict()\nloop ([5, 6]) { print(A_Key . A_Val) }', expected: '05\n16' },
			{ code: '#Strict()\no := {"a": 1}\no.b := 2\nprint(o.a + o.b)', expected: '3' },
			{ code: '#Strict()\no.a := 1\nprint(o.a)', expected: '1' }, // assigning is how you make one
			{ code: '#Strict()\nprint(IsNull(missing))\nprint(Default(missing, 5))', expected: '1\n5' }, // and this is how you read one that may not be set
			{ code: '#Strict()\nname := Default(name, "anon")\nprint(name)', expected: 'anon' },
			{ code: '#Strict()\nprint(Upper("a"))', expected: 'A' },
			{ code: '#Strict()\ndouble(n) { return n * 2 }\nprint(double(4))', expected: '8' },
			{ code: '#Strict()\nclass C { __init(v) { val := v }\nget() { return val } }\nc := new C(3)\nprint(c.get())', expected: '3' },
			{ code: '#Strict()\nx := "a"\nx .= "b"\nprint(x)', expected: 'ab' },
			{ code: '#Strict()\nx := 1\nx++\nx += 2\nprint(x)', expected: '4' },
			{ code: '#Strict()\nname := "v"\nv := 9\nprint(%name%)', expected: '9' },
			{ code: '#Strict()\nx := `${Sum([1, 2])}`\nprint(x)', expected: '3' },
			{ code: '#Strict()\nx := 5\n#Strict(0)\ny := missing\nprint(x)', expected: '5' }, // directives all run first, the last one wins
			{ code: 'f(n) { if (n <= 0) { return 0 }\nreturn 1 + f(n - 1) }\nprint(f(999))', expected: '999' }, // deep is fine up to the limit
			{ code: 'a(n) { if (n <= 0) { return 0 }\nreturn 1 + b(n - 1) }\nb(n) { return 1 + a(n - 1) }\nprint(a(400))', expected: '400' },
			
			// for in and for of
			{ code: 'arr := [10, 20, 30]\ns := ""\nfor (x of arr) { s := s . x . "," }\nprint(s)', expected: '10,20,30,' },
			{ code: 'arr := [10, 20, 30]\ns := ""\nfor (k in arr) { s := s . k . "," }\nprint(s)', expected: '0,1,2,' }, // in gives the keys, as strings
			{ code: 'for (k in [10]) { print(k === "0") }\nfor (k in [10]) { print(k === 0) }\nprint("end")', expected: 'true\nfalse\nend' },
			{ code: 's := ""\nfor (x of "abc") { s := s . x . "-" }\nprint(s)', expected: 'a-b-c-' },
			{ code: 's := ""\nfor (x in "abc") { s := s . x }\nprint(s)', expected: '012' }, // indexes for a string
			{ code: 'o := {"a": 1, "b": 2}\ns := ""\nfor (k in o) { s := s . k . o[k] }\nprint(s)', expected: 'a1b2' },
			{ code: 'o := {"a": 1, "b": 2}\nfor (k in o) { print(A_Key . A_Val) }\nprint("end")', expected: 'a1\nb2\nend' },
			{ code: '#ArrayStartIndex(1)\ns := ""\nfor (k in [5, 6, 7]) { s := s . k }\nprint(s)', expected: '123' }, // keys count from the start index
			{ code: '#ArrayStartIndex(1)\ns := ""\nfor (k in "ab") { s := s . k }\nprint(s)', expected: '12' },
			{ code: '#ArrayStartIndex(1)\narr := [5, 6]\nfor (k in arr) { print(arr[k]) }', expected: '5\n6' },
			{ code: '#ArrayStartIndex(1)\nfor (x of [5, 6]) { print(A_Key . A_Val) }', expected: '15\n26' },
			{ code: '#ArrayStartIndex(1)\nfor (k in [5, 6]) { print(A_Key . A_Val) }', expected: '15\n26' },
			{ code: 'for (x of [7, 8]) { print(A_Index . ":" . A_Key . ":" . A_Val) }\nprint("end")', expected: '1:0:7\n2:1:8\nend' },
			{ code: 'for (k in {"p": 3}) { print(A_Index . ":" . A_Key . ":" . A_Val . ":" . k) }\nprint("end")', expected: '1:p:3:p\nend' },
			{ code: 'n := 0\nfor (x in null) { n++ }\nfor (x in 5) { n++ }\nfor (x in undefined) { n++ }\nprint(n)', expected: '0' }, // in over nothing runs nothing
			{ code: 'n := 0\nfor (x in []) { n++ }\nfor (x of []) { n++ }\nfor (x of "") { n++ }\nprint(n)', expected: '0' },
			{ code: 'for (x in [1, 2]) { y := x }\nprint(x . y)', expected: '11' }, // the variable is left as it was
			{ code: 'arr := [1]\nn := 0\nfor (x of arr) { n++\nif (n < 4) { Push(arr, x + 1) } }\nprint(n)', expected: '4' }, // of is live, pushing as you go adds to it
			{ code: 'arr := [1]\nn := 0\nloop (arr) { n++\nif (n < 4) { Push(arr, 9) } }\nprint(n)', expected: '1' }, // loop is a snapshot
			{ code: 'arr := [1, 2]\nn := 0\nfor (k in arr) { n++\nPush(arr, 9) }\nprint(n)', expected: '2' }, // and in takes its keys first
			{ code: 's := ""\nfor (i of [1, 2, 3, 4]) { if (i == 2) { continue }\nif (i == 4) { break }\ns := s . i }\nprint(s)', expected: '13' },
			{ code: 's := ""\nfor (k in [1, 2, 3, 4]) { if (k == 1) { continue }\nif (k == 3) { break }\ns := s . k }\nprint(s)', expected: '02' },
			{ code: 'f() { for (i of [5, 6, 7]) { if (i == 6) { return i * 10 } } }\nprint(f())', expected: '60' },
			{ code: 'f() { for (k in {"a": 1, "b": 2}) { if (k == "b") { return k } } }\nprint(f())', expected: 'b' },
			{ code: 's := ""\nfor (i of [1, 2]) { for (j of ["a", "b"]) { if (j == "b") { break }\ns := s . i . j . " " } }\nprint(s)', expected: '1a 2a ' }, // break leaves the inner one
			{ code: 's := ""\nfor (i of [1, 2]) { for (j in [5, 6]) { s := s . i . j } }\nprint(s)', expected: '10112021' },
			{ code: 's := ""\nfor (i of [1, 2]) { s := s . i }\nloop (2) { s := s . A_Index }\nprint(s)', expected: '1212' }, // loop and for share A_Index but don't get in each other's way
			{ code: 's := ""\nfor (x of [1, 2]) s := s . x\nprint(s)', expected: '12' }, // one statement, no block
			{ code: 's := ""\nfor(x of [1, 2])\n{\n\ts := s . x\n}\nprint(s)', expected: '12' },
			{ code: 's := ""\nFor (X Of [4]) { s := s . x }\nprint(s)', expected: '4' }, // keywords ignore case
			{ code: 'for := 5\nprint(for)', expected: '5' }, // for on its own is still a name
			{ code: 'forest := 1\nfor_x := 2\nprint(forest + for_x)', expected: '3' },
			{ code: 'in := 1\nprint(in)', expected: '1' },
			{ code: 's := ""\nfor await (x of [1, 2]) { s := s . x }\nprint(s)', expected: '12' },
			{ code: 'class C { __init() { a := 1\nb := 2 } }\nc := new C()\ns := ""\nfor (k in c) { s := s . k . A_Val }\nprint(s)', expected: 'a1b2' }, // an instance gives its fields
			{ code: 'print(Json(Entries({"a": 1, "b": 2})))\nprint(Json(Entries([5, 6])))\nprint(Json(Entries("ab")))\nprint(Json(Entries(7)))\nprint(Json(Entries(null)))', expected: '[["a",1],["b",2]]\n[[0,5],[1,6]]\n[[0,"a"],[1,"b"]]\n[]\n[]' },
			{ code: '#ArrayStartIndex(1)\nprint(Json(Entries([5, 6])))', expected: '[[1,5],[2,6]]' },
			{ code: 's := ""\nfor (e of Entries({"a": 1})) { s := s . e[0] . e[1] }\nprint(s)', expected: 'a1' },
			
			// ranges, 1..10 is Range(1, 10) and 1..10..2 steps
			{ code: 'x := 1..4\nprint(Json(x))', expected: '[1,2,3,4]' },
			{ code: 'a := Json(Range(1, 4))\nprint(a == Json(1..4))', expected: 'true' },
			{ code: 'x := 1 .. 4\nprint(Json(x))', expected: '[1,2,3,4]' }, // spaces are fine
			{ code: 'x := 1..9..2\nprint(Json(x))', expected: '[1,3,5,7,9]' }, // from, to, step
			{ code: 'x := 10..1..-3\nprint(Json(x))', expected: '[10,7,4,1]' },
			{ code: 'x := 5..1\nprint(Json(x))', expected: '[]' }, // same as Range(5, 1)
			{ code: 'x := 3..3\nprint(Json(x))', expected: '[3]' },
			{ code: 'x := 0..1..0.25\nprint(Json(x))', expected: '[0,0.25,0.5,0.75,1]' },
			{ code: 'x := 0..0.3..0.1\nprint(Count(x))', expected: '4' }, // a step that doesn't add up exactly still gets its last value
			{ code: 'x := 1.5..4\nprint(Json(x))', expected: '[1.5,2.5,3.5]' },
			{ code: 'x := -2..2\nprint(Json(x))', expected: '[-2,-1,0,1,2]' },
			{ code: 'x := 0x1..0b11\nprint(Json(x))', expected: '[1,2,3]' },
			{ code: 'n := 3\nx := 1..n\nprint(Json(x))', expected: '[1,2,3]' }, // a variable next to the dots
			{ code: 'n := 2\nx := n..4\nprint(Json(x))', expected: '[2,3,4]' },
			{ code: 'a := 1\nb := 3\nx := a+1..b*2\nprint(Json(x))', expected: '[2,3,4,5,6]' }, // arithmetic on both ends
			{ code: 'o := {"n": 2}\nx := 1..o.n\nprint(Json(x))', expected: '[1,2]' },
			{ code: 'x := 1..Count([1, 2, 3])\nprint(Json(x))', expected: '[1,2,3]' },
			{ code: 'x := "1".."3"\nprint(Json(x))', expected: '[1,2,3]' }, // numeric strings are numbers
			{ code: 'x := 1 > 2 ? 1..2 : 5..6\nprint(Json(x))', expected: '[5,6]' }, // ranges sit just above the ternary
			{ code: 'x := Sum(1..10)\nprint(x)', expected: '55' },
			{ code: 'x := Count(1..100)\nprint(x)', expected: '100' },
			{ code: 'x := [1..3, 4..5]\nprint(Json(x))', expected: '[[1,2,3],[4,5]]' },
			{ code: 'f(a) { return Count(a) }\nprint(f(1..7))', expected: '7' },
			{ code: 's := ""\nfor (i of 1..5) { s := s . i }\nprint(s)', expected: '12345' },
			{ code: 's := ""\nfor (i of 10..1..-3) { s := s . i . "," }\nprint(s)', expected: '10,7,4,1,' },
			{ code: 's := ""\nfor (i of 5..1) { s := s . i }\nprint(s . "|")', expected: '|' }, // an empty range is no iterations
			{ code: 's := ""\nfor (i of 1..6) { if (i == 3) { continue }\nif (i == 5) { break }\ns := s . i }\nprint(s)', expected: '124' },
			{ code: 's := ""\nfor (i in 1..3) { s := s . i }\nprint(s)', expected: '012' },
			{ code: 's := ""\nloop (1..3) { s := s . A_Val }\nprint(s)', expected: '123' },
			{ code: 'x := 5\nx..\nprint(x)', expected: '5' }, // x.. on its own is still an append of nothing
			{ code: 'x := 5\nx.. ; note\nprint(x)', expected: '5' },
			{ code: 'x := "a"\ny := x . "b" . "c"\nprint(y)', expected: 'abc' }, // and the concat dot is what it was
			{ code: 'x := "a"\ny := x.b\nprint(y . "|")', expected: '|' },
			{ code: 'o := {"b": 4}\nprint(o.b .. 5)', expected: '4,5' },
			{ code: 'x := 1.5 . 2\nprint(x)', expected: '1.52' },
			
			// while, until and do
			{ code: 'n := 0\nwhile (n < 3) { n++ }\nprint(n)', expected: '3' },
			{ code: 'n := 5\nwhile (n < 3) { n++ }\nprint(n)', expected: '5' }, // never runs
			{ code: 'while (0) { print(1) }\nprint("end")', expected: 'end' },
			{ code: 'n := 0\nuntil (n >= 3) { n++ }\nprint(n)', expected: '3' },
			{ code: 'n := 0\nuntil (n >= 1) { n++ }\nprint(n)', expected: '1' }, // until must actually stop, not just count differently from while
			{ code: 'n := 5\nuntil (n >= 3) { n++ }\nprint(n)', expected: '5' },
			{ code: 'n := 0\ndo { n++ } while (n < 3)\nprint(n)', expected: '3' },
			{ code: 'n := 10\ndo { n++ } while (n < 3)\nprint(n)', expected: '11' }, // runs once, the test comes after
			{ code: 'n := 0\ndo { n++ } until (n >= 4)\nprint(n)', expected: '4' },
			{ code: 'n := 10\ndo { n++ } until (n >= 4)\nprint(n)', expected: '11' },
			{ code: 'n := 0\ndo\n{\n\tn++\n}\nwhile (n < 2)\nprint(n)', expected: '2' },
			{ code: 'n := 0\nwhile (n < 5) { n++\nif (n == 2) { continue }\nif (n == 4) { break }\nprint(n) }', expected: '1\n3' },
			{ code: 'n := 0\nuntil (n >= 5) { n++\nif (n == 2) { continue }\nif (n == 4) { break }\nprint(n) }', expected: '1\n3' },
			{ code: 'n := 0\ndo { n++\nif (n == 2) { continue }\nprint(n) } while (n < 3)', expected: '1\n3' }, // continue goes to the test
			{ code: 'n := 0\ndo { n++\nif (n == 2) { break }\nprint(n) } while (n < 5)', expected: '1' },
			{ code: 'n := 0\nwhile (n < 3) { n++\nprint(A_Index) }', expected: '1\n2\n3' },
			{ code: 'n := 0\ndo { n++\nprint(A_Index) } while (n < 2)', expected: '1\n2' },
			{ code: 'f() { n := 0\nwhile (1) { n++\nif (n == 3) { return n } } }\nprint(f())', expected: '3' },
			{ code: 'f() { n := 0\ndo { n++\nif (n == 3) { return n * 2 } } while (1) }\nprint(f())', expected: '6' },
			{ code: 's := ""\nn := 0\nwhile (n < 2) { n++\nm := 0\nwhile (m < 2) { m++\ns := s . n . m . " " } }\nprint(s)', expected: '11 12 21 22 ' },
			{ code: 's := ""\nn := 0\nwhile (n < 3) { n++\nloop (2) { s := s . A_Index }\ns := s . "|" }\nprint(s)', expected: '12|12|12|' },
			{ code: 'a := ["x", "y"]\ni := 0\nwhile (i < Count(a)) { print(a[i])\ni++ }', expected: 'x\ny' },
			{ code: 'n := 0\nwhile (n < 3 && n != 2) { n++ }\nprint(n)', expected: '2' }, // any expression
			{ code: 'n := 0\nWHILE (n < 2) { n++ }\nUntil (n > 4) { n++ }\nDo { n++ } While (n < 9)\nprint(n)', expected: '9' }, // keywords ignore case
			{ code: 'while := 1\ndo := 2\nuntil := 3\nprint(while + do + until)', expected: '6' }, // and on their own they are names
			{ code: 'whilst := 1\ndoing := 2\nuntilx := 3\nprint(whilst + doing + untilx)', expected: '6' },
			{ code: 'n := 0\nwhile (n < 2) { n++ }, print(n)', expected: '2' },
			
			// labels
			{ code: 's := ""\nouter: loop (3) { loop (3) { if (A_Index == 2) { continue outer }\ns := s . A_Index } }\nprint(s)', expected: '111' },
			{ code: 's := ""\nouter: loop (3) { loop (3) { if (A_Index == 2) { break outer }\ns := s . A_Index } }\nprint(s)', expected: '1' },
			{ code: 's := ""\nloop (3) { loop (3) { if (A_Index == 2) { break }\ns := s . A_Index } }\nprint(s)', expected: '111' }, // without a name it is the inner one
			{ code: 's := ""\nouter: for (i of 1..3) { for (j of 1..3) { if (j == 2) { continue outer }\ns := s . i . j . " " } }\nprint(s)', expected: '11 21 31 ' },
			{ code: 's := ""\nouter: for (i of 1..3) { for (j of 1..3) { if (i == 2) { break outer }\ns := s . i . j . " " } }\nprint(s)', expected: '11 12 13 ' },
			{ code: 's := ""\nouter: for (i in [5, 6]) { for (j in [7, 8]) { if (j == 1) { continue outer }\ns := s . i . j } }\nprint(s)', expected: '0010' },
			{ code: 'n := 0\nouter: while (n < 5) { n++\nwhile (1) { break outer } }\nprint(n)', expected: '1' },
			{ code: 'n := 0\nouter: until (n > 5) { n++\ndo { continue outer } while (1) }\nprint(n)', expected: '6' },
			{ code: 's := ""\nouter: do { s := s . "a"\nloop (2) { break outer } } while (1)\nprint(s)', expected: 'a' },
			{ code: 's := ""\na: loop (2) { b: loop (2) { c: loop (2) { s := s . A_Index\nbreak a } } }\nprint(s)', expected: '1' }, // three deep
			{ code: 's := ""\na: loop (2) { b: loop (2) { c: loop (2) { s := s . A_Index\ncontinue b } } }\nprint(s)', expected: '1111' },
			{ code: 's := ""\nOUTER: loop (2) { loop (2) { s := s . "x"\nbreak outer } }\nprint(s)', expected: 'x' }, // names ignore case
			{ code: 's := ""\nouter:\nloop (2) { s := s . A_Index }\nprint(s)', expected: '12' }, // the loop can be on the next line
			{ code: 's := ""\nouter: loop (2) {\n\tloop (2) {\n\t\tif (A_Index == 2) { continue outer }\n\t\ts := s . A_Index\n\t}\n}\nprint(s)', expected: '11' },
			{ code: 's := ""\nf() { loop (2) { break } }\nouter: loop (2) { f()\ns := s . A_Index }\nprint(s)', expected: '12' }, // a function's own loops are its own
			{ code: 's := ""\nouter: loop (3) { if (A_Index == 2) { break outer }\ns := s . A_Index }\nprint(s)', expected: '1' }, // the loop it is in
			{ code: 's := ""\nfirst: loop (2) { s := s . "a" }\nfirst: loop (2) { s := s . "b" }\nprint(s)', expected: 'aabb' }, // a name can be used again
			{ code: 's := ""\nouter: loop (2) { outer: loop (2) { s := s . "x"\nbreak outer } }\nprint(s)', expected: 'xx' }, // the same name inside itself is the inner one
			{ code: 's := ""\nloop (2) { if (1) { break } else { s := "no" } }\nprint(s . "|")', expected: '|' }, // else isn't taken for a name
			{ code: 's := ""\nloop (2) { if (A_Index == 1) { continue }\nelse s := s . "b" }\nprint(s)', expected: 'b' },
			{ code: 's := ""\nloop (2) { if (A_Index == 1) continue\nelse s := s . "b" }\nprint(s)', expected: 'bb' }, // pre-existing: a brace-less continue doesn't stop the statement after it from running
			{ code: 'breakfast := 1\ncontinued := 2\nprint(breakfast + continued)', expected: '3' },
			{ code: 'x := 1 ? 2 : 3\nprint(x)', expected: '2' }, // a colon in an expression isn't a label
			{ code: 'o := {"a": 1}\nprint(o.a)', expected: '1' },
			
			// switch
			{ code: 'switch (2) { case 1: print("one")\ncase 2: print("two")\ncase 3: print("three") }\nprint("end")', expected: 'two\nend' }, // no falling into the next one
			{ code: 'switch ("B") { case "a": print(1)\ncase "b": print(2)\ndefault: print(3) }\nprint("end")', expected: '2\nend' }, // it compares with = so case doesn't count
			{ code: 'switch ("1.0") { case 1: print("one")\ndefault: print("other") }\nprint("end")', expected: 'one\nend' }, // and numbers are numbers
			{ code: 'switch (9) { case 1, 2: print("low")\ndefault: print("other") }\nprint("end")', expected: 'other\nend' },
			{ code: 'switch (2) { case 1, 2: print("low")\ndefault: print("other") }\nprint("end")', expected: 'low\nend' }, // more than one value in a case
			{ code: 'switch (1) { case 1: print("first")\ncase 1: print("second") }\nprint("end")', expected: 'first\nend' }, // the first matching case wins, later ones with the same value don't get checked
			{ code: 'switch (3) { case 1, 2, 3, 4: print("in") }\nprint("end")', expected: 'in\nend' },
			{ code: 'switch (7) { default: print("only") }\nprint("end")', expected: 'only\nend' }, // just a default
			{ code: 'switch (7) { case 1: print(1) }\nprint("end")', expected: 'end' }, // no match and no default
			{ code: 'switch (1) { }\nprint("empty")', expected: 'empty' },
			{ code: 'switch (2) { default: print("d")\ncase 2: print("two") }\nprint("end")', expected: 'two\nend' }, // default is only for when nothing matched, wherever it is
			{ code: 'switch (5) { default: print("d")\ncase 2: print("two") }\nprint("end")', expected: 'd\nend' },
			{ code: 'switch (1) { case 1: print("a")\nfallthrough\ncase 2: print("b")\ncase 3: print("c") }\nprint("end")', expected: 'a\nb\nend' }, // fallthrough goes on into the next
			{ code: 'switch (1) { case 1: print("a")\nfallthrough\ncase 2: print("b")\nfallthrough\ncase 3: print("c") }\nprint("end")', expected: 'a\nb\nc\nend' },
			{ code: 'switch (1) { case 1: print("a")\nfallthrough\ndefault: print("d") }\nprint("end")', expected: 'a\nd\nend' },
			{ code: 'switch (3) { case 3: print("c")\nfallthrough }\nprint("end")', expected: 'c\nend' }, // nothing after the last one to fall into
			{ code: 'switch (1) { case 1:\nprint("a")\nbreak\nprint("b")\ncase 2: print("c") }\nprint("end")', expected: 'a\nend' }, // break leaves the switch
			{ code: 'switch (1) { case 1: if (1) { print("a")\nbreak }\nprint("b") }\nprint("end")', expected: 'a\nend' },
			{ code: 's := ""\nloop (4) { switch (A_Index) { case 2: continue\ncase 3: break\ndefault: s := s . A_Index }\ns := s . "." }\nprint(s)', expected: '1..4.' }, // continue inside the switch's brace-less case still skips the rest of the loop body // continue goes to the loop, break only the switch
			{ code: 's := ""\nouter: loop (4) { switch (A_Index) { case 3: break outer\ndefault: s := s . A_Index } }\nprint(s)', expected: '12' }, // break with a label leaves that loop
			{ code: 's := ""\nouter: loop (3) { switch (A_Index) { case 2: continue outer\ndefault: s := s . A_Index }\ns := s . "." }\nprint(s)', expected: '1.3.' },
			{ code: 'f(x) { switch (x) { case 1: return "one"\ncase 2: return "two" }\nreturn "none" }\nprint(f(1) . f(2) . f(3))', expected: 'onetwonone' },
			{ code: 'x := 5\nswitch (x) {\n\tcase 1 + 4:\n\t\tprint("five")\n\tcase 6:\n\t\tprint("six")\n}\nprint("end")', expected: 'five\nend' }, // case values are expressions
			{ code: 'x := 5\ny := 5\nswitch (x) { case y: print("same") }\nprint("end")', expected: 'same\nend' },
			{ code: 'switch ("a") {\n\t; a comment\n\tcase "a": ; another\n\t\tprint(1)\n\t\tprint(2)\n\t; and one more\n\tcase "b":\n\t\tprint(3)\n}\nprint("end")', expected: '1\n2\nend' },
			{ code: 'switch (null) { case "": print("empty")\ndefault: print("d") }\nprint("end")', expected: 'empty\nend' }, // null = ""
			{ code: 'switch (true) { case 1: print("one") }\nprint("end")', expected: 'one\nend' },
			{ code: 'i := 0\nf() { i := i + 1\nreturn i }\nswitch (f()) { case 1: print("once") }\nprint(i)', expected: 'once\n0' }, // the subject is worked out once
			{ code: 'switch (1) { case 1: switch (2) { case 2: print("inner") }\nprint("outer") }\nprint("end")', expected: 'inner\nouter\nend' },
			{ code: 'switch (1) { case 1: switch (2) { case 2: print("a")\nbreak\nprint("b") }\nprint("c") }\nprint("end")', expected: 'a\nc\nend' }, // break is the inner switch's
			{ code: 'switch (2) { case 1: x := 1\ncase 2: x := 2\ny := x * 2 }\nprint(x . y)', expected: '24' }, // more than one statement in a case
			{ code: 'SWITCH ("a") { CASE "a": print(1)\nDEFAULT: print(2) }\nprint("end")', expected: '1\nend' },
			{ code: 'switch := 4\ncase := 5\ndefault := 6\nfallthrough := 7\nprint(switch + case + default + fallthrough)', expected: '22' },
			{ code: 'switch (1) {\n\tcase 1: print("x")\n}, print("y")', expected: 'x\ny' },
			
			// try / catch / finally / throw
			{ code: 'x := 0\ntry { x := 1 } catch (e) { x := 2 }\nprint(x)', expected: '1' }, // try succeeds, catch never runs
			{ code: 'x := 0\ntry { throw "bad" } catch (e) { x := e.message }\nprint(x)', expected: 'bad' },
			{ code: 'x := 0\ntry { x := Count(true) } catch (e) { x := e.message }\nprint(x)', expected: 'INTERNAL_Count: Expected a string or an array' }, // a runtime error is catchable, not just an explicit throw
			{ code: 'x := 0\ntry { throw "a" } catch { x := 1 }\nprint(x)', expected: '1' }, // catch with no (e) still catches
			{ code: 'x := ""\ntry { x := x . "a" } finally { x := x . "fin" }\nprint(x)', expected: 'afin' }, // finally runs when nothing threw too
			{ code: 'f() { try { return 1 } finally { print("cleanup") } }\nprint(f())', expected: 'cleanup\n1' }, // finally after return, the original return value survives
			{ code: 'f() { try { return 1 } finally { return 2 } }\nprint(f())', expected: '2' }, // finally's own return wins
			{ code: 'f() { try { throw "x" } finally { return "caught by finally" } }\nprint(f())', expected: 'caught by finally' }, // and beats a pending throw too
			{ code: 'x := ""\nn := 0\nwhile (n < 3) { n++\ntry { if (n == 2) { continue }\nx := x . n } finally { x := x . "-" } }\nprint(x)', expected: '1--3-' }, // finally runs on the way through a continue
			{ code: 'x := ""\nloop (5) { try { if (A_Index == 3) { break }\nx := x . A_Index } finally { x := x . "." } }\nprint(x)', expected: '1.2..' }, // and a break
			{ code: 'x := ""\ntry { try { throw "inner" } catch (e) { x := "outer:" . e.message } } catch (e) { x := "unreached" }\nprint(x)', expected: 'outer:inner' }, // nested try, inner catch handles it
			{ code: 'x := ""\ntry { try { throw "inner" } finally { x := x . "f1-" } } catch (e) { x := x . "caught:" . e.message }\nprint(x)', expected: 'f1-caught:inner' }, // a finally in between with no catch of its own
			{ code: 'x := ""\ntry { try { throw "boom" } catch (e) { throw "wrapped:" . e.message } } catch (e) { x := e.message }\nprint(x)', expected: 'wrapped:boom' }, // rethrowing from a catch
			{ code: 'g() { throw "from g" }\nf() { g() }\nx := ""\ntry { f() } catch (e) { x := e.message }\nprint(x)', expected: 'from g' }, // an error from deep in a call chain
			{ code: 'x := 0\ntry { x := missing.y } catch (e) { x := 1 }\nprint(x)', expected: '' }, // a missing property is just "", not an error, so it never throws
			{ code: 'x := 0\ntry { x := 1 / 0 } catch (e) { x := "never" }\nprint(x)', expected: 'Infinity' }, // dividing by zero isn't an error in coyote
			{ code: 'x := 0\ntry { throw {"code": 404, "message": "not found"} } catch (e) { x := e.code . ":" . e.message }\nprint(x)', expected: '404:not found' }, // an object literal's own keys land on the caught error
			{ code: 'x := 0\ntry { throw 5 } catch (e) { x := e.message }\nprint(x)', expected: '5' }, // non-string throws get stringified for .message
			{ code: 'x := ""\ntry { throw null } catch (e) { x := e.message . "|" }\nprint(x)', expected: '|' },
			{ code: 'x := ""\ntry { throw "x" } catch (e) { x := e.type }\nprint(x)', expected: 'Throw' },
			{ code: 'x := ""\ntry { x := Count(true) } catch (e) { x := e.type }\nprint(x)', expected: 'Error' },
			{ code: 'x := 0\nf() { g() }\ng() { throw "boom" }\ntry { f() } catch (e) { x := e.line }\nprint(IsNum(x))', expected: '1' }, // .line is a real number
			{ code: 'x := 0\ntry { x := Count(true) } catch (e) { x := StrLen(e.stack) > 0 }\nprint(x)', expected: 'false' }, // no call chain here, so nothing to show
			{ code: 'r := 0\nf() { g() }\ng() { throw "boom" }\ntry { f() } catch (e) { r := Contains(e.stack, "g") . Contains(e.stack, "f") }\nprint(r)', expected: '11' },
			{ code: 'x := ""\ntry { x := "no throw" } catch (e) { x := "unreached" }\nprint(x)', expected: 'no throw' },
			{ code: 'x := ""\nclass T { risky() { throw "class boom" } }\nt := new T()\ntry { t.risky() } catch (e) { x := e.message }\nprint(x)', expected: 'class boom' }, // a method can throw too
			{ code: 'x := ""\ntry {\n\tx := "block"\n}\ncatch (e) {\n\tx := "never"\n}\nprint(x)', expected: 'block' }, // catch on its own line still attaches
			{ code: 'try := 1\ncatch := 2\nfinally := 3\nthrow := 4\nprint(try + catch + finally + throw)', expected: '10' }, // the keywords are still names on their own
			{ code: 'trying := 1\ncatchall := 2\nthrowaway := 3\nprint(trying + catchall + throwaway)', expected: '6' }, // and names that merely start with them
			
			// Assert
			{ code: 'x := Assert(1)\nprint(x)', expected: '1' },
			{ code: 'x := 0\ntry { Assert(0) } catch (e) { x := e.message }\nprint(x)', expected: 'Assertion failed' },
			{ code: 'x := 0\ntry { Assert(1 == 2, "custom message") } catch (e) { x := e.message }\nprint(x)', expected: 'custom message' },
			{ code: 'x := Assert(1, "unused since it passed")\nprint(x)', expected: '1' },
			{ code: 'x := 0\ntry { Assert("") } catch (e) { x := e.message }\nprint(x)', expected: 'Assertion failed' }, // uses the truthiness table, same as if
			{ code: 'x := 0\ntry { Assert("0") } catch (e) { x := e.message }\nprint(x)', expected: 'Assertion failed' },
			{ code: 'x := Assert("a")\nprint(x)', expected: '1' },
			
			// array items are worked out in order
			{ code: 'a := []\nr := [Push(a, Upper("x")), Push(a, 2)]\nprint(Json(a))', expected: '["X",2]' }, // the first is slower, and used to finish last
			{ code: 'r := [a := 1, b := a + 1, c := b + 1]\nprint(Json(r))', expected: '[1,2,3]' },
			{ code: 'r := [[a := 1], [a + 1]]\nprint(Json(r))', expected: '[[1],[2]]' },
			{ code: 'a := []\nr := [Push(a, 1), [Push(a, 2)], Push(a, 3)]\nprint(Json(a))', expected: '[1,2,3]' },
			{ code: 'o := {"a": [x := 1, x + 1]}\nprint(Json(o))', expected: '{"a":[1,2]}' },
			{ code: 'r := [1]\nprint(Json(r))', expected: '[1]' },
			{ code: 'r := []\nprint(Count(r))', expected: '0' },
			{ code: 'a := []\nf(x, y) { return x . y }\nr := [f(Push(a, 1), 2), f(Push(a, 3), 4)]\nprint(Json(a))', expected: '[1,3]' },
			
			// quotes inside strings, and single-quoted strings
			{ code: "'say \"hi\"'", expected: 'say "hi"' },
			{ code: '"it\'s"', expected: "it's" },
			{ code: "'it\\'s'", expected: "it's" },
			{ code: "'a\"b'", expected: 'a"b' },
			{ code: "'abc'", expected: 'abc' },
			{ code: "''", expected: '' },
			{ code: '""', expected: '' },
			{ code: "'\\\\'", expected: '\\' },
			{ code: "'a\\nb'", expected: 'a\nb' }, // same escapes as double quotes
			{ code: "'\\u{41}'", expected: 'A' },
			{ code: 'x := "console.log(\\"it\'s\\")"\nprint(x)', expected: 'console.log("it\'s")' }, // js source with both kinds of quote
			{ code: "x := 'console.log(\"it\\'s\")'\nprint(x)", expected: 'console.log("it\'s")' },
			{ code: 'x := "\\"" . "a"\nprint(x)', expected: '"a' }, // a quote at the edge used to get eaten by concat
			{ code: 'x := "a" . "\\""\nprint(x)', expected: 'a"' },
			{ code: 'x := "\\"a\\"" . "b"\nprint(x)', expected: '"a"b' },
			{ code: 'x := "\\"hi\\""\nprint(x)\nprint(StrLen(x))', expected: '"hi"\n4' },
			{ code: "x := 'a' 'b'\nprint(x)", expected: 'ab' },
			{ code: "x := 'a' . \"b\" . 'c'\nprint(x)", expected: 'abc' },
			{ code: "x := 'a'\nprint(x === \"a\")", expected: 'true' }, // the same string either way
			{ code: "x := 'A'\nprint(x = \"a\")\nprint(x == \"a\")", expected: 'true\nfalse' },
			{ code: "x := '5'\nprint(x === 5)\nprint(x == 5)", expected: 'false\ntrue' },
			{ code: "x := 'a'\nx .= 'b'\nprint(x)", expected: 'ab' },
			{ code: "x := Upper('abc')\nprint(x)", expected: 'ABC' },
			{ code: 'arr := ["a\\nb", \'c\']\nprint(Json(arr))', expected: '["a\\nb","c"]' },
			{ code: "o := {'a': 1, \"b\\\"c\": 2}\nprint(Json(Keys(o)))", expected: '["a","b\\"c"]' }, // keys take single quotes and escapes too
			{ code: "o := {'a': 1}\nprint(o.a)\nprint(o['a'])\nprint(o[\"a\"])", expected: '1\n1\n1' },
			{ code: 'o := {"k\\ney": 5}\nprint(o["k\\ney"])', expected: '5' },
			{ code: "f(a := 'd\\n') { return a }\nprint(StrLen(f()))", expected: '2' },
			{ code: 'r := 1 ? "y\\n" : \'n\'\nprint(StrLen(r))', expected: '2' },
			
			// strings that go over lines, and what can sit inside one
			{ code: 'x := "line1\nline2"\nprint(x)', expected: 'line1\nline2' },
			{ code: "x := 'line1\nline2'\nprint(x)", expected: 'line1\nline2' },
			{ code: 'x := "a\r\nb"\nprint(x)', expected: 'a\nb' }, // windows line endings inside a string
			{ code: 'x := "a\r\nb\r\nc"\nprint(StrLen(x))', expected: '5' },
			{ code: 'x := "\\r\\n"\nprint(StrLen(x))', expected: '2' }, // an escaped one is kept
			{ code: 'x := "one\ntwo\nthree"\nprint(Count(StrSplit(x, "\\n")))', expected: '3' },
			{ code: 'x := "a;b"\nprint(x)', expected: 'a;b' },
			{ code: "x := 'a;b'\nprint(x)", expected: 'a;b' },
			{ code: 'x := "; not a comment" ; a comment\nprint(x)', expected: '; not a comment' },
			{ code: 'x := "{[(}])"\nprint(x)', expected: '{[(}])' },
			{ code: 'x := "a := 1, b := 2"\nprint(x)', expected: 'a := 1, b := 2' },
			{ code: 'x := "%name%"\nprint(x)', expected: '%name%' },
			{ code: 'x := "${x} {x}"\nprint(x)', expected: '${x} {x}' }, // only backticks interpolate
			{ code: "x := '${x}'\nprint(x)", expected: '${x}' },
			{ code: 'x := "a" . "b"\nprint(x)', expected: 'ab' },
			
			// template strings
			{ code: '`hi`', expected: 'hi' },
			{ code: '``', expected: '' },
			{ code: 'name := "bob"\nx := `hi ${name}`\nprint(x)', expected: 'hi bob' },
			{ code: 'name := "bob"\nx := `${name}${name}`\nprint(x)', expected: 'bobbob' },
			{ code: 'x := `${1 + 2}`\nprint(x)', expected: '3' },
			{ code: 'x := `${ 1 + 2 }`\nprint(x)', expected: '3' }, // spaces inside the braces
			{ code: 'x := `sum ${Sum([1, 2, 3])} of ${Count([1, 2, 3])}`\nprint(x)', expected: 'sum 6 of 3' },
			{ code: 'x := 5\nr := `${x > 3 ? "big" : "small"}`\nprint(r)', expected: 'big' },
			{ code: 'o := {"a": {"b": 7}}\nr := `${o.a.b}`\nprint(r)', expected: '7' },
			{ code: 'arr := [10, 20]\nr := `${arr[1]}`\nprint(r)', expected: '20' },
			{ code: 'x := `${"a" . "b"}`\nprint(x)', expected: 'ab' },
			{ code: 'x := `${Upper(`in${1}`)}`\nprint(x)', expected: 'IN1' },
			{ code: 'n := "in"\nx := `a ${`b ${n} c`} d`\nprint(x)', expected: 'a b in c d' }, // templates inside templates
			{ code: 'x := `a${"}"}b`\nprint(x)', expected: 'a}b' }, // a } inside a string inside the expression
			{ code: 'x := `${ {"a": 1}.a }`\nprint(x)', expected: '1' }, // and an object literal
			{ code: 'x := `\\${x}`\nprint(x)', expected: '${x}' }, // escaping the brace
			{ code: 'x := `\\${`\nprint(x)', expected: '${' },
			{ code: 'x := `cost $5 and $`\nprint(x)', expected: 'cost $5 and $' },
			{ code: 'x := `$`\nprint(x)', expected: '$' },
			{ code: 'x := `a\\nb\\t\\`c\\\\`\nprint(x)', expected: 'a\nb\t`c\\' },
			{ code: 'x := `\\u{41}\\u0042`\nprint(x)', expected: 'AB' },
			{ code: 'x := `say "hi" it\'s`\nprint(x)', expected: 'say "hi" it\'s' },
			{ code: 'x := `line1\nline2`\nprint(x)', expected: 'line1\nline2' },
			{ code: 'x := `a\r\nb`\nprint(x)', expected: 'a\nb' },
			{ code: 'x := `${null}|${undefined}|${true}|${NaN}|${[1, 2]}|${missing}`\nprint(x)', expected: '||true|NaN|1,2|' },
			{ code: 'a := []\nr := `${Push(a, 1)}${Push(a, 2)}`\nprint(r)', expected: '11,2' }, // parts run in order
			{ code: 'x := `a` . `b`\nprint(x)', expected: 'ab' },
			{ code: 'r := `${5}`\nprint(r === "5")\nprint(r === 5)', expected: 'true\nfalse' }, // always a string
			{ code: 'f(a := `d${1}`) { return a }\nprint(f())', expected: 'd1' },
			{ code: 'greet(n) { return `hi ${n}` }\nprint(greet("bob"))', expected: 'hi bob' },
			{ code: 'arr := [`a${1}`, `b`]\nprint(Json(arr))', expected: '["a1","b"]' },
			{ code: 'o := {"k": `v${1}`}\nprint(o.k)', expected: 'v1' },
			{ code: 's := ""\nloop (3) { s := s . `${A_Index}` }\nprint(s)', expected: '123' },
			
			// heredocs
			{ code: 'x := <<END\nabc\nEND\nprint(x)', expected: 'abc' },
			{ code: 'x := <<END\nEND\nprint(x)', expected: '' },
			{ code: 'x := <<END\na\n\nb\nEND\nprint(x)', expected: 'a\n\nb' },
			{ code: 'x := <<END\na\n\nEND\nprint(x . "|")', expected: 'a\n|' }, // a blank line before the end keeps its newline
			{ code: 'x := <<END\n  indented\n\ttabbed\nEND\nprint(x)', expected: '  indented\n\ttabbed' }, // the body isn't touched
			{ code: 'x := <<END\nconsole.log("it\'s")\nEND\nprint(x)', expected: 'console.log("it\'s")' }, // both kinds of quote
			{ code: 'x := <<END\nlet s = \'a\' + "b" + `c${d}`\nEND\nprint(x)', expected: 'let s = \'a\' + "b" + `c${d}`' },
			{ code: 'x := <<END\na\\nb \\" {x} ${y} `z` ; not a comment\nEND\nprint(x)', expected: 'a\\nb \\" {x} ${y} `z` ; not a comment' }, // no escapes, no interpolation, no comments
			{ code: 'x := <<END\nENDING\nEND2\nEND_\nEND\nprint(x)', expected: 'ENDING\nEND2\nEND_' }, // only a whole END ends it
			{ code: 'x := <<END\nabc\n  END\nprint(x)', expected: 'abc' }, // the end can be indented
			{ code: 'x := <<JS\nx\nJS\nprint(x)', expected: 'x' },
			{ code: 'x := <<_a1\nx\n_a1\nprint(x)', expected: 'x' },
			{ code: 'x := <<end\nEND\nend\nprint(x)', expected: 'END' }, // the name is case-sensitive
			{ code: 'x := <<A\n<<B\nA\nprint(x)', expected: '<<B' }, // a heredoc inside one is just text
			{ code: 'x := Upper(<<END\nabc\nEND)\nprint(x)', expected: 'ABC' }, // as an argument the call closes on the END line
			{ code: 'x := <<END\na\nEND\ny := "b"\nprint(x . y)', expected: 'ab' }, // and the script carries on after it
			{ code: 'x := <<END\r\na\r\nb\r\nEND\r\nprint(x)', expected: 'a\nb' },
			{ code: 'x := Exec(<<END\nq := 5\nreturn q * 2\nEND)\nprint(x)', expected: '10' },
			{ code: 'x := Json(<<END\na"b\nEND)\nprint(x)', expected: '"a\\"b"' },
			{ code: 'x := <<END\nabc\nEND\nprint(StrLen(x))', expected: '3' },
			{ code: 'x := <<END\n1\n2\nEND\nprint(Count(StrSplit(x, "\\n")))', expected: '2' },
			{ code: 'r := 1\nif (r) {\n\tx := <<END\nkept\nEND\n\tprint(x)\n}', expected: 'kept' }, // inside a block
			{ code: 'f() { return <<END\nfrom f\nEND\n}\nprint(f())', expected: 'from f' },
			{ code: 'x := 1 << 2\nprint(x)', expected: '4' }, // << is still a shift
			{ code: 'x := 8\ny := x << 1 << 1\nprint(y)', expected: '32' },
		];
		// === never matches two separately built arrays/objects, so compare structurally
		const deepEqual = (a, b) => {
			if (a === b || (a !== a && b !== b)) return true; // NaN isn't === itself
			if (Array.isArray(a) && Array.isArray(b)) {
				return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
			}
			if (a && b && typeof a === 'object' && typeof b === 'object') {
				const aKeys = Object.keys(a);
				const bKeys = Object.keys(b);
				return aKeys.length === bKeys.length && aKeys.every(k => deepEqual(a[k], b[k]));
			}
			return false;
		};
		let counted = 0;
		const assert = async (assertions, run = (code) => this.assert_code(code)) => {
			for (const { code, expected } of assertions) {
				if (counted++ % parts !== part) {
					continue;
				}
				const result = await run(code);
				const isSuccess = deepEqual(result, expected);
				if (!isSuccess) {
					console.log(chalk.red(`Assertion failed: ${code}`));
					console.log(chalk.yellow(`Expected: ${expected}`));
					console.log(chalk.yellow(`Actual: ${result}`));
					throw new Error(chalk.red(`Assertion failed: ${code}`));
				}
				if (debuglogtier > 1)
					console.log(chalk.green(`Test passed: `) + chalk.white(`${code}`) + chalk.green(` => Result: `) + chalk.white(`${result}`));
			}
		};
		await assert(assertions);
		// finally can't swallow an unhandled throw, and a rethrow from a catch is still uncaught if nothing wraps it
		await assert([
			{ code: 'try { throw "a" } finally { print("cleanup") }', expected: 'a' },
			{ code: 'try { throw "boom" } catch (e) { throw "wrapped:" . e.message }', expected: 'wrapped:boom' },
			{ code: 'try { x := 1 } catch (e) { throw "never" }', expected: 'no error' },
		], async (code) => { try { await this.assert_code(code) } catch (err) { return err.summary } return 'no error' });
		// parser-level: what the tree printer makes of the source (colours stripped)
		await assert([
			{ code: 'loop (2) { break }', expected: '└─LOOP\n  ├─count\n  │ └─2\n  └─statements\n    └─BREAK\n' },
			{ code: 'loop (2) { continue }', expected: '└─LOOP\n  ├─count\n  │ └─2\n  └─statements\n    └─CONTINUE\n' },
			{ code: 'loop (2) { CONTINUE }', expected: '└─LOOP\n  ├─count\n  │ └─2\n  └─statements\n    └─CONTINUE\n' }, // keyword is case-insensitive
			{ code: 'loop (2) { if (1) { break } else { continue } }', expected: '└─LOOP\n  ├─count\n  │ └─2\n  └─statements\n    └─IF\n      ├─condition\n      │ └─1\n      ├─if_true\n      │ └─BREAK\n      └─if_false\n        └─CONTINUE\n' },
			{ code: 'continued := 1', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR continued\n  └─right\n    └─1\n' }, // not a CONTINUE
			{ code: 'x := a + 1 = 3', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─EQUALS\n      ├─ADD\n      │ ├─VAR a\n      │ └─1\n      └─3\n' }, // equality is below add
			{ code: 'x := 10 - 3 - 2', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─SUB\n      ├─SUB\n      │ ├─10\n      │ └─3\n      └─2\n' }, // groups from the left
			{ code: 'x := 1 || 2 && 3', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─OR\n      ├─1\n      └─AND\n        ├─2\n        └─3\n' }, // && under ||
			{ code: 'x := !a', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─NOT\n      └─VAR a\n' },
			{ code: 'x := not a', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─NOT\n      └─VAR a\n' }, // same node as !
			{ code: 'x := a ? 1 : 2', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─TERNARY\n      ├─VAR a\n      ├─1\n      └─2\n' },
			{ code: 'x := 2 & 3 | 4', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─BITWISE_OR\n      ├─BITWISE_AND\n      │ ├─2\n      │ └─3\n      └─4\n' }, // & under |
			{ code: 'x := 1 << 2 + 1', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─BIT_SHIFT\n      ├─1\n      └─ADD\n        ├─2\n        └─1\n' }, // add under shift
			{ code: 'x := 1 < 2 = 3 < 4', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─EQUALS\n      ├─LESS_THAN\n      │ ├─1\n      │ └─2\n      └─LESS_THAN\n        ├─3\n        └─4\n' }, // comparison under equality
			{ code: 'x := null', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─null\n' }, // typed literals in the tree
			{ code: 'x := undefined', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─undefined\n' },
			{ code: 'x := nil', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─undefined\n' }, // same node as undefined
			{ code: 'x := NaN', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─NaN\n' },
			{ code: 'x := Infinity', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─Infinity\n' },
			{ code: 'x := -Infinity', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─SUB\n      ├─0\n      └─Infinity\n' },
			{ code: 'x := TRUE', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─true\n' },
			{ code: 'x := 0xFF', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─255\n' }, // numeric forms come out as plain numbers
			{ code: 'x := 0b101', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─5\n' },
			{ code: 'x := 1e6', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─1000000\n' },
			{ code: 'x := 1_000', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─1000\n' },
			{ code: 'x := .5', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─0.5\n' },
			{ code: 'x := 1.5e-3', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─0.0015\n' },
			{ code: 'x := "5"', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─"5"\n' }, // a string keeps its quotes, a number does not
			{ code: 'x := nullable', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─VAR nullable\n' }, // not a null
			{ code: 'x := [null, 0x10, "a"]', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─ARRAY\n      ├─null\n      ├─16\n      └─"a"\n' },
			{ code: 'x := {"a": null}', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─OBJECT\n      └─"a"\n        └─null\n' },
			{ code: "x := 'a'", expected: "└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─'a'\n" }, // strings and templates in the tree
			{ code: 'x := "a\\nb"', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─"a\\nb"\n' }, // the escape is worked out when it runs, so the tree shows it as written
			{ code: 'x := "a`nb"', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─"a`nb"\n' },
			{ code: 'x := `a`', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─TEMPLATE\n      └─"a"\n' },
			{ code: 'x := ``', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─TEMPLATE\n' },
			{ code: 'x := `hi ${name}!`', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─TEMPLATE\n      ├─"hi "\n      ├─VAR name\n      └─"!"\n' },
			{ code: 'x := `${1 + 2}${b}`', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─TEMPLATE\n      ├─ADD\n      │ ├─1\n      │ └─2\n      └─VAR b\n' },
			{ code: 'x := `a\\n${"}"}`', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─TEMPLATE\n      ├─"a\\n"\n      └─"}"\n' },
			{ code: 'x := <<END\nabc\nEND', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─TEMPLATE\n      └─"abc"\n' }, // a heredoc is a template with just the text
			{ code: 'x := <<END\nEND', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─TEMPLATE\n' },
			{ code: "x := {'a': `b`}", expected: "└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─OBJECT\n      └─'a'\n        └─TEMPLATE\n          └─\"b\"\n" },
			{ code: 'for (x in arr) { y := 1 }', expected: '└─FOR_IN\n  ├─variable x\n  ├─iterable\n  │ └─VAR arr\n  └─statements\n    └─ASSIGNMENT\n      ├─left\n      │ └─VAR y\n      └─right\n        └─1\n' }, // for and ranges in the tree
			{ code: 'for (x of 1..3) { break }', expected: '└─FOR_OF\n  ├─variable x\n  ├─iterable\n  │ └─RANGE\n  │   ├─1\n  │   └─3\n  └─statements\n    └─BREAK\n' },
			{ code: 'for await (x of a) { }', expected: '└─FOR_OF await\n  ├─variable x\n  ├─iterable\n  │ └─VAR a\n  └─statements\n' },
			{ code: 'x := 1..10..2', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─RANGE\n      ├─1\n      ├─10\n      └─2\n' },
			{ code: 'x := 1..n', expected: '└─ASSIGNMENT\n  ├─left\n  │ └─VAR x\n  └─right\n    └─RANGE\n      ├─1\n      └─VAR n\n' },
			{ code: 'while (x) { break }', expected: '└─WHILE\n  ├─condition\n  │ └─VAR x\n  └─statements\n    └─BREAK\n' }, // while, do, switch and labels in the tree
			{ code: 'until (x) { break }', expected: '└─WHILE until\n  ├─condition\n  │ └─VAR x\n  └─statements\n    └─BREAK\n' },
			{ code: 'do { x++ } while (x < 3)', expected: '└─DO_WHILE\n  ├─condition\n  │ └─LESS_THAN\n  │   ├─VAR x\n  │   └─3\n  └─statements\n    └─INC\n      ├─VAR x\n      └─1\n' },
			{ code: 'do { x++ } until (x >= 3)', expected: '└─DO_WHILE until\n  ├─condition\n  │ └─GREATER_EQUAL\n  │   ├─VAR x\n  │   └─3\n  └─statements\n    └─INC\n      ├─VAR x\n      └─1\n' },
			{ code: 'switch (x) { case 1: y := 1\ndefault: y := 2 }', expected: '└─SWITCH\n  ├─subject\n  │ └─VAR x\n  ├─case\n  │ ├─1\n  │ └─statements\n  │   └─ASSIGNMENT\n  │     ├─left\n  │     │ └─VAR y\n  │     └─right\n  │       └─1\n  └─default\n    └─statements\n      └─ASSIGNMENT\n        ├─left\n        │ └─VAR y\n        └─right\n          └─2\n' },
			{ code: 'outer: loop (2) { break outer }', expected: '└─LOOP outer:\n  ├─count\n  │ └─2\n  └─statements\n    └─BREAK outer\n' },
			{ code: 'break outer', expected: '└─BREAK outer\n' },
			{ code: 'fallthrough', expected: '└─FALLTHROUGH\n' },
			{ code: 'try { x := 1 } catch (e) { y := 1 }', expected: '└─TRY\n  ├─try\n  │ └─ASSIGNMENT\n  │   ├─left\n  │   │ └─VAR x\n  │   └─right\n  │     └─1\n  └─catch e\n    └─ASSIGNMENT\n      ├─left\n      │ └─VAR y\n      └─right\n        └─1\n' }, // try, catch, finally and throw in the tree
			{ code: 'try { x := 1 } catch { y := 1 }', expected: '└─TRY\n  ├─try\n  │ └─ASSIGNMENT\n  │   ├─left\n  │   │ └─VAR x\n  │   └─right\n  │     └─1\n  └─catch\n    └─ASSIGNMENT\n      ├─left\n      │ └─VAR y\n      └─right\n        └─1\n' },
			{ code: 'try { x := 1 } finally { y := 1 }', expected: '└─TRY\n  ├─try\n  │ └─ASSIGNMENT\n  │   ├─left\n  │   │ └─VAR x\n  │   └─right\n  │     └─1\n  └─finally\n    └─ASSIGNMENT\n      ├─left\n      │ └─VAR y\n      └─right\n        └─1\n' },
			{ code: 'try { x := 1 } catch (e) { y := 1 } finally { z := 1 }', expected: '└─TRY\n  ├─try\n  │ └─ASSIGNMENT\n  │   ├─left\n  │   │ └─VAR x\n  │   └─right\n  │     └─1\n  ├─catch e\n  │ └─ASSIGNMENT\n  │   ├─left\n  │   │ └─VAR y\n  │   └─right\n  │     └─1\n  └─finally\n    └─ASSIGNMENT\n      ├─left\n      │ └─VAR z\n      └─right\n        └─1\n' },
			{ code: 'throw "a"', expected: '└─THROW\n  └─"a"\n' },
		], async (code) => print_Coyote_tree(await this.make_ast(code)).replace(/\u001b\[[0-9;]*m/g, ''));
		// parse errors, what the parser says when a string never ends
		await assert([
			{ code: 'x := "abc', expected: 'Unterminated string' },
			{ code: "x := 'abc", expected: 'Unterminated string' },
			{ code: 'x := "abc\\"', expected: 'Unterminated string' }, // the last quote is escaped
			{ code: 'x := "abc`"', expected: 'Unterminated string' }, // and so is this one
			{ code: "x := 'abc`'", expected: 'Unterminated string' },
			{ code: 'x := "abc\ndef', expected: 'Unterminated string' },
			{ code: 'x := `abc', expected: 'Unterminated template string' },
			{ code: 'x := `abc\\`', expected: 'Unterminated template string' },
			{ code: 'x := `a ${b', expected: "Expected '}' to close '${'" },
			{ code: 'x := `a ${} b`', expected: "Expected expression after '${'" },
			{ code: 'x := "ok"', expected: 'no error' },
		], async (code) => { try { await this.assert_code(code) } catch (err) { return err.summary } return 'no error' });
		// where things are, every node knows its line and column (from 1, a tab is one column)
		const spot = (node, out) => {
			if (node === null || typeof node !== 'object') return;
			if (Array.isArray(node) || node instanceof Map) {
				for (const child of node.values()) spot(child, out);
				return;
			}
			if (typeof node.type === 'number') out.push(ItemType[node.type] + ' ' + node.line + ':' + node.col);
			for (const child of Object.values(node)) spot(child, out);
		};
		await assert([
			{ code: 'x := 1 + 2 * 3', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,ADD 1:6,LITERAL 1:6,MUL 1:10,LITERAL 1:10,LITERAL 1:14' },
			{ code: 'x := 1\ny := 2', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,LITERAL 1:6,ASSIGNMENT 2:1,VARIABLE 2:1,LITERAL 2:6' },
			{ code: 'x := 1\r\ny := 2', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,LITERAL 1:6,ASSIGNMENT 2:1,VARIABLE 2:1,LITERAL 2:6' }, // windows line endings
			{ code: '\tx := 1\n  y := 2', expected: 'ASSIGNMENT 1:2,VARIABLE 1:2,LITERAL 1:7,ASSIGNMENT 2:3,VARIABLE 2:3,LITERAL 2:8' },
			{ code: '; c\nx := 1', expected: 'ASSIGNMENT 2:1,VARIABLE 2:1,LITERAL 2:6' },
			{ code: '\n\n\nx := 1', expected: 'ASSIGNMENT 4:1,VARIABLE 4:1,LITERAL 4:6' },
			{ code: 'x := 1, y := 2', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,LITERAL 1:6,ASSIGNMENT 1:9,VARIABLE 1:9,LITERAL 1:14' },
			{ code: 'x := "a\nb"\ny := 1', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,LITERAL 1:6,ASSIGNMENT 3:1,VARIABLE 3:1,LITERAL 3:6' }, // a string over lines
			{ code: 'x := <<END\na\nEND\ny := 1', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,TEMPLATE 1:6,ASSIGNMENT 4:1,VARIABLE 4:1,LITERAL 4:6' },
			{ code: 'if (x) {\n\ty := 1\n} else {\n\tz := 2\n}', expected: 'IF 1:1,VARIABLE 1:5,ASSIGNMENT 2:2,VARIABLE 2:2,LITERAL 2:7,ASSIGNMENT 4:2,VARIABLE 4:2,LITERAL 4:7' },
			{ code: 'loop (2) {\n\tbreak\n}', expected: 'LOOP 1:1,LITERAL 1:7,BREAK 2:2' },
			{ code: 'f(a, b := 2) {\n\treturn a\n}', expected: 'FUNCTION_DEFINITION 1:1,LITERAL 1:11,RETURN 2:2,VARIABLE 2:9' },
			{ code: 'class C {\n\tm() {\n\t}\n}', expected: 'CLASS_DEFINITION 1:1,FUNCTION_DEFINITION 2:2' },
			{ code: 'x := c ? 1 : 2', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,TERNARY 1:6,VARIABLE 1:6,LITERAL 1:10,LITERAL 1:14' },
			{ code: 'x := [1, 2]', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,ARRAY 1:6,LITERAL 1:7,LITERAL 1:10' },
			{ code: 'x := {"a": 1}', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,OBJECT 1:6,LITERAL 1:12' },
			{ code: 'x := `a${b}`', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,TEMPLATE 1:6,VARIABLE 1:10' },
			{ code: 'x++', expected: 'INC 1:1,VARIABLE 1:1,LITERAL 1:1' }, // inline nodes take their parent's place
			{ code: 'x .= "a"', expected: 'APP 1:1,VARIABLE 1:1,LITERAL 1:6' },
			{ code: 'y := %x%', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,DEREF 1:6,VARIABLE 1:6' },
			{ code: 'y := new C(1)', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,NEW_INSTANCE 1:6,LITERAL 1:12' },
			{ code: 'y := o.a.b', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,MEMBER_ACCESS 1:6,MEMBER_ACCESS 1:6,VARIABLE 1:6,LITERAL 1:7,LITERAL 1:9' },
			{ code: 'y := o[1]', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,MEMBER_ACCESS 1:6,VARIABLE 1:6,LITERAL 1:8' },
			{ code: 'y := c.m(1)', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,METHOD_CALL 1:6,MEMBER_ACCESS 1:6,VARIABLE 1:6,LITERAL 1:7,LITERAL 1:10' },
			{ code: 'y := !x', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,NOT 1:6,VARIABLE 1:7' },
			{ code: 'y := -x', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,SUB 1:6,LITERAL 1:6,VARIABLE 1:7' },
			{ code: '#Strict()', expected: 'DIRECTIVE 1:1' },
			{ code: 'x := (1 + 2)', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,ADD 1:7,LITERAL 1:7,LITERAL 1:11' },
			{ code: 'for (x in a) {\n}', expected: 'FOR_IN 1:1,VARIABLE 1:11' },
			{ code: 'x := 1..3', expected: 'ASSIGNMENT 1:1,VARIABLE 1:1,RANGE 1:6,LITERAL 1:6,LITERAL 1:9' },
			{ code: 'while (x) {\n\tbreak\n}', expected: 'WHILE 1:1,VARIABLE 1:8,BREAK 2:2' },
			{ code: 'do {\n\tx++\n} while (x)', expected: 'DO_WHILE 1:1,VARIABLE 3:10,INC 2:2,VARIABLE 2:2,LITERAL 2:2' },
			{ code: 'switch (x) {\ncase 1:\n\ty := 1\n}', expected: 'SWITCH 1:1,VARIABLE 1:9,LITERAL 2:6,ASSIGNMENT 3:2,VARIABLE 3:2,LITERAL 3:7' },
			{ code: 'try {\n\tx := 1\n} catch (e) {\n\ty := 1\n}', expected: 'TRY 1:1,ASSIGNMENT 2:2,VARIABLE 2:2,LITERAL 2:7,ASSIGNMENT 4:2,VARIABLE 4:2,LITERAL 4:7' },
			{ code: 'throw "a"', expected: 'THROW 1:1,LITERAL 1:7' },
		], async (code) => {
			const out = [];
			spot((await this.make_ast(code)).statements, out);
			return out.join(',');
		});
		// and none of them go without, whatever they are
		await assert([
			{ code: '#Strict()\nclass C {\n\t__init(v := 1) {\n\t\tn := v\n\t}\n\tget() {\n\t\treturn n\n\t}\n}\nf(a, b := [1, 2]) {\n\tif (a > 1 && b) {\n\t\treturn `${a}`\n\t} else {\n\t\tloop (3) {\n\t\t\tx++\n\t\t\tcontinue\n\t\t}\n\t}\n\treturn a ? b : {"k": new C(a)}\n}\nz := f(1)\nz .= "s"\ny := %z%[0]\nw := c.get(1).x\nt := <<END\nq\nEND\nv := !w . -y\nu := "a" 5 . [1][0]\nz.k.j := f(2)', expected: 0 },
		], async (code) => {
			const out = [];
			spot((await this.make_ast(code)).statements, out);
			return out.filter(n => n.includes('undefined')).length;
		});
		// what an error says, the message and where, and the calls it was in
		const said = err => err.summary + (err.line === undefined ? '' : ' @' + err.line + ':' + err.col) + (err.frames && err.frames.length ? ' [' + (err.frames.length > 4 ? err.frames.length + ' frames' : err.frames.map(f => f.name + '@' + f.line).join(',')) + ']' : '') + (err.inExec ? ' exec' : '');
		await assert([
			{ code: '#Strict()\nx := 1\ny := missing', expected: "Undefined variable 'missing' @3:6" },
			{ code: '#Strict(1)\ny := missing', expected: "Undefined variable 'missing' @2:6" },
			{ code: '#Strict()\nprint(1)\nnope(2)', expected: "Undefined function 'nope' @3:1" },
			{ code: '#Strict()\nx := 1 + missing', expected: "Undefined variable 'missing' @2:10" },
			{ code: '#Strict()\nx := !missing', expected: "Undefined variable 'missing' @2:7" },
			{ code: '#Strict()\nif (missing) {\n}', expected: "Undefined variable 'missing' @2:5" },
			{ code: '#Strict()\nx := [1, missing]', expected: "Undefined variable 'missing' @2:10" },
			{ code: '#Strict()\no := {"a": missing}', expected: "Undefined variable 'missing' @2:12" },
			{ code: '#Strict()\nx := `a ${missing} b`', expected: "Undefined variable 'missing' @2:11" },
			{ code: '#Strict()\nx := missing.a', expected: "Undefined variable 'missing' @2:6" },
			{ code: '#Strict()\nx := missing[1]', expected: "Undefined variable 'missing' @2:6" },
			{ code: '#Strict()\nmissing++', expected: "Undefined variable 'missing' @2:1" },
			{ code: '#Strict()\nx := 1\ny := "nm"\nz := %y%', expected: "Undefined variable 'nm' @4:6" }, // the name a deref looks up
			{ code: '#Strict()\nx := 5\ny := x.foo()', expected: "Undefined function 'foo' @3:6" },
			// did you mean
			{ code: '#Strict()\nx := Uppr("a")', expected: "Undefined function 'Uppr', did you mean 'Upper'? @2:6" },
			{ code: '#Strict()\nx := Pirnt("a")', expected: "Undefined function 'Pirnt', did you mean 'print'? @2:6" },
			{ code: '#Strict()\nx := Strlne("a")', expected: "Undefined function 'Strlne', did you mean 'strlen'? @2:6" },
			{ code: '#Strict()\ngreet(n) { return n }\nx := gret("a")', expected: "Undefined function 'gret', did you mean 'greet'? @3:6" }, // yours come before the builtins
			{ code: '#Strict()\nfoo() { return 1 }\nx := Foo()', expected: "Undefined function 'Foo', did you mean 'foo'? @3:6" }, // functions are case-sensitive
			{ code: '#Strict()\ncounter := 1\nx := countr', expected: "Undefined variable 'countr', did you mean 'counter'? @3:6" },
			{ code: '#Strict()\ncounter := 1\nx := COUNTR', expected: "Undefined variable 'COUNTR', did you mean 'counter'? @3:6" },
			{ code: '#Strict()\nMyCounter := 1\nx := mycountr', expected: "Undefined variable 'mycountr', did you mean 'MyCounter'? @3:6" }, // as it was written
			{ code: '#Strict()\nx := zzzzzzzzz()', expected: "Undefined function 'zzzzzzzzz' @2:6" }, // nothing close, nothing said
			{ code: '#Strict()\nx := nope(1)', expected: "Undefined function 'nope' @2:6" },
			{ code: '#Strict()\ny := 1\nz := x', expected: "Undefined variable 'x' @3:6" }, // and a short name doesn't match everything
			// runtime errors that were always there now say where
			{ code: 'x := 1\nx := Count(true)', expected: 'INTERNAL_Count: Expected a string or an array @2:6' },
			{ code: 'x := 1\r\ny := Count(true)', expected: 'INTERNAL_Count: Expected a string or an array @2:6' },
			{ code: 'x := 1\ny := [1] + 1', expected: 'Unsupported type @2:6' },
			{ code: 'x := 1\ny := new Nope()', expected: 'INTERNAL_new: no class named Nope @2:6' },
			{ code: 'x := 1\nif (Count(true)) {\n}', expected: 'INTERNAL_Count: Expected a string or an array @2:5' },
			{ code: 'loop (Count(true)) { }', expected: 'INTERNAL_Count: Expected a string or an array @1:7' },
			{ code: 'x := Sum([1,\n\tCount(true)])', expected: 'INTERNAL_Count: Expected a string or an array @2:2' }, // the line of the call, not of the statement
			{ code: 'x := 1\ny := "ok"\nz := Count(true)', expected: 'INTERNAL_Count: Expected a string or an array @3:6' },
			{ code: 'x := "ok"', expected: 'no error' },
			// the calls it was inside
			{ code: '#Strict()\nf() {\n\treturn zzz\n}\nx := f()', expected: "Undefined variable 'zzz' @3:9 [f@5]" },
			{ code: 'f() {\n\treturn Count(true)\n}\ng() {\n\treturn f()\n}\nx := g()', expected: 'INTERNAL_Count: Expected a string or an array @2:9 [g@7,f@5]' },
			{ code: 'f(a) {\n\treturn a\n}\nx := f(Count(true))', expected: 'INTERNAL_Count: Expected a string or an array @4:8' }, // f hadn't started yet
			{ code: 'f(n := zzz) { return n }\n#Strict()\nx := f()', expected: "Undefined variable 'zzz' @1:8 [f@3]" }, // a default runs inside the call
			{ code: 'class T {\n\trun() {\n\t\treturn Count(true)\n\t}\n}\nt := new T()\nx := t.run()', expected: 'INTERNAL_Count: Expected a string or an array @3:10 [run@7]' },
			{ code: 'class T {\n\t__init() {\n\t\tx := Count(true)\n\t}\n}\nt := new T()', expected: 'INTERNAL_Count: Expected a string or an array @3:8 [new T@6]' },
			{ code: '#Strict()\nclass C {\n\tm() {\n\t\treturn nope\n\t}\n}\nc := new C()\nx := c.m()', expected: "Undefined variable 'nope' @4:10 [m@8]" },
			// Exec counts its lines from the start of its string
			{ code: 'Exec("x := Count(true)")', expected: 'INTERNAL_Count: Expected a string or an array @1:6 [Exec@1] exec' },
			{ code: 'x := Exec("y := 1\\nz := Count(true)")', expected: 'INTERNAL_Count: Expected a string or an array @2:6 [Exec@1] exec' },
			{ code: 'Exec("x := \\"abc")', expected: 'Unterminated string @1:6 [Exec@1] exec' },
			{ code: '#Strict()\nx := Exec("return nope")', expected: "Undefined variable 'nope' @1:8 [Exec@2] exec" },
			// for and ranges
			{ code: 'o := {"a": 1}\nfor (v of o) { }', expected: 'target is not iterable @2:1' },
			{ code: 'for (x of 5) { }', expected: 'target is not iterable @1:1' },
			{ code: 'for (x of null) { }', expected: 'target is not iterable @1:1' },
			{ code: 'for await (x of 5) { }', expected: 'target is not async iterable @1:1' },
			{ code: 'x := "a" . 1 .. 3', expected: 'A range needs numbers, from, to and a step that are finite @1:6' },
			{ code: 'x := 1..2..0', expected: "A range can't step by 0 @1:6" },
			{ code: 'x := 1..Infinity', expected: 'A range needs numbers, from, to and a step that are finite @1:6' },
			{ code: 'x := 1..NaN', expected: 'A range needs numbers, from, to and a step that are finite @1:6' },
			{ code: 'x := 1..null', expected: 'A range needs numbers, from, to and a step that are finite @1:6' },
			{ code: 'x := 1.."a"', expected: 'A range needs numbers, from, to and a step that are finite @1:6' },
			{ code: 'for (x of 1..3..0) { }', expected: "A range can't step by 0 @1:11" },
			{ code: 'for (x in ) { }', expected: "Expected expression after 'in'" },
			{ code: 'for (x of [1] { }', expected: "Expected ')' after for" },
			{ code: 'for (x of [1]) {', expected: 'Failed to parse statement.' },
			// while, do, switch, labels
			{ code: 'loop (2) { break nothere }', expected: "No loop labelled 'nothere' to break or continue @1:12" },
			{ code: 'loop (2) { continue nothere }', expected: "No loop labelled 'nothere' to break or continue @1:12" },
			{ code: 'f() { break x }\nx: loop (2) { f() }', expected: "No loop labelled 'x' to break or continue @1:7 [f@2]" }, // a label from the caller's loop doesn't reach in
			{ code: 'x: loop (2) { fallthrough }', expected: 'fallthrough only works inside a switch @1:15' },
			{ code: 'fallthrough', expected: 'fallthrough only works inside a switch @1:1' },
			{ code: 'n := 0\nwhile n < 3 { n++ }', expected: 'Failed to parse statement.' }, // needs the parens
			{ code: 'do { x := 1 }', expected: 'Expected while or until after do' },
			{ code: 'switch (1) { case 1 print(1) }', expected: "Expected ':' after case" },
			{ code: 'switch 1 { }', expected: 'Failed to parse statement.' }, // needs the parens too
			{ code: 'loop (2) { break outer }\nouter: loop (2) { }', expected: "No loop labelled 'outer' to break or continue @1:12" }, // a sibling's label, not an enclosing one
			// runaway recursion stops at the limit with an error, not a crash
			{ code: 'f(n) { return f(n + 1) }\nf(0)', expected: 'Recursion limit of 1000 calls reached, is f() calling itself forever? @1:15 [1000 frames]' },
			{ code: 'f(n) { if (n <= 0) { return 0 }\nreturn 1 + f(n - 1) }\nprint(f(1000))', expected: 'Recursion limit of 1000 calls reached, is f() calling itself forever? @2:12 [1000 frames]' }, // 999 above was the deepest that fits
			{ code: 'a(n) { return b(n) }\nb(n) { return a(n) }\na(1)', expected: 'Recursion limit of 1000 calls reached, is a() calling itself forever? @2:15 [1000 frames]' },
			{ code: 'f(n) { if (n <= 0) { return 0 }\nreturn 1 + f(n - 1) }\nprint(f(999))', expected: 'no error' }, // and it is back to normal after one
		], async (code) => { try { await this.assert_code(code) } catch (err) { return said(err) } return 'no error' });
		// the helpers behind the suggestions, Levenshtein gets reused for the string one
		await assert([
			{ code: '|', expected: 0 },
			{ code: 'a|', expected: 1 },
			{ code: '|abc', expected: 3 },
			{ code: 'abc|abc', expected: 0 },
			{ code: 'abc|ABC', expected: 3 },
			{ code: 'kitten|sitting', expected: 3 },
			{ code: 'flaw|lawn', expected: 2 },
			{ code: 'saturday|sunday', expected: 3 },
			{ code: 'ab|ba', expected: 2 },
			{ code: 'é|e', expected: 1 },
		], async (code) => levenshtein(...code.split('|')));
		await assert([
			{ code: 'uppr|Upper,Lower', expected: 'Upper' },
			{ code: 'UPPR|Upper,Lower', expected: 'Upper' }, // case doesn't count
			{ code: 'pirnt|print,sort', expected: 'print' },
			{ code: 'gret|greet,Grep', expected: 'greet' }, // a tie goes to the first
			{ code: 'gret|Grep,greet', expected: 'Grep' },
			{ code: 'nope|Pop,Sort', expected: null },
			{ code: 'x|y', expected: null },
			{ code: 'ab|a', expected: 'a' },
			{ code: 'zzzzzzzzz|Upper', expected: null },
			{ code: 'x|', expected: null },
		], async (code) => nearest(code.split('|')[0], code.split('|')[1].split(',')));
		// an error keeps the first place it was given, and stack overflows read like the others
		await assert([
			{ code: 'overflow', expected: 'Ran out of stack, is something calling itself forever?' },
			{ code: 'kept', expected: 3 },
			{ code: 'message', expected: 'boom' },
			{ code: 'no place', expected: undefined },
		], async (code) => {
			if (code === 'overflow') return this.located(new RangeError('Maximum call stack size exceeded'), { line: 1, col: 1 }).summary;
			if (code === 'kept') return this.located(Object.assign(new Error('x'), { line: 3 }), { line: 9, col: 9 }).line;
			if (code === 'message') return this.located(new Error('boom'), { line: 1, col: 1 }).summary;
			return this.located(new Error('boom'), {}).line;
		});
		// the box an error ends up in when nothing catches it
		const boxes = [
			{ code: 'x := 1\ny := Count(true)', has: ['Expected a string or an array', 'ln 2, col 6  y := Count(true)'] },
			{ code: '#Strict()\nf() {\n\treturn zzz\n}\ng() {\n\treturn f()\n}\nx := g()', has: ["Undefined variable 'zzz'", 'ln 3, col 9  return zzz', 'in f() called at ln 6', 'in g() called at ln 8'] },
			{ code: 'class T {\n\t__init() {\n\t\tx := Count(true)\n\t}\n}\nt := new T()', has: ['in new T called at ln 6'] },
			{ code: 'f(n) { return f(n + 1) }\nf(0)', has: ['Recursion limit of 1000 calls', 'ln 1, col 15', 'in f() called at ln 1', '... 992 more'] },
			{ code: 'Exec("x := Count(true)")', has: ['ln 1, col 6 (inside Exec)', 'in Exec() called at ln 1'] },
			{ code: 'x := "abc', has: ['Unterminated string'] },
			{ code: 'boom', has: ['boom'] },
		];
		await assert(boxes.map(b => ({ code: b.code, expected: b.has })), async (code) => {
			const shown = [];
			const realLog = console.log;
			console.log = (...args) => shown.push(args.join(' '));
			try {
				let caught = new Error('boom');
				if (code !== 'boom') {
					try { await this.assert_code(code) } catch (err) { caught = err }
				}
				new ErrorHandler(code).handleError(caught);
			} finally {
				console.log = realLog;
			}
			const text = shown.join('\n').replace(/\u001b\[[0-9;]*m/g, '');
			return boxes.find(b => b.code === code).has.filter(h => text.includes(h));
		});
		// parser errors drawn the way a real console gets them, where the width is known. anything under 5 across used to crash the drawing
		await assert([
			{ code: '@', expected: [true, true, true, 'ln1:'] },
			{ code: 'print("a")\n@', expected: [true, true, true, 'ln2:'] },
			{ code: 'print("a")\nx@', expected: [true, true, true, 'ln2:'] },
			{ code: 'print("a")\nxx@', expected: [true, true, true, 'ln2:'] },
			{ code: 'print("a")\nxxx@', expected: [true, true, true, 'ln2:'] },
			{ code: 'print("a")\nxxxx@', expected: [true, true, true, 'ln2:'] },
			{ code: 'print("a")\nxxxxx@', expected: [true, true, true, 'ln2:'] },
			{ code: 'print("a")\nxxxxxx@', expected: [true, true, true, 'ln2:'] },
			{ code: 'print("a")\nxxxxxxx@', expected: [true, true, true, 'ln2:'] },
			{ code: 'print("a")\nxxxxxxxx@', expected: [true, true, true, 'ln2:'] },
			{ code: 'a\nb\nc\nd\ne\nf\ng\nh\ni\n@', expected: [true, true, true, 'ln10:'] }, // two digits of line number
		], async (code) => {
			const shown = [];
			const realLog = console.log;
			const realCols = process.stdout.columns;
			console.log = (...args) => shown.push(args.join(' '));
			process.stdout.columns = 120;
			try {
				let caught = null;
				try { await this.make_ast(code) } catch (err) { caught = err }
				new ErrorHandler(code).handleError(caught);
			} finally {
				console.log = realLog;
				process.stdout.columns = realCols;
			}
			const lines = shown.join('\n').replace(/\u001b\[[0-9;]*m/g, '').split('\n');
			const source = lines.find(l => /ln\d+: /.test(l) && l.includes('@'));
			const caret = lines.find(l => l.includes('^ char'));
			return [lines.join('\n').includes('Failed to parse statement.'), !lines.join('\n').includes('Invalid count'), source.indexOf('@') === caret.indexOf('^'), source.match(/ln\d+:/)[0]];
		});
		// and if drawing one goes wrong anyway, the error still gets shown
		await assert([
			{ code: 'past the end', expected: [true, true] },
			{ code: 'no line', expected: [true, true] },
		], async (code) => {
			const shown = [];
			const realLog = console.log;
			console.log = (...args) => shown.push(args.join(' '));
			try {
				new ErrorHandler('x := 1').handleError(code === 'past the end' ? { summary: 'boom', statement: 'L1: x := 1', loc: '  ^', position: 99999 } : { summary: 'boom', statement: 'L1: x := 1', loc: '  ^' });
			} finally {
				console.log = realLog;
			}
			const text = shown.join('\n');
			return [text.includes('boom'), text.includes('L1: x := 1')];
		});
		// requiring this file, what comes out of it, and running a string through it
		const loaded = require(__filename);
		await assert([
			{ code: 'run', expected: true },
			{ code: 'ASTExecutor', expected: true },
			{ code: 'CoyoteParser', expected: true },
		], async (code) => typeof loaded[code] === 'function' && loaded[code] === { run, ASTExecutor, CoyoteParser }[code]);
		const ran = async (code, options) => {
			const shown = [];
			const realLog = console.log;
			console.log = (...args) => shown.push(args.join(' '));
			try {
				await loaded.run(code, options);
			} finally {
				console.log = realLog;
			}
			return shown.join('\n');
		};
		await assert([
			{ code: 'print(1 + 2)', expected: '3' },
			{ code: 'f(n) { return n * 2 }\nprint(f(4))', expected: '8' },
			{ code: 'class C { __init(v) { val := v }\nget() { return val } }\nc := new C(3)\nprint(c.get())', expected: '3' },
			{ code: '#ArrayStartIndex(1)\nx := [5, 6]\nprint(x[1])', expected: '5' },
			{ code: 'x := <<END\nhi\nEND\nprint(x)', expected: 'hi' },
			{ code: 'print(A_platform === "' + process.platform + '")', expected: 'true' }, // the A_ vars are there
			{ code: 'print(IsNum(A_pid))', expected: '1' },
			{ code: 'x := 5', expected: '' }, // every run starts empty, nothing carries over
			{ code: 'print(IsNull(x))', expected: '1' },
			{ code: 'leak() { return 1 }\nprint(leak())', expected: '1' },
			{ code: 'print(leak() . "|")', expected: '|' },
			{ code: 'x := 1\nPrintScript()', expected: 'x := 1\nPrintScript()' }, // the source it was given
			{ code: 'x := 1\nprint(A_scriptName . "|")', expected: '|' }, // no script
			{ code: 'print(A_scriptDir)', expected: process.cwd() },
		], async (code) => ran(code));
		// OnError, only for what nothing in the script itself caught
		await assert([
			{ code: 'OnError("handler")\nhandler(e) { print("caught: " . e.message) }\nthrow "oops"', expected: 'caught: oops' },
			{ code: 'handler(e) { print("got:" . e.message) }\nOnError("handler")\nx := Count(true)', expected: 'got:INTERNAL_Count: Expected a string or an array' }, // any uncaught error, not just an explicit throw
			{ code: 'handler(e) { print("h:" . e.message) }\nOnError("handler")\ntry { throw "x" } catch (e) { print("local:" . e.message) }\nprint("end")', expected: 'local:x\nend' }, // a try in the script handles its own, OnError never fires
			{ code: 'handler(e) { print("outer:" . e.message) }\nOnError("handler")\nf() { g() }\ng() { throw "deep" }\nf()', expected: 'outer:deep' },
			{ code: 'OnError("nope")\nthrow "x"', expected: '' }, // registering a name that isn't a function doesn't itself throw
		], async (code) => ran(code));
		await assert([
			{ code: 'x := 1\nPrintAST()', expected: true },
			{ code: 'PrintAST()', expected: true },
		], async (code) => (await ran(code)).includes('FUNCTION_CALL'));
		await assert([
			{ code: 'PrintScript()', expected: 'custom' },
		], async (code) => ran(code, { source: 'custom' }));
		// what run() hands back
		await assert([
			{ code: 'return 6 * 7', expected: 42 },
			{ code: 'f() { return 3 }\nreturn f() + 1', expected: 4 },
			{ code: 'x := 5', expected: 5 },
			{ code: 'return', expected: undefined },
			{ code: 'r := 1\nif (r) {\n\treturn 7\n}\nreturn 8', expected: 7 }, // a return from further in is still the value
			{ code: 'return "a"\nreturn "b"', expected: 'a' },
			{ code: '', expected: undefined },
		], async (code) => loaded.run(code));
		await assert([
			{ code: '#Strict()\nx := missing', expected: "Undefined variable 'missing'" }, // errors come out to the caller
			{ code: 'x := "abc', expected: 'Unterminated string' },
			{ code: 'x := Count(true)', expected: 'INTERNAL_Count: Expected a string or an array' },
			{ code: 'x := 1', expected: 'no error' },
			{ code: 'throw "unhandled"', expected: 'unhandled' }, // and still does when nothing registered an OnError
			{ code: 'try { throw "x" } catch (e) { throw "wrapped:" . e.message }', expected: 'wrapped:x' },
		], async (code) => { try { await loaded.run(code) } catch (err) { return err.summary } return 'no error' });
		// no builtin is defined twice, the later one silently wins
		await assert([
			{ code: 'duplicates', expected: [] },
			{ code: 'builtins', expected: true },
		], async (code) => {
			const names = [...fs.readFileSync(__filename, 'utf8').matchAll(/^\s*async (INTERNAL_\w+)\(/gm)].map(m => m[1].toLowerCase());
			return code === 'builtins' ? names.length > 100 : names.filter((n, i) => names.indexOf(n) !== i);
		});
		// where the script is, the A_script vars used to point at this file
		const hello = path.join(__dirname, 'nested', 'hello.yote');
		await assert([
			{ code: 'print(A_scriptName)', expected: 'hello.yote' },
			{ code: 'print(A_scriptDir)', expected: path.join(__dirname, 'nested') },
			{ code: 'print(A_Process.scriptFullPath)', expected: hello },
			{ code: 'print(A_Process.scriptNameNoExt)', expected: 'hello' },
			{ code: 'print(A_scriptName != "' + path.basename(__filename) + '")', expected: 'true' },
		], async (code) => ran(code, { script: hello }));
		await assert([
			{ code: 'print(A_scriptName)\nprint(A_scriptDir)', expected: 'hello.yote\n' + path.join(process.cwd(), 'nested') }, // a relative one is made whole
		], async (code) => ran(code, { script: path.join('nested', 'hello.yote') }));
		// vars that work themselves out when they are read, so two reads can differ
		await assert([
			{ code: 'a := A_randomSeed\nb := A_randomSeed\nprint(a === b)', expected: 'false' },
			{ code: 'r := A_randomSeed = A_randomSeed\nprint(r)', expected: 'false' },
			{ code: 'a := A_currentTime\nSleep(15)\nb := A_currentTime\nprint(a === b)', expected: 'false' },
			{ code: 'a := A_uptime\nSleep(15)\nb := A_uptime\nprint(b > a)', expected: 'true' },
			{ code: 'print(A_randomSeed >= 0 && A_randomSeed < 1)', expected: 'true' },
			{ code: 'print(StrLen(A_currentTime))\nprint(IsNum(A_currentTime))', expected: '24\n0' },
			{ code: 'print(IsNum(A_uptime))\nprint(IsNum(A_freeMemory))', expected: '1\n1' },
			{ code: 'print(A_freeMemory > 0)', expected: 'true' },
			{ code: 'A_randomSeed := 5\nprint(A_randomSeed)\nprint(A_randomSeed)', expected: '5\n5' }, // write to one and it is a plain var
			{ code: 'a := A_currentTime\nb := a\nSleep(15)\nprint(a === b)', expected: 'true' }, // a copy is a copy
			{ code: 'x := `${A_randomSeed}` === `${A_randomSeed}`\nprint(x)', expected: 'false' },
			{ code: 'f() { return A_randomSeed }\nprint(f() = f())', expected: 'false' }, // and inside a function
		], async (code) => ran(code));
		//     Format(N) {       
		//     Print(S) {        
		//     Clear(/) {        
		//     Cursor(X,Y) {     
		//     Cell(C,X,Y) {     
		//     Ticks(/) {        
		//     Round(N) {        
		//     StrLen(S) {       
		//     range(N [,E]) {   
		//     isString(S) {     
		//     isNum(N) {        
		//     isFloat(N) {      
		//     isArray(N) {      
		//     isObject(N) {     
		//     isODD(N) {        
		//     isEVEN(N) {       
		//     invert(N) {       
		//     Abs(N) {          
		//     Exp(N) {          
		//     Log(N) {          
		//     Floor(N) {        
		//     Sin(N) {          
		//     Cos(N) {          
		//     Tan(N) {          
		//     Ceil(N) {         
		//     CoTan(N) {        
		//     Rand(N) {         
		//     Dice(N) {         
		//     Substr(S,B [,X]) {
		//     Asc(C) {          
		//     Chr(N) {          
		//     InStr(H,N) {      
		//     Strepl(H,N [,R]) {
		//     Upper(S) {        
		//     Lower(S) {        
		//     Repeat(S,N) {     
		//     Power(N,P) {      
		//     Sqrt(N) {         
		//     Rem(H,N) {        
		//     Repl(H,N,R) {     
		//     Grep(P,T) {       
		//     Trunc(N,S) {      
		//     StrSplit(H,N) {   
		//     FRead(F) {        
		//     StrMid(S) {       
		//     Occur(H,N [,T]) { 
		//     Justify(S,T,W) {  
		//     LastOcc(N,H [,T]) 
		//     StrClean(S [,M]) {
		//     FDelete(P) {      
		//     FWrite(D,P) {     
		//     FAppend(D,P) {    
		//     TreePrint(A) {    
		//     Pcof(P,W) {       
		//     Pct(P,N) {        
		//     PcChange(O,N) {   
		//     AddPc(N,P) {      
		//     SubPc(N,P) {      
		//     Input(S) {        
		//     Sleep(N) {        
		//     Count(A) {        
		//     Maxindex(A) {     
		//     Slice(A,s,e) {    
		//     Join(A,D) {       
		//     Flatten(A) {      
		//     Push(A,E) {       
		//     Purge(A) {        
		//     Vars(N) {         
		//     Scope(N) {        
		//     Funcs(N) {        
		//     Credits(N) {    
		// assertions run in a sandbox, nothing of theirs should be left behind
		if (Object.keys(this.functions).length || Object.keys(this.classes).length) {
			throw new Error(chalk.red(`Assertions leaked into the script's tables: ${[...Object.keys(this.functions), ...Object.keys(this.classes)].join(", ")}`));
		}
		if (debuglogtier > 1)		
			console.log("All internal function tests passed.");
	}
	// ---- scope ----
	// a scope is another executor sharing the function table, a call stack is these nested
	spawn() {
		return new ASTExecutor(this);
	}
	getvar(name) {
		const key = String(name).toLowerCase();
		for (let scope = this; scope; scope = scope.parent) {
			if (key in scope.vars) {
				return scope.vars[key];
			}
		}
		return null;
	}
	async get(name, member = null) {
		const found = this.getvar(name);
		if (!found) {
			if (this.settings.strict) {
				throw new Error(this.guess('variable', name));
			}
			return "";
		}
		const value = await found.solve();
		return member === null ? value : this.step(value, member);
	}
	// see CoyoteVar.live
	live(name, getter) {
		const key = String(name).toLowerCase();
		this.vars[key] = CoyoteVar.live(this, name, getter);
		return this.vars[key];
	}
	// writes stay in this scope, reads walk up to the parents
	set(name, value, member = null) {
		const key = String(name).toLowerCase();
		if (member === null) {
			this.vars[key] = CoyoteVar.from(this, name, value);
			return this.vars[key];
		}
		const path = this.path(member);
		if (path.length === 0) {
			return this.set(name, value);
		}
		let found = this.getvar(key);
		if (!found) {
			found = this.vars[key] = CoyoteVar.from(this, name, {});
		}
		let box = found.raw();
		if (box === null || typeof box !== 'object') {
			box = {};
		}
		let node = box;
		for (let i = 0; i < path.length - 1; i++) {
			const k = this.arrKey(node, path[i]);
			if (node[k] === null || typeof node[k] !== 'object') {
				node[k] = {};
			}
			node = node[k];
		}
		node[this.arrKey(node, path[path.length - 1])] = value;
		return found.store(box);
	}
	// members are a bare name (x.foo) or exprs (x["foo"]["bar"]), flatten to one path
	path(member) {
		if (member === null || member === undefined) {
			return [];
		}
		if (Array.isArray(member)) {
			return member.flat(Infinity).map(m => String(m).replace(/^"|"$/g, ''));
		}
		return [String(member).replace(/^"|"$/g, '')];
	}
	// numeric path segments into arrays shift by #ArrayStartIndex, object keys don't
	arrKey(node, key) {
		if (Array.isArray(node) && /^-?\d+$/.test(key)) {
			return String(Number(key) - this.settings.arrayStartIndex);
		}
		return key;
	}
	// walks x["a"]["b"] back to the root var and a flat path, for nested assignment
	async chainpath(node) {
		const path = [];
		let cur = node;
		while (cur && cur.type === ItemType.MEMBER_ACCESS) {
			path.unshift(...this.path(await this.execute_ast(cur.member)));
			cur = cur.value;
		}
		return { name: (cur && cur.name !== undefined) ? cur.name : null, path };
	}
	step(value, member) {
		let node = value;
		for (const key of this.path(member)) {
			if (node === null || typeof node !== 'object') {
				return "";
			}
			node = node[this.arrKey(node, key)];
		}
		return node === undefined ? "" : node;
	}
	dump() {
		const out = [];
		for (let scope = this; scope; scope = scope.parent) {
			out.unshift(scope.scope());
		}
		return out;
	}
	scope() {
		const out = {};
		for (const key of Object.keys(this.vars)) {
			out[key] = this.vars[key].pending() ? this.vars[key].tree() : this.vars[key].raw();
		}
		return out;
	}
	depth() {
		let n = 0;
		for (let scope = this.parent; scope; scope = scope.parent) {
			n++;
		}
		return n;
	}
	Core(value) {
		if (Array.isArray(value)) return value.length === 1 ? this.Core(value[0]) : value.map(v => this.Core(v));
		// numbers, booleans, null and objects already know what they are
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'object') return value;
		if (typeof value === 'string' && !isNaN(value)) return Number(value);

		const varrr = this.digest(value);
		
		try {
			return JSON.parse(varrr);
		} catch {
			return varrr;
		}
	}
	// Core() suits numbers and json strings, but digest() flattens real objects, so check for those first
	// Core() floors floats, so pair() only promotes when both sides are clean numbers
	numeric(value) {
		if (typeof value === 'number') {
			return value;
		}
		if (typeof value === 'string' && value.trim() !== "" && !isNaN(value)) {
			return Number(value);
		}
		return null;
	}
	pair(left, right) {
		const a = this.numeric(left);
		const b = this.numeric(right);
		return (a !== null && b !== null) ? [a, b] : [left, right];
	}
	unbox(value) {
		if (value !== null && typeof value === 'object') {
			return value;
		}
		return this.Core(value);
	}
	// false, null, undefined, NaN, "" and anything that reads as 0 ("0", "0.0") are false, the rest is true
	// that includes "false", [] and {}, use IsEmpty() for those
	truth(value) {
		if (value === null || value === undefined) {
			return false;
		}
		if (typeof value === 'object') {
			return true;
		}
		const n = this.numeric(value);
		if (n !== null) {
			return n !== 0 && !Number.isNaN(n);
		}
		return Boolean(value);
	}
	// null and undefined have no text
	text(value) {
		return value === null || value === undefined ? "" : String(value);
	}
	// null, undefined, or a plain variable that was never set
	unset(node, value) {
		return value === null || value === undefined || (node && node.type === ItemType.VARIABLE && !this.getvar(node.name));
	}
	digest(data) {
		if (data === null || data === undefined) {
			return 0;
		}

		if (typeof data === 'object') {
			if (Array.isArray(data)) {
				return data.map(v => this.digest(v));
			} else {
				return Object.keys(data)
					.map(key => this.digest(data[key]))
					.filter(value => value !== 0);
			}
		}

		if (typeof data === 'string') {
			const asFloat = parseFloat(data);
			if (!isNaN(asFloat)) {
				return this.digest(asFloat);
			}
			return data;
		}

		if (typeof data === 'number') {
			if (Number.isInteger(data)) {
				return data;
			}
			return Math.floor(data);
		}

		return 0;
	}

	removeUndefined(obj) {
		//this.print(`${this.getFunctionName()}`);
		if (Array.isArray(obj)) {
			return obj.filter(item => item !== undefined);
		} else if (typeof obj === 'object' && obj !== null) {
			const newObj = {};
			Object.keys(obj).forEach(key => {
				if (obj[key] !== undefined) {
					newObj[key] = obj[key];
				}
			});
			return newObj;
		} else {
			return obj;
		}
	}
    async ASS(ast) {
        if (ast.type >= 0) {
            const DICK = ItemType[ast.type];
            const CUNT = this.methods[DICK.toLowerCase()];
            if (CUNT && typeof this[CUNT] === 'function') {
                const depth = this.frames.length;
                const labels = this.labels.length;
                if (ast.label) {
                    this.labels.push(String(ast.label).toLowerCase());
                }
                if (ast.type === ItemType.SWITCH) {
                    this.labels.push(" switch");
                }
                try {
                    const frame = this.callframe(ast);
                    if (frame) {
                        this.frames.push(frame);
                        if (depth >= this.settings.maxDepth) {
                            throw new Error(`Recursion limit of ${this.settings.maxDepth} calls reached, is ${frame.name}() calling itself forever?`);
                        }
                    }
                    return await this[CUNT](ast);
                } catch (err) {
                    throw this.located(err, ast);
                } finally {
                    this.frames.length = depth;
                    this.labels.length = labels;
                }
            } else {
                this.print(chalk.red(`ERROR: Method "${DICK}" not found`));
            }
        } else {
            this.print(chalk.red('ERROR UNKNOWN DIRECTIVE'));
            this.print(ast);
        }
    }
	// runs a user function by name with the given args, ignoring what it returns. OnError uses this
	async callByName(name, args) {
		const fn = this.functions[name];
		if (!fn) {
			return;
		}
		const inner = this.spawn();
		if (fn.params) {
			for (const [index, param] of fn.params.entries()) {
				let val = args[index];
				if (val === undefined && param.default_value !== null) {
					val = await inner.execute_ast(param.default_value);
				}
				inner.set(param.name, val);
			}
		}
		await inner.execute_ast(fn.statements);
	}
	// a call that runs coyote code, for the stack in an error. builtins don't get one, except Exec
	callframe(ast) {
		const where = { line: ast.line, col: ast.col, node: ast };
		if (ast.type === ItemType.FUNCTION_CALL && ((this.functions[ast.name] && this.functions[ast.name].params) || String(ast.name).toLowerCase() === "exec")) {
			return { name: ast.name, ...where };
		}
		if (ast.type === ItemType.METHOD_CALL) {
			return { name: ast.func.member ? ast.func.member.value : "", ...where };
		}
		if (ast.type === ItemType.NEW_INSTANCE) {
			return { name: "new " + ast.classname, ...where };
		}
		return null;
	}
	// the call in ast has its arguments worked out, so from here it is part of the stack
	begun(ast) {
		const top = this.frames[this.frames.length - 1];
		if (top && top.node === ast) {
			top.begun = true;
		}
	}
	// the first node an error passes through says where it happened, and what was being called at the time
	located(err, ast) {
		if (err === null || typeof err !== 'object' || err.line !== undefined || ast.line === undefined) {
			return err;
		}
		err.line = ast.line;
		err.col = ast.col;
		// a call that never got past its arguments isn't part of the stack
		err.frames = this.frames.filter(frame => frame.begun);
		if (err instanceof RangeError && /call stack/i.test(err.message)) {
			err.summary = "Ran out of stack, is something calling itself forever?";
		}
		if (err.summary === undefined) {
			err.summary = err.message;
		}
		return err;
	}
	// names to pick from for a did you mean. functions are the builtins, yours and the natives, variables are whatever is in scope
	guess(kind, name) {
		let names = [];
		if (kind === 'function') {
			names = Object.keys(this.functions).concat(Object.keys(this.natives), Object.keys(this.methods).filter(key => key.startsWith('internal_')).map(key => this.methods[key].substring(9)));
		} else {
			for (let scope = this; scope; scope = scope.parent) {
				names.push(...Object.values(scope.vars).map(v => v.name));
			}
		}
		const near = nearest(name, names);
		return `Undefined ${kind} '${name}'` + (near ? `, did you mean '${near}'?` : '');
	}
	// #Name(args) directives, applied on the pre-scan. plain if-chain so more are easy to add
	async applyDirective(statement) {
		const key = String(statement.name).toLowerCase();
		const values = await this.execute_ast(statement.params);
		if (key === "arraystartindex") {
			// #ArrayStartIndex(0) is the default, (1) makes [N] 1-based
			this.settings.arrayStartIndex = this.numeric(values[0]) || 0;
		} else if (key === "strict") {
			// #Strict() turns it on, #Strict(0) off. undefined variables and functions throw instead of giving ""
			this.settings.strict = values.length ? this.truth(values[0]) : true;
		} else if (key === "setbatchlines") {
			this.settings.batchLines = this.numeric(values[0]) || null;
		} else if (key === "setbatchops") {
			this.settings.batchOps = this.numeric(values[0]) || null;
		}
	}
async run(ast, options = {}) {
		//this.print(`${this.getFunctionName()}`);
		this.print("running...");
		this.ast = ast;
		this.source = options.source || "";
		this.script = options.script || "";
		//console.log(ast.statements);



		ast.statements.forEach(statement => {
			if (statement.type === 4) {
				this.functions[statement.name] = statement;
			}
			if (statement.type === ItemType.CLASS_DEFINITION) {
				this.classes[statement.name.toLowerCase()] = statement;
			}
		});

		// directives first, before the A_ vars and the script
		for (const statement of ast.statements) {
			if (statement.type === ItemType.DIRECTIVE) {
				await this.applyDirective(statement);
			}
		}

		if (debuglogtier > 0)
			console.log("Functions found:", this.functions);
		
		this.set("A_consoleWidth", (process.stdout.columns || 80));
		this.set("A_consoleHeight", (process.stdout.rows || 24));
		this.set("A_workingdir", process.cwd());
		this.set("A_username", process.env.USER || process.env.USERNAME || "unknown");
		this.set("A_hostname", require("os").hostname());
		this.set("A_platform", process.platform);
		this.set("A_architecture", process.arch);
		this.set("A_nodeVersion", process.version);
		//this.set("A_envPath", process.env.PATH || "");
		this.set("A_homeDir", require("os").homedir());
		this.set("A_tempDir", require("os").tmpdir());
		this.live("A_uptime", () => require("os").uptime());
		this.set("A_totalMemory", require("os").totalmem());
		this.live("A_freeMemory", () => require("os").freemem());
		this.set("A_cpuCount", require("os").cpus().length);
		this.set("A_cpuModel", require("os").cpus()[0]?.model || "unknown");
		//this.set("A_networkInterfaces", JSON.stringify(require("os").networkInterfaces()));
		this.live("A_currentTime", () => new Date().toISOString());
		this.set("A_scriptName", require("path").basename(this.script));
		this.set("A_scriptDir", this.script ? require("path").dirname(this.script) : process.cwd());
		this.set("A_pid", process.pid);
		this.set("A_execPath", process.execPath);
		this.set("A_isTTY", process.stdout.isTTY);
		this.set("A_locale", Intl.DateTimeFormat().resolvedOptions().locale || "unknown");
		this.set("A_timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown");
		this.live("A_randomSeed", () => Math.random());
		this.set("A_isDebugMode", process.env.NODE_ENV === "development");
		this.set("A_defaultEncoding", process.env.LANG || process.env.LC_ALL || "unknown");
		this.set("A_isWindows", process.platform === "win32");
		this.set("A_isLinux", process.platform === "linux");
		this.set("A_isMacOS", process.platform === "darwin");

		// helpers for the vars below, everything is snapshotted once at start
		const os = require("os");
		const path = require("path");
		const fs = require("fs");
		const v8 = require("v8");
		const http = require("http");
		const crypto = require("crypto");
		const worker = require("worker_threads");
		const perf = require("perf_hooks").performance;
		const env = process.env;
		const safe = (fn, fallback = "") => { try { const r = fn(); return (r === undefined || r === null) ? fallback : r; } catch { return fallback; } };
		const bool = x => x ? 1 : 0;
		const pad = (n, len = 2) => String(n).padStart(len, "0");
		const win = process.platform === "win32";
		const mac = process.platform === "darwin";
		const home = os.homedir();
		const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
		const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
		const now = new Date();
		const nowY = now.getFullYear(), nowM = now.getMonth() + 1, nowD = now.getDate();
		const nowH = now.getHours(), nowMin = now.getMinutes(), nowS = now.getSeconds();
		const hour12 = nowH % 12 || 12;
		const isLeap = (nowY % 4 === 0 && nowY % 100 !== 0) || nowY % 400 === 0;
		const daysInMonth = new Date(nowY, nowM, 0).getDate();
		const daysInYear = isLeap ? 366 : 365;
		const yearDay = Math.round((Date.UTC(nowY, nowM - 1, nowD) - Date.UTC(nowY, 0, 0)) / 86400000);
		const midnightSecs = nowH * 3600 + nowMin * 60 + nowS;
		const stamp = "" + nowY + pad(nowM) + pad(nowD) + pad(nowH) + pad(nowMin) + pad(nowS);
		const stampUTC = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
		const isoInfo = (() => { const t = new Date(Date.UTC(nowY, nowM - 1, nowD)); const dow = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dow); const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1); return { year: t.getUTCFullYear(), week: Math.ceil(((t - jan1) / 86400000 + 1) / 7), weekday: dow }; })();
		const tzMinutes = -now.getTimezoneOffset();
		const tzText = (tzMinutes < 0 ? "-" : "+") + pad(Math.floor(Math.abs(tzMinutes) / 60)) + ":" + pad(Math.abs(tzMinutes) % 60);
		const tzAbbr = safe(() => new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(now).find(p => p.type === "timeZoneName").value, "");
		const tzStd = Math.max(new Date(nowY, 0, 1).getTimezoneOffset(), new Date(nowY, 6, 1).getTimezoneOffset());
		const intlInfo = Intl.DateTimeFormat().resolvedOptions();
		const localeParts = String(intlInfo.locale || "").split("-");
		const numParts = new Intl.NumberFormat().formatToParts(1234567.5);
		const hourCycle = safe(() => new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle, "");
		const mem = process.memoryUsage();
		const heap = v8.getHeapStatistics();
		const cpuUse = process.cpuUsage();
		const cpus = safe(() => os.cpus(), []);
		const loads = os.loadavg();
		const totalMem = os.totalmem(), freeMem = os.freemem();
		const nets = Object.values(safe(() => os.networkInterfaces(), {})).flat().filter(Boolean);
		const ext4 = nets.filter(n => !n.internal && String(n.family).endsWith("4"));
		const ext6 = nets.filter(n => !n.internal && String(n.family).endsWith("6"));
		const macs = nets.filter(n => !n.internal && n.mac && n.mac !== "00:00:00:00:00:00");
		const nodeVer = process.versions.node.split(".").map(Number);
		const instanceId = crypto.randomBytes(4).toString("hex");
		const xdg = (name, fallback) => env[name] || path.join(home, fallback);

		// ---- common scalars ----
		this.set("A_true", 1);
		this.set("A_false", 0);
		this.set("A_tab", "\t");
		this.set("A_newline", "\n");
		this.set("A_crlf", "\r\n");
		this.set("A_space", " ");
		this.set("A_quote", "\"");
		this.set("A_eol", os.EOL);
		this.set("A_args", process.argv.slice(2));
		this.set("A_Year", nowY);
		this.set("A_Month", nowM);
		this.set("A_Day", nowD);
		this.set("A_Hour", nowH);
		this.set("A_Min", nowMin);
		this.set("A_Sec", nowS);
		this.set("A_MSec", now.getMilliseconds());
		this.set("A_YYYY", String(nowY));
		this.set("A_MM", pad(nowM));
		this.set("A_DD", pad(nowD));
		this.set("A_HH", pad(nowH));
		this.set("A_MI", pad(nowMin));
		this.set("A_SS", pad(nowS));
		this.set("A_MMMM", monthNames[nowM - 1]);
		this.set("A_MMM", monthNames[nowM - 1].slice(0, 3));
		this.set("A_DDDD", dayNames[now.getDay()]);
		this.set("A_DDD", dayNames[now.getDay()].slice(0, 3));
		this.set("A_WDay", now.getDay() + 1);
		this.set("A_YDay", yearDay);
		this.set("A_YWeek", String(isoInfo.year) + pad(isoInfo.week));
		this.set("A_Now", stamp);
		this.set("A_NowUTC", stampUTC);
		this.set("A_Date", nowY + "-" + pad(nowM) + "-" + pad(nowD));
		this.set("A_Time", pad(nowH) + ":" + pad(nowMin) + ":" + pad(nowS));
		this.set("A_DateTime", nowY + "-" + pad(nowM) + "-" + pad(nowD) + " " + pad(nowH) + ":" + pad(nowMin) + ":" + pad(nowS));
		this.set("A_unixTime", Math.floor(now.getTime() / 1000));
		this.set("A_unixTimeMs", now.getTime());

		// ---- console and runtime context ----
		this.set("A_Console", {
			stdinIsTTY: bool(process.stdin.isTTY),
			stdoutIsTTY: bool(process.stdout.isTTY),
			stderrIsTTY: bool(process.stderr.isTTY),
			isPipedInput: bool(!process.stdin.isTTY),
			isPipedOutput: bool(!process.stdout.isTTY),
			area: (process.stdout.columns || 80) * (process.stdout.rows || 24),
			colorDepth: safe(() => process.stdout.getColorDepth(), 1),
			hasColor: bool(safe(() => process.stdout.hasColors(), false)),
			hasTrueColor: bool(safe(() => process.stdout.getColorDepth() >= 24, false)),
			noColor: bool(env.NO_COLOR !== undefined),
			forceColor: env.FORCE_COLOR || "",
			term: env.TERM || "",
			termProgram: env.TERM_PROGRAM || "",
			termProgramVersion: env.TERM_PROGRAM_VERSION || "",
			colorTerm: env.COLORTERM || "",
		});

		this.set("A_Context", {
			isHeadless: bool(!win && !mac && !env.DISPLAY && !env.WAYLAND_DISPLAY),
			isTmux: bool(env.TMUX),
			isScreen: bool(env.STY),
			isVSCodeTerminal: bool(env.TERM_PROGRAM === "vscode"),
			isSSH: bool(env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY),
			isCI: bool(env.CI),
			isGitHubActions: bool(env.GITHUB_ACTIONS),
			isGitLabCI: bool(env.GITLAB_CI),
			isJenkins: bool(env.JENKINS_URL),
			isTravisCI: bool(env.TRAVIS),
			isCircleCI: bool(env.CIRCLECI),
			isAzurePipelines: bool(env.TF_BUILD),
			isDocker: bool(safe(() => fs.existsSync("/.dockerenv"), false)),
			isWSL: bool(os.release().toLowerCase().includes("microsoft") || env.WSL_DISTRO_NAME),
			wslDistro: env.WSL_DISTRO_NAME || "",
			isTermux: bool(env.TERMUX_VERSION),
			isRoot: bool(safe(() => process.getuid() === 0, false)),
			isProduction: bool(env.NODE_ENV === "production"),
			isTestEnv: bool(env.NODE_ENV === "test"),
		});

		// ---- script and process ----
		this.set("A_Process", {
			scriptFullPath: this.script,
			scriptNameNoExt: path.basename(this.script, path.extname(this.script)),
			workingDirName: path.basename(process.cwd()),
			workingDirParent: path.dirname(process.cwd()),
			driveRoot: path.parse(process.cwd()).root,
			execName: path.basename(process.execPath),
			execDir: path.dirname(process.execPath),
			argCount: process.argv.slice(2).length,
			argv: process.argv,
			execArgv: process.execArgv,
			ppid: process.ppid,
			title: process.title,
			uptime: process.uptime(),
			startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
			startTimeUnix: Math.floor(Date.now() / 1000 - process.uptime()),
			userId: safe(() => process.getuid(), -1),
			groupId: safe(() => process.getgid(), -1),
			effectiveUserId: safe(() => process.geteuid(), -1),
			userShell: safe(() => os.userInfo().shell, ""),
			cpuUserTime: cpuUse.user,
			cpuSystemTime: cpuUse.system,
			hrtimeMs: Number(process.hrtime.bigint() / 1000000n),
			perfNow: perf.now(),
			timeOrigin: perf.timeOrigin,
			exitCode: process.exitCode || 0,
			isMainThread: bool(worker.isMainThread),
			threadId: worker.threadId,
			envCount: Object.keys(env).length,
			instanceId: instanceId,
			tempFile: path.join(os.tmpdir(), "coyote_" + instanceId + "_" + process.pid),
		});

		// ---- node and the engine ----
		this.set("A_Node", {
			major: nodeVer[0],
			minor: nodeVer[1],
			patch: nodeVer[2],
			release: process.release.name,
			lts: process.release.lts || "",
			isLTS: bool(process.release.lts),
			env: env.NODE_ENV || "",
			options: env.NODE_OPTIONS || "",
			path: env.NODE_PATH || "",
			moduleCount: Object.keys(require.cache).length,
			builtinModuleCount: require("module").builtinModules.length,
		});

		this.set("A_NodeVersions", { ...process.versions });

		this.set("A_NodeFeatures", {
			fetch: bool(typeof fetch === "function"),
			webCrypto: bool(typeof globalThis.crypto !== "undefined"),
			structuredClone: bool(typeof structuredClone === "function"),
			abortController: bool(typeof AbortController === "function"),
			sharedArrayBuffer: bool(typeof SharedArrayBuffer === "function"),
			webAssembly: bool(typeof WebAssembly === "object"),
			textEncoder: bool(typeof TextEncoder === "function"),
			url: bool(typeof URL === "function"),
			intl: bool(typeof Intl === "object"),
			bigInt: bool(typeof BigInt === "function"),
			atomics: bool(typeof Atomics === "object"),
			weakRef: bool(typeof WeakRef === "function"),
			queueMicrotask: bool(typeof queueMicrotask === "function"),
			eventTarget: bool(typeof EventTarget === "function"),
			blob: bool(typeof Blob === "function"),
			formData: bool(typeof FormData === "function"),
			webSocket: bool(typeof WebSocket === "function"),
			tls: bool(process.versions.openssl),
		});

		// ---- memory ----
		this.set("A_Memory", {
			totalMB: Math.round(totalMem / 1048576),
			totalGB: Math.round(totalMem / 1073741824 * 100) / 100,
			freeMB: Math.round(freeMem / 1048576),
			freeGB: Math.round(freeMem / 1073741824 * 100) / 100,
			used: totalMem - freeMem,
			usedMB: Math.round((totalMem - freeMem) / 1048576),
			percentUsed: Math.round((totalMem - freeMem) / totalMem * 10000) / 100,
			heapUsed: mem.heapUsed,
			heapTotal: mem.heapTotal,
			heapLimit: heap.heap_size_limit,
			heapAvailable: heap.total_available_size,
			rss: mem.rss,
			external: mem.external,
			arrayBuffers: mem.arrayBuffers || 0,
			malloced: heap.malloced_memory,
			nativeContexts: heap.number_of_native_contexts,
		});

		// ---- os and hardware ----
		this.set("A_OS", {
			type: os.type(),
			release: os.release(),
			version: safe(() => os.version(), ""),
			machine: safe(() => os.machine(), process.arch),
			endian: os.endianness(),
			devNull: os.devNull,
			availableParallelism: safe(() => os.availableParallelism(), cpus.length),
			cpuSpeed: cpus[0] ? cpus[0].speed : 0,
			cpuSpeeds: cpus.map(c => c.speed),
			loadAvg: loads,
			tickCount: Math.round(os.uptime() * 1000),
			uptimeMinutes: Math.floor(os.uptime() / 60),
			uptimeHours: Math.floor(os.uptime() / 3600),
			uptimeDays: Math.floor(os.uptime() / 86400),
			bootTime: new Date(Date.now() - os.uptime() * 1000).toISOString(),
			bootTimeUnix: Math.floor(Date.now() / 1000 - os.uptime()),
			is64Bit: bool(/64/.test(process.arch)),
			isX64: bool(process.arch === "x64"),
			isARM: bool(process.arch.startsWith("arm")),
			isAppleSilicon: bool(mac && process.arch === "arm64"),
			isLittleEndian: bool(os.endianness() === "LE"),
			isBigEndian: bool(os.endianness() === "BE"),
			isUnix: bool(!win),
			isAndroid: bool(process.platform === "android"),
			isFreeBSD: bool(process.platform === "freebsd"),
			isOpenBSD: bool(process.platform === "openbsd"),
			isSunOS: bool(process.platform === "sunos"),
			isAIX: bool(process.platform === "aix"),
			maxPath: win ? 260 : (mac ? 1024 : 4096),
			maxFileName: 255,
		});

		// ---- environment and folders ----
		this.set("A_Env", {
			pathSep: path.sep,
			pathDelimiter: path.delimiter,
			pathEntryCount: (env.PATH || "").split(path.delimiter).filter(Boolean).length,
			shell: env.SHELL || env.ComSpec || "",
			shellLevel: Number(env.SHLVL) || 0,
			display: env.DISPLAY || "",
			waylandDisplay: env.WAYLAND_DISPLAY || "",
			sessionType: env.XDG_SESSION_TYPE || "",
			desktopEnvironment: env.XDG_CURRENT_DESKTOP || "",
			userDomain: env.USERDOMAIN || "",
			computerName: env.COMPUTERNAME || os.hostname(),
			numberOfProcessors: Number(env.NUMBER_OF_PROCESSORS) || cpus.length,
			processorArchitecture: env.PROCESSOR_ARCHITECTURE || process.arch,
			os: env.OS || os.type(),
			lang: env.LANG || "",
			langCode: (env.LANG || "").split(".")[0],
			lcAll: env.LC_ALL || "",
			editor: env.EDITOR || env.VISUAL || "",
			pager: env.PAGER || "",
			browser: env.BROWSER || "",
			logName: env.LOGNAME || "",
			pwd: env.PWD || process.cwd(),
			oldPwd: env.OLDPWD || "",
			tz: env.TZ || "",
			httpProxy: env.HTTP_PROXY || env.http_proxy || "",
			httpsProxy: env.HTTPS_PROXY || env.https_proxy || "",
			noProxy: env.NO_PROXY || env.no_proxy || "",
			hasProxy: bool(env.HTTP_PROXY || env.http_proxy || env.HTTPS_PROXY || env.https_proxy),
		});

		this.set("A_Dirs", {
			desktop: path.join(home, "Desktop"),
			documents: path.join(home, "Documents"),
			downloads: path.join(home, "Downloads"),
			pictures: path.join(home, "Pictures"),
			music: path.join(home, "Music"),
			videos: path.join(home, mac ? "Movies" : "Videos"),
			config: win ? (env.APPDATA || path.join(home, "AppData", "Roaming")) : (mac ? path.join(home, "Library", "Application Support") : xdg("XDG_CONFIG_HOME", ".config")),
			cache: win ? (env.LOCALAPPDATA || path.join(home, "AppData", "Local")) : (mac ? path.join(home, "Library", "Caches") : xdg("XDG_CACHE_HOME", ".cache")),
			data: win ? (env.LOCALAPPDATA || path.join(home, "AppData", "Local")) : (mac ? path.join(home, "Library", "Application Support") : xdg("XDG_DATA_HOME", ".local/share")),
			state: win ? (env.LOCALAPPDATA || path.join(home, "AppData", "Local")) : (mac ? path.join(home, "Library", "Logs") : xdg("XDG_STATE_HOME", ".local/state")),
			userProfile: env.USERPROFILE || home,
			homeDrive: env.HOMEDRIVE || "",
			homePath: env.HOMEPATH || "",
			appData: env.APPDATA || "",
			localAppData: env.LOCALAPPDATA || "",
			programData: env.ProgramData || "",
			programFiles: env.ProgramFiles || "",
			programFilesX86: env["ProgramFiles(x86)"] || "",
			winDir: env.windir || "",
			systemRoot: env.SystemRoot || "",
			systemDrive: env.SystemDrive || "",
			comSpec: env.ComSpec || "",
			pathExt: env.PATHEXT || "",
		});

		// ---- date and time extras, locale, randomness ----
		this.set("A_TimeInfo", {
			dayOfWeek: now.getDay(),
			isoWeekday: isoInfo.weekday,
			isoWeek: isoInfo.week,
			isoWeekYear: isoInfo.year,
			dateUS: pad(nowM) + "/" + pad(nowD) + "/" + nowY,
			dateEU: pad(nowD) + "/" + pad(nowM) + "/" + nowY,
			timeShort: pad(nowH) + ":" + pad(nowMin),
			time12: hour12 + ":" + pad(nowMin) + ":" + pad(nowS) + " " + (nowH < 12 ? "AM" : "PM"),
			ampm: nowH < 12 ? "AM" : "PM",
			hour12: hour12,
			dateLocale: now.toLocaleDateString(),
			timeLocale: now.toLocaleTimeString(),
			dateTimeLocale: now.toLocaleString(),
			utcYear: now.getUTCFullYear(),
			utcMonth: now.getUTCMonth() + 1,
			utcDay: now.getUTCDate(),
			utcHour: now.getUTCHours(),
			utcMin: now.getUTCMinutes(),
			utcSec: now.getUTCSeconds(),
			utcOffset: tzText,
			utcOffsetMin: tzMinutes,
			utcOffsetHours: tzMinutes / 60,
			timezoneAbbr: tzAbbr,
			isDST: bool(now.getTimezoneOffset() < tzStd),
			quarter: Math.ceil(nowM / 3),
			isLeapYear: bool(isLeap),
			daysInMonth: daysInMonth,
			daysInYear: daysInYear,
			daysLeftInMonth: daysInMonth - nowD,
			daysLeftInYear: daysInYear - yearDay,
			century: Math.ceil(nowY / 100),
			decade: Math.floor(nowY / 10) * 10,
			isWeekend: bool(now.getDay() === 0 || now.getDay() === 6),
			isWeekday: bool(now.getDay() !== 0 && now.getDay() !== 6),
			epochDays: Math.floor(now.getTime() / 86400000),
			julianDay: now.getTime() / 86400000 + 2440587.5,
			secondsSinceMidnight: midnightSecs,
			dayProgress: Math.round(midnightSecs / 86400 * 10000) / 10000,
			yearProgress: Math.round(yearDay / daysInYear * 10000) / 10000,
		});

		this.set("A_LocaleInfo", {
			language: localeParts[0] || "",
			region: localeParts[1] || "",
			calendar: intlInfo.calendar || "",
			numberingSystem: intlInfo.numberingSystem || "",
			hourCycle: hourCycle,
			is24Hour: bool(hourCycle === "h23" || hourCycle === "h24"),
			decimalSeparator: (numParts.find(p => p.type === "decimal") || { value: "." }).value,
			thousandsSeparator: (numParts.find(p => p.type === "group") || { value: "," }).value,
		});

		this.set("A_Random", {
			float: Math.random(),
			int: Math.floor(Math.random() * 2147483648),
			byte: Math.floor(Math.random() * 256),
			bool: Math.round(Math.random()),
			uuid: crypto.randomUUID(),
			hex: crypto.randomBytes(16).toString("hex"),
		});

		// ---- the interpreter itself ----
		this.set("A_Interpreter", {
			name: "coyote",
			path: __filename,
			yoteExt: ".yote",
			arrayStartIndex: this.settings.arrayStartIndex,
			batchLines: this.settings.batchLines ?? "",
			batchOps: this.settings.batchOps ?? "",
			scopeDepth: this.depth(),
			functionCount: Object.keys(this.functions).length,
			functionNames: Object.keys(this.functions),
			classCount: Object.keys(this.classes).length,
			classNames: Object.keys(this.classes),
			nativeCount: Object.keys(this.natives).length,
			methodCount: Object.keys(this.methods).length,
			statementCount: ast.statements.length,
			directiveCount: ast.statements.filter(s => s.type === ItemType.DIRECTIVE).length,
			debugTier: debuglogtier,
			hasDebugLog: bool(debuglogtier > 0),
		});

		// ---- math, limits, physics ----
		this.set("A_Math", {
			e: Math.E,
			tau: Math.PI * 2,
			halfPi: Math.PI / 2,
			quarterPi: Math.PI / 4,
			invPi: 1 / Math.PI,
			sqrtPi: Math.sqrt(Math.PI),
			sqrt2Pi: Math.sqrt(2 * Math.PI),
			phi: (1 + Math.sqrt(5)) / 2,
			silverRatio: 1 + Math.SQRT2,
			plasticNumber: 1.324717957244746,
			sqrt2: Math.SQRT2,
			sqrt1_2: Math.SQRT1_2,
			sqrt3: Math.sqrt(3),
			sqrt5: Math.sqrt(5),
			ln2: Math.LN2,
			ln10: Math.LN10,
			log2e: Math.LOG2E,
			log10e: Math.LOG10E,
			eulerGamma: 0.5772156649015329,
			apery: 1.2020569031595942,
			catalan: 0.915965594177219,
			goldenAngle: Math.PI * (3 - Math.sqrt(5)),
			goldenAngleDeg: 180 * (3 - Math.sqrt(5)),
			degToRad: Math.PI / 180,
			radToDeg: 180 / Math.PI,
			degPerCircle: 360,
			gradiansPerCircle: 400,
			arcMinutesPerDeg: 60,
			arcSecondsPerDeg: 3600,
		});

		this.set("A_Limits", {
			maxSafeInt: Number.MAX_SAFE_INTEGER,
			minSafeInt: Number.MIN_SAFE_INTEGER,
			maxFloat: Number.MAX_VALUE,
			minFloat: Number.MIN_VALUE,
			epsilon: Number.EPSILON,
			infinity: Infinity,
			negInfinity: -Infinity,
			int8Max: 127,
			int8Min: -128,
			uint8Max: 255,
			int16Max: 32767,
			int16Min: -32768,
			uint16Max: 65535,
			int32Max: 2147483647,
			int32Min: -2147483648,
			uint32Max: 4294967295,
			int64Max: "9223372036854775807",
			int64Min: "-9223372036854775808",
			uint64Max: "18446744073709551615",
			float32Max: 3.4028234663852886e38,
			float32Min: 1.1754943508222875e-38,
			float32Epsilon: 1.1920928955078125e-7,
			maxArrayLength: 4294967295,
			maxStringLength: require("buffer").constants.MAX_STRING_LENGTH,
			maxBufferLength: require("buffer").constants.MAX_LENGTH,
		});

		this.set("A_Physics", {
			speedOfLight: 299792458,
			planck: 6.62607015e-34,
			planckReduced: 1.054571817e-34,
			boltzmann: 1.380649e-23,
			avogadro: 6.02214076e23,
			elementaryCharge: 1.602176634e-19,
			gasConstant: 8.31446261815324,
			faraday: 96485.33212331001,
			gravitationalConstant: 6.6743e-11,
			standardGravity: 9.80665,
			electronMass: 9.1093837015e-31,
			protonMass: 1.67262192369e-27,
			neutronMass: 1.67492749804e-27,
			atomicMassUnit: 1.66053906660e-27,
			vacuumPermittivity: 8.8541878128e-12,
			vacuumPermeability: 1.25663706212e-6,
			fineStructure: 7.2973525693e-3,
			rydberg: 10973731.568160,
			stefanBoltzmann: 5.670374419e-8,
			wienDisplacement: 2.897771955e-3,
			standardAtmosphere: 101325,
			absoluteZeroC: -273.15,
			speedOfSound: 343,
			earthRadiusM: 6371008.8,
			earthRadiusKm: 6371.0088,
			earthCircumferenceKm: 40075.017,
			earthMassKg: 5.972168e24,
			sunMassKg: 1.98847e30,
			astronomicalUnitM: 149597870700,
			lightYearM: 9460730472580800,
			parsecM: 3.0856775814913673e16,
			siderealDaySec: 86164.0905,
		});

		// ---- unit conversions (multiply by the factor, name reads from -> to) ----
		this.set("A_UnitConversions", {
			inchToCm: 2.54,
			inchToMm: 25.4,
			cmToInch: 1 / 2.54,
			footToInch: 12,
			footToM: 0.3048,
			mToFoot: 1 / 0.3048,
			yardToFoot: 3,
			yardToM: 0.9144,
			mileToFoot: 5280,
			mileToM: 1609.344,
			mileToKm: 1.609344,
			kmToMile: 1 / 1.609344,
			nauticalMileToM: 1852,
			pointsPerInch: 72,
			picasPerInch: 6,
			pixelsPerInch: 96,
			pointToMm: 25.4 / 72,
			lbToKg: 0.45359237,
			kgToLb: 1 / 0.45359237,
			ozToG: 28.349523125,
			lbToOz: 16,
			stoneToKg: 6.35029318,
			shortTonToKg: 907.18474,
			tonneToKg: 1000,
			grainToMg: 64.79891,
			caratToMg: 200,
			galToL: 3.785411784,
			impGalToL: 4.54609,
			quartToL: 0.946352946,
			pintToL: 0.473176473,
			cupToMl: 236.588236,
			flOzToMl: 29.5735295625,
			tbspToMl: 14.78676478125,
			tspToMl: 4.92892159375,
			cubicFootToL: 28.316846592,
			acreToM2: 4046.8564224,
			hectareToM2: 10000,
			sqFootToM2: 0.09290304,
			sqMileToKm2: 2.589988110336,
			mphToMs: 0.44704,
			mphToKmh: 1.609344,
			kmhToMs: 1 / 3.6,
			knotToMs: 1852 / 3600,
			barToPa: 100000,
			psiToPa: 6894.757293168,
			atmToPa: 101325,
			mmHgToPa: 133.322387415,
			calToJ: 4.184,
			kwhToJ: 3600000,
			btuToJ: 1055.05585262,
			hpToW: 745.69987158227,
			celsiusToKelvin: 273.15,
			fahrenheitOffset: 32,
			fahrenheitRatio: 1.8,
		});

		this.set("A_DataSizes", {
			KiB: 1024,
			MiB: 1048576,
			GiB: 1073741824,
			TiB: 1099511627776,
			PiB: 1125899906842624,
			KB: 1000,
			MB: 1000000,
			GB: 1000000000,
			TB: 1000000000000,
			PB: 1000000000000000,
			bitsPerByte: 8,
		});

		this.set("A_TimeUnits", {
			msPerSecond: 1000,
			msPerMinute: 60000,
			msPerHour: 3600000,
			msPerDay: 86400000,
			msPerWeek: 604800000,
			secondsPerMinute: 60,
			secondsPerHour: 3600,
			secondsPerDay: 86400,
			secondsPerWeek: 604800,
			secondsPerYear: 31557600,
			minutesPerHour: 60,
			minutesPerDay: 1440,
			hoursPerDay: 24,
			hoursPerWeek: 168,
			daysPerWeek: 7,
			daysPerYear: 365,
			daysPerLeapYear: 366,
			daysPerJulianYear: 365.25,
			daysPerGregorianYear: 365.2425,
			weeksPerYear: 52.1775,
			monthsPerYear: 12,
			microsPerSecond: 1000000,
			nanosPerSecond: 1000000000,
		});

		// ---- characters ----
		this.set("A_Chars", {
			cr: "\r",
			singleQuote: "'",
			backtick: "`",
			backslash: "\\",
			slash: "/",
			comma: ",",
			semicolon: ";",
			colon: ":",
			period: ".",
			pipe: "|",
			ampersand: "&",
			percent: "%",
			caret: "^",
			tilde: "~",
			dollar: "$",
			hash: "#",
			at: "@",
			exclamation: "!",
			question: "?",
			asterisk: "*",
			plus: "+",
			minus: "-",
			equals: "=",
			underscore: "_",
			lparen: "(",
			rparen: ")",
			lbracket: "[",
			rbracket: "]",
			lbrace: "{",
			rbrace: "}",
			lt: "<",
			gt: ">",
			nullChar: "\0",
			bell: "\x07",
			backspace: "\b",
			formFeed: "\f",
			verticalTab: "\v",
			escape: "\x1b",
			delete: "\x7f",
			nbsp: "\u00a0",
			zeroWidthSpace: "\u200b",
			zeroWidthJoiner: "\u200d",
			bom: "\ufeff",
			replacementChar: "\ufffd",
			lineSeparator: "\u2028",
			paragraphSeparator: "\u2029",
			softHyphen: "\u00ad",
			ellipsis: "\u2026",
			enDash: "\u2013",
			emDash: "\u2014",
			bullet: "\u2022",
			degreeSign: "\u00b0",
		});

		this.set("A_CharSets", {
			lowerCase: "abcdefghijklmnopqrstuvwxyz",
			upperCase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
			letters: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
			digits: "0123456789",
			alphanumeric: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
			hexDigits: "0123456789abcdef",
			hexDigitsUpper: "0123456789ABCDEF",
			octalDigits: "01234567",
			binaryDigits: "01",
			vowels: "aeiou",
			consonants: "bcdfghjklmnpqrstvwxyz",
			punctuation: "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
			whitespace: " \t\n\r\v\f",
			printableAscii: String.fromCharCode(...Array.from({ length: 95 }, (_, i) => i + 32)),
			base32: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
			base36: "0123456789abcdefghijklmnopqrstuvwxyz",
			base58: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
			base64: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
			base64Url: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",
		});

		this.set("A_CharCodes", {
			asciiMax: 127,
			latin1Max: 255,
			bmpMax: 65535,
			unicodeMax: 1114111,
			highSurrogateStart: 55296,
			highSurrogateEnd: 56319,
			lowSurrogateStart: 56320,
			lowSurrogateEnd: 57343,
			asciiPrintableMin: 32,
			asciiPrintableMax: 126,
			asciiDigitMin: 48,
			asciiUpperMin: 65,
			asciiLowerMin: 97,
			asciiCaseOffset: 32,
		});

		// ---- ansi escapes (colors are A_AnsiFg / A_AnsiBg further down) ----
		this.set("A_Ansi", {
			reset: "\x1b[0m",
			bold: "\x1b[1m",
			dim: "\x1b[2m",
			italic: "\x1b[3m",
			underline: "\x1b[4m",
			blink: "\x1b[5m",
			inverse: "\x1b[7m",
			hidden: "\x1b[8m",
			strike: "\x1b[9m",
			noBold: "\x1b[22m",
			noItalic: "\x1b[23m",
			noUnderline: "\x1b[24m",
			clearScreen: "\x1b[2J",
			clearLine: "\x1b[2K",
			clearToEnd: "\x1b[0J",
			eraseScrollback: "\x1b[3J",
			cursorHome: "\x1b[H",
			cursorHide: "\x1b[?25l",
			cursorShow: "\x1b[?25h",
			cursorSave: "\x1b[s",
			cursorRestore: "\x1b[u",
			cursorUp: "\x1b[1A",
			cursorDown: "\x1b[1B",
			cursorRight: "\x1b[1C",
			cursorLeft: "\x1b[1D",
			altScreenOn: "\x1b[?1049h",
			altScreenOff: "\x1b[?1049l",
			resetTerminal: "\x1bc",
		});

		// ---- regex patterns (as strings, for validation) ----
		this.set("A_Regex", {
			// numbers
			integer: "^[+-]?\\d+$",
			unsignedInteger: "^\\d+$",
			positiveInteger: "^[1-9]\\d*$",
			negativeInteger: "^-[1-9]\\d*$",
			float: "^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$",
			decimal: "^[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)$",
			scientific: "^[+-]?(?:\\d+\\.?\\d*|\\.\\d+)[eE][+-]?\\d+$",
			percentage: "^[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)%$",
			thousands: "^[+-]?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?$",
			europeanNumber: "^[+-]?\\d{1,3}(?:\\.\\d{3})*(?:,\\d+)?$",
			currencyUSD: "^\\$?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{2})?$",
			fraction: "^[+-]?\\d+/[1-9]\\d*$",
			binary: "^(?:0b)?[01]+$",
			octal: "^(?:0o)?[0-7]+$",
			hex: "^(?:0x)?[0-9a-fA-F]+$",
			hexBytes: "^(?:[0-9a-fA-F]{2})+$",

			// text and identifiers
			alpha: "^[A-Za-z]+$",
			alnum: "^[A-Za-z0-9]+$",
			lowercase: "^[a-z]+$",
			uppercase: "^[A-Z]+$",
			titleCase: "^[A-Z][a-z]*(?: [A-Z][a-z]*)*$",
			identifier: "^[A-Za-z_][A-Za-z0-9_]*$",
			jsIdentifier: "^[A-Za-z_$][A-Za-z0-9_$]*$",
			camelCase: "^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$",
			pascalCase: "^[A-Z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$",
			snakeCase: "^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$",
			screamingSnakeCase: "^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$",
			kebabCase: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
			slug: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
			username: "^[A-Za-z][A-Za-z0-9_.-]{2,31}$",
			personName: "^[A-Za-z]+(?:[ '-][A-Za-z]+)*$",
			mediumPassword: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$",
			strongPassword: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s]).{8,}$",
			pin4: "^\\d{4}$",
			pin6: "^\\d{6}$",
			boolean: "^(?:true|false)$",
			jsonString: "^\"(?:[^\"\\\\\\x00-\\x1F]|\\\\[\"\\\\/bfnrt]|\\\\u[0-9a-fA-F]{4})*\"$",

			// network
			mac: "^[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\\1){4}[0-9A-Fa-f]{2}$",
			macNoSeparator: "^[0-9A-Fa-f]{12}$",
			emailLoose: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
			httpMethod: "^(?:GET|HEAD|POST|PUT|DELETE|CONNECT|OPTIONS|TRACE|PATCH)$",
			httpStatusCode: "^[1-5]\\d\\d$",
			mimeType: "^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$",
			queryString: "^\\??[^=&#\\s]+(?:=[^&#\\s]*)?(?:&[^=&#\\s]+(?:=[^&#\\s]*)?)*$",
			twitterHandle: "^@[A-Za-z0-9_]{1,15}$",
			youtubeVideoId: "^[A-Za-z0-9_-]{11}$",

			// phone and postal
			e164: "^\\+[1-9]\\d{1,14}$",
			usPhone: "^(?:\\+?1[ .-]?)?(?:\\([2-9]\\d{2}\\)|[2-9]\\d{2})[ .-]?[2-9]\\d{2}[ .-]?\\d{4}$",
			usZip: "^\\d{5}(?:-\\d{4})?$",
			ukPostcode: "^[A-Za-z]{1,2}\\d[A-Za-z\\d]? ?\\d[A-Za-z]{2}$",
			usState: "^(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$",
			countryCode2: "^[A-Z]{2}$",
			countryCode3: "^[A-Z]{3}$",

			// dates and times
			year: "^\\d{4}$",
			month: "^(?:0[1-9]|1[0-2])$",
			dayOfMonth: "^(?:0[1-9]|[12]\\d|3[01])$",
			hour24: "^(?:[01]\\d|2[0-3])$",
			minute: "^[0-5]\\d$",
			time24: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$",
			time12: "^(?:0?[1-9]|1[0-2]):[0-5]\\d(?::[0-5]\\d)?\\s?[AaPp][Mm]$",
			isoWeek: "^\\d{4}-W(?:0[1-9]|[1-4]\\d|5[0-3])(?:-[1-7])?$",
			utcOffset: "^[+-](?:0\\d|1[0-4]):[0-5]\\d$",
			unixTimestamp: "^\\d{10}$",
			unixTimestampMs: "^\\d{13}$",

			// ids, hashes and versions
			uuid: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
			uuidNoDashes: "^[0-9a-fA-F]{32}$",
			ulid: "^[0-7][0-9A-HJKMNP-TV-Z]{25}$",
			nanoid: "^[A-Za-z0-9_-]{21}$",
			objectId: "^[0-9a-fA-F]{24}$",
			md5: "^[a-fA-F0-9]{32}$",
			sha1: "^[a-fA-F0-9]{40}$",
			sha256: "^[a-fA-F0-9]{64}$",
			sha512: "^[a-fA-F0-9]{128}$",
			gitCommit: "^[0-9a-f]{7,40}$",
			versionDotted: "^\\d+(?:\\.\\d+){1,3}$",
			hexColor: "^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
			hexColorAlpha: "^#(?:[0-9a-fA-F]{4}|[0-9a-fA-F]{8})$",

			// money, banking, commerce
			cardNumber: "^\\d{13,19}$",
			visa: "^4\\d{12}(?:\\d{3}){0,2}$",
			mastercard: "^(?:5[1-5]\\d{2}|2(?:2[2-9]\\d|[3-6]\\d\\d|7[01]\\d|720))\\d{12}$",
			amex: "^3[47]\\d{13}$",
			discover: "^6(?:011|5\\d{2}|4[4-9]\\d)\\d{12,15}$",
			cvv: "^\\d{3,4}$",
			cardExpiry: "^(?:0[1-9]|1[0-2])/(?:\\d{2}|\\d{4})$",
			iban: "^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$",
			usSSN: "^(?!000|666|9\\d\\d)\\d{3}-(?!00)\\d{2}-(?!0000)\\d{4}$",
			isbn13: "^97[89]\\d{10}$",
			ean13: "^\\d{13}$",
			bitcoinAddress: "^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,71})$",
			ethereumAddress: "^0x[a-fA-F0-9]{40}$",

			// encodings and tokens
			base64: "^(?=.)(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
			base64Url: "^(?=.)(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$",
			jwt: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*$",

			// files, paths and dev
			unixPermissions: "^[0-7]{3,4}$",
			envVarAssignment: "^[A-Za-z_][A-Za-z0-9_]*=.*$",
			npmPackage: "^(?:@[a-z0-9-*~][a-z0-9-*._~]*/)?[a-z0-9-~][a-z0-9-._~]*$",
			dockerImage: "^(?:[a-z0-9.-]+(?::\\d+)?/)?[a-z0-9._-]+(?:/[a-z0-9._-]+)*(?::[A-Za-z0-9_][A-Za-z0-9._-]{0,127})?(?:@sha256:[a-f0-9]{64})?$",

			// unanchored fragments
			whitespace: "\\s+",
			word: "\\w+",
			ansi: "\\x1b\\[[0-9;?]*[A-Za-z]",
			lineBreak: "\\r\\n|\\r|\\n"
		});

		// ---- network and ports ----
		this.set("A_Network", {
			loopback: "127.0.0.1",
			loopbackV6: "::1",
			localhost: "localhost",
			anyAddress: "0.0.0.0",
			broadcastAddress: "255.255.255.255",
			ipAddress: ext4[0] ? ext4[0].address : "",
			ipAddress2: ext4[1] ? ext4[1].address : "",
			ipAddress3: ext4[2] ? ext4[2].address : "",
			ipAddress4: ext4[3] ? ext4[3].address : "",
			ipv6Address: ext6[0] ? ext6[0].address : "",
			subnetMask: ext4[0] ? ext4[0].netmask : "",
			macAddress: macs[0] ? macs[0].mac : "",
			hasNetwork: bool(ext4.length || ext6.length),
			interfaceCount: nets.length,
			interfaceNames: Object.keys(safe(() => os.networkInterfaces(), {})),
		});

		this.set("A_Ports", {
			ftpData: 20,
			ftp: 21,
			ssh: 22,
			telnet: 23,
			smtp: 25,
			dns: 53,
			dhcpServer: 67,
			dhcpClient: 68,
			tftp: 69,
			http: 80,
			pop3: 110,
			ntp: 123,
			imap: 143,
			snmp: 161,
			ldap: 389,
			https: 443,
			smb: 445,
			smtps: 465,
			syslog: 514,
			submission: 587,
			ldaps: 636,
			imaps: 993,
			pop3s: 995,
			mssql: 1433,
			oracle: 1521,
			mqtt: 1883,
			nfs: 2049,
			mysql: 3306,
			rdp: 3389,
			postgres: 5432,
			vnc: 5900,
			redis: 6379,
			httpAlt: 8080,
			httpsAlt: 8443,
			elasticsearch: 9200,
			memcached: 11211,
			mongo: 27017,
			max: 65535,
			privilegedMax: 1023,
			ephemeralMin: 49152,
		});

		// ---- lookup tables (arrays and maps, read them like A_MimeTypes["png"]) ----
		this.set("A_MonthNames", monthNames);
		this.set("A_MonthNamesShort", monthNames.map(m => m.slice(0, 3)));
		this.set("A_DayNames", dayNames);
		this.set("A_DayNamesShort", dayNames.map(d => d.slice(0, 3)));
		this.set("A_DaysInMonthTable", [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
		this.set("A_Primes", [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229]);
		this.set("A_Powers2", Array.from({ length: 32 }, (_, i) => Math.pow(2, i)));
		this.set("A_Fibonacci", (() => { const f = [0, 1]; while (f.length < 40) { f.push(f[f.length - 1] + f[f.length - 2]); } return f; })());
		this.set("A_Factorials", (() => { const f = [1]; for (let i = 1; i <= 18; i++) { f.push(f[i - 1] * i); } return f; })());
		this.set("A_RomanNumerals", { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 });
		this.set("A_SIPrefixes", { yotta: 1e24, zetta: 1e21, exa: 1e18, peta: 1e15, tera: 1e12, giga: 1e9, mega: 1e6, kilo: 1e3, hecto: 1e2, deca: 1e1, deci: 1e-1, centi: 1e-2, milli: 1e-3, micro: 1e-6, nano: 1e-9, pico: 1e-12, femto: 1e-15, atto: 1e-18, zepto: 1e-21, yocto: 1e-24 });
		this.set("A_PaperSizesMm", { a3: [297, 420], a4: [210, 297], a5: [148, 210], a6: [105, 148], letter: [215.9, 279.4], legal: [215.9, 355.6], tabloid: [279.4, 431.8] });
		this.set("A_HttpStatus", { ...http.STATUS_CODES });
		this.set("A_HttpMethods", [...http.METHODS]);
		this.set("A_MimeTypes", { txt: "text/plain", html: "text/html", htm: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript", json: "application/json", xml: "application/xml", csv: "text/csv", md: "text/markdown", yaml: "application/yaml", yml: "application/yaml", pdf: "application/pdf", zip: "application/zip", gz: "application/gzip", tar: "application/x-tar", "7z": "application/x-7z-compressed", rar: "application/vnd.rar", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon", bmp: "image/bmp", tiff: "image/tiff", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", wasm: "application/wasm", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
		this.set("A_ExtImages", ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tif", "tiff", "heic", "avif"]);
		this.set("A_ExtAudio", ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus", "aiff"]);
		this.set("A_ExtVideo", ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpg", "mpeg"]);
		this.set("A_ExtArchives", ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "zst"]);
		this.set("A_ExtDocuments", ["txt", "md", "pdf", "doc", "docx", "odt", "rtf", "xls", "xlsx", "ods", "ppt", "pptx", "odp", "csv"]);
		this.set("A_ExtCode", ["js", "mjs", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "c", "h", "cpp", "hpp", "cs", "java", "kt", "swift", "php", "lua", "sh", "ps1", "bat", "html", "css", "json", "yaml", "yml", "toml", "xml", "sql", "yote"]);
		this.set("A_Signals", { ...os.constants.signals });
		this.set("A_Errno", { ...os.constants.errno });
		this.set("A_Priority", { ...os.constants.priority });
		this.set("A_FsConstants", { ...fs.constants });
		this.set("A_ExitCodes", { success: 0, generalError: 1, misuse: 2, cannotExecute: 126, notFound: 127, invalidExit: 128, sigint: 130, sigkill: 137, sigterm: 143 });

		// ---- colors, one map so it doesn't flood the scope ----
		this.set("A_Colors", { black: "#000000", silver: "#c0c0c0", gray: "#808080", white: "#ffffff", maroon: "#800000", red: "#ff0000", purple: "#800080", fuchsia: "#ff00ff", green: "#008000", lime: "#00ff00", olive: "#808000", yellow: "#ffff00", navy: "#000080", blue: "#0000ff", teal: "#008080", aqua: "#00ffff", orange: "#ffa500" });
		this.set("A_AnsiFg", { black: "\x1b[30m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m", brightBlack: "\x1b[90m", brightRed: "\x1b[91m", brightGreen: "\x1b[92m", brightYellow: "\x1b[93m", brightBlue: "\x1b[94m", brightMagenta: "\x1b[95m", brightCyan: "\x1b[96m", brightWhite: "\x1b[97m", default: "\x1b[39m" });
		this.set("A_AnsiBg", { black: "\x1b[40m", red: "\x1b[41m", green: "\x1b[42m", yellow: "\x1b[43m", blue: "\x1b[44m", magenta: "\x1b[45m", cyan: "\x1b[46m", white: "\x1b[47m", brightBlack: "\x1b[100m", brightRed: "\x1b[101m", brightGreen: "\x1b[102m", brightYellow: "\x1b[103m", brightBlue: "\x1b[104m", brightMagenta: "\x1b[105m", brightCyan: "\x1b[106m", brightWhite: "\x1b[107m", default: "\x1b[49m" });

		this.returning = false;
		this.breaking = this.continuing = false;
		try {
			return await this.execute_ast(ast.statements);
		} catch (err) {
			// an error nothing in the script caught, OnError() gets first refusal
			if (this.onerrorhandler) {
				await this.callByName(this.onerrorhandler, [this.wrapError(err)]);
				return [];
			}
			throw err;
		}
	}


	async execute_ast(ast) {
		// skip early exit if ast.type is 4
		if (ast.type === 4) return;

		if (Array.isArray(ast)) {
			const results = [];
			for (const element of ast) {
				results.push(await this.ASS(element));
				// return kills the rest of the block and carries its value up. break and continue do the same up to the nearest loop
				if (this.returning || this.breaking || this.continuing || this.falling) {
					break;
				}
			}
			return results;
		}

		return await this.ASS(ast);
	}
	async statements(ast) {
		//this.print(`${this.getFunctionName()}`);
		//this.print(ast)
		return await this.execute_ast(ast);
	}
	async statement(ast) {
		//this.print(`${this.getFunctionName()}`);
		return await this.execute_ast(ast);
	}
	async IF(ast) { // 1
		//this.print(`${this.getFunctionName()}`);
		const conditionResult = await this.execute_ast(ast.condition);
		if (this.truth(conditionResult)) {
			return await this.execute_ast(ast.if_true);
		} else {
			return await this.execute_ast(ast.if_false);
		}
	}
	async STATEMENT_MAX(ast) { //5
		//this.print(`${this.getFunctionName()}`);
		return ast
	}
	async TERNARY(ast) { // 7
		//this.print(`${this.getFunctionName()}`);
		return this.truth(await this.execute_ast(ast.condition))
			? await this.execute_ast(ast.if_true) 
			: await this.execute_ast(ast.if_false);
	}
	async OR(ast) { // 8
		//this.print(`${this.getFunctionName()}`);
		const left = await this.execute_ast(ast.left);
		return this.truth(left) ? left : await this.execute_ast(ast.right);
	}
	async AND(ast) { // 9
		//this.print(`${this.getFunctionName()}`);
		const left = await this.execute_ast(ast.left);
		return this.truth(left) ? await this.execute_ast(ast.right) : left;
	}
	async EQUALS(ast) { // 10
		//this.print(`${this.getFunctionName()}`);
		return await this.equality(ast);
	}
	async NOT_EQUALS(ast) { // 11
		//this.print(`${this.getFunctionName()}`);
		return !(await this.equality(ast));
	}
	async NOT(ast) { // 42
		// same truthiness as if, so !x is always the opposite of if (x)
		return !this.truth(await this.execute_ast(ast.expression));
	}
	// = ignores case, == doesn't, === compares kind and value with no coercing ("1" !== 1, null !== undefined, NaN !== NaN)
	// loose: numbers and numeric strings compare as numbers, null and undefined only match each other and "",
	// a boolean is 1/0 next to a number and true/false next to text, arrays and objects only match themselves
	strictkind(value) {
		return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
	}
	async equality(ast) {
		let l = await this.execute_ast(ast.left);
		let r = await this.execute_ast(ast.right);
		if (ast.mode === "strict") {
			return this.strictkind(l) === this.strictkind(r) && l === r;
		}
		const none = v => v === null || v === undefined;
		if (none(l) || none(r)) {
			return (none(l) || l === "") && (none(r) || r === "");
		}
		if (typeof l === 'boolean') {
			l = this.numeric(r) !== null ? Number(l) : String(l);
		}
		if (typeof r === 'boolean') {
			r = this.numeric(l) !== null ? Number(r) : String(r);
		}
		let [left, right] = this.pair(l, r);
		if (!ast.mode && typeof left === 'string' && typeof right === 'string') {
			left = left.toLowerCase();
			right = right.toLowerCase();
		}
		return left === right;
	}
	async GREATER_THAN(ast) { // 12
		//this.print(`${this.getFunctionName()}`);
		const [left, right] = this.pair(await this.execute_ast(ast.left), await this.execute_ast(ast.right));
		return left > right;
	}
	async GREATER_EQUAL(ast) { // 13
		//this.print(`${this.getFunctionName()}`);
		const [left, right] = this.pair(await this.execute_ast(ast.left), await this.execute_ast(ast.right));
		return left >= right;
	}
	async LESS_THAN(ast) { // 14
		//this.print(`${this.getFunctionName()}`);
		const [left, right] = this.pair(await this.execute_ast(ast.left), await this.execute_ast(ast.right));
		return left < right;
	}
	async LESS_EQUAL(ast) { // 15
		//this.print(`${this.getFunctionName()}`);
		const [left, right] = this.pair(await this.execute_ast(ast.left), await this.execute_ast(ast.right));
		return left <= right;
	}
	async BITWISE_AND(ast) { // 17
		//this.print(`${this.getFunctionName()}`);
		return (await this.execute_ast(ast.left)) & (await this.execute_ast(ast.right));
	}
	async BITWISE_OR(ast) { // 18
		//this.print(`${this.getFunctionName()}`);
		return (await this.execute_ast(ast.left)) | (await this.execute_ast(ast.right));
	}
	async BITWISE_XOR(ast) { // 19
		//this.print(`${this.getFunctionName()}`);
		return (await this.execute_ast(ast.left)) ^ (await this.execute_ast(ast.right));
	}
	async BIT_SHIFT(ast) { // 20
		//this.print(`${this.getFunctionName()}`);
		return ast.direction === "LEFT"
			? (await this.execute_ast(ast.left)) << (await this.execute_ast(ast.right))
			: (await this.execute_ast(ast.left)) >> (await this.execute_ast(ast.right));
	}
	async function_call(ast) { // 6
		//this.print(`${this.getFunctionName()}`);
		let retval = "";
		let name = "INTERNAL_" + ast.name;
		let correct_case_key = this.methods[name.toLowerCase()];
		if (correct_case_key) {
			this.print(correct_case_key)
			this.begun(ast);
			retval = await this[correct_case_key](ast.params);
		} else {
			//console.log(this.functions[ast.name].params)
			let params = await this.execute_ast(ast.params)
			this.begun(ast);
			// the body gets its own scope, garbage when it returns
			const inner = this.spawn();
			if (this.functions[ast.name] && this.functions[ast.name].params) {
			for (const [index, param] of this.functions[ast.name].params.entries()) {
				let paramName = param.name;
				let paramValue = params[index];

				if (paramValue === undefined && param.default_value !== null) {
					paramValue = await inner.execute_ast(param.default_value);
				}
				
				inner.set(paramName, paramValue);
			}
				const body = await inner.execute_ast(this.functions[ast.name].statements)
				// explicit return wins, otherwise the first statement that produced something
				retval = inner.returning ? this.Core(inner.returned) : this.Core(this.removeUndefined(body)[0])
			} else {
				retval = await this.native_call(ast)
			}
		}
		return retval;
	}	
	async function_definition(ast) { // 4
	}
	// already handled on the pre-scan
	async directive(ast) { // 38
	}
	async class_definition(ast) { // 39
	}
	async new_instance(ast) { // 40
		const classDef = this.classes[String(ast.classname).toLowerCase()];
		if (!classDef) {
			throw new Error(`INTERNAL_new: no class named ${ast.classname}`);
		}
		let params = await this.execute_ast(ast.params);
		this.begun(ast);
		// an instance is a persistent scope plus its class, so method_call() knows where to look
		const instance = this.spawn();
		const init = classDef.methods["__init"];
		if (init) {
			if (init.params) {
				for (const [index, param] of init.params.entries()) {
					let paramValue = params[index];
					if (paramValue === undefined && param.default_value !== null) {
						paramValue = await instance.execute_ast(param.default_value);
					}
					instance.set(param.name, paramValue);
				}
			}
			await instance.execute_ast(init.statements);
			instance.returning = false;
			instance.breaking = instance.continuing = false;
			instance.returned = undefined;
		}
		return { __class__: classDef.name, __instance__: instance };
	}
	// runs a loop body once, true if the loop should end. continue ends the pass, break ends the loop, both are spent here.
	// return takes the loop with it. one that names another loop goes on through to it
	async loopbody(ast) {
		await this.execute_ast(ast.statements);
		if (this.breaking || this.continuing) {
			if (this.jumplabel && this.jumplabel !== String(ast.label || "").toLowerCase()) {
				return true;
			}
			const broke = this.breaking;
			this.breaking = this.continuing = false;
			this.jumplabel = null;
			return broke;
		}
		return this.returning;
	}
	// for (x in expr), the keys. array indexes and string positions count from #ArrayStartIndex
	async for_in(ast) { // 31
		const target = await this.execute_ast(ast.iterable);
		const first = this.settings.arrayStartIndex;
		let keys = [];
		let read = (key) => target[key];
		if (typeof target === "string" || Array.isArray(target)) {
			keys = Array.from(target, (_, i) => String(i + first));
			read = (key) => target[key - first];
		} else if (target && typeof target === "object" && target.__instance__) {
			keys = Object.keys(target.__instance__.vars);
			read = (key) => target.__instance__.vars[key].raw();
		} else if (target && typeof target === "object") {
			// own keys of a coyote object, a js one gets a real for in and what it inherits
			const proto = Object.getPrototypeOf(target);
			if (proto === Object.prototype || proto === null) {
				keys = Object.keys(target);
			} else {
				for (const key in target) {
					keys.push(key);
				}
			}
		}
		let i = 1;
		for (const key of keys) {
			this.set(ast.variable, key);
			this.set('A_Index', i++);
			this.set('A_Key', key);
			this.set('A_Val', read(key));
			if (await this.loopbody(ast)) {
				break;
			}
		}
	}
	// for (x of expr), the values of anything js can loop over. an array is live, same as node,
	// so pushing to it as you go adds to the loop. loop (arr) is a snapshot
	async for_of(ast) { // 44
		const target = await this.execute_ast(ast.iterable);
		let i = 1;
		const pass = async (value) => {
			this.set(ast.variable, value);
			this.set('A_Index', i);
			this.set('A_Key', i++ - 1 + this.settings.arrayStartIndex);
			this.set('A_Val', value);
			return await this.loopbody(ast);
		};
		if (ast.wait) {
			for await (const value of target) {
				if (await pass(value)) {
					break;
				}
			}
		} else {
			for (const value of target) {
				if (await pass(value)) {
					break;
				}
			}
		}
	}
	// 1..10 and 1..10..2, both ends are in it
	async range(ast) { // 45
		const start = this.numeric(await this.execute_ast(ast.start));
		const end = this.numeric(await this.execute_ast(ast.end));
		const step = ast.step ? this.numeric(await this.execute_ast(ast.step)) : 1;
		if (start === null || end === null || step === null || !Number.isFinite(start + end + step)) {
			throw new Error("A range needs numbers, from, to and a step that are finite");
		}
		if (step === 0) {
			throw new Error("A range can't step by 0");
		}
		const out = [];
		// a little slack, so 0..0.3..0.1 still gets to 0.3
		const slack = Math.abs(step) * 1e-9;
		for (let i = 0; step > 0 ? start + i * step <= end + slack : start + i * step >= end - slack; i++) {
			out.push(start + i * step);
		}
		return out;
	}
	async loop(ast) {
		//this.print(`${this.getFunctionName()}`);
		let countResult = await this.execute_ast(ast.count);

		if (typeof countResult !== "number" && !Array.isArray(countResult) && typeof countResult !== "object") {
			const parsedInt = parseInt(countResult, 10);
			if (!isNaN(parsedInt)) countResult = parsedInt;
		}
		const breakCheck = () => this.loopbody(ast);
		if (typeof countResult === "number") {
			const step = countResult >= 1 ? 1 : -1;
			for (let i = 1; step > 0 ? i <= countResult : i >= countResult; i += step) {
				this.set('A_Index', i);
				if (await breakCheck()) break;
			}
		} else {
			const iterable = typeof countResult === "string" ? countResult.split('') : countResult;
			let i = 1;
			for (const [key, value] of Object.entries(iterable || countResult || {})) {
				this.set('A_Index', i);
				this.set('A_Key', key);
				this.set('A_Val', value);
				if (await breakCheck()) break;
				i++;
			}
		}
	}
	async RETURN(ast){ // 3
		//this.print(`${this.getFunctionName()}`);
		const value = ast.expression ? await this.execute_ast(ast.expression) : undefined
		this.returning = true
		this.returned = value
		return value
	}
	// a break or continue with a name has to be inside the loop with that name
	jumpto(target) {
		if (target && !this.labels.includes(String(target).toLowerCase())) {
			throw new Error(`No loop labelled '${target}' to break or continue`);
		}
		this.jumplabel = target ? String(target).toLowerCase() : null;
	}
	async BREAK(ast){ // 32
		//this.print(`${this.getFunctionName()}`);
		this.jumpto(ast.target)
		this.breaking = true
	}
	async CONTINUE(ast){ // 41
		//this.print(`${this.getFunctionName()}`);
		this.jumpto(ast.target)
		this.continuing = true
	}
	async FALLTHROUGH(ast) { // 49
		if (!this.labels.includes(" switch")) {
			throw new Error("fallthrough only works inside a switch");
		}
		this.falling = true;
	}
	// builds the object a catch block sees, message/line/stack/type plus whatever a thrown object itself carried
	wrapError(err) {
		// summary/message can legitimately be an empty string (throw null gives one), so this checks for undefined, not falsy
		const base = {
			message: err ? (err.summary !== undefined ? err.summary : (err.message !== undefined ? err.message : String(err))) : String(err),
			line: (err && err.line !== undefined) ? err.line : 0,
			stack: (err && err.frames && err.frames.length) ? err.frames.slice().reverse().map(f => `in ${f.name}${String(f.name).startsWith('new ') ? '' : '()'} called at ln ${f.line}`).join('\n') : "",
			type: (err && (err.type || err.name)) || "Error",
		};
		// throw {"code": 5} lets the catch see e.code too, not just the fixed fields
		return (err && err.coyoteValue !== undefined && err.coyoteValue !== null && typeof err.coyoteValue === 'object' && !Array.isArray(err.coyoteValue)) ? { ...base, ...err.coyoteValue } : base;
	}
	async TRY(ast) { // 50
		let pending = null;
		try {
			await this.execute_ast(ast.statements);
		} catch (err) {
			if (ast.catchBlock) {
				if (ast.catchBlock.variable) {
					this.set(ast.catchBlock.variable, this.wrapError(err));
				}
				await this.execute_ast(ast.catchBlock.statements);
			} else {
				pending = err;
			}
		}
		if (ast.finallyBlock) {
			// finally runs even after a return/break/continue/throw from try or catch, and its own wins if it has one
			const stash = { returning: this.returning, returned: this.returned, breaking: this.breaking, continuing: this.continuing };
			const stashedPending = pending;
			this.returning = this.breaking = this.continuing = false;
			pending = null;
			await this.execute_ast(ast.finallyBlock);
			if (!this.returning && !this.breaking && !this.continuing) {
				this.returning = stash.returning;
				this.returned = stash.returned;
				this.breaking = stash.breaking;
				this.continuing = stash.continuing;
				pending = stashedPending;
			}
		}
		if (pending !== null) {
			throw pending;
		}
	}
	async THROW(ast) { // 51
		const value = await this.execute_ast(ast.expression);
		const err = new Error(this.text(value));
		err.type = "Throw";
		err.coyoteValue = value;
		throw err;
	}
	// while (cond) and until (cond), A_Index counts the passes
	async while(ast) { // 46
		let i = 1;
		while (this.truth(await this.execute_ast(ast.condition)) !== ast.until) {
			this.set('A_Index', i++);
			if (await this.loopbody(ast)) {
				break;
			}
		}
	}
	async do_while(ast) { // 47
		let i = 1;
		do {
			this.set('A_Index', i++);
			if (await this.loopbody(ast)) {
				break;
			}
		} while (this.truth(await this.execute_ast(ast.condition)) !== ast.until);
	}
	// the first case with a value that = the subject, or default. it ends there unless it says fallthrough. break leaves the switch
	async switch(ast) { // 48
		const subject = await this.execute_ast(ast.subject);
		let start = -1;
		search: for (const [i, one] of ast.cases.entries()) {
			for (const value of one.values) {
				if (await this.equality({ left: { type: ItemType.VALUE, value: subject }, right: value })) {
					start = i;
					break search;
				}
			}
		}
		if (start < 0) {
			start = ast.cases.findIndex(one => one.isdefault);
		}
		for (let i = Math.max(start, 0); start >= 0 && i < ast.cases.length; i++) {
			await this.execute_ast(ast.cases[i].statements);
			if (!this.falling) {
				break;
			}
			this.falling = false;
		}
		this.falling = false;
		if (this.breaking && !this.jumplabel) {
			this.breaking = false;
		}
	}
	async variable(ast) { //26
		//this.print(`${this.getFunctionName()}`);
		return await this.get(ast.name)
	}
	async deref(ast) { // 37
		// the target was already read once, this.get() is the second lookup
		let name = await this.execute_ast(ast.target)
		return await this.get(String(name))
	}
	async literal(ast) { // 25
		//this.print(`${this.getFunctionName()}`);
		// strings lose their quotes and get their escapes worked out, everything else keeps its type
		return typeof ast.value === 'string' ? unquote(ast.value) : ast.value;
	}
	async template(ast) { // 43
		// in order, so a call in one part is done before the next
		let out = '';
		for (const part of ast.parts) {
			out += typeof part === 'string' ? part : this.text(await this.execute_ast(part));
		}
		return out;
	}
	// an already resolved value wrapped as a node so it isn't run again (method_call uses this)
	async value(ast) { // 36
		return ast.value;
	}
	async assignment(ast) {
		const leftType = await this.detype(ast.left.type);

		if (leftType === "MEMBER_ACCESS") {
			const target = await this.chainpath(ast.left);
			const value = await this.execute_ast(ast.right);
			if (target.name !== null) {
				this.set(target.name, value, target.path);
			}
			// as an inline param it hands back what it set
			return value;
		} else if (leftType === "VARIABLE") {
			const value = await this.execute_ast(ast.right);
			this.set(ast.left.name, value);
			return value;
		}
	}
	async object(ast) { // 27
		//this.print(`${this.getFunctionName()}`);

		let properties = ast.items;
		let obj = {};
		for (let [key, value] of properties.entries()) {
			let propName = unquote(key);
			obj[propName] = await this.execute_ast(value);
		}
		return obj;
	}
	async array(ast) { // 28
		//this.print(`${this.getFunctionName()}`);
		if (Array.isArray(ast.items)) {
			// one at a time, so [a := 1, b := a + 1] and calls with side effects happen in order
			const result = [];
			for (const item of ast.items) {
				result.push(await this.execute_ast(item));
			}
			return result;
		}
		return ast;
	}
	async member_access(ast) { // 29
		const member = await this.execute_ast(ast.member);
		if (ast.value.name !== undefined) {
			return await this.get(ast.value.name, member);
		}
		// x.a.b - work out the left side first, then step in
		return this.step(await this.execute_ast(ast.value), member);
	}
	async method_call(ast) {
		// re-evaluating would double any side effects, so it runs once
		const target = await this.execute_ast(ast.func.value);
		const methodName = await this.execute_ast(ast.func.member);
		if (target && typeof target === 'object' && target.__instance__) {
			const classDef = this.classes[String(target.__class__).toLowerCase()];
			const method = classDef && classDef.methods[String(methodName).toLowerCase()];
			if (method) {
				// runs on the instance's own scope, so fields stay between calls
				const instance = target.__instance__;
				let params = await this.execute_ast(ast.params);
				this.begun(ast);
				if (method.params) {
					for (const [index, param] of method.params.entries()) {
						let paramValue = params[index];
						if (paramValue === undefined && param.default_value !== null) {
							paramValue = await instance.execute_ast(param.default_value);
						}
						instance.set(param.name, paramValue);
					}
				}
				const body = await instance.execute_ast(method.statements);
				const retval = instance.returning ? this.Core(instance.returned) : this.Core(this.removeUndefined(body)[0]);
				instance.returning = false;
				instance.breaking = instance.continuing = false;
				instance.returned = undefined;
				return retval;
			}
			// not one of the class's methods, falls through to the global function with the object as first arg
		}
		return this.execute_ast({ type: 6, name: methodName, params: [{ type: ItemType.VALUE, value: target }, ...ast.params], line: ast.line, col: ast.col })
	}
	async concat(ast) { // 16
		//this.print(`${this.getFunctionName()}`);
		let left = this.text(await this.execute_ast(ast.left));
		let right = this.text(await this.execute_ast(ast.right));

		return (left + right)
	}
	async add(ast) { // 21
		//this.print(`${this.getFunctionName()}`);
		let left = await this.execute_ast(ast.left)
		let right = await this.execute_ast(ast.right)
		left = Number.isNaN(left) || left ? left : 0
		right = Number.isNaN(right) || right ? right : 0
		return (await this.toFloat(left ) + await this.toFloat(right))
	}
	async sub(ast) { // 22
		//this.print(`${this.getFunctionName()}`);
		let left = await this.execute_ast(ast.left)
		let right = await this.execute_ast(ast.right)
		left = Number.isNaN(left) || left ? left : 0
		right = Number.isNaN(right) || right ? right : 0
		return (await this.toFloat(left ) - await this.toFloat(right))
	}
	async mul(ast) {
		let left = await this.execute_ast(ast.left);
		let right = await this.execute_ast(ast.right);
		// nothing is 0 and a boolean is 1/0, same as the sums
		if (left === null || left === undefined || typeof left === 'boolean') left = Number(left || 0);
		if (right === null || right === undefined || typeof right === 'boolean') right = Number(right || 0);
		if (Number.isNaN(left) || Number.isNaN(right)) return NaN;

		let numLeft = parseFloat(left);
		let numRight = parseFloat(right);
		if (!isNaN(numLeft) && isFinite(numLeft) && !isNaN(numRight) && isFinite(numRight)) {
			return numLeft * numRight;
		} else if (typeof left === "string" && !isNaN(numRight) && isFinite(numRight)) {
			return left.repeat(Math.max(0, Math.floor(numRight)));
		} else {
			//console.log(left)
			//console.log(right)
			//throw new Error("Invalid operands for multiplication");
		}
	}
	async inc(ast) { // 33
		//this.print(`${this.getFunctionName()}`);
		var varval = parseInt(await this.execute_ast(ast.variable))
		var delta = parseInt(await this.execute_ast(ast.delta))
		this.set(ast.variable.name, (varval + delta))
	}	
	async dec(ast) { // 34
		//this.print(`${this.getFunctionName()}`);
		var varval = parseInt(await this.execute_ast(ast.variable))
		var delta = parseInt(await this.execute_ast(ast.delta))
		this.set(ast.variable.name, (varval - delta))
	}	
	async app(ast) { // 35
		this.set(ast.variable.name, `${this.text(await this.execute_ast(ast.variable))}${this.text(await this.execute_ast(ast.delta))}`)
	}
	async div(ast) { // 24
		//this.print(`${this.getFunctionName()}`);
		let left = await this.execute_ast(ast.left)
		let right = await this.execute_ast(ast.right)
		left = Number.isNaN(left) || left ? left : 0
		right = Number.isNaN(right) || right ? right : 0
		return (await this.toFloat(left) / await this.toFloat(right))
	}
	async VALUE(ast) { // 36
		// an already worked out result, lets a var park it in the tree
		return ast.value
	}
	async detype(type) {
		//this.print(`${this.getFunctionName()}`);
		return ItemType[type]
	}
	async toFloat(value) {
		//this.print(`${this.getFunctionName()}`);
		if (typeof value === 'string') {
			return parseFloat(value);
		} else if (typeof value === 'number') {
			return parseFloat(value);
		} else if (typeof value === 'boolean') {
			return Number(value);
		} else {
			throw new Error('Unsupported type');
		}
	}
	async INTERNAL_print(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		let out = value[0];
		// arrays print joined, not as raw node output
		if (Array.isArray(out)) {
			out = out.join(",");
		}
		if (out === null || out === undefined) {
			out = "";
		}
		console.log(out);
	}
	async INTERNAL_Cell(ast) {
		//this.print(`${this.getFunctionName()}`);
		const values = await this.execute_ast(ast);
		const char = values[0];
		const x = values[1];
		const y = values[2];

		process.stdout.cursorTo(x, y);

		process.stdout.write(char);
	}
	async INTERNAL_Cursor(ast) {
		//this.print(`${this.getFunctionName()}`);
		const values = await this.execute_ast(ast);
		const x = values[0];
		const y = values[1];

		process.stdout.cursorTo(x, y);
	}
	async INTERNAL_clear(ast) {
		//this.print(`${this.getFunctionName()}`);
		console.clear();
	}
	async INTERNAL_round(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast)
		if (Object.keys(ast).length == 1) {
			return Math.round(value)
		} else {
			return +parseFloat(value[0]).toFixed(value[1]);
		}
	}
	async INTERNAL_strlen(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast)
		return this.text(value[0]).length
	}
	async INTERNAL_abs(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		return Math.abs(value[0]);
	}
	async INTERNAL_Exp(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		return Math.exp(value[0]);
	}
	async INTERNAL_Log(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		return Math.log(this.Core(value[0]));
	}
	async INTERNAL_Floor(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		return Math.floor(value[0]);
	}
	async INTERNAL_Sin(ast) {
		let value = await this.execute_ast(ast);
		let degrees = value[1] === "D";
		let rawValue = typeof value[0] === "number" ? value[0] : this.Core(value[0]);
		let radians = degrees ? rawValue * (Math.PI / 180) : rawValue;
		return Math.sin(radians);
	}
	async INTERNAL_Cos(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		// Core() floors non-integers, which zeroes x / 4. skipped for real numbers like Sin
		let rawValue = typeof value[0] === "number" ? value[0] : this.Core(value[0]);
		return Math.cos(rawValue);
	}
	async INTERNAL_Ticks(ast) {
		return performance.now();
	}
	async INTERNAL_Tan(ast) {
		let value = await this.execute_ast(ast);
		let degrees = value[1] === "D";
		let rawValue = typeof value[0] === "number" ? value[0] : this.Core(value[0]);
		let radians = degrees ? rawValue * (Math.PI / 180) : rawValue;
		return Math.tan(radians);
	}
	async INTERNAL_Ceil(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		return Math.ceil(value[0]);
	}
	async INTERNAL_Cotan(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		// Cotan has always taken degrees only
		let radians = value[0] * (Math.PI / 180);
		let result = 1 / Math.tan(radians);
		let tolerance = 1e-10;
		if (Math.abs(result - 1) < tolerance) {
			result = 1;
		}
		return result;
	}
	async INTERNAL_Rand(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		if (value.length === 0) {
			return Math.random() * 100 + 1;
		} else if (value.length === 1) {
			let max = value[0];
			return Math.random() * max;
		} else if (value.length === 2) {
			let bound1 = value[0];
			let bound2 = value[1];
			let min = Math.min(bound1, bound2);
			let max = Math.max(bound1, bound2);
			return Math.random() * (max - min) + min;
		} else {
			throw new Error("INTERNAL_Rand: Invalid number of arguments");
		}
	}
	async INTERNAL_Dice(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		let N = parseInt(value[0]);
		return Math.floor(Math.random() * N) + 1;
	}
	async INTERNAL_Substr(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		// no Core() here, an all-digit string ("48") would turn into a number
		let string = String(values[0])
		let start =  this.Core(values[1])
		let length = values.length >= 3 ?  this.Core(values[2]) : string.length - start;
		return string.substring(start, start + length);
	}
	async INTERNAL_Asc(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		value = String(value[0]).replace(/^"(.*)"$/, '$1')
		if (typeof value[0] === 'string' && value[0].length === 1) {
			return value[0].charCodeAt(0);
		} else {
			throw new Error("INTERNAL_Asc: Argument must be a single character string");
		}
	}
	async INTERNAL_Chr(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		return String.fromCharCode(value[0]);
	}
	async INTERNAL_InStr(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string1 = String(values[0]);
		let string2 = values[1];
		return string1.indexOf(string2) + 1;
	}
	async INTERNAL_Strepl(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string = String(values[0]);
		let find = values[1];
		let replace = values[2];
		return string.replace(new RegExp(find, 'g'), replace);
	}
	async INTERNAL_Upper(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string = String(values[0]);
		return string.toUpperCase();
	}
	async INTERNAL_Lower(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string = String(values[0]);
		return string.toLowerCase();
	}
	async INTERNAL_power(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let base = values[0];
		let exponent = values[1];
		return Math.pow(base, exponent);
	}
	async INTERNAL_sqrt(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let number = values[0];
		return Math.sqrt(number);
	}
async INTERNAL_Rem(ast) {
    let values = await this.execute_ast(ast);
    let string = typeof values[0] === "number" ? String(values[0]) : values[0];
    let regexPattern = values[1];
    let numMatches = values[2] !== undefined ? parseInt(values[2]) : 1;

    if (typeof string !== "string" || isNaN(numMatches)) {
        throw new Error("Invalid arguments. Expected a string, a regex pattern, and an optional number of matches.");
    }

    let regex = numMatches === 1 ? new RegExp(regexPattern) : new RegExp(regexPattern, "g");

    let matches = [];
    let matchCount = 0;

    let match;
    while ((match = regex.exec(string)) !== null) {
        matches.push({ match: match[0], pos: match.index });
        matchCount++;
        if (numMatches > 0 && matchCount >= numMatches) {
            break;
        }
    }

    return matches;
}
	async INTERNAL_Repl(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string = String(values[0]);
		let regex = values[1];
		let replace = values[2];
		// 4th param (Recursive): falsy replaces the first match only, truthy replaces all
		let recursive = values[3];
		return string.replace(new RegExp(regex, recursive ? 'g' : ''), replace);
	}
	async INTERNAL_Grep(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		// substring/pattern match, no \b boundaries
		let pattern = new RegExp(values[0], 'g');
		let text = String(values[1]);
		// split on real newlines
		let lines = text.split('\n');
		let matchedLines = lines.filter(line => line.match(pattern));
		return matchedLines;
	}
	async INTERNAL_Trunc(ast) {
		let values = await this.execute_ast(ast);
		let number = parseFloat(values[0]);
		let decimalPlaces = parseInt(values[1]);
		if (isNaN(number) || isNaN(decimalPlaces) || decimalPlaces < 0) {
			throw new Error("Invalid arguments for truncation. Expected a number and a non-negative integer.");
		}
		let powerOf10 = Math.pow(10, decimalPlaces);
		let truncated = Math.trunc(number * powerOf10) / powerOf10;
		let truncatedStr = truncated.toFixed(decimalPlaces);
		return truncatedStr;
	}
	async INTERNAL_Strsplit(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string = String(values[0]);
		let separator = values[1];
		return string.split(separator);
	}
	async INTERNAL_fRead(ast) {
		//this.print(`${this.getFunctionName()}`);
		let filePath = await this.execute_ast(ast);
		try {
			let content = fs.readFileSync(filePath[0], 'utf8');
			return content;
		} catch (err) {
			console.error("Error reading file:", err);
			return null;
		}
	}
	async INTERNAL_strmid(ast) {
		//this.print(`${this.getFunctionName()}`);
		let string = await this.execute_ast(ast);
		let length = string[0].length;

		if (length % 2 === 0) {
			return (length / 2) + 0.5;
		} else {
			return Math.floor(length / 2) + 1;
		}
	}
	async INTERNAL_Occur(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let [haystack, needle, N] = values;
		let flags = N === 2 ? '' : 'i';
		let regex = new RegExp(needle, `g${flags}`);
		let matches = String(haystack).match(regex);
		return this.Core(matches ? matches.length : 0);
	}
	async INTERNAL_Dir(ast) {
		//this.print(`${this.getFunctionName()}`);
		let [dirPath = process.cwd(), option] = await this.execute_ast(ast);
		return await this.listFiles(dirPath, option === 'R');
	}
	async listFiles(directory, recursive = false) {
		//this.print(`${this.getFunctionName()}`);
		let files = [];
		let entries = fs.readdirSync(directory, { withFileTypes: true });

		for (let entry of entries) {
			let fullPath = path.join(directory, entry.name);
			if (entry.isDirectory() && recursive) {
				files.push(...await this.listFiles(fullPath, true));
			} else if (!entry.isDirectory()) {
				files.push(fullPath);
			}
		}

		return files;
	}
	async buildFileTree(filePaths) {
		//this.print(`${this.getFunctionName()}`);
		const tree = {};

		filePaths.forEach(filePath => {
			const parts = filePath.split(path.sep);
			let current = tree;

			parts.forEach((part, index) => {
				if (index === parts.length - 1) {
					if (!current.files) {
						current.files = [];
					}
					current.files.push(part);
				} else {
					if (!current[part]) {
						current[part] = {};
					}
					current = current[part];
				}
			});
		});

		return tree;
	}
	async INTERNAL_justify(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let text = String(values[0]);
		// switch is strict, hence parseInt
		let justifyType = parseInt(values[1]); // 1 left, 2 center, 3 right
		let width = values[2];

		let lines = text.split('\n');

		lines.forEach(line => {
			if (line.length > width) {
				width = line.length;
			}
		});

		function justifyLine(line, justifyType, width) {
			let padding;
			switch (justifyType) {
				case 1:
					return line.padEnd(width);
				case 2:
					padding = Math.floor((width - line.length) / 2);
					return ' '.repeat(padding) + line + ' '.repeat(width - line.length - padding);
				case 3:
					return line.padStart(width);
				default:
					return line;
			}
		}

		let justifiedText = lines.map(line => justifyLine(line, justifyType, width)).join('\n');

		return justifiedText;
	}
	async INTERNAL_LastOcc(ast) {
		let [haystack, needle, N] = await this.execute_ast(ast);
		let regex = new RegExp(needle, `g${N === 2 ? '' : 'i'}`);
		let match, lastPos = -1;
		while ((match = regex.exec(haystack)) !== null) lastPos = match.index;
		return this.Core(lastPos) + 1;
	}
	async INTERNAL_strclean(ast) {
		//this.print(`${this.getFunctionName()}`); //untested
		let values = await this.execute_ast(ast);
		let string = String(values[0]);
		let N = values[1];

		switch (N) {
			case 1:
				// collapse repeated spaces
				return string.replace(/\s+/g, ' ').trim();
			
			case 2:
				// collapse spaces, trim the ends
				// and strip tabs and newlines
				return string.replace(/\s+/g, ' ').replace(/\t+/g, ' ').replace(/\n+/g, ' ').trim();
			
			case 3:
				// strip all whitespace and invisible characters
				return string.replace(/[\s\uFEFF\xA0]+/g, '');
			
			default:
				throw new Error('Invalid cleaning type. Use 1 for light, 2 for medium, or 3 for heavy cleaning.');
		}
	}
	async INTERNAL_fdelete(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let filePath = values[0];
		const fs = require('fs');

		try {
			fs.unlinkSync(filePath);
			return `File deleted successfully: ${filePath}`;
		} catch (err) {
			return `Error deleting file: ${err.message}`;
		}
	}
	async INTERNAL_fwrite(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let data = this.text(values[0]);
		let filePath = values[1];
		const fs = require('fs');

		try {
			fs.writeFileSync(filePath, data, 'utf8');
			return `File written successfully: ${filePath}`;
		} catch (err) {
			return `Error writing to file: ${err.message}`;
		}
	}
	async INTERNAL_repeat(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let repeat = String(values[0]);
		let num = values[1];
		return repeat.repeat(await this.toFloat(num))
	}
	async INTERNAL_fappend(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let data = this.text(values[0]);
		let filePath = values[1];
		const fs = require('fs');

		try {
			fs.appendFileSync(filePath, data, 'utf8');
			return `Data appended successfully: ${filePath}`;
		} catch (err) {
			return `Error appending to file: ${err.message}`;
		}
	}
	async INTERNAL_treeprint(ast) {
		//this.print(`${this.getFunctionName()}`);
		console.log(chalk.gray("Tree:"))
		const printTree = (obj, indent = '', last = true, arr=false) => {
			const prefix = indent + (last ? chalk.gray('└─ ') : chalk.gray('└─ '));

			if (Array.isArray(obj)) {
				obj.forEach((item, index) => {
					console.log(indent + (index === obj.length - 1 ? chalk.gray('└─ ') : chalk.gray('├─ ')) + chalk.cyan(`[${index}]`));
					printTree(item, indent + (index === obj.length - 1 ? '    ' : chalk.gray('│   ')), index === obj.length - 1);
				});
			
			//		if (Array.isArray(obj)) {
			//	// Print each item in the array
			//	obj.forEach((item, index) => {
			//		const isLast = index === obj.length - 1;
			//		// Use different prefixes and indentation for the last item
			//		console.log(indent + (isLast ? chalk.gray('└─┐') : chalk.gray('├─┐')));
			//		printTree(item, indent + (isLast ? '  ' : chalk.gray('│ ')), false);
			//	});




			//if (Array.isArray(obj)) {
			//	obj.forEach((item, index) => {
			//		const isLast = index === obj.length - 1;
			//		const isObject = typeof item === 'object' && item !== null;
			//
			//		// Print the correct branch marker
			//		console.log(
			//			indent +
			//			(isLast ? chalk.gray('└─') : chalk.gray('├─')) +
			//			(isObject ? chalk.gray('┐') : chalk.cyan(JSON.stringify(item)))
			//		);
			//
			//		// Pass proper indentation to the next recursive call
			//		if (isObject) {
			//			printTree(item, indent + (isLast ? '  ' : chalk.gray('│ ')), false);
			//		}
			//	});
			} else if (typeof obj === 'object' && obj !== null) {
				const keys = Object.keys(obj);
				keys.forEach((key, index) => {
					console.log(indent + (index === keys.length - 1 ? chalk.gray('└─ ') : chalk.gray('├─ ')) + chalk.cyan(key));
					printTree(obj[key], indent + (index === keys.length - 1 ? '   ' : chalk.gray('│  ')), index === keys.length - 1);
				});
			} else {
				if (!arr)  {
				console.log(prefix + chalk.yellow(JSON.stringify(obj)));
				}
			}
		};

		let jsonObject = await this.execute_ast(ast);
		printTree(jsonObject[0]);

		
	}	
	async INTERNAL_pcof(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let part = values[0];
		let whole = values[1];
		if (whole === 0) {
			return "Error: Division by zero";
		}
		let result = (part / whole) * 100;
		return result;
	}
	async INTERNAL_pct(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let number = values[0];
		let percent = values[1];

		let result = (number * percent) / 100;
		return result;
	}
	async INTERNAL_pcChange(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let oldValue = values[0];
		let newValue = values[1];

		let change = ((newValue - oldValue) / oldValue) * 100;
		return change;
	}
	async INTERNAL_addPc(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let number = Number(values[0]);
		let percent = Number(values[1]);

		return number + (number * percent / 100);
	}	
	async INTERNAL_subPc(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let number = values[0];
		let percent = values[1];

		return number - (number * percent / 100);
	}
	async INTERNAL_input(ast) {
		//this.print(`${this.getFunctionName()}`);
		let promptText = await this.execute_ast(ast)[0] || 'Enter input: ';
		let userInput = readlineSync.question(promptText);
		return userInput;
	}
	async INTERNAL_sleep(ast) {
		//this.print(`${this.getFunctionName()}`);
        let values = await this.execute_ast(ast);
        let milliseconds = values[0];
        await new Promise(r => setTimeout(r, milliseconds))

        return true;
	}
	async INTERNAL_Count(ast) {
		let value = await this.execute_ast(ast);
		if (typeof value[0] === 'string' || typeof value[0] === 'number') {
			return String(value[0]).split('').length;
		} else if (Array.isArray(value[0])) {
			return value[0].length;
		} else {
			throw new Error("INTERNAL_Count: Expected a string or an array");
		}
	}
	async INTERNAL_MaxIndex(ast) {
		let value = await this.execute_ast(ast);
		if (typeof value[0] === 'string' || typeof value[0] === 'number') {
			return String(value[0]).split('').length - 1;
		} else if (Array.isArray(value[0])) {
			return value[0].length - 1;
		} else {
			throw new Error("INTERNAL_MaxIndex: Expected a string or an array");
		}
	}
	async INTERNAL_Slice(ast) {
		let values = await this.execute_ast(ast);
		let source = values[0];
		let start = values[1];
		let end = values.length >= 3 ? values[2] : undefined;

		if (typeof source === 'string' || typeof source === 'number') {
			return String(source).slice(start, end);
		} else if (Array.isArray(source)) {
			return source.slice(start, end);
		} else {
			throw new Error("INTERNAL_Slice: Expected a string or an array");
		}
	}
	async INTERNAL_Join(ast) {
		let values = await this.execute_ast(ast);
		let array = values[0];
		let separator = values.length >= 2 ? values[1] : '';

		if (Array.isArray(array)) {
			return array.join(separator);
		} else {
			throw new Error("INTERNAL_Join: Expected an array as the first argument");
		}
	}
	async INTERNAL_Flatten(ast) {
		let values = await this.execute_ast(ast);
		let array = values[0];

		if (Array.isArray(array)) {
			return array.flat();
		} else {
			throw new Error("INTERNAL_Flatten: Expected an array as the argument");
		}
	}
	async INTERNAL_Push(ast) {
		let values = await this.execute_ast(ast);
		let array = values[0];
		let element = values[1];

		if (Array.isArray(array)) {
			array.push(element);
			return array;
		} else if (typeof array === 'string') {
			return array + String(element);
		} else {
			throw new Error("INTERNAL_Push: Expected an array or string as the first argument");
		}
	}
	async INTERNAL_Mod(ast) {
		// Mod, in place of a % operator
		let values = await this.execute_ast(ast);
		let a = this.numeric(values[0]);
		let b = this.numeric(values[1]);
		return a % b;
	}
	async INTERNAL_Sign(ast) {
		let values = await this.execute_ast(ast);
		return Math.sign(this.numeric(values[0]));
	}
	async INTERNAL_Clamp(ast) {
		let values = await this.execute_ast(ast);
		let n = this.numeric(values[0]);
		let min = this.numeric(values[1]);
		let max = this.numeric(values[2]);
		return Math.min(Math.max(n, min), max);
	}
	async INTERNAL_RandRange(ast) {
		let values = await this.execute_ast(ast);
		let min = this.numeric(values[0]);
		let max = this.numeric(values[1]);
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
	async INTERNAL_IndexOf(ast) {
		let values = await this.execute_ast(ast);
		let array = this.unbox(values[0]);
		if (!Array.isArray(array)) {
			throw new Error("INTERNAL_IndexOf: Expected an array as the first argument");
		}
		return array.findIndex(v => String(v) === String(values[1]));
	}
	async INTERNAL_Pop(ast) {
		// mutates and returns the removed element (Push returns the array)
		let values = await this.execute_ast(ast);
		let array = values[0];
		if (!Array.isArray(array)) {
			throw new Error("INTERNAL_Pop: Expected an array as the argument");
		}
		return array.pop();
	}
	async INTERNAL_Shift(ast) {
		// like Pop but off the front
		let values = await this.execute_ast(ast);
		let array = values[0];
		if (!Array.isArray(array)) {
			throw new Error("INTERNAL_Shift: Expected an array as the argument");
		}
		return array.shift();
	}
	async INTERNAL_Unshift(ast) {
		// prepends, mutates and returns the array like Push
		let values = await this.execute_ast(ast);
		let array = values[0];
		let element = values[1];
		if (!Array.isArray(array)) {
			throw new Error("INTERNAL_Unshift: Expected an array as the first argument");
		}
		array.unshift(element);
		return array;
	}
	async INTERNAL_Concat(ast) {
		let values = await this.execute_ast(ast);
		let a = this.unbox(values[0]);
		let b = this.unbox(values[1]);
		if (!Array.isArray(a) || !Array.isArray(b)) {
			throw new Error("INTERNAL_Concat: Expected two arrays");
		}
		return a.concat(b);
	}
	async INTERNAL_First(ast) {
		let values = await this.execute_ast(ast);
		let array = this.unbox(values[0]);
		if (!Array.isArray(array)) {
			throw new Error("INTERNAL_First: Expected an array as the argument");
		}
		return array[0];
	}
	async INTERNAL_Last(ast) {
		let values = await this.execute_ast(ast);
		let array = this.unbox(values[0]);
		if (!Array.isArray(array)) {
			throw new Error("INTERNAL_Last: Expected an array as the argument");
		}
		return array[array.length - 1];
	}
	async INTERNAL_Shuffle(ast) {
		let values = await this.execute_ast(ast);
		let array = this.unbox(values[0]);
		if (!Array.isArray(array)) {
			throw new Error("INTERNAL_Shuffle: Expected an array as the argument");
		}
		let out = array.slice();
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	}
	async INTERNAL_Left(ast) {
		let values = await this.execute_ast(ast);
		return String(values[0]).slice(0, values[1]);
	}
	async INTERNAL_Right(ast) {
		let values = await this.execute_ast(ast);
		let str = String(values[0]);
		let n = values[1];
		return n <= 0 ? '' : str.slice(-n);
	}
	async INTERNAL_Capitalize(ast) {
		let values = await this.execute_ast(ast);
		let str = String(values[0]);
		if (!str.length) return str;
		return str[0].toUpperCase() + str.slice(1).toLowerCase();
	}
	async INTERNAL_HasKey(ast) {
		let values = await this.execute_ast(ast);
		let obj = this.unbox(values[0]);
		if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
			throw new Error("INTERNAL_HasKey: Expected an object as the first argument");
		}
		return Object.prototype.hasOwnProperty.call(obj, values[1]) ? 1 : 0;
	}
	async INTERNAL_Merge(ast) {
		let values = await this.execute_ast(ast);
		let a = this.unbox(values[0]);
		let b = this.unbox(values[1]);
		if (typeof a !== 'object' || a === null || Array.isArray(a) || typeof b !== 'object' || b === null || Array.isArray(b)) {
			throw new Error("INTERNAL_Merge: Expected two objects");
		}
		return { ...a, ...b };
	}

	async INTERNAL_Set(ast) {
		let values = await this.execute_ast(ast);
		let obj = this.unbox(values[0]);
		let key = String(values[1]);
		let val = values[2];
		if (typeof obj !== 'object' || obj === null) {
			throw new Error("INTERNAL_Set: Expected an object as the first argument");
		}
		obj[key] = val;
		return obj;
	}
	async INTERNAL_IsEmpty(ast) {
		let values = await this.execute_ast(ast);
		let value = values[0];
		// no unbox()/Core() here, Core("") gives 0 and the length would come back as 1
		if (value === null || value === undefined) return 1;
		if (Array.isArray(value)) return value.length === 0 ? 1 : 0;
		if (typeof value === 'object' && value !== null) return Object.keys(value).length === 0 ? 1 : 0;
		return String(value).length === 0 ? 1 : 0;
	}
	// the params of IsNull and Default, a variable that was never set is just undefined so #Strict lets it by
	async unsetparams(ast) {
		const values = [];
		for (const node of ast) {
			values.push(node.type === ItemType.VARIABLE && !this.getvar(node.name) ? undefined : await this.execute_ast(node));
		}
		return values;
	}
	async INTERNAL_IsNull(ast) {
		let values = await this.unsetparams(ast);
		return this.unset(ast[0], values[0]) ? 1 : 0;
	}
	async INTERNAL_Default(ast) {
		let values = await this.unsetparams(ast);
		return this.unset(ast[0], values[0]) ? values[1] : values[0];
	}
	async INTERNAL_Purge(ast) {
		let value = await this.execute_ast(ast);
		
		async function purge(input) {
			if (Array.isArray(input)) {
				return Promise.all(input.filter(item => {
					if (item === null || item === undefined || item === '' || 
						(Array.isArray(item) || typeof item === 'object' ? purge(item).then(res => res.length === 0) : false)) {
						return false;
					}
					return true;
				}).map(async (item) => await purge(item)));
			} else if (typeof input === 'object' && input !== null) {
				let purgedObj = {};
				for (let key in input) {
					if (input.hasOwnProperty(key)) {
						let value = await purge(input[key]);
						if (value !== null && value !== undefined && value !== '' && 
							!(Array.isArray(value) && value.length === 0) && 
							!(typeof value === 'object' && Object.keys(value).length === 0)) {
							purgedObj[key] = value;
						}
					}
				}
				return purgedObj;
			}
			return input;
		}

		return await purge(value[0]);
	}
async INTERNAL_IsOdd(ast) {
    let value = await this.execute_ast(ast);
    let number = parseInt(value[0]);
    return number % 2 !== 0 ? 1 : 0;
}

async INTERNAL_IsEven(ast) {
    let value = await this.execute_ast(ast);
    let number = parseInt(value[0]);
    return number % 2 === 0 ? 1 : 0;
}
async INTERNAL_Invert(ast) {
    let value = await this.execute_ast(ast);
    let number = parseFloat(value[0]);
    return -number;
}
async INTERNAL_IsArray(ast) {
    let value = await this.execute_ast(ast);
    return Array.isArray(this.Core(value[0])) ? 1 : 0;
}

async INTERNAL_IsObject(ast) {
    let value = await this.execute_ast(ast);
    return (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) ? 1 : 0;
}
async INTERNAL_IsString(ast) {
    let value = await this.execute_ast(ast);
    return typeof this.Core(value[0]) === 'string' ? 1 : 0;
}

async INTERNAL_IsNum(ast) {
    let value = await this.execute_ast(ast);
    // any number, int or float. isInt is the whole-number one
    return typeof value[0] !== 'boolean' && value[0] !== null && !isNaN(value[0]) ? 1 : 0;
}
async INTERNAL_IsInt(ast) {
    let value = await this.execute_ast(ast);
    // whole numbers only
    return !isNaN(value[0]) && Number.isInteger(parseFloat(value[0])) ? 1 : 0;
}
async INTERNAL_Range(ast) {
    let values = await this.execute_ast(ast);

    if (values.length === 1) {
        // range(25)
        let end = parseInt(values[0]);
        if (isNaN(end)) {
            throw new Error("Invalid argument for range. Expected a number.");
        }
        return Array.from({ length: end + 1 }, (_, i) => i); // [0, 1, ..., end]
    } else if (values.length === 2) {
        // range(5, 10)
        let start = parseInt(values[0]);
        let end = parseInt(values[1]);
        if (isNaN(start) || isNaN(end)) {
            throw new Error("Invalid arguments for range. Expected two numbers.");
        }
        return Array.from({ length: end - start + 1 }, (_, i) => start + i); // [start, ..., end]
    } else {
        throw new Error("Range expects 1 or 2 arguments.");
    }
}
async INTERNAL_IsFloat(ast) {
    let value = await this.execute_ast(ast);
    // no Core() here, digest() floors floats so everything would look like an int
    let num = parseFloat(value[0]);
    return !Number.isNaN(num) && !Number.isInteger(num) ? 1 : 0;
}

	// ---- natives ----
	// nothing internal matched: if the left of the dot is a js object with that method, call it (Use("os") then os.hostname())
	async native_call(ast) {
		const params = ast.params ? await this.execute_ast(ast.params) : [];
		const host = params.length ? params[0] : null;
		if (host !== null && host !== undefined) {
			const key = this.nativekey(host, ast.name);
			if (key) {
				return await host[key](...params.slice(1));
			}
		}
		const free = this.natives[String(ast.name).toLowerCase()];
		if (free) {
			return await free(...params);
		}
		if (this.settings.strict) {
			throw new Error(this.guess('function', ast.name));
		}
		this.print(chalk.red(`Function definition for ${ast.name} not found or missing parameters`));
		return "";
	}
	// case insensitive method lookup, own keys first then up the prototype.
	// walking the proto gives strings and arrays the whole js method set
	nativekey(host, name) {
		const want = String(name).toLowerCase();
		if (typeof host[name] === 'function') {
			return name;
		}
		for (const key in host) {
			if (typeof host[key] === 'function' && key.toLowerCase() === want) {
				return key;
			}
		}
		for (let proto = Object.getPrototypeOf(host); proto; proto = Object.getPrototypeOf(proto)) {
			for (const key of Object.getOwnPropertyNames(proto)) {
				if (key.toLowerCase() === want && typeof host[key] === 'function') {
					return key;
				}
			}
		}
		return null;
	}
	root() {
		let scope = this;
		while (scope.parent) {
			scope = scope.parent;
		}
		return scope;
	}
	async INTERNAL_Use(ast) {
		let values = await this.execute_ast(ast);
		let name = String(values[0]).replace(/^"|"$/g, '');
		let mod = require(name);
		// park the module under its name so os.hostname() resolves, and add its top level functions as bare calls
		this.root().set(name.split('/').pop(), mod);
		if (mod && (typeof mod === 'object' || typeof mod === 'function')) {
			for (const key of Object.keys(mod)) {
				if (typeof mod[key] === 'function') {
					this.natives[key.toLowerCase()] = mod[key].bind(mod);
				}
			}
		}
		return name;
	}
	async INTERNAL_Solve(ast) {
		let values = await this.execute_ast(ast);
		return values[0] instanceof CoyoteVar ? await values[0].solve() : values[0];
	}
	async INTERNAL_Tree(ast) {
		let values = await this.execute_ast(ast);
		let found = this.getvar(ast[0] && ast[0].name ? ast[0].name : "");
		console.log(found ? found.tree() : print_Coyote_expression({ type: ItemType.VALUE, value: values[0] }));
	}
	async INTERNAL_ToHex(ast) {
		let values = await this.execute_ast(ast);
		let value = this.Core(values[0]);
		if (typeof value === 'number') {
			let out = Math.trunc(Math.abs(value)).toString(16).toUpperCase();
			return (value < 0 ? "-" : "") + (out.length % 2 ? "0" + out : out);
		}
		return String(values[0]).split('').map(c => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join('');
	}
	async INTERNAL_FromHex(ast) {
		let values = await this.execute_ast(ast);
		return parseInt(String(values[0]).replace(/^0x/i, ''), 16);
	}
	async INTERNAL_ToBin(ast) {
		let values = await this.execute_ast(ast);
		return (this.Core(values[0]) >>> 0).toString(2);
	}
	async INTERNAL_FromBin(ast) {
		let values = await this.execute_ast(ast);
		return parseInt(String(values[0]), 2);
	}
	async INTERNAL_ToString(ast) {
		let values = await this.execute_ast(ast);
		let value = values[0];
		if (value !== null && typeof value === 'object') {
			return JSON.stringify(value);
		}
		return this.text(value);
	}
	async INTERNAL_ToNum(ast) {
		let values = await this.execute_ast(ast);
		let num = parseFloat(values[0]);
		return Number.isNaN(num) ? 0 : num;
	}
	async INTERNAL_Uppercase(ast) {
		let values = await this.execute_ast(ast);
		return String(values[0]).toUpperCase();
	}
	async INTERNAL_Lowercase(ast) {
		let values = await this.execute_ast(ast);
		return String(values[0]).toLowerCase();
	}
	async INTERNAL_Type(ast) {
		let values = await this.execute_ast(ast);
		if (values[0] === undefined) {
			return "undefined";
		}
		let value = this.unbox(values[0]);
		if (Array.isArray(value)) {
			return "array";
		}
		if (value === null) {
			return "null";
		}
		if (typeof value === 'number') {
			return Number.isInteger(value) ? "int" : "float";
		}
		return typeof value;
	}
	async INTERNAL_Trim(ast) {
		let values = await this.execute_ast(ast);
		let chars = values.length >= 2 ? String(values[1]) : " \t\r\n";
		let string = String(values[0]);
		let a = 0;
		let b = string.length;
		while (a < b && chars.includes(string[a])) {
			a++;
		}
		while (b > a && chars.includes(string[b - 1])) {
			b--;
		}
		return string.substring(a, b);
	}
	async INTERNAL_Reverse(ast) {
		let values = await this.execute_ast(ast);
		let value = this.unbox(values[0]);
		return Array.isArray(value) ? value.slice().reverse() : String(values[0]).split('').reverse().join('');
	}
	async INTERNAL_Contains(ast) {
		let values = await this.execute_ast(ast);
		let haystack = this.unbox(values[0]);
		if (Array.isArray(haystack)) {
			return haystack.some(v => String(v) === String(values[1])) ? 1 : 0;
		}
		return String(values[0]).includes(String(values[1])) ? 1 : 0;
	}
	async INTERNAL_StartsWith(ast) {
		let values = await this.execute_ast(ast);
		return String(values[0]).startsWith(String(values[1])) ? 1 : 0;
	}
	async INTERNAL_EndsWith(ast) {
		let values = await this.execute_ast(ast);
		return String(values[0]).endsWith(String(values[1])) ? 1 : 0;
	}
	async INTERNAL_Pad(ast) {
		let values = await this.execute_ast(ast);
		let string = String(values[0]);
		let width = parseInt(this.Core(values[1]));
		let char = values.length >= 3 ? String(values[2]) : " ";
		let side = values.length >= 4 ? String(values[3]).toUpperCase() : "R";
		if (side.startsWith("L")) {
			return string.padStart(width, char);
		}
		if (side.startsWith("C")) {
			let total = Math.max(0, width - string.length);
			let left = Math.floor(total / 2);
			return char.repeat(left) + string + char.repeat(total - left);
		}
		return string.padEnd(width, char);
	}
	async INTERNAL_OnError(ast) {
		// takes a function name, called with the caught error object when nothing else catches one
		let values = await this.execute_ast(ast);
		this.root().onerrorhandler = values[0] ? String(values[0]) : null;
		return values[0];
	}
	async INTERNAL_Assert(ast) {
		let values = await this.execute_ast(ast);
		if (!this.truth(values[0])) {
			throw new Error(values.length >= 2 ? this.text(values[1]) : "Assertion failed");
		}
		return 1;
	}
	async INTERNAL_Entries(ast) {
		let values = await this.execute_ast(ast);
		let value = values[0];
		// [key, value] pairs, so for ([k, v] of Entries(o)) can work when destructuring is there
		if (typeof value === 'string' || Array.isArray(value)) {
			return Array.from(value, (v, i) => [i + this.settings.arrayStartIndex, v]);
		}
		return (value !== null && typeof value === 'object' && !value.__instance__) ? Object.entries(value) : [];
	}
	async INTERNAL_Keys(ast) {
		let values = await this.execute_ast(ast);
		let value = this.unbox(values[0]);
		return (value !== null && typeof value === 'object') ? Object.keys(value) : [];
	}
	async INTERNAL_Values(ast) {
		let values = await this.execute_ast(ast);
		let value = this.unbox(values[0]);
		return (value !== null && typeof value === 'object') ? Object.values(value) : [];
	}
	async INTERNAL_Sort(ast) {
		let values = await this.execute_ast(ast);
		let list = this.unbox(values[0]);
		if (!Array.isArray(list)) {
			return list;
		}
		let down = values.length >= 2 && String(values[1]).toUpperCase().startsWith("D");
		let out = list.slice().sort((a, b) => {
			let x = this.Core(a);
			let y = this.Core(b);
			if (typeof x === 'number' && typeof y === 'number') {
				return x - y;
			}
			return String(x).localeCompare(String(y));
		});
		return down ? out.reverse() : out;
	}
	async INTERNAL_Unique(ast) {
		let values = await this.execute_ast(ast);
		let list = this.unbox(values[0]);
		if (!Array.isArray(list)) {
			return list;
		}
		let seen = [];
		for (const item of list) {
			if (!seen.some(v => String(v) === String(item))) {
				seen.push(item);
			}
		}
		return seen;
	}
	async INTERNAL_Sum(ast) {
		let values = await this.execute_ast(ast);
		let list = this.unbox(values[0]);
		if (!Array.isArray(list)) {
			return this.Core(list);
		}
		return list.reduce((a, b) => a + (parseFloat(b) || 0), 0);
	}
	async INTERNAL_Min(ast) {
		let values = await this.execute_ast(ast);
		let list = this.unbox(values[0]);
		let pool = Array.isArray(list) ? list : values;
		return Math.min(...pool.map(v => parseFloat(v)));
	}
	async INTERNAL_Max(ast) {
		let values = await this.execute_ast(ast);
		let list = this.unbox(values[0]);
		let pool = Array.isArray(list) ? list : values;
		return Math.max(...pool.map(v => parseFloat(v)));
	}
	async INTERNAL_Avg(ast) {
		let values = await this.execute_ast(ast);
		let list = this.unbox(values[0]);
		let pool = Array.isArray(list) ? list : values;
		return pool.reduce((a, b) => a + (parseFloat(b) || 0), 0) / (pool.length || 1);
	}
	async INTERNAL_Json(ast) {
		let values = await this.execute_ast(ast);
		return JSON.stringify(this.unbox(values[0]), null, values.length >= 2 ? parseInt(this.Core(values[1])) : 0);
	}
	async INTERNAL_Parse(ast) {
		let values = await this.execute_ast(ast);
		try {
			return JSON.parse(String(values[0]));
		} catch {
			return "";
		}
	}
	async INTERNAL_Now(ast) {
		return Date.now();
	}
	async INTERNAL_Date(ast) {
		let values = await this.execute_ast(ast);
		let when = values.length ? new Date(this.Core(values[0])) : new Date();
		return when.toISOString();
	}
	async INTERNAL_Env(ast) {
		let values = await this.execute_ast(ast);
		if (!values.length) {
			return process.env;
		}
		return process.env[String(values[0]).replace(/^"|"$/g, '')] || "";
	}
	async INTERNAL_Exec(ast) {
		// runs a string of coyote in a fresh executor sharing this scope
		let values = await this.execute_ast(ast);
		// lines in an error from in here count from the start of the string
		const code = String(values[0]);
		const inside = err => {
			if (err !== null && typeof err === 'object') {
				err.inExec = true;
				if (err.line === undefined && err.position !== undefined) {
					Object.assign(err, locate(code, err.position));
				}
				err.frames = err.frames || this.frames.slice();
			}
			throw err;
		};
		let tree = await this.make_ast(code).catch(inside);
		// borrows this scope, hands the flags back as found so a top level return doesn't latch on
		const mark = this.returning;
		const loopmark = [this.breaking, this.continuing];
		this.returning = false;
		this.breaking = this.continuing = false;
		const body = await this.execute_ast(tree.statements).catch(inside);
		const value = this.returning ? this.returned : this.removeUndefined(body)[0];
		this.returning = mark;
		[this.breaking, this.continuing] = loopmark;
		return this.Core(value);
	}
	async INTERNAL_credits() {
		//this.print(`${this.getFunctionName()}`);
		this.print("----- devs -----")
		this.print("spoon")
		this.print("bugz")
		await 
		this.print("----- alpha testers -----")
		this.print("bugz")			
	}
	async INTERNAL_vars() {
		//this.print(`${this.getFunctionName()}`);
		console.log(this.dump())
	}
	async INTERNAL_scope() {
		//this.print(`${this.getFunctionName()}`);
		console.log(this.scope())
	}
	async INTERNAL_PrintScript(ast) {
		// dumps the running script's source, to a file if given a path
		let fileContent = this.root().source;
		let values = await this.execute_ast(ast);
		let dest = values.length ? String(values[0]) : null;
		if (dest) {
			try {
				fs.writeFileSync(dest, fileContent, 'utf8');
				return `Script written to: ${dest}`;
			} catch (err) {
				return `Error writing script: ${err.message}`;
			}
		}
		console.log(fileContent);
		return "";
	}
	async INTERNAL_PrintAST(ast) {
		// dumps the parsed tree and json, to a file if given a path
		let r = this.root().ast || { statements: [] };
		let values = await this.execute_ast(ast);
		let dest = values.length ? String(values[0]) : null;
		let text = print_Coyote_tree(r) + "\n\n" + JSON.stringify(r, null, 2);
		if (dest) {
			try {
				fs.writeFileSync(dest, text, 'utf8');
				return `AST written to: ${dest}`;
			} catch (err) {
				return `Error writing AST: ${err.message}`;
			}
		}
		console.log(print_Coyote_tree(r));
		console.log(r);
		return "";
	}
	async INTERNAL_DumpRAM(ast) {
		// snapshot of node's memory and the variable stack, to a file if given a path
		let values = await this.execute_ast(ast);
		let dest = values.length ? String(values[0]) : null;
		let mem = process.memoryUsage();
		let toMB = n => (n / 1024 / 1024).toFixed(2) + ' MB';
		let report = {
			rss: toMB(mem.rss),
			heapTotal: toMB(mem.heapTotal),
			heapUsed: toMB(mem.heapUsed),
			external: toMB(mem.external),
			arrayBuffers: toMB(mem.arrayBuffers),
			vars: this.dump()
		};
		let text = JSON.stringify(report, null, 2);
		if (dest) {
			try {
				fs.writeFileSync(dest, text, 'utf8');
				return `RAM dump written to: ${dest}`;
			} catch (err) {
				return `Error writing RAM dump: ${err.message}`;
			}
		}
		console.log(text);
		return "";
	}
	async INTERNAL_funcs() {
		
			//this.print(`${this.getFunctionName()}`);
			console.log( "" )
			console.log( chalk.red('!!!') + " = not working | " + chalk.cyan('?') + " = maybe working | " + chalk.green('✓') + " = working")
			console.log( "" )
			console.log(this.justifyColumns(["Status:","Function:", "Return Value:", ...this.generateFuncs(
			[                                     				
			 '!!!' 	,	'Format 		'	,	'N'         ,	'> [|||] FUCK format i hate it', 
			 '✓'  	,	'Print  		'	,	'S'         ,	'> [|||] prints S', 
			 '✓'  	,	'Clear  		'	,	'/'         ,	'> [|||] Clears terminal', 
			 '✓'  	,	'Cursor  		'	,	'X,Y'       ,	'> [|||] Sets cursor to X Y', 
			 '✓'  	,	'Cell  			'	,	'C,X,Y'     ,	'> [|||] Prints char C at X Y', 
			 '✓'  	,	'Ticks 			'	,	'/'   		,	'> [|||] reports exact milliseconds', 
			 '✓'  	,	'Round  		'	,	'N'         ,	'> [num] Rounds N to int', 
			 '✓'  	,	'StrLen 		'	,	'S'         ,	'> [num] Length of string', 
			 '✓'  	,	'range	 		'	,	'N [,E]'    ,	'> [arr] Returns array between 0 and N [or N to E (optional)]', 
			 '✓'   	,	'isString  		'	,	'S'         ,	'> [num] returns 1 or 0 if N is String',    
			 '✓'   	,	'isNum   		'	,	'N'         ,	'> [num] returns 1 or 0 if N is a number (int or float)',    
			 '✓'   	,	'isInt   		'	,	'N'         ,	'> [num] returns 1 or 0 if N is a whole number',    
			 '✓'   	,	'isFloat   		'	,	'N'         ,	'> [num] returns 1 or 0 if N is float',    
			 '✓'   	,	'isArray   		'	,	'N'         ,	'> [num] returns 1 or 0 if N is array',    
			 '✓'   	,	'isObject  		'	,	'N'         ,	'> [num] returns 1 or 0 if N is object',    
			 '✓'   	,	'isODD    		'	,	'N'         ,	'> [num] returns 1 or 0 if N is odd',    
			 '✓'   	,	'isEVEN    		'	,	'N'         ,	'> [num] returns 1 or 0 if N is even',    
			 '✓'   	,	'invert    		'	,	'N'         ,	'> [num] converts -N to N, and N to -N',    
			 '✓'   	,	'Abs    		'	,	'N'         ,	'> [num] Non-negative value of N',    
			 '✓'   	,	'Exp    		'	,	'N'         ,	'> [num] Exponential function of N',    
			 '✓'   	,	'Log    		'	,	'N'         ,	'> [num] Logarithm value of N',    
			 '✓'   	,	'Floor  		'	,	'N'         ,	'> [num] Rounds N down',    
			 '✓'   	,	'Sin    		'	,	'N'         ,	'> [num] Sine function of N',    
			 '✓'   	,	'Cos    		'	,	'N'         ,	'> [num] Cosine function of N',    
			 '✓'   	,	'Tan    		'	,	'N'         ,	'> [num] Tangent function of N',    
			 '✓'   	,	'Ceil			'	,  	'N'         ,	'> [num] Rounds N up',    
			 '✓'   	,	'CoTan			'	,	'N'         ,	'> [num] Cotangent function of N',    
			 '✓'   	,	'Rand	        '	,  	'N'         ,	'> [num] Random float between 0 and N',    
			 '✓'  	,	'Dice	        '	,  	'N'         ,	'> [num] Random int between 0 and N', 
			 '✓'   	,	'Substr			' 	,	'S,B [,X]'	,	'> [str] cuts S from B [to X length (optional)]',   
			 '✓'   	,	'Asc	        '	,  	'C'			,	'> [num] ascii value of C char ',   
			 '✓'   	,	'Chr	        '	,  	'N'			,	'> [str] char of ascii value N ',   
			 '✓'   	,	'InStr	      	'	,	'H,N'		,	'> [num] start position of N in H ' ,   
			 '✓'   	,	'Strepl   		' 	,	'H,N [,R]'	,	'> [str] Replaces N in H [with R (optiona)] ' ,   
			 '✓'   	,	'Upper	 	  	'	,	'S'			,	'> [str] S in uppercase ' ,   
			 '✓'   	,	'Lower	      	'	,	'S'			,	'> [str] S in lowercase ' ,   
			 '✓'   	,	'Repeat	      	'	,	'S,N'		,	'> [str] Repeat S, N times' ,   
			 '✓'   	,	'Power	      	'	,	'N,P'		,	'> [num] N raised to power P ' ,   
			 '✓'   	,	'Sqrt		    '	,  	'N'			,	'> [num] square root of N ' ,   
			 '?' 	,	'Rem    		' 	,	'H,N'		,	'> [str] returns regex N from H ' ,  
			 '✓' 	,	'Repl       	'	,  	'H,N,R [,Rec]'		,	'> [str] replaces regex N with R in H, [Rec = 1 to replace every match, not just the first] ' ,    
			 '!'   	,	'Grep	        '	,  	'P,T'		,	'> [str] returns lines containing P from T ' ,  
			 '!'   	,	'Trunc	      	'	,	'N,S'		,	'> [num] returns float N to S decimal places ' ,  
			 '✓'   	,	'StrSplit	    '	,  	'H,N'		,	'> [arr] splits H by N char' ,  
			 '✓'  	,	'FRead	        '	,  	'F'			,	'> [str] reads F path file contents ' ,    
			 '✓'  	,	'StrMid	    	' 	,	'S'			,	'> [num] midpoint of S ' ,    
			 '✓'  	,	'Occur      	'	,  	'H,N [,T]'	,	'> [num] number of N in H, [T = search mode (optional)] ' ,    
			 '!!!' 	,	'Justify	    '	,  	'S,T,W'		,	'> [str] aligns S to T (Lft/Ctr/Rgt) and W width ' ,    
			 '✓'  	,	'LastOcc    	'	,	'N,H [,T]'	,	'> [num] last occurence of N in H, [T = search mode (optional)] ' ,    
			 '!'   	,	'StrClean	    '	,  	'S [,M]'	,	'> [str] cleans S, [M = clean mode (optional)] ' ,  
			 '✓'   	,	'FDelete		' 	,	'P'			,	'> [|||] deletes file at P path' ,   
			 '✓'   	,	'FWrite	     	'	,	'D,P'		,	'> [|||] writes data D at path P ' ,   
			 '✓'   	,	'FAppend		' 	,	'D,P'		,	'> [|||] appends data D to file P ' ,   
			 '✓'  	,	'TreePrint	  	'	,	'A'			,	'> [|||] prints an array in pretty tree print ' ,    
			 '✓'  	,	'Pcof	      	'	,	'P,W'		,	'> [num] what percent P is of W' ,    
			 '✓'  	,	'Pct	      	'	,	'P,N'		,	'> [num] what N percent of P is' ,    
			 '✓'  	,	'PcChange      	'	,	'O,N'		,	'> [num] percent change between O and N ' , 
			 '✓'  	,	'AddPc	      	'	,	'N,P'		,	'> [num] adds P percent to N ' ,    
			 '✓'  	,	'SubPc	      	'	,	'N,P'		,	'> [num] subs P percent from N ' ,    
			 '✓'  	,	'Input	      	'	,	'S'			,	'> [str] prompts S and waits input' ,    
			 '✓'  	,	'Sleep	      	'	,	'N'			,	'> [|||] sleeps N ms ' ,   
			 '✓'  	,	'Count	      	'	,	'A'			,	'> [num] returns element count of A ' ,   
			 '✓'  	,	'Maxindex	   	'	,	'A'			,	'> [num] returns max index of A ' ,   
			 '✓'  	,	'Slice		   	'	,	'A,s,e'		,	'> [arr] returns elements between S and E' ,   
			 '✓'  	,	'Join		   	'	,	'A,D'		,	'> [str] joins elements from A with D delimeter' ,   
			 '✓'  	,	'Flatten		'	,	'A'			,	'> [arr] Flattens A array' ,   
			 '✓'  	,	'Push			'	,	'A,E'		,	'> [arr] Pushes E to A array' ,   
			 '✓'  	,	'Purge			'	,	'A'			,	'> [arr] recursively purges A of blank entries' ,   
			 '✓'  	,	'Vars	      	'	,	'N'			,	'> [|||] prints the current var stack ' ,    
			 '✓'  	,	'Scope	      	'	,	'N'			,	'> [|||] prints the vars in the current scope ' ,    
			 '✓'  	,	'Funcs	      	'	,	'N'			,	'> [|||] why are you here ' ,    
			 '✓'  	,	'Credits	    '	,  	'N'			,	'> [|||] shows the great people who made this peice of crap' ,
			 '✓'  	,	'ToHex			'	,	'V'		,	'> [str] V as hex, numbers by value and strings by char' ,
			 '✓'  	,	'FromHex			'	,	'S'		,	'> [num] hex string S back to a number' ,
			 '✓'  	,	'ToBin			'	,	'N'		,	'> [str] N as a binary string' ,
			 '✓'  	,	'FromBin			'	,	'S'		,	'> [num] binary string S back to a number' ,
			 '✓'  	,	'ToString		'	,	'V'		,	'> [str] V as a string, objects come back as json' ,
			 '✓'  	,	'ToNum			'	,	'V'		,	'> [num] V as a number, 0 if it isnt one' ,
			 '✓'  	,	'Uppercase		'	,	'S'		,	'> [str] S in uppercase' ,
			 '✓'  	,	'Lowercase		'	,	'S'		,	'> [str] S in lowercase' ,
			 '✓'  	,	'Type			'	,	'V'		,	'> [str] int/float/string/boolean/array/object/null/undefined of V' ,
			 '✓'  	,	'Trim			'	,	'S [,C]'		,	'> [str] trims whitespace [or any char in C] off both ends' ,
			 '✓'  	,	'Reverse			'	,	'V'		,	'> [any] reverses a string or an array' ,
			 '✓'  	,	'Contains		'	,	'H,N'		,	'> [num] 1 or 0 if N is inside H' ,
			 '✓'  	,	'StartsWith		'	,	'H,N'		,	'> [num] 1 or 0 if H starts with N' ,
			 '✓'  	,	'EndsWith		'	,	'H,N'		,	'> [num] 1 or 0 if H ends with N' ,
			 '✓'  	,	'Pad				'	,	'S,W [,C,D]'		,	'> [str] pads S to W wide [with C, D = L/C/R]' ,
			 '✓'  	,	'Keys			'	,	'O'		,	'> [arr] keys of object O' ,
			 '✓'  	,	'Values			'	,	'O'		,	'> [arr] values of object O' ,
			 '✓'  	,	'Sort			'	,	'A [,D]'		,	'> [arr] sorts A, numeric when it can [D for descending]' ,
			 '✓'  	,	'Unique			'	,	'A'		,	'> [arr] A with the duplicates dropped' ,
			 '✓'  	,	'Sum				'	,	'A'		,	'> [num] adds every element of A' ,
			 '✓'  	,	'Min				'	,	'A'		,	'> [num] smallest element of A' ,
			 '✓'  	,	'Max				'	,	'A'		,	'> [num] largest element of A' ,
			 '✓'  	,	'Avg				'	,	'A'		,	'> [num] mean of A' ,
			 '✓'  	,	'Json			'	,	'V [,I]'		,	'> [str] V as json [I = indent width]' ,
			 '✓'  	,	'Parse			'	,	'S'		,	'> [any] json string S back into a real value' ,
			 '✓'  	,	'Now				'	,	'/'		,	'> [num] milliseconds since epoch' ,
			 '✓'  	,	'Date			'	,	'[N]'		,	'> [str] iso date of N [or right now]' ,
			 '✓'  	,	'Env				'	,	'[S]'		,	'> [any] env var S, or the whole environment' ,
			 '✓'  	,	'Use				'	,	'M'		,	'> [str] requires node module M and hangs it off a var' ,
			 '✓'  	,	'Exec			'	,	'S'		,	'> [any] parses and runs S as coyote in this scope' ,
			 '✓'  	,	'Solve			'	,	'V'		,	'> [any] forces a pending var chain to work itself out' ,
			 '✓'  	,	'Tree			'	,	'V'		,	'> [|||] prints the pending AST behind a var' ,
			 '✓'  	,	'Mod			'	,	'N,D'		,	'> [num] remainder of N divided by D (there is no % operator)' ,
			 '✓'  	,	'Sign			'	,	'N'		,	'> [num] -1, 0 or 1 depending on the sign of N' ,
			 '✓'  	,	'Clamp			'	,	'N,Min,Max'		,	'> [num] N pinned between Min and Max' ,
			 '✓'  	,	'RandRange		'	,	'Min,Max'		,	'> [num] random whole number between Min and Max (inclusive)' ,
			 '✓'  	,	'IndexOf		'	,	'A,N'		,	'> [num] index of N in A, or -1 if not found' ,
			 '✓'  	,	'Pop			'	,	'A'		,	'> [any] removes and returns the last element of A' ,
			 '✓'  	,	'Shift			'	,	'A'		,	'> [any] removes and returns the first element of A' ,
			 '✓'  	,	'Unshift		'	,	'A,E'		,	'> [arr] adds E to the front of A' ,
			 '✓'  	,	'Concat			'	,	'A,B'		,	'> [arr] A and B joined into one new array' ,
			 '✓'  	,	'First			'	,	'A'		,	'> [any] first element of A' ,
			 '✓'  	,	'Last			'	,	'A'		,	'> [any] last element of A' ,
			 '✓'  	,	'Shuffle		'	,	'A'		,	'> [arr] A with its elements in random order' ,
			 '✓'  	,	'Left			'	,	'S,N'		,	'> [str] first N chars of S' ,
			 '✓'  	,	'Right			'	,	'S,N'		,	'> [str] last N chars of S' ,
			 '✓'  	,	'Capitalize		'	,	'S'		,	'> [str] S with its first letter uppercase, the rest lowercase' ,
			 '✓'  	,	'HasKey			'	,	'O,K'		,	'> [num] 1 or 0 if object O has key K' ,
			 '✓'  	,	'Merge			'	,	'O1,O2'		,	'> [obj] O1 and O2 combined, O2 wins on key conflicts' ,
			 '✓'  	,	'IsEmpty		'	,	'V'		,	'> [num] 1 or 0 if V (string/array/object) is empty' ,
			 '✓'  	,	'IsNull		'	,	'V'		,	'> [num] 1 or 0 if V is null, undefined or a variable that was never set' ,
			 '✓'  	,	'Default		'	,	'V,D'		,	'> [any] V, or D if V is null, undefined or a variable that was never set' ,
			 '✓'  	,	'Entries		'	,	'V'		,	'> [arr] [key, value] pairs of an object, array or string' ,
			 '✓'  	,	'OnError		'	,	'F'		,	'> [str] registers F (a function name) as the handler for an uncaught error' ,
			 '✓'  	,	'Assert		'	,	'C [,M]'	,	'> [num] throws [M or a default message] if C is falsy, else 1'
			])], 3));
	}
	generateFuncs(arr) {
		let numColumns = 4
		const rows = [];
		const cols = [];
		for (let i = 0; i < arr.length; i += numColumns) {
			rows.push(arr.slice(i, i + numColumns));
		}
		for (let i = 0; i < rows.length; i++) {
			cols.push(chalk.gray('  [') + (rows[i][0] === '!!!' ? chalk.red(String(rows[i][0]).trim()) : rows[i][0] === '?' ? chalk.cyan(String(rows[i][0]).trim()) : rows[i][0] === '✓'  ? chalk.green(String(rows[i][0]).trim()) : chalk.red(String(rows[i][0]).trim())) +  chalk.gray(']') );
			const formattedRow = rows[i][2].replace(/\[([^\]]*)\]/g, (match, p1) => {
			  return chalk.yellowBright(`[${p1}]`);
			});
			cols.push(chalk.blueBright(String(rows[i][1]).trim()) + chalk.gray('(') + chalk.cyanBright(formattedRow) + chalk.gray(') { '));
			const formattedRow3 = rows[i][3].replace(/\[([^\]]*)\]/g, (match, p1) => {
			  return chalk.yellowBright(`[${p1}]`);
			});
			cols.push(chalk.yellow(formattedRow3));	
		}
		return cols
		
	}
	stripAnsiCodes(str) {
		return str.replace(/\x1b\[[0-9;]*m/g, '');
	}
	justifyColumns(strings, numColumns) {
		const rows = [];
		for (let i = 0; i < strings.length; i += numColumns) {
			rows.push(strings.slice(i, i + numColumns));
		}
		const columnWidths = [];
		for (let col = 0; col < numColumns; col++) {
			let maxWidth = 0;
			for (let row of rows) {
				if (row[col]) {
					const plainText = this.stripAnsiCodes(row[col]);
					maxWidth = Math.max(maxWidth, plainText.length);
				}
			}
			columnWidths.push(maxWidth);
		}
		const justifiedRows = rows.map(row => {
			return row.map((item, index) => {
				const width = columnWidths[index] || 0;
				const plainText = this.stripAnsiCodes(item);
				return item.padEnd(width + (item.length - plainText.length), ' ');
			}).join(' | ');
		});

		return justifiedRows.join('\n');
	}
	getFunctionName() {
		if (debuglogtier>3) {
			const error = new Error();
			const stack = error.stack.split("\n");
			const functionName = stack[2]?.match(/at (\S+)/)?.[1] || "anonymous";
			return functionName;
		}
    }
	print(str){
		if (debuglogtier>3) {
			console.log(str)
		}
		
	}
}

class ErrorHandler {
	constructor(fileContent) {
		this.fileContent = fileContent;
		this.lines = fileContent.split('\n');
		this.consoleWidth = Math.floor(process.stdout.columns * 0.8);
	}


drawBox(title, content, boxWidth, color) {
  let Hue = color ? chalk[color] : chalk.white;
  let borderTopLeft = '┌';
  let borderTopRight = '┐';
  let borderBottomLeft = '└';
  let borderBottomRight = '┘';
  let borderHorizontal = '─';
  let borderVertical = '│';
  let padding = 2;

  let lines = content.split('\n').map(line => line.replace(/\t/g, '    '));

  function stripChalk(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  let maxLength = 0;
  lines.forEach(line => {
    let strippedLine = stripChalk(line);
    if (strippedLine.length > maxLength) {
      maxLength = strippedLine.length;
    }
  });
    let maxLengthRaw = 0;
  lines.forEach(line => {
    if (line.length > maxLength) {
      maxLengthRaw = line.length;
    }
  });

  maxLength = maxLength + 6;
  maxLengthRaw = maxLengthRaw + 6;
  let contentWidth = maxLength + padding * 2 - 2;

  const titleLine = `${borderTopLeft}─${title} ${borderHorizontal.repeat(contentWidth - title.length - 3)}${borderTopRight}`;

  const paddedContent = lines.map(line => {
    if (line.length > contentWidth - padding * 2) {
      line = line.slice(0, maxLengthRaw - padding * 2);
    }

    let leftPadding = ' '.repeat(padding);
    let rightPadding = ' '.repeat(contentWidth - stripChalk(line).length - padding * 2 + 1);

    let contentline = `${Hue(borderVertical)}${leftPadding}${line}${rightPadding}${Hue(borderVertical)}`;
    return contentline;
  }).join('\n');

  const borderBottom = `${borderBottomLeft}${borderHorizontal.repeat(titleLine.length - 2)}${borderBottomRight}`;

  return `${Hue(titleLine)}\n${paddedContent}\n${Hue(borderBottom)}`;
}
  
	extractPosFromError(errorMessage) {
		const posRegex = /pos\((\d+)\)/;
		const match = errorMessage.match(posRegex);
		if (match) {
			return parseInt(match[1], 10);
		} else {
			return null;
		}
	}
	getPosWithinLine(pos) {
		let charCount = 0;
		for (let i = 0; i < this.lines.length; i++) {
			for (let j = 0; j < this.lines[i].length; j++) {
				if (charCount === pos) {
					return j;
				}
				charCount++;
			}
			if (charCount === pos) {
				return this.lines[i].length;
			}
			charCount++;
		}
		throw new Error("Position out of bounds");
	}
	getContextLines(pos) {
	  const lineNumber = this.getLineFromPos(pos);
	  if (lineNumber === -1) {
		return { prev: null, current: { line: '' }, next: null };
	  }

	  const prevLine = lineNumber > 0 ? this.lines[lineNumber - 1] : null;
	  const currentLine = this.lines[lineNumber];
	  const nextLine = lineNumber < this.lines.length - 1 ? this.lines[lineNumber + 1] : null;

	  return { prev: prevLine, current: { line: currentLine }, next: nextLine };
	}

	getLineFromPos(pos) {
		let charCount = 0;
		for (let i = 0; i < this.lines.length; i++) {
			charCount += this.lines[i].length + 1;
			if (charCount > pos) {
				return i;
			}
		}
		return -1;
	}
	trunc(string) {
		const visibleWidth = Math.floor((process.stdout.columns || 80) * 0.7) - 2;
		if (string.length > visibleWidth) {
			return string.slice(0, visibleWidth) + ' ...';
		}
		return string;
	}
	truncrep(context, ch) {
		const visibleWidth = Math.floor(process.stdout.columns * 0.85); // 85% of console width
		const halfWidth = Math.floor(visibleWidth / 2);
		let start = Math.max(0, ch - halfWidth);
		let end = start + visibleWidth;
		if (end > context.current.line.length) {
			end = context.current.line.length;
			start = Math.max(0, end - visibleWidth);
		}
		const Line = context.current.line.slice(start, end);
		const splitOffset = 0;
		const adjustedCh = ch + splitOffset;
		const safeCh = Math.max(start, Math.min(adjustedCh, end));
		const beforeCh = chalk.green(Line.slice(0, safeCh - start));
		const afterCh = chalk.red(Line.slice(safeCh - start));
		// under 5 in it goes off the left of the box, so the rest of the spaces come off the front instead
		const pointerPosition = (ch - start) - 5;
		const pointer = ' '.repeat(Math.max(pointerPosition, 0)) + '^';
		return { Line: String(beforeCh + afterCh), pointer, pointerPosition };
	}

  handleError(error) {
	// only parser errors have a statement, the rest get the message, the line and the calls
	if (!error || typeof error.statement !== 'string' || error.inExec) {
		return this.handleRuntimeError(error);
	}
	// if drawing the parser error goes wrong, the error itself still gets shown
	try {
		this.handleParserError(error);
	} catch (err) {
		this.handleRuntimeError(error);
	}
  }
	handleParserError(error) {
	const strippedStatement = this.uStrip(error.statement);
	const match = strippedStatement.match(/^L(\d+):/);
	if (!match) {
		this.handleRuntimeError(error);
		return;
	}
	const ln = parseInt(match[1], 10);
	const pos = error.position
	if (pos !== null) {
		const context = this.getContextLines(pos);
		const ch = this.getPosWithinLine(pos);
		context.center = this.truncrep(context, ch);
		const truncatedPrev = context.prev ? this.trunc(`ln ${ln-1} ${context.prev}`) : '';
		const truncatedCurrent = context.current.line ? this.trunc(`ln ${ln} ${context.current.line}`) : '';
		const truncatedNext = context.next ? this.trunc(`ln ${ln+1} ${context.next}`) : '';
		const contextContent = [
		truncatedPrev,
		truncatedCurrent,
		truncatedNext,
		].join('\n');
		const errorContent = [
		  `${chalk.gray("ln" + ln + ":")} ${context.center.Line}`,
		  `${' '.repeat(String(ln).length + 8 + Math.min(context.center.pointerPosition, 0))} ${context.center.pointer} char: ${ch} | ln: ${ln}`,
		  `${error.summary}`,
		].join('\n');

		const contextBox = this.drawBox('Context', contextContent, 0, "blue");
		const errorBox = this.drawBox('Error', errorContent, 0, "red");

		//console.log(contextBox);
		console.log(errorBox);
	} else {
		console.log(chalk.red('Error: Position not found'));
	}
  }
	// anything that isn't a parser error: the message, where it happened and the calls it happened inside
	handleRuntimeError(error) {
		const lines = [(error && (error.summary || error.message)) || String(error)];
		if (error && error.line !== undefined) {
			const source = error.inExec ? undefined : this.lines[error.line - 1];
			lines.push('', `ln ${error.line}, col ${error.col}` + (error.inExec ? ' (inside Exec)' : source === undefined ? '' : '  ' + source.replace(/\r$/, '').trim()));
			const frames = (error.frames || []).slice().reverse();
			for (const frame of frames.slice(0, 8)) {
				lines.push(`in ${frame.name}${String(frame.name).startsWith('new ') ? '' : '()'} called at ln ${frame.line}`);
			}
			if (frames.length > 8) {
				lines.push(`... ${frames.length - 8} more`);
			}
		} else if (error && typeof error.statement === 'string') {
			lines.push('', this.uStrip(error.statement), this.uStrip(error.loc));
		} else if (error && error.stack) {
			lines.push('', ...String(error.stack).split('\n').slice(1, 5).map(l => l.trim()));
		}
		console.log(this.drawBox('Error', lines.join('\n'), 0, 'red'));
	}
	uStrip(str = '') {
    return (str || '').replace(/\u001b\[[0-9;]*[mG]/g, '');
}
	extractCoreErrorMessage(errorMessage) {
		const coreMessageRegex = /^([^\n]+?)(?=\n|L\d+:|$)/;
		const match = errorMessage.match(coreMessageRegex);
		if (match) {
			return match[1].trim();
		} else {
			return errorMessage.trim();
		}
	}
}

// runs a string of coyote and gives back what the script returned, or else what its last statement gave
async function run(code, options = {}) {
	const executor = new ASTExecutor(null, true);
	const script = options.script ? path.resolve(options.script) : "";
	const results = await executor.run(new CoyoteParser(code).parse(), { source: code, ...options, script });
	return executor.returning ? executor.returned : results[results.length - 1];
}
module.exports = { ASTExecutor, CoyoteParser, ErrorHandler, run };

if (!isMainThread) {
	// a worker for its share of the startup assertions
	new ASTExecutor(null, true).verifyInternalFunctions(workerData.part, workerData.parts).then(
		() => parentPort.postMessage({ ok: true }),
		(error) => parentPort.postMessage({ ok: false, message: String(error.message || error) }));
} else if (require.main === module) {

if (process.argv.length < 3) {
    console.error('Usage: node coyote.js <file_path>');
    process.exit(1);
}

const filePath = process.argv[2];
const fileContent = fs.readFileSync(filePath, 'utf8');
const errorHandler = new ErrorHandler(fileContent);
process.on('uncaughtException', (error) => {
  errorHandler.handleError(error);
});
process.on('unhandledRejection', (error) => {
  errorHandler.handleError(error);
});


console.time();
const parser = new CoyoteParser(fileContent);
const r = parser.parse();
console.timeEnd();
console.log(r)
console.log(print_Coyote_tree(r));
fs.writeFileSync('output.txt', JSON.stringify(r, null, 2));
const executer = new ASTExecutor()
executer.verified.then(() => executer.run(r))
}