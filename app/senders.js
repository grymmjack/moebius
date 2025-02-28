const electron = require("electron");
const path = require("path");
const win = electron.remote.getCurrentWindow();

function on(channel, msg) {
    return electron.ipcRenderer.on(channel, msg);
}

function getWindowId() {
    try {
        const currentWindow = electron.remote.getCurrentWindow();
        if (currentWindow) {
            const parentWindow = currentWindow.getParentWindow();
            if (parentWindow) {
                return parentWindow.id;
            }
            return currentWindow.id;
        }
    } catch (err) {
        console.error('Error getting window ID:', err);
    }
    return null;
}

function send_sync(channel, opts) {
    const id = getWindowId();
    return electron.ipcRenderer.sendSync(channel, {id, ...opts});
}

function send(channel, opts = {}) {
    const id = getWindowId();
    electron.ipcRenderer.send(channel, {id, ...opts});
}

function msg_box(message, detail, opts = {}) {
    send("close_modal", {});
    return electron.remote.dialog.showMessageBoxSync(win, {message, detail, ...opts});
}

function open_box(opts) {
    send("set_modal_menu");
    const files = electron.remote.dialog.showOpenDialogSync(win, opts);
    send("set_doc_menu");
    return files;
}

function save_box(default_file, ext, opts) {
    send("set_modal_menu");
    const file = electron.remote.dialog.showSaveDialogSync(win, {defaultPath: `${default_file ? path.parse(default_file).name : "Untitled"}.${ext}`, ...opts});
    send("set_doc_menu");
    return file;
}

module.exports = {on, send_sync, send, msg_box, open_box, save_box};
