import * as vscode from 'vscode';

const split_re = /\B_\B/i;
const dec_re = /^(0|[1-9][0-9]*)(u|l|ul|lu|ll|ull|llu)?$/i;
const hex_re = /^0x([0-9a-f]+)(u|l|ul|lu|ll|ull|llu)?$/i;
const oct_re = /^(0[0-7]+)(u|l|ul|lu|ll|ull|llu)?$/i;
const bin_re = /^0b([01]+)(u|l|ul|lu|ll|ull|llu)?$/i;

const select_re = /[%$]?[0-9a-fulx_]+$/i;
const hex_65xx_re = /^\$([0-9a-f]+)$/i;
const bin_65xx_re = /^%([01]+)$/i;

function parse_number(text: string) {
    let match;
    let underscores = "";

    if (text.includes("_")) {
        underscores = "_";
    }

    // remove underscores in the number
    text = text.split(split_re).join("");

    let bases = [
        {"regex": dec_re, "base": 10},
        {"regex": hex_re, "base": 16},
        {"regex": oct_re, "base": 8},
        {"regex": bin_re, "base": 2},
        {"regex": hex_65xx_re, "base": 16},
        {"regex": bin_65xx_re, "base": 2},
    ];

    for (let base of bases) {
        match = text.match(base.regex);
        if (match && match[1]) {
            return {
                "number": parseInt(match[1], base.base),
                "base": base.base,
                "suffix": match[2] || "",
                "underscores": underscores,
            };
        }
    }

    return undefined;
}

function format_str(str: string, num: number, separator: string = " ") {
    let res = str.substr(-num);
    str = str.substr(0, str.length-num);

    while (str.length) {
        res = str.substr(-num) + separator + res;
        str = str.substr(0, str.length-num);
    }

    return res;
}

// TODO: rewrite this sh*tty code
function gen_bits_position_string(curr_bits: number) {
    let start = 4;
    let str = "0";

    str += "||||";
    while (start < curr_bits) {
        str += "||";
        str += start.toString(10);
        str += "||||";

        start += 4;
    }

    return str.split("|").reverse().join("|");
}

function set_bits_commands(str: string, position: vscode.Position) {
    let arr = str.split("|");
    let counter = 0;

    for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i] == '0' || arr[i] == '1') {
            // TODO: make this a type or smth?
            let data = {"offset": counter, "pos":{"line": position.line, "char": position.character}};

            arr[i] = '[' + arr[i] + '](command:display_nums.change_bit?' + JSON.stringify(data) + ')';

            counter++;
        }
    }

    return arr.join("|");
}

// TODO: add configs with default length
// do vscode have configs?? oO
function get_curr_bits_in_word(num: number) {
    return num.toString(2).length + ((-num.toString(2).length) & 0x3);
}

function get_closer_bits_num(curr_bits: number) {
    let i: number = 8; // bits number in byte
    while (i < curr_bits) {
        i <<= 1;
    }

    return i;
}

function gen_basic_string(num: number, position: vscode.Position) {
    let str: string = "";
    let data = {"base": 0, "pos":{"line": position.line, "char": position.character}};

    str += "|||\n";
    str += "|---|---|\n";

    data.base = 16;
    str += "|[Hex](command:display_nums.convert_number?" + JSON.stringify(data) + "):|";
    str += format_str(num.toString(16), 2)  + "|\n";

    data.base = 10;
    str += "|[Dec](command:display_nums.convert_number?" + JSON.stringify(data) + "):|";
    str += format_str(num.toString(10), 3, ",");

    // check if number can be negative
    let sign_bit = get_closer_bits_num(Math.floor(num / 2).toString(2).length) - 1;
    if (num & (1 << sign_bit)) {
        let mask = Math.pow(2, (sign_bit + 1)) - num;

        str += " (-" + mask + ")";
    }

    str += "|\n";

    data.base = 8;
    str += "|[Oct](command:display_nums.convert_number?" + JSON.stringify(data) + "):|";
    str += format_str(num.toString(8),  3)  + "|\n";

    str += "\n";

    // TODO: rewrite this too (maybe?)
    const curr_bits_in_word = get_curr_bits_in_word(num);
    const temp_str = format_str(num.toString(2).padStart(curr_bits_in_word, "0"), 4, "|");
    const final_str = format_str(temp_str, 1, "|");
    const len = final_str.split("|").length + 1;

    const str_w_cmds = set_bits_commands(final_str, position);

    str += "|" + "".padStart(len, "|") + "\n";
    str += "|" + "".padEnd(len, "*").split("*").join(":---:|") + "\n";
    data.base = 2;
    str += "|[Bin](command:display_nums.convert_number?" + JSON.stringify(data) + "):|";
    str += str_w_cmds + " " + "|\n";
    str += "|" + gen_bits_position_string(curr_bits_in_word) + "|\n";

    return str;
}

function convert_number(num: {"number": number, "base": number, "underscores": string, "suffix": string}) {
    let prefix = "";
    let output = "";

    switch (num.base) {
    case 16:
        prefix = "0x";
        output = format_str(num.number.toString(num.base), 4, num.underscores);
        break;
    case 10:
        output = format_str(num.number.toString(num.base), 3, num.underscores);
        break;
    case 8:
        prefix = "0";
        output = format_str(num.number.toString(num.base), 4, num.underscores);
        break;
    case 2:
        prefix = "0b";
        output = format_str(num.number.toString(num.base), 4, num.underscores);
        break;
    }

    return prefix + output + num.suffix;
}

class Provider {
    provideHover(document: vscode.TextDocument, position: vscode.Position) {
        const wordRange = document.getWordRangeAtPosition(position, select_re);
        const word = wordRange ? document.getText(wordRange) : '';

        const num = parse_number(word);

        if (!num) {
            return null;
        }

        let str = new vscode.MarkdownString();
        str.isTrusted = true;

        str.appendMarkdown(gen_basic_string(num.number, position));

        return new vscode.Hover(str);
    }
}

export function activate(context: vscode.ExtensionContext) {
    const ctx = vscode.languages.registerHoverProvider(
        [
            { pattern: '**', scheme: 'file' },
            { pattern: '**', scheme: 'untitled' },
            { scheme: 'file', language: 'plaintext' }
        ],
        new Provider()
    );

    context.subscriptions.push(ctx);

    // some strange things happens here..
    // TODO: rewrite pls...
    const change_bit_commandHandler = (obj: {"offset": number, "pos":{"line": number, "char": number}}) => {
        if (!vscode.window.activeTextEditor || !vscode.window.activeTextEditor.document) {
            return null;
        }

        const document = vscode.window.activeTextEditor.document;
        const pos = new vscode.Position(obj.pos.line, obj.pos.char);
        const wordRange = document.getWordRangeAtPosition(pos, select_re);
        const word = wordRange ? document.getText(wordRange) : '';

        const num = parse_number(word);
        if (!num || !wordRange) {
            return null;
        }

        // convert number to string of bits
        let bin_num = num.number.toString(2).padStart(get_curr_bits_in_word(num.number), "0");

        // calculate inverting bit's position and it's value
        obj.offset = bin_num.length - obj.offset - 1;
        const val = bin_num[obj.offset] == "0" ? 1 : 0;

        // replace that bit with magic
        bin_num = bin_num.substr(0, obj.offset) + val.toString(2) + bin_num.substr(obj.offset + 1);

        // turn back it to int
        num.number = parseInt(bin_num, 2);

        return vscode.window.activeTextEditor.edit(
            function (builder) {
                builder.replace(wordRange, convert_number(num));
            }
        )
    }

    context.subscriptions.push(vscode.commands.registerCommand('display_nums.change_bit', change_bit_commandHandler));

    const convert_number_commandHandler = (obj: {"base": number, "pos":{"line": number, "char": number}}) => {
        if (!vscode.window.activeTextEditor || !vscode.window.activeTextEditor.document) {
            return null;
        }

        const document = vscode.window.activeTextEditor.document;
        const pos = new vscode.Position(obj.pos.line, obj.pos.char);
        const wordRange = document.getWordRangeAtPosition(pos, select_re);
        const word = wordRange ? document.getText(wordRange) : '';

        const num = parse_number(word);
        if (!num || !wordRange) {
            return null;
        }

        num.base = obj.base;

        return vscode.window.activeTextEditor.edit(
            function (builder) {
                builder.replace(wordRange, convert_number(num));
            }
        )
    }

    context.subscriptions.push(vscode.commands.registerCommand('display_nums.convert_number', convert_number_commandHandler));
}
