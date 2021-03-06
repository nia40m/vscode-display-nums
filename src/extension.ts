import * as vscode from 'vscode';

const split_re = /\B_\B/i;
const dec_re = /^(0|([1-9][0-9]*))(u|l|ul|lu|ll|ull|llu)?$/i;
const hex_re = /^0x([0-9a-f]+)(u|l|ul|lu|ll|ull|llu)?$/i;
const oct_re = /^(0[0-7]+)(u|l|ul|lu|ll|ull|llu)?$/i;
const bin_re = /^0b([01]+)(u|l|ul|lu|ll|ull|llu)?$/i;

function parse_number(text: string) {
    let match;

    // remove underscores in the number
    text = text.split(split_re).join("");

    match = text.match(dec_re);
    if (match && match[1]) {
        return {"number": parseInt(match[1], 10), "base": 10};
    }

    match = text.match(hex_re);
    if (match && match[1]) {
        return {"number": parseInt(match[1], 16), "base": 16};
    }

    match = text.match(oct_re);
    if (match && match[1]) {
        return {"number": parseInt(match[1], 8), "base": 8};
    }

    match = text.match(bin_re);
    if (match && match[1]) {
        return {"number": parseInt(match[1], 2), "base": 2};
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

function gen_basic_string(num: number, position: vscode.Position) {
    let str: string = "";

    str += "|||\n";
    str += "|---|---|\n";
    str += "|Hex:|" + format_str(num.toString(16), 2)  + "|\n";
    str += "|Dec:|" + format_str(num.toString(10), 3, ",") + "|\n";
    str += "|Oct:|" + format_str(num.toString(8),  3)  + "|\n";
    str += "\n";

    // TODO: rewrite this too (maybe?)
    const curr_bits_in_word = get_curr_bits_in_word(num);
    const temp_str = format_str(num.toString(2).padStart(curr_bits_in_word, "0"), 4, "|");
    const final_str = format_str(temp_str, 1, "|");
    const len = final_str.split("|").length + 1;

    const str_w_cmds = set_bits_commands(final_str, position);

    str += "|" + "".padStart(len, "|") + "\n";
    str += "|" + "".padEnd(len, "*").split("*").join(":---:|") + "\n";
    str += "|Bin:|" + str_w_cmds + "|\n";
    str += "|" + gen_bits_position_string(curr_bits_in_word) + "|\n";

    return str;
}

class Provider {
    provideHover(document: vscode.TextDocument, position: vscode.Position) {
        const wordRange = document.getWordRangeAtPosition(position);
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
    const commandHandler = (obj: {"offset": number, "pos":{"line": number, "char": number}}) => {
        if (!vscode.window.activeTextEditor || !vscode.window.activeTextEditor.document) {
            return null;
        }

        const document = vscode.window.activeTextEditor.document;
        const pos = new vscode.Position(obj.pos.line, obj.pos.char);
        const wordRange = document.getWordRangeAtPosition(pos);
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
        const changed = parseInt(bin_num, 2);

        let prefix = "";
        switch (num.base) {
        case 16: prefix = "0x"; break;
        case 8: prefix = "0"; break;
        case 2: prefix = "0b"; break;
        }

        return vscode.window.activeTextEditor.edit(
            function (builder) {
                builder.replace(wordRange, prefix + changed.toString(num.base));
            }
        )
    }

    context.subscriptions.push(vscode.commands.registerCommand('display_nums.change_bit', commandHandler));
}
