const {palette_4bit} = require("./palette");
const {bytes_to_blocks, Textmode, add_sauce_for_bin} = require("./textmode");
const {send} = require("../senders");

class BinaryText extends Textmode {
    constructor(bytes) {
        super(bytes);
        if (this.columns == undefined) {
            this.columns = 80;
        }
        this.rows = Math.ceil(this.filesize / this.columns / 2);
        this.palette = [...palette_4bit];
        this.data = bytes_to_blocks({columns: this.columns, rows: this.rows, bytes: this.bytes.subarray(0, this.filesize)});
    }
}

function encode_as_bin(doc, save_without_sauce, allow_odd_columns = false) {
    if (!allow_odd_columns && doc.columns % 2 != 0) {
        send(
            "show_warning",
            {
                title: "Error saving binary file",
                content:
                    "The file cannot be saved in the BIN format because it has an uneven number of columns. " +
                    "To resolve this issue, you can either resize the canvas, or save the file as XBIN."
            }
        );
        throw("Cannot save in Binary Text format with an odd number of columns.");
    }
    const bytes = new Uint8Array(doc.data.length * 2);
    for (let i = 0, j = 0; i < doc.data.length; i++, j += 2) {
        bytes[j] = doc.data[i].code;
        bytes[j + 1] = (doc.data[i].bg << 4) + doc.data[i].fg;
    }
    if (!save_without_sauce) {
        return add_sauce_for_bin({doc, bytes});
    }
    return bytes;
}

module.exports = {BinaryText, encode_as_bin};
