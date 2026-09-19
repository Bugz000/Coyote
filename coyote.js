const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const readlineSync = require('readline-sync');
const { performance } = require('perf_hooks');

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
const debuglogtier = -1
const VARIABLE = new RegexToken(/[a-zA-Z_][a-zA-Z0-9_]*/);
const OPERATOR_TERNARY_IF = new StringToken('?', 'Begins the true-branch of a ternary expression');
const OPERATOR_TERNARY_ELSE = new StringToken(':', 'Separates the true and false branches of a ternary expression');
const OPERATOR_OR = new StringToken('||', 'Logical OR');
const OPERATOR_AND = new StringToken('&&', 'Logical AND');
const OPERATOR_EQUAL = new RegexToken(/==|=/, 'Equality comparison');
const OPERATOR_NOT_EQUAL = new RegexToken(/!==|!=/, 'Inequality comparison');
const OPERATOR_LESS = new StringToken('<', 'Less-than comparison');
const OPERATOR_LESS_EQUAL = new StringToken('<=', 'Less-than-or-equal comparison');
const OPERATOR_GREATER = new StringToken('>', 'Greater-than comparison');
const OPERATOR_GREATER_EQUAL = new StringToken('>=', 'Greater-than-or-equal comparison');
const OPERATOR_CONCAT = new RegexToken(/\.|[ \t]+/, 'Joins two values into a string, via `.` or plain whitespace');
const OPERATOR_BITWISE_AND = new StringToken('&', 'Bitwise AND');
const OPERATOR_BITWISE_OR = new StringToken('|', 'Bitwise OR');
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
const LITERAL_NUMBER = new RegexToken(/-?[0-9]+(\.[0-9]+)?/, 'Numeric literal, e.g. `42` or `3.14`');
const LITERAL_BOOLEAN = new RegexToken(/(true|false)\b/i, 'Boolean literal, `true` or `false` (case-insensitive)');
const LITERAL_STRING = new RegexToken(/"[^"]*"/, 'Double-quoted string literal');
const KEYWORD_IF = new RegexToken(/if\b/i, 'Begins a conditional statement');
const KEYWORD_ELSE = new RegexToken(/else\b/i, 'Begins the alternate branch of a conditional statement');
const KEYWORD_LOOP = new RegexToken(/loop\b/i, 'Begins a loop statement');
const KEYWORD_in = new RegexToken(/in\b/i, 'Introduces the collection in a for-in loop');
const KEYWORD_FOR = new RegexToken(/for\b/i, 'Begins a for-in loop');
const KEYWORD_BREAK = new RegexToken(/break\b/i, 'Exits the innermost loop immediately');
const KEYWORD_CONTINUE = new RegexToken(/continue\b/i, 'Skips to the next iteration of the innermost loop');
const KEYWORD_RETURN = new RegexToken(/return\b/i, 'Returns a value from a function');
const KEYWORD_CLASS = new RegexToken(/class\b/i, 'Begins a class definition');
const KEYWORD_NEW = new RegexToken(/new\b/i, 'Constructs a new instance of a class');
const OPERATOR_HASH = new StringToken('#', 'Begins a top-of-script directive - #Name(args)');
const LINE_COMMENT = new RegexToken(/;[^\r\n]*/);
const WHITESPACE = new RegexToken(/[ \t]+/);
const NEWLINE = new RegexToken(/\r?\n/);
var ItemType;
(function(ItemType) {
	// Statements
	ItemType[ItemType["ASSIGNMENT"] = 0] = "ASSIGNMENT";
	ItemType[ItemType["IF"] = 1] = "IF";
	ItemType[ItemType["LOOP"] = 2] = "LOOP";
	ItemType[ItemType["FOR"] = 31] = "FOR";
	ItemType[ItemType["BREAK"] = 32] = "BREAK";
	ItemType[ItemType["RETURN"] = 3] = "RETURN";
	ItemType[ItemType["FUNCTION_DEFINITION"] = 4] = "FUNCTION_DEFINITION";
	ItemType[ItemType["STATEMENT_MAX"] = 5] = "STATEMENT_MAX";
	// Both Statement and Expression
	ItemType[ItemType["FUNCTION_CALL"] = 6] = "FUNCTION_CALL";
	// Expressions
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
		token: OPERATOR_BITWISE_AND,
		type: ItemType.BITWISE_AND
	}, {
		token: OPERATOR_BITWISE_OR,
		type: ItemType.BITWISE_OR
	}, {
		token: OPERATOR_BITWISE_XOR,
		type: ItemType.BITWISE_XOR
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
	[{
		token: OPERATOR_EQUAL,
		type: ItemType.EQUALS
	}, {
		token: OPERATOR_NOT_EQUAL,
		type: ItemType.NOT_EQUALS
	}, ],
];
/** Token that matches when position is at the end of the input. */
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
			.or(() => this.parse_statement_return())
			.or(() => this.parse_statement_break())
			.or(() => this.parse_statement_directive())
			.or(() => this.parse_statement_class_definition())
			.or(() => this.parse_statement_assignment())
			.or(() => this.parse_statement_function_definition())
			.or(() => this.parse_expression_function_call())
			.or(() => this.parse_expression_base())
		this.parse_eol();
		// This is jank but it prevents an infinite loop if a statement doesn't parse
		if (this.position === start) {
			throw Object.assign(
				new Error(),
				{
					summary: "Failed to parse statement.",
					source: "parser",
					position: this.position,
					statement: this.print_current_position()[0], // Include only the necessary data
					loc: this.print_current_position()[1], // Include only the necessary data
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
	// %name% or %(expr)% - dynamic var lookup by name. %name% is the "look
	// up the value X points at" version: X's own value gets read once (the
	// normal variable lookup), then read AGAIN using that as the var name -
	// two lookups total, which is the whole "double deref" of it. %(expr)%
	// is the same trick but with the target name coming from any expression
	// instead of a bare variable, so foo/bar/whatever can be built on the fly
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
	// new ClassName(args) - constructs an instance and runs __init if the
	// class defines one. same param-list parsing as a function call/def
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

		// Parse the base object which should be a variable
		const object = lookahead_parser.scan(VARIABLE);
		if (object.not_found()) {
			return this.not_found();
		}

		// Parse the member access expression (e.g., `push`)
		const member_access = lookahead_parser.parse_member_access_expression();
		if (member_access.not_found()) {
			return this.not_found();
		}

		// Parse the method call expression
		const method_call = lookahead_parser.parse_method_call_expression();
		if (method_call.not_found()) {
			return this.not_found();
		}

		// Synchronize the state of the parser
		this.sync_to(lookahead_parser);

		return this.found({
			type: ItemType.METHOD_CALL,
			object: object.get(),
			method: member_access.get(),  // Using the member access for method name
			arguments: method_call.get()
		});
	}
	parse_statement_assignment() {
		this.log('parse_statement_assignment');
		const lookahead_parser = this.copy();
		const varname = lookahead_parser.scan(VARIABLE);
		// Consider blocking keywords (if, else, etc) here
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
	parse_statement_for() {
		if (this.scan(KEYWORD_FOR).not_found()) {
			return this.not_found();
		}
		const count = this.parse_expression().or_else_throw('Expected arr after for');
		this.scan(OPERATOR_COMMA).or_else_throw('incomplete FOR statement');
		this.scan(WHITESPACE);
		
		this.parse_eol();
		const statements = this.parse_block_or_statement().or_else_throw('Expected statement or block after loop');
		return this.found({
			type: ItemType.LOOP,
			count,
			statements
		}).or_else_throw(`Invalid use of LOOP.`);
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
	parse_statement_break() {
		if (this.scan(KEYWORD_BREAK).not_found()) {
			return this.not_found();
		}
		return this.found({type: ItemType.BREAK});
	}
	parse_statement_function_definition() {
		this.log('parse_statement_function_definition');
		const lookahead_parser = this.copy();
		const funcname = lookahead_parser.scan(VARIABLE);
		// Consider blocking keywords (if, else, etc) here
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
			// Check for the optional `:=` default value operator
			if (lookahead_parser.scan(OPERATOR_ASSIGN).found()) { // Assuming := is defined as OPERATOR_ASSIGN
				lookahead_parser.scan(WHITESPACE);
				default_value = lookahead_parser.parse_expression();  // Assuming parse_expression handles the default value parsing
				if (default_value.not_found()) {
					return this.not_found();
				}
			}
			// Store the parameter and its default value
			params.push({
				name: param_name.get(),
				default_value: default_value ? default_value.get() : null  // If no default, store null
			});
			lookahead_parser.scan(WHITESPACE);
			// Continue if a comma is found, otherwise stop
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
	// #Name(args) - a top-of-script switch, same idea as AHK's #directives.
	// picked up on the same pre-scan pass that finds functions/classes and
	// applied before the script's real statements ever run
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
	// class Name { __init(params) {...} func(args) {...} } - a class body is
	// just a block of function definitions, so parse_block() already does
	// all the real work here; this just sorts what it hands back by name
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
		// items, etc) used to just blow up the parser. try it as an
		// assignment first and fall through to the normal expression
		// chain if there's no ':=' waiting after the variable
		const assign = this.parse_expression_assignment();
		if (assign.found()) {
			return assign;
		}
		const expr = this.parse_binary_op(0);
		this.scan(WHITESPACE);
		//console.log(expr)
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
		const left = op_index === 2 ? this.parse_operator_concat() : has_ops_left ? this.parse_binary_op(op_index + 1) : this.parse_unary_expression();
		if (has_ops_left && left.found()) {
			for (const op of BINARY_OP_PRECEDENCE[op_index]) {
				const lookahead_parser = this.copy();
				lookahead_parser.scan(WHITESPACE);
				if (lookahead_parser.scan(op.token).found()) {
									//console.log(op)
					this.sync_to(lookahead_parser);
					this.scan(WHITESPACE);
					return this.found({
						type: op.type,
						left: left.get(),
						right: this.parse_binary_op(op_index).or_else_throw(`Expected expression after '${op.token}'`),
					});
				}
			}
		}
		return left;
	}
	parse_operator_concat() {
		const left = this.parse_binary_op(3);
		if (left.found()) {
			const lookahead_parser = this.copy();
			const concat_op = lookahead_parser.scan(OPERATOR_CONCAT);
			if (concat_op.found()) {
				// If op is '.', we must find another expression.
				// If op is space, it doesn't mean this is concat. It could just be a stray space at the end the expression.
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

		// Delegate to primary literals, member access, and method calls
		return this.parse_expression_base();
	}
	parse_expression_function_call() {
		this.log('parse_expression_function_call');
		const lookahead_parser = this.copy();
		const funcname = lookahead_parser.scan(VARIABLE);
		// Consider blocking keywords (if, else, etc) here
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
			// Keep going only if we find a comma
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
		// '(' expression ')'
		if (this.scan(OPERATOR_LPAREN).found()) {
			const expr = this.parse_expression().or_else_throw(`Expected expression after '('`);
			this.scan(OPERATOR_RPAREN).or_else_throw(`Expected ')' after expression`);
			return this.found(expr);
		}
		const number = this.scan(LITERAL_NUMBER);
		if (number.found()) {
			return this.found({
				type: ItemType.LITERAL,
				value: +number.get(),
			});
		}
		const boolean = this.scan(LITERAL_BOOLEAN);
		if (boolean.found()) {
			return this.found({
				type: ItemType.LITERAL,
				value: boolean.get() === 'true',
			});
		}
		const string = this.scan(LITERAL_STRING);
		if (string.found()) {
			return this.found({
				type: ItemType.LITERAL,
				value: string.get(),
			});
		}
		//if (this.loopmode == true) {
			return this.parse_expression_function_call().or(() => this.parse_expression_array()).or(() => this.parse_expression_object()).or(() => this.parse_expression_incdec()).or(() => this.parse_expression_deref()).or(() => this.parse_expression_new()).or(() => this.parse_expression_variable())
		//} else {
		//	console.log(this.loopmode)
		//	return this.parse_expression_function_call().or(() => this.parse_expression_variable());
		//}
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

		// Arrays can break across lines, so skip any whitespace, comments and
		// newlines sitting between the bracket/comma and the next item.
		const skip_array_trivia = () => {
			while (this.scan(WHITESPACE).found() || this.scan(LINE_COMMENT).found() || this.scan(NEWLINE).found()) {}
		};
		skip_array_trivia();

		// Early return for empty arrays `[]`
		if (this.scan(OPERATOR_RBRACKET).found()) {
			return this.found({
				type: ItemType.ARRAY,
				items
			});
		}

		while (true) {
			skip_array_trivia();
			// Delegate all array items (values, expressions, nested arrays) to parse_expression()
			const value = this.parse_expression();
			if (value.not_found()) {
				throw new Error(`Expected value or expression in array`);
			}
			
			items.push(value.get());
			skip_array_trivia();

			// Continue loop only if a comma separates elements
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
		// `x.foo`
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
				// Keep going only if we find a comma
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
			// Keep going only if we find a comma
			keep_going = this.scan(OPERATOR_COMMA).found();
		}
		this.scan(WHITESPACE);
		this.scan(OPERATOR_RPAREN).or_else_throw(`Expected ')' after method call`);
		return this.found(params);
	}
	parse_eol() {
		this.scan(WHITESPACE);
		this.scan(LINE_COMMENT);
		// comma-separated statements on one line: var := 5, var2 := 10, var3 := 30
		// reuses the same OPERATOR_COMMA token every other comma-separated
		// list (params, arrays, objects) already scans - no new token added
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
	if (s.type === ItemType.LOOP) {
		return {
			name: chalk.cyan(ItemType[s.type]),
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
	if (s.type === ItemType.BREAK) {
		return {
			name: chalk.cyan(ItemType[s.type]),
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
					name: p.name,  // Just the name here
					children: p.default_value !== null ? 
						[{
							name: chalk.gray('default_value'),
							children: [convert_expression(p.default_value)]  // Directly use the converted expression
						}] : []  // No child if no default value
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
		// assignments can live inline now (buf := SubStr(..., pos := ...))
		// so the tree needs to be able to draw one same as convert_statement does
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
	// a var is born from a raw js value, or from another var. either way the
	// value gets parked inside a VALUE node so it sits in the tree exactly
	// like anything the parser would have handed us
	static from(owner, name, value) {
		if (value instanceof CoyoteVar) {
			return new CoyoteVar(owner, name, value.ast);
		}
		return new CoyoteVar(owner, name, { type: ItemType.VALUE, value: value });
	}
	// chaining runs nothing. it grows the tree. the var IS the pending line
	// of code and solve() is what finally dumps it out in whatever format the
	// tail of the chain asked for
	stack(func, params) {
		const nodes = (params || []).map(p => CoyoteVar.from(this.owner, this.name, p).ast);
		return new CoyoteVar(this.owner, this.name, {
			type: ItemType.FUNCTION_CALL,
			name: func,
			params: [this.ast, ...nodes]
		});
	}
	async solve() {
		if (this.ast.type === ItemType.VALUE) {
			this.solved = this.ast.value;
			return this.solved;
		}
		this.solved = await this.owner.execute_ast(this.ast);
		return this.solved;
	}
	// being thenable means `await x.tohex().upper()` just works, and any
	// async path that returns a var unwraps it to the value on its own
	then(good, bad) {
		return this.solve().then(good, bad);
	}
	raw() {
		return this.ast.type === ItemType.VALUE ? this.ast.value : this.solved;
	}
	store(value) {
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
	// every INTERNAL_ the executor owns gets bolted on as a lowercase method,
	// so x.tohex().upper().print() in js builds the identical tree the parser
	// builds for x.tohex().upper().print() in coyote. same road, two doors
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
	constructor(parent = null) {
		this.parent = parent;
		this.vars = {};
		this.returning = false;
		this.returned = undefined;
		this.localfuncvars = {};
		this.functions = parent ? parent.functions : {};
		this.natives = parent ? parent.natives : {};
		this.classes = parent ? parent.classes : {};
		this.settings = parent ? parent.settings : { arrayStartIndex: 0, batchLines: null, batchOps: null };
		this.debug = 11111111111110;
		this.initialising = true;
		this.methods = parent ? parent.methods : Object.getOwnPropertyNames(ASTExecutor.prototype)
            .filter(key => typeof this[key] === 'function' && key !== 'constructor')
            .reduce((map, key) => {
                map[key.toLowerCase()] = key;
                return map;
            }, {});
		// a spawned scope is the same class with a parent bolted on - no
		// asserts, no banner, it just inherits the tables and gets on with it
		if (parent) {
			return;
		}
		CoyoteVar.bind(ASTExecutor.prototype);
		console.log("Verifying asserts")
		this.verifyInternalFunctions()
		console.log("AST Executor Initialised.")
		console.log("Script Start.")
		console.log(" ")
	}
	async make_ast(code) {
		const parser = new CoyoteParser(code);
		const r = parser.parse();
		return r
	}
	async assert_code(ast) {
		// asserts run in their own scope. they fire off unawaited from the
		// constructor so they'd otherwise be writing vars and flags into the
		// same scope the script is busy using
		const statements = (await this.make_ast(ast))['statements']
		if (statements.length === 1) {
			return (await this.spawn().execute_ast(statements[0]))
		}
		// multi-line assertions: run every statement in one shared scope so
		// earlier assignments are visible further down (var := 123 \n print(var)),
		// and capture print() output so it can be asserted on directly
		const scope = this.spawn()
		// settings (things like #ArrayStartIndex) are shared-by-reference
		// from spawn(), same as functions/classes - but unlike those, a
		// directive is meant to be a per-script opt-in, so it gets its own
		// copy here rather than leaking whatever one assertion sets into
		// every assertion that runs after it
		scope.settings = { ...this.settings }
		// same pre-scan run() does for a real script, so a function or class
		// defined earlier in the snippet can be used later in the same snippet
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
	async verifyInternalFunctions() {
		//UNIT TESTS
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
			{ code: 'Cos(a_pi)', expected: -1 }, // was -0.9899924966004454, which only "passed" because Cos used to floor a_pi down to 3 before taking the cosine
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
			{ code: 'isNum("5.5")', expected: 1 }, // isNum() now means "is a number at all" - use isInt() to check for whole numbers specifically
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
			{ code: 'isObject("{}")', expected: 0 }, // gotcha: unlike isArray(), isObject() never parses a string - only real object literals count
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
			{ code: 'Substr("48", 1)', expected: "8" }, // all-digit string - Core() used to coerce this straight to a number and drop .substring
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
			{ code: 'Strepl("abc", ".", "-")', expected: "---" }, // gotcha: find is a raw RegExp source, "." matches ANY char, not a literal dot
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
			{ code: 'Occur("Hello", "L", 2)', expected: 2 }, // gotcha: the 3rd "case-sensitive" arg arrives as a string, N===2 never matches, so this stays case-insensitive
			{ code: 'Occur("abcabcabc", "abc")', expected: 3 },
			{ code: 'Occur("no match", "zzz")', expected: 0 },
			{ code: 'LastOcc("abcabc", "a")', expected: 4 },
			{ code: 'LastOcc("Hello", "L", 2)', expected: 4 }, // gotcha: same N===2 issue as Occur() - 3rd arg is effectively ignored
			{ code: 'LastOcc("no match", "zzz")', expected: 0 },
			{ code: 'Pcof(25, 200)', expected: 12.5 },
			{ code: 'Pcof(0, 100)', expected: 0 },
			{ code: 'Pcof(50, 0)', expected: Infinity }, // gotcha: the "whole === 0" guard never fires (whole arrives as a string), so this returns Infinity instead of the error string
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
			{ code: 'ToString([1,2,3])', expected: "[\"1\",\"2\",\"3\"]" },
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
			{ code: 'Reverse([1,2,3])', expected: ["3", "2", "1"] },
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
			{ code: 'Json([1,2,3])', expected: "[\"1\",\"2\",\"3\"]" },
			{ code: 'Json({"a":"1","b":"2"})', expected: "{\"a\":\"1\",\"b\":\"2\"}" },
			{ code: 'Json("plain")', expected: "\"plain\"" },
			{ code: 'Parse("[1,2,3]")', expected: [1, 2, 3] },
			{ code: 'Parse("not json")', expected: "" },
			{ code: 'Range(0)', expected: [0] },
			{ code: 'Range(3)', expected: [0, 1, 2, 3] },
			{ code: 'Range(2, 5)', expected: [2, 3, 4, 5] },
			{ code: 'Range(5, 2)', expected: [] },
			{ code: 'Slice([1,2,3,4,5], 1, 3)', expected: ["2", "3"] },
			{ code: 'Slice([1,2,3,4,5], 2)', expected: ["3", "4", "5"] },
			{ code: 'Slice("Hello", 1, 3)', expected: "el" },
			{ code: 'Join([1,2,3], "-")', expected: "1-2-3" },
			{ code: 'Join(["a","b","c"], "")', expected: "abc" },
			{ code: 'Flatten([1,[2,3],[4,[5]]])', expected: ["1", "2", "3", "4", ["5"]] },
			{ code: 'Push([1,2], 3)', expected: ["1", "2", "3"] },
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
			{ code: 'Sort([3,1,2])', expected: ["1", "2", "3"] },
			{ code: 'Sort([3,1,2], "D")', expected: ["3", "2", "1"] },
			{ code: 'Sort(["banana","apple","cherry"])', expected: ["apple", "banana", "cherry"] },
			{ code: 'Unique([1,1,2,2,3])', expected: ["1", "2", "3"] },
			{ code: 'Unique(["a","a","b"])', expected: ["a", "b"] },
			{ code: 'Repl("Hello", "l", "L")', expected: "HeLlo" },
			{ code: 'Repl("aaa", "a", "b")', expected: "baa" },
			{ code: 'StrSplit("a,b,c", ",")', expected: ["a", "b", "c"] },
			{ code: 'StrSplit("a-b-c", "-")', expected: ["a", "b", "c"] },
			{ code: 'Justify("Hi", 1, 5)', expected: "Hi   " }, // was "Hi" (unpadded) - only "passed" because the type-mismatched switch was a no-op
			{ code: 'Justify("Hi", 3, 5)', expected: "   Hi" }, // was "Hi", same reason
			{ code: 'Justify("Hi", 2, 6)', expected: "  Hi  " }, // was "Hi", same reason
			{ code: 'StrClean("  a   b  ", 1+0)', expected: "a b" },
			{ code: 'StrClean("  a   b  ", 2+0)', expected: "a b" },
			{ code: 'StrClean("  a   b  ", 3+0)', expected: "ab" },
			{ code: 'Exec("return 1 + 1")', expected: 2 },
			{ code: 'Exec("return 6 * 9")', expected: 54 },
			{ code: 'Contains("hello world", "world")', expected: 1 },
			{ code: 'StartsWith("HELLO", "HE")', expected: 1 },
			{ code: 'Tan(3.14159 / 4)', expected: 0.9999986732059836 }, // was `expected: 1` - close to but not exactly 1, since 3.14159/4 isn't precisely pi/4
			{ code: 'CoTan(30)', expected: 1.7320508075688774 }, // was `CoTan(3.14159 / 4)` expected 1 - Cotan takes degrees only (see Cotan(45) above), so that call was feeding it a radian value by mistake
			{ code: 'isNum(Rand(100))', expected: 1 }, // Rand is non-deterministic, so just check it returns a number
			{ code: 'isNum(Dice(6))', expected: 1 }, // same - Dice is non-deterministic
			{ code: 'Rem("Hello", "e")', expected: [ { match: 'e', pos: 1 } ] },
			{ code: 'Repl("Hello", "l", "x")', expected: 'Hexlo' }, // was `expected: 'Hexxo'` - Repl only replaces the first match (see Repl("Hello","l","L") above)
			{ code: 'Repl("Hello", "l", "x", 1)', expected: 'Hexxo' }, // the 4th param (Recursive) is what actually gets you the all-matches behavior
			{ code: 'Repl("aaa", "a", "b", 1)', expected: 'bbb' },
			{ code: 'Grep("e", "Hello")', expected: ["Hello"] }, // was `Grep("Hello", "e")` expected 1 - args were the wrong way round (Grep(pattern, text)) and 1 isn't a possible return value (Grep returns matching lines)
			{ code: 'StrSplit("Hello,World", ",")', expected: ["Hello", "World"] }, // was `expected: true`, which an array could never equal
			{ code: 'Justify("Hello", 1, 10)', expected: 'Hello     ' }, // was `Justify("Hello", "left", 10)` - the justify type is numeric (1/2/3), not the string "left"
			{ code: 'StrClean("  Hello  ", 1+0)', expected: 'Hello' }, // was missing its required cleaning-level argument
			{ code: 'var := 123\nprint(var)', expected: '123' }, // multi-line: assignment in one statement, read back and printed in the next

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
			{ code: 'x := 2 & 3 | 4\nprint(x)', expected: '2' },
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
			{ code: 'Sort(Unique([3,1,2,1,3]))', expected: ["1", "2", "3"] },
			{ code: 'nums := [5,3,8,1,9]\nprint(Max(nums) - Min(nums))', expected: '8' },

			// values that couldn't be checked with a fixed expected result before multi-line + print existed
			{ code: 'isNum(Ticks())', expected: 1 }, // Ticks is a live counter, so just check it's a number
			{ code: 'isNum(Now())', expected: 1 }, // Now is the current timestamp, so just check it's a number
			{ code: 'Date(0)', expected: '1970-01-01T00:00:00.000Z' },
			{ code: 'Env("DEFINITELY_NOT_A_REAL_ENV_VAR_XYZ123")', expected: '' },
			{ code: 'Sleep(0)', expected: true },
			{ code: 'Purge([1, "", 2, 0, 3])', expected: ["1", "2", "0", "3"] }, // only the empty string gets dropped
			{ code: 'Purge({"a": "", "b": "1"})', expected: { b: '1' } },

			// comma-separated statements on one line: var := 5, var2 := 10, var3 := 30
			{ code: 'var := 5, var2 := 10, var3 := 30\nprint(var + var2 + var3)', expected: '45' },
			{ code: 'x := 1, y := 2\nprint(x)', expected: '1' }, // only the first of a comma-chain should bind here
			{ code: 'x := 1, y := 2\nprint(y)', expected: '2' },
			{ code: 'x := 1,\ny := 2\nprint(x + y)', expected: '3' }, // trailing comma followed by a real newline
			{ code: 'x := 1 , y := 2\nprint(x+y)', expected: '3' }, // whitespace around the comma
			{ code: 'x := 1, y := 2, z := 3\nif (x == 1) { print("yes") }\nprint(y + z)', expected: 'yes\n5' }, // comma-chain followed by unrelated statements still parses fine
			{ code: 'x := 0\nloop (3) { x := x + 1, print(x) }', expected: '1\n2\n3' }, // comma-chain works inside a block, not just top-level
			// comma still means what it always meant everywhere else - params, arrays, objects, defaults
			{ code: 'add(a, b) { return a + b }\nprint(add(3, 4))', expected: '7' },
			{ code: 'arr := [1, 2, 3]\nprint(Sum(arr))', expected: '6' },
			{ code: 'obj := {"a": "1", "b": "2"}\nprint(obj.a . obj.b)', expected: '12' },
			{ code: 'greet(name := "World") { return "Hello " . name }\nprint(greet())', expected: 'Hello World' },

			// Mod / Sign / Clamp / RandRange - there's no % operator in the language at all, and no clamping/sign helpers either
			{ code: 'Mod(7, 3)', expected: 1 },
			{ code: 'Mod(10, 5)', expected: 0 },
			{ code: 'Mod(-7, 3)', expected: -1 }, // JS % semantics - sign follows the dividend, not a "true" always-positive mod
			{ code: 'Sign(-5)', expected: -1 },
			{ code: 'Sign(5)', expected: 1 },
			{ code: 'Sign(0)', expected: 0 },
			{ code: 'Clamp(15, 0, 10)', expected: 10 },
			{ code: 'Clamp(-5, 0, 10)', expected: 0 },
			{ code: 'Clamp(5, 0, 10)', expected: 5 },
			{ code: 'Clamp(5.5, 0, 10)', expected: 5.5 },
			// RandRange is non-deterministic by nature, so this checks the result lands in range rather than pinning an exact value
			{ code: 'x := RandRange(1, 10)\nresult := 0\nif (x >= 1) { if (x <= 10) { result := 1 } }\nprint(result)', expected: '1' },

			// array utilities: IndexOf / Pop / Shift / Unshift / Concat / First / Last / Shuffle
			{ code: 'IndexOf([10,20,30], 20)', expected: 1 },
			{ code: 'IndexOf([10,20,30], 99)', expected: -1 },
			{ code: 'IndexOf(["a","b","c"], "b")', expected: 1 },
			{ code: 'arr := [1,2,3]\nprint(Pop(arr))', expected: '3' }, // Pop returns the removed element (Push returns the array instead)
			{ code: 'arr := [1,2,3]\nPop(arr)\nprint(arr)', expected: '1,2' }, // and it mutates the array in place, same as Push
			{ code: 'arr := [1,2,3]\nprint(Shift(arr))', expected: '1' },
			{ code: 'arr := [1,2,3]\nShift(arr)\nprint(arr)', expected: '2,3' },
			{ code: 'arr := [1,2,3]\nprint(Unshift(arr, 0))', expected: '0,1,2,3' }, // Unshift returns the (mutated) array, same shape as Push
			{ code: 'Concat([1,2],[3,4])', expected: ["1", "2", "3", "4"] },
			{ code: 'First([1,2,3])', expected: '1' },
			{ code: 'Last([1,2,3])', expected: '3' },
			// Shuffle is non-deterministic, so these check the multiset is preserved rather than pinning an exact order
			{ code: 'a := Shuffle([1,2,3,4,5])\nprint(Count(a))', expected: '5' },
			{ code: 'a := Shuffle([1,2,3,4,5])\nprint(Sum(a))', expected: '15' },

			// string utilities: Left / Right / Capitalize
			{ code: 'Left("Hello World", 5)', expected: 'Hello' },
			{ code: 'Right("Hello World", 5)', expected: 'World' },
			{ code: 'Right("Hi", 10)', expected: 'Hi' }, // asking for more than the string has just returns the whole thing
			{ code: 'Right("Hello", 0)', expected: '' }, // 0 has to be special-cased - slice(-0) is the same as slice(0), which would return the whole string
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
			{ code: 'IsEmpty({"a":"1"})', expected: 0 }, // can't test the true empty-object case - {} itself doesn't parse in this language
			{ code: 'b := (c := 10) + 1\nprint(b)\nprint(c)', expected: '11\n10' }, // assignment as an expression - the outer read gets the value, and the inline var sticks around too
			{ code: 'Double(n) { return n * 2 }\nprint(Double(d := 7))\nprint(d)', expected: '14\n7' },
			{ code: 'buf := "................"\nprint(SubStr(buf, 1, pos := 5))\nprint(pos)', expected: '.....\n5' },
			{ code: 'arr := [1,2,3]\nIdent(n) { return n }\nprint(Ident(arr[0] := 99))\nprint(arr[0])', expected: '99\n99' }, // member-access targets inline too, not just plain vars

			// dynamic variable dereference: %name% and %(expr)%
			// %name% reads name's own value once (a normal var read), then reads
			// AGAIN using that value as the variable to look up - two reads
			// total, e.g. world/hello holding each other's name and swapping
			{ code: 'world := "hello"\nhello := "world"\nprint(%world% %hello%)', expected: 'worldhello' }, // no space - bare-whitespace concat never inserts one (see the plain-variable version of this same check below)
			{ code: 'a := "hello"\nb := "world"\nprint(a b)', expected: 'helloworld' }, // same no-space concat behavior with two plain variables, nothing deref-specific about it
			{ code: 'x := "y"\ny := "z"\nz := "final"\nprint(%x%)', expected: 'z' },
			{ code: 'a := "b"\nb := "the value"\nprint(%a%)', expected: 'the value' },
			{ code: 'x := "doesNotExist"\nprint(%x%)', expected: '' }, // deref-ing to a name nothing declared is just an empty result, not an error
			// %name% chains with indexing/member access same as a plain variable would
			{ code: 'var := ["foo", "man", "chu"]\nname := "var"\nprint(%name%[1])', expected: 'man' },
			{ code: 'name := "var"\nvar := ["foo","man","chu"]\nprint(Upper(%name%[0]))', expected: 'FOO' }, // and nests fine inside an ordinary function call
			// %(expr)% - same trick, but the target name comes from any expression instead of only a bare variable
			{ code: 'greeting := "hi"\nhi := "there"\nprint(%("g" . "r" . "eeting")%)', expected: 'hi' },
			{ code: 'foo := "picked foo"\na1 := "f"\na2 := "oo"\nprint(%(a1 a2)%)', expected: 'picked foo' }, // the inside of %( )% is a real expression too, so bare-whitespace concat works there as well
			{ code: 'letters := ["p","q","r"]\nkey := "letters"\nprint(%(key)%[2])', expected: 'r' }, // and %( )% chains with [index]/.member afterward too

			// #ArrayStartIndex - default is 0 (matches every array-index assertion
			// above, untouched), opting into 1 shifts every [N] read AND write
			{ code: 'arr := [10,20,30]\nprint(arr[1])', expected: '20' }, // default, unchanged
			{ code: '#ArrayStartIndex(1)\narr := [10,20,30]\nprint(arr[1])', expected: '10' },
			{ code: '#ArrayStartIndex(1)\narr := [10,20,30]\nprint(arr[3])', expected: '30' },
			{ code: '#ArrayStartIndex(1)\narr := [1,2,3]\narr[1] := 99\nprint(arr)', expected: '99,2,3' }, // the write side shifts too, not just reads
			// %deref% + #ArrayStartIndex(1) together, same idea as the "very
			// silly" expression-deref example - var4[3] now correctly lands on
			// "bongo" (1st/2nd/3rd, not 0/1/2), so the built name comes out as
			// "hey"+"bongo"+%hello%. %hello% itself still resolves to "hello"
			// (hello's value is "world", and %world% is what would read back
			// as "hello" - see the swap example above), so the variable this
			// actually finds is "heybongohello", not "heybongoworld"
			{ code: '#ArrayStartIndex(1)\nvar1 := "h"\nvar2 := "e"\nvar3 := "y"\nvar4 := ["bingo", "bango", "bongo"]\nworld := "hello"\nhello := "world"\nheybongohello := ["yes", "this", "works"]\nprint(%(var1 var2 var3 var4[3] %hello%)%[1])', expected: 'yes' }, // [1] under #ArrayStartIndex(1) is the 1st element
			// #SetBatchLines / #SetBatchOps - parsed and stored, don't affect
			// correctness of anything after them
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
		];
		// Strict === can never match two separately-built arrays/objects even
		// when their contents are identical, which is why every array- or
		// object-returning assertion below used to be commented out as
		// "faulty" - they were actually passing, the comparison just couldn't
		// see it. This does a structural comparison instead.
		const deepEqual = (a, b) => {
			if (a === b) return true;
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
		const assert = async (assertions) => {
			for (const { code, expected } of assertions) {
				const result = await this.assert_code(code);
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
		if (debuglogtier > 1)		
			console.log("All internal function tests passed.");
	}
	// ---- scope ----------------------------------------------------------
	// a scope is just another coyote. spawn() hands back a whole executor
	// pointed at the same function table, so a call stack is literally a
	// chain of this class nested inside itself, all the way down
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
			return "";
		}
		const value = await found.solve();
		return member === null ? value : this.step(value, member);
	}
	// writes land in THIS scope, never a parent, so a var made inside a
	// function stays inside that function. reads walk up, writes don't
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
	// members show up as a bare name off x.foo or an array of exprs off
	// x["foo"]["bar"]. flatten both down to one path and be done with it
	path(member) {
		if (member === null || member === undefined) {
			return [];
		}
		if (Array.isArray(member)) {
			return member.flat(Infinity).map(m => String(m).replace(/^"|"$/g, ''));
		}
		return [String(member).replace(/^"|"$/g, '')];
	}
	// a plain-numeric path segment into an array gets shifted by whatever
	// #ArrayStartIndex was set to (default 0, so this is a no-op unless a
	// script opts into 1-based indexing) - objects/string keys are untouched
	arrKey(node, key) {
		if (Array.isArray(node) && /^-?\d+$/.test(key)) {
			return String(Number(key) - this.settings.arrayStartIndex);
		}
		return key;
	}
	// walks x["a"]["b"] back down to the root var plus one flat path, so a
	// nested assignment knows which box to open and which key to drop it in
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
		if (typeof value === 'string' && !isNaN(value)) return Number(value);

		const varrr = this.digest(value);
		
		try {
			return JSON.parse(varrr); // Attempt to parse if it's valid JSON
		} catch {
			return varrr; // Otherwise, return as is
		}
	}
	// Core() is perfect for numbers and json strings but digest() chews a
	// real object down to nothing, so anything that wants a live array or
	// object back has to look first and only fall back to Core for strings
	// Core() floors floats on its way through digest() so it can't be used to
	// line up a comparison. this only promotes a pair when BOTH sides read as
	// clean numbers, otherwise they stay exactly as they were
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
            if (DICK === "BREAK") {
                return;
            }
            const CUNT = this.methods[DICK.toLowerCase()];
            if (CUNT && typeof this[CUNT] === 'function') {
                return await this[CUNT](ast);
            } else {
                this.print(chalk.red(`ERROR: Method "${DICK}" not found`));
            }
        } else {
            this.print(chalk.red('ERROR UNKNOWN DIRECTIVE'));
            this.print(ast);
        }
    }
	// #Name(args) directives, applied on the pre-scan pass before run() gets
	// to any of its own A_ vars or the script's real statements. deliberately
	// a plain if-chain rather than a lookup table - meant to be easy to bolt
	// one more "expected behavior" switch onto later without restructuring
	async applyDirective(statement) {
		const key = String(statement.name).toLowerCase();
		const values = await this.execute_ast(statement.params);
		if (key === "arraystartindex") {
			// #ArrayStartIndex(0) is the default (matches every existing
			// script/assertion) - #ArrayStartIndex(1) shifts [N] to 1-based
			this.settings.arrayStartIndex = this.numeric(values[0]) || 0;
		} else if (key === "setbatchlines") {
			this.settings.batchLines = this.numeric(values[0]) || null;
		} else if (key === "setbatchops") {
			this.settings.batchOps = this.numeric(values[0]) || null;
		}
	}
	async run(ast) {
		//this.print(`${this.getFunctionName()}`);
		this.print("running...");
		//console.log(ast.statements);

		// Store function definitions

		// Iterate over the AST statements

		ast.statements.forEach(statement => {
			if (statement.type === 4) {
				// Found a function definition, store it by its name
				this.functions[statement.name] = statement;
			}
			if (statement.type === ItemType.CLASS_DEFINITION) {
				this.classes[statement.name.toLowerCase()] = statement;
			}
		});

		// directives get applied on the same pre-scan pass, before any of
		// the A_ vars below or the script's own statements ever run
		for (const statement of ast.statements) {
			if (statement.type === ItemType.DIRECTIVE) {
				await this.applyDirective(statement);
			}
		}

		// Log the collected function definitions
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
		this.set("A_uptime", require("os").uptime());
		this.set("A_totalMemory", require("os").totalmem());
		this.set("A_freeMemory", require("os").freemem());
		this.set("A_cpuCount", require("os").cpus().length);
		this.set("A_cpuModel", require("os").cpus()[0]?.model || "unknown");
		//this.set("A_networkInterfaces", JSON.stringify(require("os").networkInterfaces()));
		this.set("A_currentTime", new Date().toISOString());
		this.set("A_scriptName", require("path").basename(__filename));
		this.set("A_scriptDir", __dirname);
		this.set("A_pid", process.pid);
		this.set("A_execPath", process.execPath);
		this.set("A_isTTY", process.stdout.isTTY);
		this.set("A_locale", Intl.DateTimeFormat().resolvedOptions().locale || "unknown");
		this.set("A_timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown");
		this.set("A_randomSeed", Math.random());
		this.set("A_isDebugMode", process.env.NODE_ENV === "development");
		this.set("A_defaultEncoding", process.env.LANG || process.env.LC_ALL || "unknown");
		this.set("A_isWindows", process.platform === "win32");
		this.set("A_isLinux", process.platform === "linux");
		this.set("A_isMacOS", process.platform === "darwin");
		this.set("A_pi", 3.141592653589793238462643383279502288419716939937);
		
		
		// You can now return or execute AST with the collected functions
		// For now, return the functions for further processing if needed
		this.returning = false;
		return await this.execute_ast(ast.statements);;
	}
	async execute_ast(ast) {
		// Skip early exit if ast.type is 4
		if (ast.type === 4) return;

		if (Array.isArray(ast)) {
			const results = [];
			for (const element of ast) {
				if (element.type === 32) {
					return "BREAK";
				}
				results.push(await this.ASS(element));
				// a return anywhere in a block kills the rest of that block and
				// carries its value up to whoever called the function
				if (this.returning) {
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
		if (conditionResult) {
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
		return (await this.execute_ast(ast.condition)) 
			? await this.execute_ast(ast.if_true) 
			: await this.execute_ast(ast.if_false);
	}
	async OR(ast) { // 8
		//this.print(`${this.getFunctionName()}`);
		return (await this.execute_ast(ast.left)) || (await this.execute_ast(ast.right));
	}
	async AND(ast) { // 9
		//this.print(`${this.getFunctionName()}`);
		return (await this.execute_ast(ast.left)) && (await this.execute_ast(ast.right));
	}
	async EQUALS(ast) { // 10
		//this.print(`${this.getFunctionName()}`);
		const [left, right] = this.pair(await this.execute_ast(ast.left), await this.execute_ast(ast.right));
		return left === right;
	}
	async NOT_EQUALS(ast) { // 11
		//this.print(`${this.getFunctionName()}`);
		const [left, right] = this.pair(await this.execute_ast(ast.left), await this.execute_ast(ast.right));
		return left !== right;
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
		let correct_case_key = this.methods[name.toLowerCase()]; // was doing a full Object.getOwnPropertyNames(...).find() scan over every prototype method on every single function call
		if (correct_case_key) {
			this.print(correct_case_key)
			retval = await this[correct_case_key](ast.params);
		} else {
			//console.log(this.functions[ast.name].params)
			let params = await this.execute_ast(ast.params)
			// the body gets its own coyote. no push/pop, no stack to keep
			// straight - when this returns the whole scope is just garbage
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
				// an explicit return wins. with no return at all we fall back to
				// the old behaviour of handing back the first statement that
				// actually produced something
				retval = inner.returning ? this.Core(inner.returned) : this.Core(this.removeUndefined(body)[0])
			} else {
				retval = await this.native_call(ast)
			}
		}
		return retval;
	}	
	async function_definition(ast) { // 4
	}
	// both already did their real work on the pre-scan pass in run()/
	// assert_code() - same as function_definition just above
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
		// an instance is just its own persistent scope (so fields set in one
		// method are still there for the next) plus a tag saying which class
		// it belongs to, so method_call() knows where to look up methods
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
			instance.returned = undefined;
		}
		return { __class__: classDef.name, __instance__: instance };
	}
	async loop(ast) {
		//this.print(`${this.getFunctionName()}`);
		let countResult = await this.execute_ast(ast.count);

		if (typeof countResult !== "number" && !Array.isArray(countResult) && typeof countResult !== "object") {
			const parsedInt = parseInt(countResult, 10);
			if (!isNaN(parsedInt)) countResult = parsedInt;
		}
		const breakCheck = async () => {
			const out = await this.execute_ast(ast.statements);
			// a return inside a loop has to take the loop with it
			return this.returning || out.includes('BREAK');
		};
		if (typeof countResult === "number") {
			const step = countResult >= 1 ? 1 : -1;
			for (let i = 1; step > 0 ? i <= countResult : i >= countResult; i += step) {
				this.set('A_Index', i);
				if (await breakCheck()) break;
			}
		} else {
			const iterable = typeof countResult === "string" ? countResult.split('') : countResult;
			let i = 1;
			for (const [key, value] of Object.entries(iterable || countResult)) {
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
		const value = await this.execute_ast(ast.expression)
		this.returning = true
		this.returned = value
		return value
	}
	async BREAK(ast){ // 32
		//this.print(`${this.getFunctionName()}`);
		return "BREAK"
	}
	async variable(ast) { //26
		//this.print(`${this.getFunctionName()}`);
		return await this.get(ast.name)
	}
	async deref(ast) { // 37
		// target's own value has already been read once by execute_ast below
		// (a plain variable read if it's %name%, whatever the expression
		// works out to if it's %(expr)%) - this.get() on top of that is the
		// second lookup, using that value as the name to go find
		let name = await this.execute_ast(ast.target)
		return await this.get(String(name))
	}
	async literal(ast) { // 25
		//this.print(`${this.getFunctionName()}`);
		return String(ast.value).replace(/^"|"$/g, '');
	}
	// a value that's already been resolved, wrapped back up as a tiny AST
	// node so it can be dropped into a params array without re-executing
	// whatever produced it a second time (method_call uses this)
	async value(ast) { // 36
		return ast.value;
	}
	async assignment(ast) {
		const leftType = await this.detype(ast.left.type); // Store the result of detype

		if (leftType === "MEMBER_ACCESS") {
			const target = await this.chainpath(ast.left);
			const value = await this.execute_ast(ast.right);
			if (target.name !== null) {
				this.set(target.name, value, target.path);
			}
			// used inline (eg as a function param) the assignment needs to
			// hand back what it just set, same as the var would read back
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
			let propName = key.replace(/"/g, "");
			if (value.type === 27) {
				this.print("Nested object found, creating recursively...");
				obj[propName] = await this.object(value);
			} else {
				obj[propName] = String(value.value).replace(/"/g, "");
			}
		}
		return obj;
	}
	async array(ast) { // 28
		//this.print(`${this.getFunctionName()}`);
		// Check if the AST contains 'items' and ensure it's an array
		if (Array.isArray(ast.items)) {
			// Use Promise.all to ensure all items are processed asynchronously
			const result = await Promise.all(ast.items.map(item => this.execute_ast(item)));
			return result;
		}
		// If there are no 'items', return the original AST
		return ast;
	}
	async member_access(ast) { // 29
		const member = await this.execute_ast(ast.member);
		if (ast.value.name !== undefined) {
			return await this.get(ast.value.name, member);
		}
		// chained access like x.a.b - the left side isn't a plain var so work
		// it out first and then step into whatever came back
		return this.step(await this.execute_ast(ast.value), member);
	}
	async method_call(ast) {
		// evaluated exactly once, whatever it is - re-evaluating ast.func.value
		// a second time down in the fallback branch would double any side
		// effects it has (e.g. if it's itself a function call)
		const target = await this.execute_ast(ast.func.value);
		const methodName = await this.execute_ast(ast.func.member);
		if (target && typeof target === 'object' && target.__instance__) {
			const classDef = this.classes[String(target.__class__).toLowerCase()];
			const method = classDef && classDef.methods[String(methodName).toLowerCase()];
			if (method) {
				// runs on the instance's own persistent scope, same as
				// __init did, so fields set by one method call are still
				// there the next time any method on this instance runs
				const instance = target.__instance__;
				let params = await this.execute_ast(ast.params);
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
				instance.returned = undefined;
				return retval;
			}
			// not one of the class's own methods - falls through to the
			// normal "global function, object as the first arg" behavior
			// below, same as any other value (this is what lets something
			// like Var.func(x).round() reach the built-in Round() for
			// .round() once func()'s own return value isn't a class instance)
		}
		return this.execute_ast({ type: 6, name: methodName, params: [{ type: ItemType.VALUE, value: target }, ...ast.params] })
	}
	async concat(ast) { // 16
		//this.print(`${this.getFunctionName()}`);
		let left = String(await this.execute_ast(ast.left)).replace(/^"|"$/g, ''); // Convert to string and strip double quotes from left
		let right = String(await this.execute_ast(ast.right)).replace(/^"|"$/g, ''); // Convert to string and strip double quotes from right

		return (left + right)
	}
	async add(ast) { // 21
		//this.print(`${this.getFunctionName()}`);
		let left = await this.execute_ast(ast.left)
		let right = await this.execute_ast(ast.right)
		left = left ? left : 0
		right = right ? right : 0
		return (await this.toFloat(left ) + await this.toFloat(right))
	}
	async sub(ast) { // 22
		//this.print(`${this.getFunctionName()}`);
		let left = await this.execute_ast(ast.left)
		let right = await this.execute_ast(ast.right)
		left = left ? left : 0
		right = right ? right : 0
		return (await this.toFloat(left ) - await this.toFloat(right))
	}
	async mul(ast) {
		let left = await this.execute_ast(ast.left);
		let right = await this.execute_ast(ast.right);

		let numLeft = parseFloat(left);
		let numRight = parseFloat(right);
		if (!isNaN(numLeft) && isFinite(numLeft) && !isNaN(numRight) && isFinite(numRight)) {
			return numLeft * numRight;
		} else if (typeof left === "string" && !isNaN(numRight) && isFinite(numRight)) {
			return left.repeat(Math.max(0, Math.floor(numRight))); // Ensures non-negative integer repeat
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
		this.set(ast.variable.name, `${await this.execute_ast(ast.variable)}${await this.execute_ast(ast.delta)}`)
	}
	async div(ast) { // 24
		//this.print(`${this.getFunctionName()}`);
		let left = await this.execute_ast(ast.left)
		let right = await this.execute_ast(ast.right)
		left = left ? left : 0
		right = right ? right : 0
		return (await this.toFloat(left) / await this.toFloat(right))
	}
	async VALUE(ast) { // 36
		// a value that has already been worked out - it exists so a var can
		// park a finished result in the tree next to unfinished ones
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
		} else {
			throw new Error('Unsupported type');
		}
	}
	async INTERNAL_print(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		let out = value[0];
		// print(array) was dumping raw node inspect output ("[ '1', '2' ]")
		// instead of just laying the values out like everything else does
		if (Array.isArray(out)) {
			out = out.join(",");
		}
		if (typeof out === 'string') {
			console.log(out.replace(/`n/g, '\n'));
		} else {
			console.log(out);
		}
	}
	async INTERNAL_Cell(ast) {
		//this.print(`${this.getFunctionName()}`);
		const values = await this.execute_ast(ast);
		const char = values[0]; // The character to set
		const x = values[1];    // X position
		const y = values[2];    // Y position

		// Move the cursor to the specified position
		process.stdout.cursorTo(x, y);

		// Write the character
		process.stdout.write(char);
	}
	async INTERNAL_Cursor(ast) {
		//this.print(`${this.getFunctionName()}`);
		const values = await this.execute_ast(ast);
		const x = values[0]; // X position
		const y = values[1]; // Y position

		// Move the cursor to the specified position
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
		return String(value[0]).length
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
		// Core() floors non-integer numbers via digest() - fine for literals
		// (which arrive here as strings and take a different path through
		// Core), but it silently zeroes out any computed value like `x / 4`.
		// Skip Core() when we already have a real number, same as Sin does.
		let rawValue = typeof value[0] === "number" ? value[0] : this.Core(value[0]);
		return Math.cos(rawValue);
	}
	async INTERNAL_Ticks(ast) {
		return performance.now();
	}
	async INTERNAL_Tan(ast) {
		let value = await this.execute_ast(ast);
		let degrees = value[1] === "D";  // Check if input is in degrees
		let rawValue = typeof value[0] === "number" ? value[0] : this.Core(value[0]);
		let radians = degrees ? rawValue * (Math.PI / 180) : rawValue;  // Convert if in degrees
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
		// Unlike Tan/Sin/Cos, Cotan has always taken degrees with no radians
		// option - Cotan(45) === 1 already relies on that. It never called
		// Core() on the way in, so it never had the flooring bug either.
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
			// If no arguments provided, default range is 1 to 100
			return Math.random() * 100 + 1;
		} else if (value.length === 1) {
			// If one argument provided, range is from 0 to the argument
			let max = value[0];
			return Math.random() * max;
		} else if (value.length === 2) {
			// If two arguments provided, range is between the arguments (order-independent)
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
		// was running the string through Core() same as start/length -
		// fine until the string itself was all digits ("48"), Core()
		// coerced it straight to a number and .substring wasn't a thing
		// anymore. it just needs to stay a string.
		let string = String(values[0])
		let start =  this.Core(values[1])
		let length = values.length >= 3 ?  this.Core(values[2]) : string.length - start;
		return string.substring(start, start + length);
	}
	async INTERNAL_Asc(ast) {
		//this.print(`${this.getFunctionName()}`);
		let value = await this.execute_ast(ast);
		value = value[0].replace(/^"(.*)"$/, '$1')
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
		let string1 = values[0];
		let string2 = values[1];
		return string1.indexOf(string2) + 1; // Adding 1 to convert from zero-based index to one-based index
	}
	async INTERNAL_Strepl(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string = values[0];
		let find = values[1];
		let replace = values[2];
		return string.replace(new RegExp(find, 'g'), replace);
	}
	async INTERNAL_Upper(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string = values[0];
		return string.toUpperCase();
	}
	async INTERNAL_Lower(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string = values[0];
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
    // Get the values from the AST
    let values = await this.execute_ast(ast);
    let string = values[0];
    let regexPattern = values[1];
    let numMatches = values[2] !== undefined ? parseInt(values[2]) : 1;

    if (typeof string !== "string" || isNaN(numMatches)) {
        throw new Error("Invalid arguments. Expected a string, a regex pattern, and an optional number of matches.");
    }

    // Create a regex with the global flag only if multiple matches are needed
    let regex = numMatches === 1 ? new RegExp(regexPattern) : new RegExp(regexPattern, "g");

    let matches = [];
    let matchCount = 0;

    // Use regex.exec() to find matches up to the specified number
    let match;
    while ((match = regex.exec(string)) !== null) {
        matches.push({ match: match[0], pos: match.index }); // Store match and position
        matchCount++;
        if (numMatches > 0 && matchCount >= numMatches) {
            break; // Stop if we've reached the desired number of matches
        }
    }

    return matches;
}
	async INTERNAL_Repl(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let string = values[0];
		let regex = values[1];
		let replace = values[2];
		// 4th param (optional) = Recursive: falsy/absent replaces only the
		// first match (Repl("Hello","l","L") -> "HeLlo"); truthy replaces
		// every match, same as adding the 'g' flag by hand
		// (Repl("Hello","l","L",1) -> "HeLLo")
		let recursive = values[3];
		return string.replace(new RegExp(regex, recursive ? 'g' : ''), replace);
	}
	async INTERNAL_Grep(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		// Docs: "returns lines containing P from T" - a substring/pattern
		// search, not a whole-word match, so no \b boundaries here.
		let pattern = new RegExp(values[0], 'g');
		let text = values[1];
		// Was splitting on the literal two characters `n instead of a real
		// newline, so multi-line text was never actually split into lines.
		let lines = text.split('\n');
		let matchedLines = lines.filter(line => line.match(pattern));
		return matchedLines;
	}
	async INTERNAL_Trunc(ast) {
		// Get the values from the AST
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
		let string = values[0];
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
		let matches = haystack.match(regex);
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
				files.push(...await this.listFiles(fullPath, true));  // Recursively add files
			} else if (!entry.isDirectory()) {
				files.push(fullPath);  // Add file path to the list
			}
		}

		return files;
	}
	async buildFileTree(filePaths) {
		//this.print(`${this.getFunctionName()}`);
		const tree = {};

		filePaths.forEach(filePath => {
			const parts = filePath.split(path.sep); // Split by the platform's separator (e.g., '\\' on Windows)
			let current = tree;

			parts.forEach((part, index) => {
				if (index === parts.length - 1) {
					// For the last part (file), push the file name to an array
					if (!current.files) {
						current.files = [];
					}
					current.files.push(part);
				} else {
					// For directories, create a new object if it doesn't exist
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
		let text = values[0];
		// Literals always arrive as strings in this language, but switch/case
		// uses strict equality, so "1" would never match `case 1` below -
		// that's what "not working properly" meant. parseInt fixes it.
		let justifyType = parseInt(values[1]); // 1 for Left, 2 for Center, 3 for Right
		let width = values[2];

		// Split text into lines
		let lines = text.split('\n');

		// Determine the maximum line length (to adjust the width if any line is longer)
		lines.forEach(line => {
			if (line.length > width) {
				width = line.length;
			}
		});

		// Function to justify a single line
		function justifyLine(line, justifyType, width) {
			let padding;
			switch (justifyType) {
				case 1: // Left Justified
					return line.padEnd(width);
				case 2: // Center Justified
					padding = Math.floor((width - line.length) / 2);
					return ' '.repeat(padding) + line + ' '.repeat(width - line.length - padding);
				case 3: // Right Justified
					return line.padStart(width);
				default:
					return line;
			}
		}

		// Justify each line according to the specified justifyType
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
		let string = values[0];
		let N = values[1];

		switch (N) {
			case 1: // Light cleaning
				// Remove extra spaces between words but keep single spaces
				return string.replace(/\s+/g, ' ').trim();
			
			case 2: // Medium cleaning
				// Remove extra spaces between words and trim the start and end of the string
				// Additional: Remove tabs and newlines, keeping only single spaces
				return string.replace(/\s+/g, ' ').replace(/\t+/g, ' ').replace(/\n+/g, ' ').trim();
			
			case 3: // Heavy cleaning
				// Remove all types of whitespace and invisible characters
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
		let data = values[0];
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
		let repeat = values[0];
		let num = values[1];
		return repeat.repeat(await this.toFloat(num))
	}
	async INTERNAL_fappend(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let data = values[0];
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
			// Determine the prefix for the current node
			const prefix = indent + (last ? chalk.gray('└─ ') : chalk.gray('└─ '));

			if (Array.isArray(obj)) {
				// Print each item in the array
				obj.forEach((item, index) => {
					// Use different prefixes and indentation for the last item
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
				// Print each key-value pair in the object
				const keys = Object.keys(obj);
				keys.forEach((key, index) => {
					// Use different prefixes and indentation for the last key
					console.log(indent + (index === keys.length - 1 ? chalk.gray('└─ ') : chalk.gray('├─ ')) + chalk.cyan(key));
					printTree(obj[key], indent + (index === keys.length - 1 ? '   ' : chalk.gray('│  ')), index === keys.length - 1);
				});
			} else {
				// Print the value
				if (!arr)  {
				console.log(prefix + chalk.yellow(JSON.stringify(obj)));
				}
			}
		};

		// Extract the JSON object from the AST
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

		// Calculate the result of applying the percentage to the number
		let result = (number * percent) / 100;
		return result;
	}
	async INTERNAL_pcChange(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let oldValue = values[0];
		let newValue = values[1];

		// Calculate percentage change
		let change = ((newValue - oldValue) / oldValue) * 100;
		return change;
	}
	async INTERNAL_addPc(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let number = Number(values[0]);
		let percent = Number(values[1]);

		// Calculate the result by adding the percent
		return number + (number * percent / 100);
	}	
	async INTERNAL_subPc(ast) {
		//this.print(`${this.getFunctionName()}`);
		let values = await this.execute_ast(ast);
		let number = values[0];
		let percent = values[1];

		// Calculate the result by subtracting the percent
		return number - (number * percent / 100);
	}
	async INTERNAL_input(ast) {
		//this.print(`${this.getFunctionName()}`);
		let promptText = await this.execute_ast(ast)[0] || 'Enter input: '; // Optional prompt from AST
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
		if (typeof value[0] === 'string') {
			return value[0].split('').length;
		} else if (Array.isArray(value[0])) {
			return value[0].length;
		} else {
			throw new Error("INTERNAL_Count: Expected a string or an array");
		}
	}
	async INTERNAL_MaxIndex(ast) {
		// Get the value from the AST and check if it's an array or string
		let value = await this.execute_ast(ast);
		if (typeof value[0] === 'string') {
			// If it's a string, split it into an array and find the max index
			return value[0].split('').length - 1;
		} else if (Array.isArray(value[0])) {
			// If it's an array, return the max index
			return value[0].length - 1;
		} else {
			throw new Error("INTERNAL_MaxIndex: Expected a string or an array");
		}
	}
	async INTERNAL_Slice(ast) {
		// Slice an array or string
		let values = await this.execute_ast(ast);
		let source = values[0];
		let start = values[1];
		let end = values.length >= 3 ? values[2] : undefined;

		if (typeof source === 'string') {
			return source.slice(start, end);
		} else if (Array.isArray(source)) {
			return source.slice(start, end);
		} else {
			throw new Error("INTERNAL_Slice: Expected a string or an array");
		}
	}
	async INTERNAL_Join(ast) {
		// Join elements of an array into a string
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
		// Flatten a nested array
		let values = await this.execute_ast(ast);
		let array = values[0];

		if (Array.isArray(array)) {
			return array.flat();
		} else {
			throw new Error("INTERNAL_Flatten: Expected an array as the argument");
		}
	}
	async INTERNAL_Push(ast) {
		// Get the value from the AST
		let values = await this.execute_ast(ast);
		let array = values[0];
		let element = values[1];

		if (Array.isArray(array)) {
			// If it's an array, push the element to the array
			array.push(element);
			return array;
		} else if (typeof array === 'string') {
			// If it's a string, append the element (as a string) to the string
			return array + String(element);
		} else {
			throw new Error("INTERNAL_Push: Expected an array or string as the first argument");
		}
	}
	async INTERNAL_Mod(ast) {
		// fills a real gap - there's no % operator anywhere in the language
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
		// mutates in place and returns the removed element, mirroring how
		// every other language's pop() works (Push instead returns the array)
		let values = await this.execute_ast(ast);
		let array = values[0];
		if (!Array.isArray(array)) {
			throw new Error("INTERNAL_Pop: Expected an array as the argument");
		}
		return array.pop();
	}
	async INTERNAL_Shift(ast) {
		// same as Pop but off the front - mutates in place, returns the element
		let values = await this.execute_ast(ast);
		let array = values[0];
		if (!Array.isArray(array)) {
			throw new Error("INTERNAL_Shift: Expected an array as the argument");
		}
		return array.shift();
	}
	async INTERNAL_Unshift(ast) {
		// prepends, mutates in place, returns the array - same shape as Push
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
	async INTERNAL_IsEmpty(ast) {
		let values = await this.execute_ast(ast);
		let value = values[0];
		// no unbox()/Core() here on purpose - Core("") coerces the empty
		// string to the number 0 (since Number("") === 0), which would
		// make String(value).length come back as 1 ("0") instead of 0
		if (Array.isArray(value)) return value.length === 0 ? 1 : 0;
		if (typeof value === 'object' && value !== null) return Object.keys(value).length === 0 ? 1 : 0;
		return String(value).length === 0 ? 1 : 0;
	}
	async INTERNAL_Purge(ast) {
		// Get the value from the AST
		let value = await this.execute_ast(ast);
		
		// Define the purge function inside the async function
		async function purge(input) {
			if (Array.isArray(input)) {
				// If it's an array, filter out empty entries and recursively purge each element
				return Promise.all(input.filter(item => {
					if (item === null || item === undefined || item === '' || 
						(Array.isArray(item) || typeof item === 'object' ? purge(item).then(res => res.length === 0) : false)) {
						return false;
					}
					return true;
				}).map(async (item) => await purge(item))); // Apply purge recursively on each element
			} else if (typeof input === 'object' && input !== null) {
				// If it's an object, recursively purge each property
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
			return input; // Return primitive values as is
		}

		return await purge(value[0]);
	}
async INTERNAL_IsOdd(ast) {
    // Get the value from the AST
    let value = await this.execute_ast(ast);
    let number = parseInt(value[0]);
    return number % 2 !== 0 ? 1 : 0; // Return 1 if odd, 0 if even
}

async INTERNAL_IsEven(ast) {
    // Get the value from the AST
    let value = await this.execute_ast(ast);
    let number = parseInt(value[0]);
    return number % 2 === 0 ? 1 : 0; // Return 1 if even, 0 if odd
}
async INTERNAL_Invert(ast) {
    // Get the value from the AST
    let value = await this.execute_ast(ast);
    let number = parseFloat(value[0]);
    return -number; // Flip the sign of the number
}
async INTERNAL_IsArray(ast) {
    // Get the value from the AST
    let value = await this.execute_ast(ast);
    return Array.isArray(this.Core(value[0])) ? 1 : 0; // Return 1 if it's an array, 0 otherwise
}

async INTERNAL_IsObject(ast) {
    // Get the value from the AST
    let value = await this.execute_ast(ast);
    return (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) ? 1 : 0; // Return 1 if it's an object, 0 otherwise
}
async INTERNAL_IsString(ast) {
    // Get the value from the AST
    let value = await this.execute_ast(ast);
    return typeof this.Core(value[0]) === 'string' ? 1 : 0; // Return 1 if it's a string, 0 otherwise
}

async INTERNAL_IsNum(ast) {
    // Get the value from the AST
    let value = await this.execute_ast(ast);
    // isNum() means "is this numeric at all" - integer or float. It used to
    // require Number.isInteger() on top, which made it really "isInt" in
    // disguise and meant a perfectly good number like "5.5" reported as 0.
    // isNaN() coerces the same way Core()'s own string branch does, so this
    // keeps the existing edge cases (e.g. isNum("") === 1) intact.
    return !isNaN(value[0]) ? 1 : 0; // Return 1 if it's a number (int or float), 0 otherwise
}
async INTERNAL_IsInt(ast) {
    // Get the value from the AST
    let value = await this.execute_ast(ast);
    // The integer-only check isNum() used to do, now under its own name.
    return !isNaN(value[0]) && Number.isInteger(parseFloat(value[0])) ? 1 : 0; // Return 1 if it's a whole number, 0 otherwise
}
async INTERNAL_Range(ast) {
    // Get the value(s) from the AST
    let values = await this.execute_ast(ast);

    if (values.length === 1) {
        // Single argument: range(25)
        let end = parseInt(values[0]);
        if (isNaN(end)) {
            throw new Error("Invalid argument for range. Expected a number.");
        }
        return Array.from({ length: end + 1 }, (_, i) => i); // [0, 1, ..., end]
    } else if (values.length === 2) {
        // Two arguments: range(5, 10)
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
    // Get the value from the AST
    let value = await this.execute_ast(ast);
    // Core() runs values through digest(), which floors floats on its way
    // through - fine for most uses, but it means every non-integer would
    // look like an integer by the time we got to check it. parseFloat()
    // works directly on both real numbers and numeric strings, so skip Core().
    let num = parseFloat(value[0]);
    return !Number.isNaN(num) && !Number.isInteger(num) ? 1 : 0; // Return 1 if it's a float, 0 otherwise
}

	// ---- natives ---------------------------------------------------------
	// nothing internal matched and there's no coyote function by that name
	// either. if whatever sits left of the dot is a real js object carrying a
	// method of that name then just call it. this is the whole trick behind
	// Use("os") then os.hostname() - nothing gets registered by hand
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
		this.print(chalk.red(`Function definition for ${ast.name} not found or missing parameters`));
		return "";
	}
	// case insensitive method lookup, own keys first then up the prototype.
	// walking the proto is what gives every string and array in coyote the
	// entire js method set for free
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
		// park the module under its own name so os.hostname() resolves, and
		// drop its top level functions in as bare calls while we're here
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
		return String(value);
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
		// hands a string of coyote back to a fresh executor sharing this
		// scope, so code held in a var can be run on demand
		let values = await this.execute_ast(ast);
		let tree = await this.make_ast(String(values[0]));
		// borrow this scope but hand back the return flag exactly as it was
		// found, otherwise a top level return in the string latches on and
		// every block after it stops dead at its first statement
		const mark = this.returning;
		this.returning = false;
		const body = await this.execute_ast(tree.statements);
		const value = this.returning ? this.returned : this.removeUndefined(body)[0];
		this.returning = mark;
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
		// dumps the raw source text of the running script - straight from
		// the same fileContent the parser was built from. optional 1st
		// arg is a destination path; omit it to print to console instead
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
		// dumps the parsed AST for the running script - the same tree
		// print() run() already shows at startup, plus the full JSON.
		// optional 1st arg is a destination path; omit it for console
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
		// snapshot of the node process's own memory (rss/heap/external)
		// plus the interpreter's live variable stack from this scope on
		// down. optional 1st arg is a destination path; omit for console
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
			 '✓'  	,	'Type			'	,	'V'		,	'> [str] int/float/string/array/object/null of V' ,
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
			 '✓'  	,	'IsEmpty		'	,	'V'		,	'> [num] 1 or 0 if V (string/array/object) is empty'
			])], 3));
	}
	async INTERNAL_PrintScript(ast) {
		// dumps the raw source text of the running script - straight from
		// the same fileContent the parser was built from. optional 1st
		// arg is a destination path; omit it to print to console instead
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
		// dumps the parsed AST for the running script - the same tree
		// print() run() already shows at startup, plus the full JSON.
		// optional 1st arg is a destination path; omit it for console
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
		// snapshot of the node process's own memory (rss/heap/external)
		// plus the interpreter's live variable stack from this scope on
		// down. optional 1st arg is a destination path; omit for console
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
			// Extract the function name from the second line of the stack trace
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
  let borderTopLeft = '┌'; 	// Top-left corner
  let borderTopRight = '┐'; 	// Top-right corner
  let borderBottomLeft = '└'; // Bottom-left corner
  let borderBottomRight = '┘'; // Bottom-right corner
  let borderHorizontal = '─';	 // Horizontal line
  let borderVertical = '│'; 	// Vertical line
  let padding = 2;

  // Split content into lines and replace tabs with spaces
  let lines = content.split('\n').map(line => line.replace(/\t/g, '    '));

  // Function to strip chalk escape sequences for width calculation
  function stripChalk(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, ''); // Remove chalk escape sequences
  }

  // Calculate max length of lines ignoring chalk escape sequences
  let maxLength = 0;
  lines.forEach(line => {
    let strippedLine = stripChalk(line); // Strip chalk for length calculation
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

  // Add some padding for the box width
  maxLength = maxLength + 6;  // You can adjust this value as needed
  maxLengthRaw = maxLengthRaw + 6;  // You can adjust this value as needed
  let contentWidth = maxLength + padding * 2 - 2;

  // Title line (adjust width to fit the content)
  const titleLine = `${borderTopLeft}─${title} ${borderHorizontal.repeat(contentWidth - title.length - 3)}${borderTopRight}`;

  // Padded content (apply chalk to the content, but calculate padding based on raw length)
  const paddedContent = lines.map(line => {
    // Ensure line fits within the content width
    if (line.length > contentWidth - padding * 2) {
      line = line.slice(0, maxLengthRaw - padding * 2);
    }

    // Calculate left and right padding based on raw content length (ignoring chalk)
    let leftPadding = ' '.repeat(padding);
    let rightPadding = ' '.repeat(contentWidth - stripChalk(line).length - padding * 2 + 1);

    // Add chalk styling for the borders and content
    let contentline = `${Hue(borderVertical)}${leftPadding}${line}${rightPadding}${Hue(borderVertical)}`;
    return contentline;
  }).join('\n');

  // Bottom border
  const borderBottom = `${borderBottomLeft}${borderHorizontal.repeat(titleLine.length - 2)}${borderBottomRight}`;

  // Return the final box with content and borders
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
		let charCount = 0; // Global character count
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
		return { prev: null, current: { line: '' }, next: null }; // Ensure consistent structure
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
		const visibleWidth = Math.floor(process.stdout.columns * 0.85); // 65% of console width
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
		const pointerPosition = (ch - start) - 6;
		const pointer = ' '.repeat(pointerPosition) + '^';
		return { Line: String(beforeCh + afterCh), pointer };
	}

  handleError(error) {
	console.log(error)
	//const ln = Number(this.uStrip(error.statement).replace(/^L(\d+):.*$/, '$1'));
	const ln = parseInt(this.uStrip(error.statement).match(/^L(\d+):/)[1], 10) - 1;
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
		].join('\n'); // Join the content into one string
		const errorContent = [
		  `${chalk.gray("ln" + ln + ":")} ${context.center.Line}`,
		  `${' '.repeat(String(ln).length + 8)} ${context.center.pointer} char: ${ch} | ln: ${ln}`,
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
executer.run(r)