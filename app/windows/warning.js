const electron = require("electron");

function cancel() {
    electron.remote.getCurrentWindow().close();
}

document.addEventListener("keydown", (event) => {
    if (event.code == "Enter") {
        cancel();
    } else if (event.code == "Escape") {
        cancel();
    }
}, true);

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("cancel").addEventListener("click", event => cancel(), true);
}, true);

electron.ipcRenderer.on("cancel", (event) => cancel());

electron.ipcRenderer.on("get_warning_data", (event, {title, content}) => {
    document.getElementById("warning_title").textContent = title;
    document.getElementById("warning_content").textContent = content;
});