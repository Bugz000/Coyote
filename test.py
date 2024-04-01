from lark import *
import json
import textwrap
import ast
import math
import random
import time
import re
import pyperclip

#todo
# move var++ statement_inc_dec to expression
# var += 1 should be statement inc


clipboard =  ""
def bugzprint(text):
    global clipboard
    print(text)
    clipboard = clipboard + "\n" + str(text)


code2 = """

var := 1
var++
print(var)

"""

code = """
print(round(strlen("reee") + 500+ (5*(1/((1/((5*(1/((5*(1/((5*(1/((1/((5*(1/((5*2)+6)-1))+6)-1) + (5*(1/((1/((5*(1/((5*(1/((5*(1/((1/((5*(1/((5*2)+6)-1))+6)-1) + ((1/((5*(1/((5*2)+6)-1))+6)-1)*2)+6)-1))+6)-1))+6)-1) + ((1/((5*(1/((5*(1/((5*2)+6)-1))+6)-1))+6)-1)*2)+6)-1))+6)-1) + (500 * 500)) + ((1/((5*(1/((5*2)+6)-1))+6)-1)*2)+6)-1))+6)-1))+6)-1) + ((1/((5*(1/((5*(1/((5*2)+6)-1))+6)-1))+6)-1)*2)+6)-1))+6)-1) + (500 * 500)))  " is indeed a number!")



"""

coyote_grammar = r"""
start: statements

statements: (statement _NL)* statement
statement: _WS* _statement? _WS* LINE_COMMENT?
_statement: MULTI_LINE_COMMENT
          | COMMAND
          | statement_loop
          | statement_if
          | statement_function_definition
          | statement_return
          | statement_assignment
          | expression
          | statement_exp_inc_dec
          | statement_inc_dec

statement_assignment: (variable|expression_array) _WS* OPERATOR_ASSIGN _WS* expression
statement_exp_inc_dec: (variable|expression_array) _WS* (OPERATOR_EXP_INC | OPERATOR_EXP_DEC) _WS* expression
statement_inc_dec: variable (OPERATOR_INCREMENT|OPERATOR_DECREMENT)
statement_loop.2: _WS? LOOP _WS* expression _WS* LINE_COMMENT?  (_NL? block | _NL statement _NL)
statement_if: IF _WS* expression _WS* LINE_COMMENT? _NL? (block | statement) (ELSE (block | statement))?
statement_function_definition: CNAME "(" parameter_names ")" _WS* LINE_COMMENT? _NL? block
statement_return.2: RETURN expression?

// Doesn't handle default values
parameter_names: (parameter_name COMMA)* parameter_name | _WS*
parameter_name: _WS* CNAME _WS*

block: _WS* "{" statements "}" _WS*

// Doesn't handle inline assignments or comma separated expressions
expression: _WS* expression_ternary _WS*

?expression_ternary: expression OPERATOR_TERNARY_IF expression OPERATOR_TERNARY_ELSE expression
                   | expression_or

?expression_or: expression_or OPERATOR_OR expression_and
              | expression_and

?expression_and: expression_and OPERATOR_AND expression_equality
               | expression_equality

?expression_equality: expression_equality (OPERATOR_EQUAL | OPERATOR_NOT_EQUAL) expression_inequality
                    | expression_inequality

?expression_inequality: expression_inequality (OPERATOR_LESS | OPERATOR_LESS_EQUAL | OPERATOR_GREATER | OPERATOR_GREATER_EQUAL) expression_concat
                      | expression_concat

?expression_concat: expression_concat OPERATOR_CONCAT expression_bitwise
                  | expression_bitwise

?expression_bitwise: expression_bitwise (OPERATOR_BITWISE_AND | OPERATOR_BITWISE_OR | OPERATOR_BITWISE_XOR) expression_bit_shift
                   | expression_bit_shift

?expression_bit_shift: expression_bit_shift (OPERATOR_BIT_SHIFT_LEFT | OPERATOR_BIT_SHIFT_RIGHT) expression_add_sub
                     | expression_add_sub

?expression_add_sub: expression_add_sub (OPERATOR_ADD | OPERATOR_SUB) expression_mul_div
                   | expression_mul_div

?expression_mul_div: expression_mul_div (OPERATOR_MUL | OPERATOR_DIV) expression_base
                    |expression_floor_pow

?expression_floor_pow: expression_mul_div (OPERATOR_FLOORDIV | OPERATOR_POWER) expression_base
                   | expression_base

?expression_base: _WS* _expression_base _WS*
_expression_base:"(" expression ")"
                | expression_func_call
                | expression_array
                | variable
                | NUMBER
                | STRING
                | BOOLEAN
                | array_args
                | object_definition
                | expression_method


array_args: "[" array_list* "]"
object_definition: "{" object_list* "}"
expression_func_call: CNAME "(" expression_list ")"
expression_method: (variable|expression_method|expression_array) "." method "(" expression_list ")"
object_directive: (variable|expression_method) "." method ("(" expression_list ")")*
expression_array: CNAME "[" array_list "]"


array_list: (expression COMMA)* expression | _WS*
object_list: (expression COLON expression COMMA)* expression COLON expression | _WS*
expression_list: (expression COMMA)* expression | _WS*
variable: CNAME
method:CNAME

LOOP: "loop"
IF: "if"
BOOLEAN: "true" | "false"
COMMAND: "break" | "continue" | "exitapp"
RETURN: "return"
ELSE: "else"

OPERATOR_TERNARY_IF: "?"
OPERATOR_TERNARY_ELSE: ":"
OPERATOR_OR: "||"
OPERATOR_AND: "&&"
OPERATOR_EQUAL: "=" | "=="
OPERATOR_NOT_EQUAL: "!=" | "!==" | "<>"
OPERATOR_LESS: "<"
OPERATOR_LESS_EQUAL: "<="
OPERATOR_GREATER: ">"
OPERATOR_GREATER_EQUAL: ">="
OPERATOR_CONCAT: _WS "." _WS | " "
OPERATOR_BITWISE_AND: "&"
OPERATOR_BITWISE_OR: "|"
OPERATOR_BITWISE_XOR: "^"
OPERATOR_BIT_SHIFT_RIGHT: ">>"
OPERATOR_BIT_SHIFT_LEFT: "<<"
OPERATOR_ADD: "+"
OPERATOR_SUB: "-"
OPERATOR_MUL: "*"
OPERATOR_DIV: "/"
OPERATOR_POWER: "**"
OPERATOR_FLOORDIV: "//"
OPERATOR_ASSIGN: ":="
OPERATOR_EXP_INC: "+="
OPERATOR_EXP_DEC: "-="
OPERATOR_INCREMENT: "++"
OPERATOR_DECREMENT: "--"

LINE_COMMENT: /;[^\r\n]*/
MULTI_LINE_COMMENT: /\/\*[\s\S]*?\*\//
WS: /[ \t]/
COMMA: ","
COLON: ":"
_WS: /[ \t]/
_NL: /\r?\n/
_WS_OR_NL: /[ \t\r\n]/

%import common.CNAME
// Doesn't hex numbers
%import common.NUMBER
// Doesn't handle AHK escapes or single quoted
%import common.ESCAPED_STRING  -> STRING
"""

def convert_to_json(data):
    if isinstance(data, tuple):
        if len(data) == 2:
            return {data[0]: convert_to_json(data[1])}
        else:
            return {data[0]: [convert_to_json(item) for item in data[1:]]}
    elif isinstance(data, str):
        return data
    elif isinstance(data, int):
        return data
    elif isinstance(data, list):
        if len(data) == 1 and isinstance(data[0], (str, int)):
            return data[0]
        else:
            return [convert_to_json(item) for item in data]
    elif isinstance(data, Tree):
        return convert_to_json(data.children)
    else:
        return None

def indent(text, amount, ch=' '):
    return textwrap.indent(text, amount * ch)
    
def parse_code(code):
    try:
        ast = parser.parse(code)
        return ast
    except Exception as e:
        if isinstance(e, UnexpectedToken):
            token = e.token
            line = token.line
            column = token.column
            expected_tokens = e.expected
            token_history = e.token_history
            context = indent(str(e.__context__), 4)
            docs = str(e.__doc__)
            terminals = str(e._terminals_by_name)
            lines = code.split('\n')
            error_line = lines[line - 1]
            caret = " " * (column - 1) + "^"
            last_five_lines = "\n".join(lines[max(0, line - 5):line])
            error_message = f"{docs}\n\n{context}\nError: {token} at line {line}, column {column}.\n\n{last_five_lines}\n{caret}\n\n\n####################################\n{context}\n####################################\n\n\nExpected one of: {expected_tokens}.\nPrevious tokens: {token_history}\n"
            bugzprint(error_message)
            quit()
        else:
            bugzprint(f"An unexpected error occurred: {str(e)}")

def convert_tree_to_json(tree):
    if isinstance(tree, Token):
        return {tree.type: tree.value}
    elif isinstance(tree, Tree):
        json_tree = {tree.data: [convert_tree_to_json(child) for child in tree.children]}
        return json_tree
    else:
        return tree
        
class Variable:
    def __init__(self):
        self.global_vars = {}
        self.scopes_stack = [{}]
        self.debug = 1000 #####################################################################################

    def push_scope(self, scope):
        self.scopes_stack.append(scope)

    def pop_scope(self):
        if len(self.scopes_stack) > 1:  # Ensure we don't pop the global scope
            self.scopes_stack.pop()

    def set(self, var_name, value):
        bugzprint(f"Setting variable '{var_name}' to value '{value}'") if self.debug < 3 else None  # Debug print
        self._set_recursive(var_name, value, self.global_vars)  # Start setting from global scope

    def _set_recursive(self, var_name, value, scope):
        if "[" not in var_name or "]" not in var_name:
            scope[var_name] = value
            bugzprint(f"Assigned value '{value}' to variable '{var_name}'") if self.debug < 3 else None  # Debug print
            return
        obj_name, keys_str = var_name.split("[")[0], var_name.split("[")[1].split("]")[0]
        keys = [key.strip() for key in keys_str.split(',')]
        current_dict = scope
        for key in keys[:-1]:
            if key not in current_dict:
                current_dict[key] = {}
            current_dict = current_dict[key]
        current_dict[keys[-1]] = value
        bugzprint(f"Nested value set: {value}") if self.debug < 3 else None  # Debug print

    def get(self, var_name):
        bugzprint(f"Retrieving value for variable '{var_name}'") if self.debug < 3 else None  # Debug print
        if "[" not in var_name or "]" not in var_name:
            value = self.global_vars.get(var_name)
            if value is None:
                bugzprint(f"Variable '{var_name}' not found in global scope.") if self.debug < 3 else None
            else:
                bugzprint(f"Retrieved value '{value}' for variable '{var_name}'") if self.debug < 3 else None  # Debug print
            return value
        obj_name, keys_str = var_name.split("[")[0], var_name.split("[")[1].split("]")[0]
        keys = [key.strip() for key in keys_str.split(',')]
        current_dict = self.global_vars
        for key in keys:
            if isinstance(current_dict, dict) and key in current_dict:
                current_dict = current_dict[key]
            else:
                bugzprint(f"Key '{key}' not found in '{var_name}'") if self.debug < 3 else None
                return None
        bugzprint(f"Retrieved value '{current_dict}' for variable '{var_name}'") if self.debug < 3 else None  # Debug print
        return current_dict

class ASTExecutor:
    def __init__(self):
        self.variables = Variable()
        self.localfuncvars = {}
        self.funcs = []
        self.debug = 10000 #####################################################################################
        self.initialising = True

    def case_insensitive_method_search(self, obj, method_name):
        method_name_lower = method_name.lower()
        for method in dir(obj):
            if method.lower() == method_name_lower and callable(getattr(obj, method)):
                return method
        return None

    def call_func_by_key(self, key, *args, **kwargs):
        method_name = self.case_insensitive_method_search(self, key)
        bugzprint("-----" + str(method_name)) if self.debug < 3 else None
        if method_name is not None:
            func_to_call = getattr(self, method_name)
            if "INTERNAL_" in method_name:
                print_tree(len(args)) if self.debug < 3 else None
                print_tree("") if self.debug < 3 else None
                print_tree(str(method_name) + ":") if self.debug < 3 else None
                print_tree(str(args)) if self.debug < 3 else None
                print_tree(str(kwargs)) if self.debug < 3 else None
                if len(args) == 1:
                    return func_to_call(*args, **kwargs)
                elif len(args) == 0:
                    return func_to_call("", **kwargs)
                else:
                    return func_to_call(args, **kwargs)
            else:
                return func_to_call(*args) if not kwargs else func_to_call(kwargs)
        else:
            func = None
            func_to_call = None
            for func in self.funcs:
                if (("INTERNAL_" + str(func['statement_function_definition'][0]['CNAME'])) == key):
                    func_to_call = func
            if func_to_call is None:
                return bugzprint(f"No such func '{key}' defined")
            else:
                temp = []
                for param in args:
                    if "expression" in param:
                        temp.append(self.from_list(self.execute_ast(param)))
                self.variables.push_scope({})
                i=0
                for param in func_to_call['statement_function_definition'][1]['parameter_names']:
                    if "parameter_name" in param:
                        self.variables.set(param['parameter_name'][0]['CNAME'], temp[i])
                        i+=1
                returnval = self.execute_ast(func_to_call['statement_function_definition'][2]['block'])
                self.variables.pop_scope()
                #bugzprint("call func by key:")
                #bugzprint(returnval)
                return returnval
        print_tree(f"No such method '{key}' in class")
  
    def run(self, ast):
        bugzprint("running...") if self.debug < 3 else None
        self.variables.push_scope({})
        self.variables.push_scope({})
        self.variables.push_scope({})
        self.variables.pop_scope()
        self.variables.pop_scope()
        self.variables.pop_scope()
        self.variables.pop_scope()
        self.variables.pop_scope()
        funcz = self.execute_ast(ast)
        bugzprint("done gathering") if self.debug < 3 else None
        self.initialising = False
        bugzprint(self.funcs) if self.debug < 3 else None
        print_tree(self.funcs) if self.debug < 3 else None
        bugzprint("executing") if self.debug < 3 else None
        return self.execute_ast(ast)
        
    def execute_ast(self, ast):
        #bugzprint("WHOLE TREE:")
        #print_tree(str(ast))
        #bugzprint("\n\n")
        if self.initialising:
            functiondefinitions = []
            if isinstance(ast, list):
                for item in ast:
                    self.execute_ast(item)
            elif isinstance(ast, dict):
                for key, value in ast.items():
                    try:
                        if 'statement_function_definition' in value[0]:
                            self.funcs.append(value[0])
                        self.execute_ast(value)
                    except:
                        self.execute_ast(value)
        else:
            if isinstance(ast, list):
                results = []
                for item in ast:
                    result = self.execute_ast(item)
                    results.append(result)
                return results
            elif isinstance(ast, dict):
                results = []
                for key, value in ast.items():
                    result = self.call_func_by_key(key, value)
                    results.append(result)
                return results
            else:
                print_tree(f"{ast}: Invalid AST: Expected a dictionary or list of dictionaries.")

#Main Execution Methods:
    def start(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)
 
    def block(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

#Statement Execution Methods:  
    def statements(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)        

    def statement(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)
        
    def statement_exp_inc_dec(self, ast):
        var_name = self.from_list(ast[0]['variable'][0]['CNAME'])
        expression_result = self.from_list(self.execute_ast(ast[2]))
        op = self.from_list(self.execute_ast(ast[1]))

        print(var_name)  if self.debug < 3 else None
        print(expression_result)  if self.debug < 3 else None
        print(op)  if self.debug < 3 else None

        if op == "+":
            self.variables.set(var_name, self.INTERNAL_CheckDouble(float(self.variables.get(var_name)) + float(expression_result)))        
        if op == "-":
            self.variables.set(var_name, self.INTERNAL_CheckDouble(float(self.variables.get(var_name)) - float(expression_result)))     

        bugzprint(f"Assigned {expression_result} to variable '{var_name}'")  if self.debug < 3 else None
        
        
    def statement_inc_dec(self, ast):
        var_name = self.from_list(ast[0]['variable'][0]['CNAME'])
        if "OPERATOR_INCREMENT" in ast[1]:
            self.variables.set(var_name, self.INTERNAL_CheckDouble(float(self.variables.get(var_name)) + 1))
        if "OPERATOR_DECREMENT" in ast[1]:
            self.variables.set(var_name, self.INTERNAL_CheckDouble(float(self.variables.get(var_name)) - 1))
        print(var_name)
        pass
    def statement_assignment(self, ast):
        if "expression_array" in ast[0]:
            var_name = ast[0]['expression_array'][0]['CNAME']
            expression_result = self.from_list(self.execute_ast(ast[0]['expression_array'][1]['array_list']))
            var_name = var_name + "[" + expression_result + "]"
        else:
            var_name = self.from_list(ast[0]['variable'][0]['CNAME'])
        if "object_definition" in ast[2]['expression'][0]:
            expression_result = self.from_list(self.execute_ast(ast[2]))
            value = {}
            if not expression_result:
                # Handle empty object assignment
                value = {}
            else:
                pairs = self.from_list(expression_result).split(',')
                for pair in pairs:
                    key, val = pair.split(':')
                    value[key.strip()] = val.strip()
            self.variables.set(var_name, value)
        else:
            expression_result = self.from_list(self.execute_ast(ast[2]))
            self.variables.set(var_name, expression_result)

        bugzprint(f"Assigned {expression_result} to variable '{var_name}'")  if self.debug < 3 else None

    def statement_function_definition(self, ast):
        if self.initialising == True:
            print_tree(str(ast)) if self.debug < 3 else None
            return self.execute_ast(ast)
        else:
            return 

    def statement_return(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        #bugzprint("statement return:")
        #bugzprint(       self.execute_ast(ast[1])    )
        #bugzprint(       self.from_list(self.execute_ast(ast[1]))    )
        return self.from_list(self.execute_ast(ast[1])) 

    def statement_loop(self, ast):
        bugzprint(str(ast).replace("'","\"")) if self.debug < 9000 else None
        print_tree(ast) if self.debug < 9000 else None
        bugzprint("hallo") if self.debug < 9000 else None
        iteration_ammt = int(self.from_list(self.execute_ast(ast[1])))
        self.variables.set("A_Index", None) if self.debug < 7 else None
        bugzprint(self.variables.get("A_Index")) if self.debug < 9000 else None
        for count in range(1, iteration_ammt + 1):
            self.variables.set("A_Index", count)
            bugzprint(self.variables.get("A_Index")) if self.debug < 9000 else None
            dump = self.execute_ast(ast[2])
        self.variables.set("A_Index", None)
        bugzprint(self.variables.get("A_Index")) if self.debug < 9000 else None
    def statement_if(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)       

#Expression Evaluation Methods:
    def expression(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

    def expression_array(self, ast):
        cname = None
        dimensions = []

        # Extract CNAME and dimensions from the AST
        for node in ast:
            if 'CNAME' in node and node['CNAME']:
                cname = node['CNAME']
            elif 'array_list' in node and node['array_list']:
                for expr_node in node['array_list']:
                    if 'expression' in expr_node and expr_node['expression']:
                        dimensions.append(expr_node['expression'])

        array = []
        for item in dimensions:
            array.append(self.from_list(self.execute_ast(item[0])))
        comma_separated_values = ','.join(array)
        var_name = f"{cname}[{comma_separated_values}]"
        bugzprint()
        bugzprint("expression array: variable name:  " + var_name) if self.debug < 3 else None
        # Retrieve value from variables
        value = self.variables.get(var_name)
        bugzprint("expression array: value retrieved:  " + str(value)) if self.debug < 3 else None
        bugzprint()
        return value
        
    def expression_or(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

    def expression_bit_shift(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

    def expression_equality(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

    def expression_inequality(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

    def expression_add_sub(self, ast):
        left = float(self.from_list(self.execute_ast(ast[0])))  # Evaluate and convert left operand to int
        operator = self.from_list(self.execute_ast(ast[1]))  # Get the operator token
        right = float(self.from_list(self.execute_ast(ast[2])))  # Evaluate and convert right operand to int
        print_tree(str(ast)) if self.debug < 3 else None
        print_tree(str(left) + " => ") if self.debug < 7 else None
        print_tree(str(operator) + " => ") if self.debug < 7 else None
        print_tree(str(right) + " => ") if self.debug < 7 else None
        if operator == '+':
            result = left + right
            print_tree(f"{left} {operator} {right} = {result}\n") if self.debug < 9 else None  # Debug print
            return self.INTERNAL_CheckDouble(self.from_list(result))  # Return the integer result
        elif operator == '-':
            result = left - right
            print_tree(f"{left} {operator} {right} = {result}") if self.debug < 9 else None  # Debug print
            return self.INTERNAL_CheckDouble(self.from_list(result))  # Return the integer result

        print_tree("Unsupported operation or invalid operands in expression_add_sub")
        return None  # Return None or handle error accordingly
   
    def expression_mul_div(self, ast):
        left = float(self.from_list(self.execute_ast(ast[0])))  # Evaluate and convert left operand to int
        operator = self.from_list(self.execute_ast(ast[1]))  # Get the operator token
        right = float(self.from_list(self.execute_ast(ast[2])))  # Evaluate and convert right operand to int
        bugzprint("\nexpression_mul_div:") if self.debug < 70 else None
        bugzprint(str(ast)) if self.debug < 70 else None
        bugzprint(str(left) + " => ") if self.debug < 70 else None
        bugzprint(str(operator) + " => ") if self.debug < 70 else None
        bugzprint(str(right) + " => ") if self.debug < 70 else None
        if operator == '*':
            result = left * right
            bugzprint(f"{left} {operator} {right} = {result}\n") if self.debug < 90 else None  # Debug print
            return self.INTERNAL_CheckDouble(str(self.from_list(result)))  # Return the integer result
        elif operator == '/':
            result = left / right
            bugzprint(f"{left} {operator} {right} = {result}") if self.debug < 90 else None  # Debug print
            return self.INTERNAL_CheckDouble(str(self.from_list(result)))  # Return the integer result

        print_tree("Unsupported operation or invalid operands in expression_add_sub")
        return None  # Return None or handle error accordingly
        
    def expression_floor_pow(self, ast):
        left = float(self.from_list(self.execute_ast(ast[0])))  # Evaluate and convert left operand to int
        operator = self.from_list(self.execute_ast(ast[1]))  # Get the operator token
        right = float(self.from_list(self.execute_ast(ast[2])))  # Evaluate and convert right operand to int
        print_tree(str(ast)) if self.debug < 3 else None
        print("left => " + str(left)) if self.debug < 70 else None
        print("op => " + str(operator)) if self.debug < 70 else None
        print("right => " + str(right)) if self.debug < 70 else None
        if operator == '/':
            result = left // right
            print_tree(f"{left} {operator} {right} = {result}\n") if self.debug < 70 else None  # Debug print
            return self.INTERNAL_CheckDouble(self.from_list(result))  # Return the integer result
        elif operator == '*':
            result = left ** right
            print_tree(f"{left} {operator} {right} = {result}") if self.debug < 70 else None  # Debug print
            return self.INTERNAL_CheckDouble(self.from_list(result))  # Return the integer result
        print_tree("Unsupported operation or invalid operands in expression_add_sub")
        return None  # Return None or handle error accordingly
        
    def expression_concat(self, ast):
        print_tree("Processing concatenation:", ast) if self.debug < 7 else None
        left = str(self.from_list(self.execute_ast(ast[0])))
        operator = ast[1]['OPERATOR_CONCAT']
        right = str(self.from_list(self.execute_ast(ast[2])))
        print_tree(str(ast)) if self.debug < 3 else None
        print_tree("LEFT => " + str(left)) if self.debug < 7 else None
        print_tree("OPERATOR => " + str(operator)) if self.debug < 7 else None
        print_tree("RIGHT => " + str(right)) if self.debug < 7 else None
        if isinstance(left, str) and isinstance(right, str):
            concatenated_string = left + right
            print_tree("Concatenated String:", repr(concatenated_string)) if self.debug < 7 else None
            return concatenated_string
        else:
            print_tree("Error: Concatenation operands must be strings.")
            return None
   
    def expression_func_call(self, ast):
        func_name = "INTERNAL_" + ast[0]['CNAME']  # Add "INTERNAL_" prefix to function name
        print_tree(ast) if self.debug < 7000 else None
        args_ast = ast[1]['expression_list']  # Extract arguments AST from AST
        args = []
        print_tree("\n\n\nargs AST:") if self.debug < 7000 else None
        print_tree(args_ast) if self.debug < 7000 else None
        args = args_ast
        print_tree(str(args)) if self.debug < 7000 else None
        # Pass all arguments as separate arguments to the function call
        result = self.call_func_by_key(func_name, *args)
        #bugzprint("expression func call:")
        #bugzprint(result)
        return result 
        
    def expression_method(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

    def expression_list(self, ast):
        results = []
        print_tree(f"Processing expression list: {ast}") if self.debug < 7 else None
        for idx, item in enumerate(ast):
            print_tree(f"Processing expression {idx+1} in the list.") if self.debug < 7 else None
            result = self.execute_ast(item)
            print_tree(f"Result of expression {idx+1}: {result}") if self.debug < 7 else None
            results.append(result)
        print_tree(f"Expression List Results: {results}") if self.debug < 7 else None
        return results
        
    def expression_and(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

    def expression_ternary(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

#Variable and Parameter Handling:

    def object_list(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)
        
    def object_definition(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)
        
    def variable(self, ast):
        print_tree(str(ast)) if self.debug < 9 else None
        try:
            bugzprint("deref test") if self.debug < 7 else None
            bugzprint(ast[0]['CNAME']) if self.debug < 7 else None
            bugzprint(self.variables.get("A_Index")) if self.debug < 7 else None
            bugzprint("deref:" + self.from_list(str(ast[0]['CNAME']))) if self.debug < 7 else None
            bugzprint(self.variables.get(self.from_list(str(ast[0]['CNAME'])))) if self.debug < 7 else None
            outyy = self.variables.get(self.from_list(str(ast[0]['CNAME'])))
        except:
            out = ""
        return outyy

    def parameter_name(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

    def parameter_names(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

    def array_list(self, ast):
        print_tree(str(ast)) if self.debug < 3 else None
        return self.execute_ast(ast)

#ENDPOINTS
#Comments and Basic Elements: 
    def MULTI_LINE_COMMENT(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        pass #endpoint      
    
    def LINE_COMMENT(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        pass #endpoint

#Data Types and Values:   
    def CNAME(self, ast):
        print_tree("CNAME" + str(ast)) if self.debug < 90 else None
        return self.from_list(ast[0])

    def NUMBER(self, ast):
        print_tree(str(ast)) if self.debug < 7 else None
        return ast
        
    def COLON(self, ast):
        print_tree(str(ast)) if self.debug < 7 else None
        return ast

    def BOOLEAN(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])

    def STRING(self, ast):
        print_tree("STRING:" + str(ast)) if self.debug < 20 else None
        return self.from_list(ast).replace('`n', '\n').replace('`t', '\t').replace('`r', '\r').translate(str.maketrans("", "", '"'))

#Operators:


        
    def OPERATOR_FLOORDIV(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])   
                        
    def OPERATOR_POWER(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])   
                
    def OPERATOR_INCREMENT(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])   
        
    def OPERATOR_DECREMENT(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0]) 
        
    def OPERATOR_EXP_INC(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0]) 
        
    def OPERATOR_EXP_DEC(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def OPERATOR_LESS(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def OPERATOR_AND(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])

    def OPERATOR_BIT_SHIFT_RIGHT(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])

    def OPERATOR_GREATER(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def OPERATOR_EQUAL(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def OPERATOR_OR(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def OPERATOR_TERNARY_ELSE(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def OPERATOR_NOT_EQUAL(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def OPERATOR_ASSIGN(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])

    def OPERATOR_TERNARY_IF(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])

    def OPERATOR_DIV(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])

    def OPERATOR_ADD(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])

    def OPERATOR_SUB(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def OPERATOR_MUL(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])

    def OPERATOR_CONCAT(self, ast):
        print_tree("Processing concat operator:", ast) if self.debug < 7 else None
        concatenated_string = ""
        for expr_ast in ast:
            expr_result = self.execute_ast(expr_ast)
            if isinstance(expr_result, str):
                concatenated_string += expr_result
            else:
                print_tree("Error: Concatenation operands must be strings.")
                return None
        print_tree("Concatenated String:", repr(concatenated_string)) if self.debug < 7 else None
        return concatenated_string

#Control Flow and Logic:        
    def COMMAND(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])

    def LOOP(self, ast):
        print_tree("test:" + str(ast)) if self.debug < 9000 else None
        return self.from_list(ast[0])
        
    def ELSE(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def IF(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
        
    def RETURN(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        #print_tree(ast)
        return self.from_list(ast[0])

#Delimiters and Separators:
    def COMMA(self, ast):
        print_tree(str(ast)) if self.debug < 2 else None
        return self.from_list(ast[0])
 
    def from_list(self, data_list):
        if isinstance(data_list, list):
            flattened_list = []
            for item in data_list:
                flattened_item = self.from_list(item)
                if isinstance(flattened_item, str):
                    flattened_list.append(flattened_item)
                elif isinstance(flattened_item, list):
                    flattened_list.extend(flattened_item)
            return ''.join(flattened_list)
        else:
            return str(data_list).strip('"') if isinstance(data_list, str) else str(data_list)

    def to_list(self, raw_data):
        if isinstance(raw_data, str):
            return [raw_data]  # Convert string to list with one element
        elif isinstance(raw_data, int):
            return [raw_data]  # Convert integer to list with one element
        else:
            return raw_data  # Return as is for other types

#Built-in functions
    def INTERNAL_print(self, ast):
        print(self.from_list(self.execute_ast(ast)))

    def INTERNAL_Upper(self, ast):
        return self.from_list(self.execute_ast(ast)).upper()
        
    def INTERNAL_Lower(self, ast):
        return self.from_list(self.execute_ast(ast)).lower()

    def INTERNAL_SubStr(self, ast):
        string_value = self.from_list(self.execute_ast(ast[0]))
        start_index = int(self.from_list(self.execute_ast(ast[2])))
        print_tree(string_value) if self.debug < 3 else None
        print_tree(start_index) if self.debug < 3 else None
        if len(ast) > 3:
            end_offset = int(self.from_list(self.execute_ast(ast[4])))  # Get the offset from AST
            end_index = start_index + end_offset  # Calculate the end index relative to start
            print_tree("end: " + str(end_index)) if self.debug < 3 else None
            substring = string_value[start_index:end_index]
        else:
            substring = string_value[start_index:]
            
        return substring

    def INTERNAL_InStr(self, ast):
        return str(int(self.from_list(self.execute_ast(ast[0])).find(self.from_list(self.execute_ast(ast[2]))))+1)

    def INTERNAL_StrReplace(self, ast):
        string_value = self.from_list(self.execute_ast(ast[0]))
        old_str = self.from_list(self.execute_ast(ast[2]))
        new_str = self.from_list(self.execute_ast(ast[4]))
        replaced_string = string_value.replace(old_str, new_str)
        return replaced_string

    def INTERNAL_StrSplit(self, ast):
        string_value = self.from_list(self.execute_ast(ast[0]))
        delimiter = self.from_list(self.execute_ast(ast[1]))
        split_list = string_value.split(delimiter)
        return str(split_list)

    def INTERNAL_StrLen(self, ast):
        string_value = self.from_list(self.execute_ast(ast))
        length = len(string_value)
        return str(length)

    def INTERNAL_Dice(self, ast):
        return self.INTERNAL_CheckDouble(str(int(random.random() * int(self.from_list(self.execute_ast(ast['expression']))) + 1)))

    def INTERNAL_Rand(self, ast):
        print_tree(str(ast))  if self.debug < 3 else None
        print_tree(len(ast))  if self.debug < 3 else None
        if len(ast) == 1:
            max_val = int(self.from_list(self.execute_ast(ast)))
            return self.INTERNAL_CheckDouble(str(int(random.random() * (max_val + 1))))
        if len(ast) == 3:
            min_val = int(self.from_list(self.execute_ast(ast[0])))
            max_val = int(self.from_list(self.execute_ast(ast[2])))
            return self.INTERNAL_CheckDouble(str(int(random.random() * (max_val - min_val + 1) + min_val)))
        else:
            return self.INTERNAL_CheckDouble(str(int(random.random() * 101)))  # Default range if no arguments provided

    def INTERNAL_Mod(self, ast):
        dividend = int(self.from_list(self.execute_ast(ast[0])))
        divisor = int(self.from_list(self.execute_ast(ast[1])))
        return str(dividend % divisor)

    def INTERNAL_Floor(self, ast):
        return self.INTERNAL_CheckDouble(str(math.floor(float(self.from_list(self.execute_ast(ast))))))

    def INTERNAL_Ceil(self, ast):
        return self.INTERNAL_CheckDouble(str(math.ceil(float(self.from_list(self.execute_ast(ast))))))

    def INTERNAL_Round(self, ast):
        return self.INTERNAL_CheckDouble(str(round(float(self.from_list(self.execute_ast(ast))))))
        
    def INTERNAL_Abs(self, ast):
        return self.INTERNAL_CheckDouble(str(int(abs(float(self.from_list(self.execute_ast(ast)))))))

    def INTERNAL_Exp(self, ast):
        return self.INTERNAL_CheckDouble(str(math.exp(float(self.from_list(self.execute_ast(ast))))))

    def INTERNAL_Log(self, ast):
        return self.INTERNAL_CheckDouble(str(math.log(float(self.from_list(self.execute_ast(ast))))))

    def INTERNAL_Sin(self, ast):
        return self.INTERNAL_CheckDouble(str(math.sin(math.radians(float(self.from_list(self.execute_ast(ast)))))))

    def INTERNAL_Cos(self, ast):
        return self.INTERNAL_CheckDouble(str(math.cos(float(self.from_list(self.execute_ast(ast))))))
        
    def INTERNAL_Tan(self, ast):
        return self.INTERNAL_CheckDouble(str(round(math.tan(math.radians(float(self.from_list(self.execute_ast(ast))))), 10)) if math.isclose(round(math.tan(math.radians(float(self.from_list(self.execute_ast(ast))))), 10), 1.0, abs_tol=1e-10) else "Not approximately 1")
   
    def INTERNAL_Cotan(self, ast):
        angle_degrees = float(self.from_list(self.execute_ast(ast)))
        angle_radians = math.radians(angle_degrees)
        # Calculate cotangent value using cosine and sine
        cos_value = math.cos(angle_radians)
        sin_value = math.sin(angle_radians)
        # Check if sin_value is close to 0 to avoid division by zero
        if math.isclose(sin_value, 0.0, abs_tol=1e-10):
            return "Not defined"  # Cotangent is not defined when sin(theta) = 0
        else:
            cotangent_value = cos_value / sin_value
            return self.INTERNAL_CheckDouble(cotangent_value)
        
    def INTERNAL_Power(self, ast):
        base = float(self.from_list(self.execute_ast(ast[0])))
        exponent = float(self.from_list(self.execute_ast(ast[2])))
        result = math.pow(base, exponent)
        return self.INTERNAL_CheckDouble(result)

    def INTERNAL_Sqrt(self, ast):
        num = float(self.from_list(self.execute_ast(ast)))
        result = math.sqrt(num)
        return self.INTERNAL_CheckDouble(result)

    def INTERNAL_CheckDouble(self, ast):
        num_str = str(ast)
        if '.' in num_str:
            stripped_num = num_str.rstrip('0').rstrip('.')
            return stripped_num
        else:
            return num_str

    def INTERNAL_Asc(self, ast):
        char = self.from_list(self.execute_ast(ast))
        if len(char) == 1:
            return str(ord(char))
        else:
            raise ValueError("asc() function expects a single character string.")

    def INTERNAL_Chr(self, ast):
        ascii_code = int(self.from_list(self.execute_ast(ast)))
        if 0 <= ascii_code <= 255:
            return chr(ascii_code)
        else:
            raise ValueError("chr() function expects an ASCII value between 0 and 255.")
            
    def INTERNAL_RegexMatch(self, ast):
        input_string = self.from_list(self.execute_ast(ast[0]))
        pattern = self.from_list(self.execute_ast(ast[2]))
        match = re.search(pattern, input_string)
        if match:
            return match.group()
        else:
            return ""  # Return empty string if no match found

    def INTERNAL_RegexReplace(self, ast):
        input_string = self.from_list(self.execute_ast(ast[0]))
        pattern = self.from_list(self.execute_ast(ast[2]))
        replace_str = self.from_list(self.execute_ast(ast[4]))
        replaced_string = re.sub(pattern, replace_str, input_string)
        return replaced_string
        
    def INTERNAL_Grep(self, ast):
        pattern = self.from_list(self.execute_ast(ast[0]))
        text = self.from_list(self.execute_ast(ast[2]))
        lines = text.split('\n')
        matched_lines = []
        for line in lines:
            if re.search(pattern, line):
                matched_lines.append(line)
        return str(matched_lines)  # Return the list of matched lines directly

def print_hierarchy(node, indent='', is_last=True, prefix='', is_child=False):
    global clipboard
    if isinstance(node, list):
        for idx, item in enumerate(node):
            new_indent = indent
            print_hierarchy(item, new_indent, idx == len(node) - 1, prefix, True)
    elif isinstance(node, dict):
        for idx, (key, value) in enumerate(node.items()):
            new_prefix = '╚' if is_last and idx == len(node) - 1 else '╠'
            has_children = isinstance(value, (list, dict)) and len(value) > 0
            if is_child and has_children:
                prefix_char = '╦═'
                connector = '>'
            else:
                prefix_char = '═'
                connector = '>'
            print(f"{indent}{prefix}{new_prefix}{prefix_char}{connector}{key}:", end=' ')
            clipboard = clipboard + (f"{indent}{prefix}{new_prefix}{prefix_char}{connector}{key}:")
            if not has_children:
                print(value)
                clipboard = clipboard + str(value) + "\n"
            else:
                print()
                clipboard = clipboard + "\n"
            new_is_last = is_last and idx == len(node) - 1
            new_prefix += ' ' if not is_child else ''
            print_hierarchy(value, indent + (' ' if new_is_last else '║'), new_is_last, prefix, has_children)

def print_tree(tree_str, other=0):
    if other:
        return tree_str
    else:
        if is_valid_json(str(tree_str).replace("'","\"").replace("\"\"","\"")):
            bugzprint("\nroot:")
            print_hierarchy(json.loads(str(tree_str).replace("'","\"").replace("\"\"","\"")))
          
def is_valid_json(my_str):
    try:
        json.loads(my_str)
        return True
    except ValueError:
        return False
        
        
print("assigning grammar")
parser = Lark(coyote_grammar, parser='earley', lexer="dynamic_complete")
print("tokenizing")
ast = parse_code(code)
print("converting to json obj")
json_tree = convert_tree_to_json(ast)
print("converting to json string")
json_str = json.dumps(json_tree)
#bugzprint(json_tree)

#print_tree(str(json_tree).replace("'","\""))
#pyperclip.copy(str(clipboard))
#spam = pyperclip.paste()
print("initialising executer")
executor = ASTExecutor()
print("executing code")
executor.run(json.loads(json_str))



