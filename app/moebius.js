const prefs = require("./prefs");
const electron = require("electron");
const window = require("./window");
const menu = require("./menu");
const touchbar = require("./touchbar");
const path = require("path");
const docs = {};
let last_win_pos;
const darwin = (process.platform == "darwin");
const win32 = (process.platform == "win32");
const linux = (process.platform == "linux");
const frameless = darwin ? { frame: false, titleBarStyle: "hiddenInset" } : { frame: true };
let prevent_splash_screen_at_startup = false;
let splash_screen;
const discord = require("./discord");
const {new_win} = require("./window");

// This switch is required for <input type="color"> to utilize the OS color
// picker, which is nicer than the one that's provided by chromium. At some
// time in the future, this may no longer be true, in which case it would be
// fine to remove this line if it causes other issues with forms.
electron.app.commandLine.appendSwitch('disable-features', 'FormControlsRefresh')

function cleanup(id) {
    menu.cleanup(id);
    last_win_pos = docs[id].win_pos;
    delete docs[id];
    if (docs.length == 0) menu.set_application_menu();
}

async function new_document_window() {
    const win = await window.new_doc();
    if (last_win_pos) {
        const display = electron.screen.getPrimaryDisplay();
        const [max_x, max_y] = [display.workArea.width + display.workArea.x - 1280, display.workArea.height + display.workArea.y - 800];
        const [new_x, new_y] = [last_win_pos[0] + 30, last_win_pos[1] + 30];
        if (new_x < max_x && new_y < max_y) win.setPosition(new_x, new_y);
    }
    const win_pos = win.getPosition();
    last_win_pos = win_pos;
    const debug = prefs.get("debug");
    docs[win.id] = { win, menu: menu.document_menu(win, debug), chat_input_menu: menu.chat_input_menu(win, debug), edited: false, win_pos, destroyed: false, open_in_current_window: false };
    touchbar.create_touch_bars(win);
    prefs.send(win);
    win.on("focus", (event) => {
        if (darwin) {
            if (docs[win.id] && docs[win.id].modal && !docs[win.id].modal.isDestroyed()) {
                electron.Menu.setApplicationMenu(menu.modal_menu);
            } else {
                electron.Menu.setApplicationMenu(docs[win.id].menu);
            }
        } else {
            docs[win.id].win.setMenu(docs[win.id].menu);
        }
        // win.openDevTools({mode: "detach"});
    });
    win.on("close", (event) => {
        if (prefs.get("unsaved_changes") && docs[win.id].edited && !docs[win.id].destroyed) {
            event.preventDefault();
            win.send("check_before_closing");
        } else {
            cleanup(win.id);
        }
    });
    return win;
}

async function new_document({ columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data, font_bytes } = {}) {
    const win = await new_document_window();
    if (!author) author = prefs.get("nick");
    if (!group) group = prefs.get("group");
    if (!rows) {
        const num = Number.parseInt(prefs.get("new_document_rows"));
        rows = (num >= 1 && num <= 3000) ? num : 25;
    }
    win.send("new_document", { columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data, font_bytes });
}

// Function to add a file to the recent files list in preferences
function add_to_recent_files(file) {
    console.log("Adding to recent files:", file);
    
    // Make sure we have an array (might be undefined if it's the first time)
    let recent_files = prefs.get("recent_files");
    if (!Array.isArray(recent_files)) {
        recent_files = [];
    }
    
    // If file is already in the list, remove it
    const file_index = recent_files.indexOf(file);
    if (file_index !== -1) {
        recent_files.splice(file_index, 1);
    }
    
    // Add file to the beginning of the list
    recent_files.unshift(file);
    
    // Keep only the most recent 10 files
    if (recent_files.length > 10) {
        recent_files.pop();
    }
    
    console.log("Recent files after update:", recent_files);
    
    // Save updated list to preferences
    prefs.set("recent_files", recent_files);
    
    // Force menu rebuild for all windows
    for (const id of Object.keys(docs)) {
        docs[id].menu = menu.document_menu(docs[id].win, prefs.get("debug"));
        if (!darwin) {
            docs[id].win.setMenu(docs[id].menu);
        }
    }
    
    // Update application menu (mainly for macOS)
    menu.set_application_menu();
}

function set_file(id, file) {
    docs[id].file = file;
    docs[id].win.setRepresentedFilename(file);
    docs[id].win.setTitle(path.basename(file));
    docs[id].win.setDocumentEdited(false);
    docs[id].edited = false;
    electron.app.addRecentDocument(file);
    add_to_recent_files(file);
}

electron.ipcMain.on("set_file", (event, { id, file }) => set_file(id, file));

menu.on("new_document", new_document);
electron.ipcMain.on("new_document", (event, opts) => new_document(opts));

function check_if_file_is_already_open(file) {
    for (const id of Object.keys(docs)) {
        if (docs[id].file == file) {
            docs[id].win.show();
            return true;
        }
    }
    return false;
}

async function open_file(file) {
    if (check_if_file_is_already_open(file)) return;
    const win = await new_document_window();
    win.send("open_file", file);
}
electron.ipcMain.on("open_file", (event, {file}) => open_file(file));

function open_in_new_window(win) {
    if (win && docs[win.id].open_in_current_window) {
        return false;
    }
    return !win || docs[win.id].network || docs[win.id].file || docs[win.id].edited;
}

function open(win) {
    if (darwin && win) electron.Menu.setApplicationMenu(menu.modal_menu);
    const files = electron.dialog.showOpenDialogSync(open_in_new_window(win) ? undefined : win, { filters: [{ name: "TextArt", extensions: ["ans", "xb", "bin", "diz", "asc", "txt", "nfo"] }, { name: "All Files", extensions: ["*"] }], properties: ["openFile", "multiSelections"] });
    if (darwin && win) electron.Menu.setApplicationMenu(docs[win.id].menu);
    if (!files) return;
    for (const file of files) {
        if (win && !check_if_file_is_already_open(file) && !open_in_new_window(win)) {
            win.send("open_file", file);
            docs[win.id].file = file;
        } else {
            open_file(file);
        }
    }
}

menu.on("open", open);
electron.ipcMain.on("open", (event) => open());

menu.on("open_in_current_window", (win) => {
    docs[win.id].open_in_current_window = true;
    open(win);
});

// Open a file from the recent files list
menu.on("open_recent_file", ({ win, file }) => {
    console.log("Opening recent file:", file);
    console.log("Win provided:", !!win);
    
    const fs = require("fs");
    // Check if file exists
    if (fs.existsSync(file)) {
        console.log("File exists");
        
        if (win && !check_if_file_is_already_open(file) && !open_in_new_window(win)) {
            console.log("Opening in existing window");
            win.send("open_file", file);
            docs[win.id].file = file;
        } else {
            console.log("Opening in new window");
            open_file(file);
        }
    } else {
        console.log("File does not exist:", file);
        
        // If file doesn't exist, show an error and remove it from the recent files list
        let recent_files = prefs.get("recent_files");
        if (!Array.isArray(recent_files)) {
            recent_files = [];
        }
        
        const file_index = recent_files.indexOf(file);
        if (file_index !== -1) {
            recent_files.splice(file_index, 1);
            prefs.set("recent_files", recent_files);
            
            // Rebuild menus
            for (const id of Object.keys(docs)) {
                docs[id].menu = menu.document_menu(docs[id].win, prefs.get("debug"));
                if (!darwin) {
                    docs[id].win.setMenu(docs[id].menu);
                }
            }
            menu.set_application_menu();
        }
        
        // Show error dialog
        electron.dialog.showMessageBoxSync({
            type: "error",
            title: "File Not Found",
            message: `The file "${file}" could not be found.`,
            detail: "It may have been moved, renamed, or deleted.",
            buttons: ["OK"]
        });
    }
});

// Clear the recent files list
menu.on("clear_recent_files", () => {
    prefs.set("recent_files", []);
    
    // Rebuild menus
    for (const id of Object.keys(docs)) {
        docs[id].menu = menu.document_menu(docs[id].win, prefs.get("debug"));
        if (!darwin) {
            docs[id].win.setMenu(docs[id].menu);
        }
    }
    menu.set_application_menu();
});

async function preferences() {
    const preferences = await window.static("app/html/preferences.html", { width: 480, height: 690 });
    preferences.send("prefs", prefs.get_all());
}
menu.on("preferences", preferences);
electron.ipcMain.on("preferences", (event) => preferences());

async function open_reference_window(win) {
    const files = electron.dialog.showOpenDialogSync(win,
        {
            filters: [{
                name: "Images",
                extensions: ["png", "jpg", "jpeg"]
            }],
            properties: ["openFile", "multiSelections"]
        });

    if (!files) return;
    for (const file of files) {
        let reference = await new_win(
            file,
            {
                width: 480,
                height: 340,
                parent: win,
                maximizable: false,
                minimizable: false,
                fullscreenable: false,
                resizable: true,
            });
    }
}
menu.on("open_reference_window", open_reference_window);

async function show_new_connection() {
    const new_connection = await window.static("app/html/new_connection.html", { width: 480, height: 340 }, touchbar.new_connection);
    const server = prefs.get("server");
    const pass = prefs.get("pass");
    const saved_servers = prefs.get("saved_servers");
    if (server) {
        new_connection.send("saved_servers", { server, pass, saved_servers });
    }
}
menu.on("show_new_connection_window", show_new_connection);
electron.ipcMain.on("show_new_connection_window", (event) => show_new_connection());

async function connect_to_server(server, pass = "") {
    const win = await new_document_window();
    docs[win.id].network = true;
    win.setTitle(server);
    win.send("connect_to_server", { server, pass });
}
electron.ipcMain.on("connect_to_server", (event, { server, pass }) => connect_to_server(server, pass));

async function show_splash_screen() {
    splash_screen = await window.static("app/html/splash_screen.html", { width: 720, height: 600, ...frameless }, touchbar.splash_screen, { preferences, new_document, open });
    const server = prefs.get('server');
    const pass = prefs.get('pass');
    if (server) {
        splash_screen.send("saved_server", { server, pass });
    }
}

menu.on("show_cheatsheet", () => window.static("app/html/cheatsheet.html", { width: 640, height: 816, ...frameless }));
menu.on("show_acknowledgements", () => window.static("app/html/acknowledgements.html", { width: 640, height: 688, ...frameless }));
menu.on("show_numpad_mappings", () => window.static("app/html/numpad_mappings.html", { width: 640, height: 400, ...frameless }));
menu.on("show_changelog", () => window.static("app/html/changelog.html", { width: 352, height: 576, ...frameless }));

function has_documents_open() {
    return Object.keys(docs).length > 0;
}

electron.ipcMain.on("get_canvas_size", async (event, { id, columns, rows }) => {
    docs[id].modal = await window.new_modal("app/html/resize.html", { width: 300, height: 190, parent: docs[id].win, frame: false, ...get_centered_xy(id, 300, 190) }, touchbar.get_canvas_size);
    if (darwin) add_darwin_window_menu_handler(id);
    docs[id].modal.send("set_canvas_size", { columns, rows });
    event.returnValue = true;
});

electron.ipcMain.on("document_changed", (event, { id }) => {
    if (!docs[id].network) {
        docs[id].edited = true;
        docs[id].win.setDocumentEdited(true);
    }
});

electron.ipcMain.on("destroy", (event, { id }) => {
    docs[id].destroyed = true;
    docs[id].win.close();
});

function update_prefs(key, value) {
    prefs.set(key, value);
    for (const id of Object.keys(docs)) docs[id].win.send(key, value);
}

electron.ipcMain.on("update_prefs", (event, { key, value }) => update_prefs(key, value));

electron.ipcMain.on("discord", (event, { value }) => {
    prefs.set("discord", value);
    if (value) {
        discord.login();
    } else {
        discord.destroy();
    }
});

electron.ipcMain.on("show_rendering_modal", async (event, { id }) => {
    docs[id].modal = await window.new_modal("app/html/rendering.html", { width: 200, height: 80, parent: docs[id].win, frame: false, ...get_centered_xy(id, 200, 80) });
    if (darwin) add_darwin_window_menu_handler(id);
    event.returnValue = true;
});

electron.ipcMain.on("show_connecting_modal", async (event, { id }) => {
    docs[id].modal = await window.new_modal("app/html/connecting.html", { width: 200, height: 80, parent: docs[id].win, frame: false, ...get_centered_xy(id, 200, 80) });
    if (darwin) add_darwin_window_menu_handler(id);
    event.returnValue = true;
});

electron.ipcMain.on("close_modal", (event, { id }) => {
    if (docs[id].modal && !docs[id].modal.isDestroyed()) docs[id].modal.close();
});

electron.ipcMain.on("chat_input_focus", (event, { id }) => {
    if (darwin) electron.Menu.setApplicationMenu(docs[id].chat_input_menu);
});

electron.ipcMain.on("chat_input_blur", (event, { id }) => {
    if (darwin) {
        if (docs[id] && docs[id].modal && !docs[id].modal.isDestroyed()) {
            electron.Menu.setApplicationMenu(menu.modal_menu);
        } else {
            electron.Menu.setApplicationMenu(docs[id].menu);
        }
    }
});

electron.ipcMain.on("set_modal_menu", (event, { id }) => {
    if (darwin && docs[id]) electron.Menu.setApplicationMenu(menu.modal_menu);
});

electron.ipcMain.on("set_doc_menu", (event, { id }) => {
    if (darwin && docs[id]) electron.Menu.setApplicationMenu(docs[id].menu);
});

function add_darwin_window_menu_handler(id) {
    docs[id].modal.on("close", () => electron.Menu.setApplicationMenu(docs[id].menu));
    electron.Menu.setApplicationMenu(menu.modal_menu);
}

electron.ipcMain.on("get_sauce_info", async (event, { id, title, author, group, comments }) => {
    docs[id].modal = await window.new_modal("app/html/sauce.html", { width: 600, height: 340, parent: docs[id].win, frame: false, ...get_centered_xy(id, 350, 340) }, touchbar.get_sauce_info);
    if (darwin) add_darwin_window_menu_handler(id);
    docs[id].modal.send("set_sauce_info", { title, author, group, comments });
    event.returnValue = true;
});

electron.ipcMain.on("update_sauce", (event, { id, title, author, group, comments }) => {
    if (docs[id] && docs[id].modal && !docs[id].modal.isDestroyed()) docs[id].modal.send("set_sauce_info", { title, author, group, comments });
});

function get_centered_xy(id, width, height) {
    const pos = docs[id].win.getPosition();
    const size = docs[id].win.getSize();
    const x = pos[0] + Math.floor((size[0] - width) / 2);
    const y = pos[1] + Math.floor((size[1] - height) / 2);
    return { x, y };
}

electron.ipcMain.on("select_attribute", async (event, { id, fg, bg, palette }) => {
    if (docs[id].modal && !docs[id].modal.isDestroyed()) {
        docs[id].modal.close();
        event.returnValue = true;
        return;
    }
    docs[id].modal = await window.new_modal("app/html/select_attribute.html", { width: 340, height: 340, parent: docs[id].win, frame: false, ...get_centered_xy(id, 340, 340) }, touchbar.select_attribute);
    if (darwin) add_darwin_window_menu_handler(id);
    docs[id].modal.send("select_attribute", { fg, bg, palette });
    event.returnValue = true;
});

electron.ipcMain.on("fkey_prefs", async (event, { id, num, fkey_index, current, bitmask, font_height }) => {
    if (docs[id].modal && !docs[id].modal.isDestroyed()) {
        docs[id].modal.close();
        event.returnValue = true;
        return;
    }
    const width = 16 * 8 * 2;
    const height = 16 * font_height * 2;
    docs[id].modal = await window.new_modal("app/html/fkey_prefs.html", { width, height, parent: docs[id].win, frame: false, ...get_centered_xy(id, width, height) });
    if (darwin) add_darwin_window_menu_handler(id);
    docs[id].modal.send("fkey_prefs", { num, fkey_index, current, bitmask, font_height });
    event.returnValue = true;
});

electron.ipcMain.on("set_fkey", async (event, { id, num, fkey_index, code }) => {
    const fkeys = prefs.get("fkeys");
    if (num == -1) {
        docs[id].win.send("set_custom_block", code);
    } else {
        fkeys[fkey_index][num] = code;
        update_prefs("fkeys", fkeys);
    }
});

electron.ipcMain.on("ready", async (event, { id }) => {
    if (splash_screen && !splash_screen.isDestroyed()) splash_screen.close();
    if (prefs.get("smallscale_guide")) docs[id].win.send("toggle_smallscale_guide", true);
});

electron.ipcMain.on("show_controlcharacters", async (event, { id, method, destroy_when_done }) => {
    docs[id].modal = await window.new_modal("app/html/controlcharacters.html", { width: 640, height: 400, parent: docs[id].win, frame: false, ...get_centered_xy(id, 640, 400) });
    if (darwin) add_darwin_window_menu_handler(id);
    docs[id].modal.send("get_save_data", { method, destroy_when_done });
    event.returnValue = true;
});

electron.ipcMain.on("show_warning", async (event, { id, title, content }) => {
    docs[id].modal = await window.new_modal("app/html/warning.html", { width: 480, height: 200, parent: docs[id].win, frame: false, ...get_centered_xy(id, 480, 200) });
    if (darwin) add_darwin_window_menu_handler(id);
    docs[id].modal.send("get_warning_data", { title, content })
    event.returnValue = true;
});

if (darwin) {
    electron.app.on("will-finish-launching", (event) => {
        electron.app.on("open-file", (event, file) => {
            if (electron.app.isReady()) {
                open_file(file);
            } else {
                prevent_splash_screen_at_startup = true;
                electron.app.whenReady().then(() => open_file(file));
            }
        });
    });
    electron.app.on("activate", (event) => {
        if (!has_documents_open()) show_splash_screen();
    });
}

electron.app.on("ready", (event) => {
    if (!darwin && process.argv.length > 1 && require("path").parse(process.argv[0]).name != "electron") {
        for (let i = 1; i < process.argv.length; i++) open_file(process.argv[i]);
    } else {
        if (!prevent_splash_screen_at_startup) show_splash_screen();
    }
    if (darwin) electron.app.dock.setMenu(menu.dock_menu);
    if (prefs.get("discord")) {
        discord.login();
    }
});

electron.app.on("window-all-closed", (event) => {
    if (darwin) {
        menu.set_application_menu();
    } else {
        electron.app.quit();
    }
});

if (win32 && prefs.get("ignore_hdpi")) {
    electron.app.commandLine.appendSwitch("high-dpi-support", "true");
    electron.app.commandLine.appendSwitch("force-device-scale-factor", "1");
}

if (darwin) {
    electron.systemPreferences.setUserDefault("NSDisabledDictationMenuItem", "boolean", true);
    electron.systemPreferences.setUserDefault("NSDisabledCharacterPaletteMenuItem", "boolean", true);
}

// if (linux) electron.app.disableHardwareAcceleration();
