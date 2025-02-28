const electron = require("electron");

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().getParentWindow().id, ...opts});
}

function send_parent(channel, opts) {
    electron.remote.getCurrentWindow().getParentWindow().send(channel, opts);
    send("close_modal");
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("ok").addEventListener("click", event => ok(), true);
    document.getElementById("cancel").addEventListener("click", event => cancel(), true);
}, true);

electron.ipcRenderer.on("get_warning_data", (event, {title, content}) => {
    document.getElementById("warning_title").innerText = title;
    document.getElementById("warning_content").innerText = content;
});

function ok() {
    send_parent("warning_ok");
}

function cancel() {
    send_parent("warning_cancel");
}

document.addEventListener("keydown", (event) => {
    if (event.code == "Enter") {
        ok();
    } else if (event.code == "Escape") {
        cancel();
    }
}, true);