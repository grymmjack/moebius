const {tools, toolbar} = require("../ui/ui");

let enabled = false;

let reference_image = null;
let viewport = null;

let mouse_start_pos = null;
let reference_start_pos = null;

document.addEventListener("DOMContentLoaded", (event) => {
    reference_image = document.getElementById("reference_image");
    viewport = document.getElementById('viewport');
});

tools.on("start", (mode) => {
    enabled = (mode === tools.modes.REFERENCE);
    if (enabled) {
        toolbar.show_reference();
        reference_image.classList.add("selected")
        viewport.classList.add('reference-tool')
        viewport.addEventListener("pointerdown", pointer_down, true);
        document.body.addEventListener("pointermove", pointer_move, true);
        document.body.addEventListener("pointerup", pointer_up, true);
        document.body.addEventListener("pointerout", pointer_out, true);

    } else {
        reference_image.classList.remove("selected")
        viewport.classList.remove('reference-tool')
        viewport.removeEventListener("pointerdown", pointer_down, true);
        document.body.removeEventListener("pointermove", pointer_move, true);
        document.body.removeEventListener("pointerup", pointer_up, true);
        document.body.removeEventListener("pointerout", pointer_out, true);
    }
});


function move_reference(y, x) {
    reference_image.style.top = `${y}px`;
    reference_image.style.left = `${x}px`;
}

function pointer_down(event) {
    if (event.button !== 0) return;
    viewport.classList.add('grabbing');

    mouse_start_pos = {
        y: event.clientY,
        x: event.clientX
    }
    reference_start_pos = {
        y: parseFloat(getComputedStyle(reference_image).top) || 0,
        x: parseFloat(getComputedStyle(reference_image).left) || 0
    }
}

function pointer_up() {
    viewport.classList.remove('grabbing');
    mouse_start_pos = null;
    reference_start_pos = null;
}

function pointer_out(event) {
    if (event.relatedTarget) return;
    pointer_up();
}

function pointer_move(event) {
    if (mouse_start_pos) {
        const y_offset = event.clientY - mouse_start_pos.y;
        const x_offset = event.clientX - mouse_start_pos.x;
        move_reference(reference_start_pos.y + y_offset, reference_start_pos.x + x_offset);
    }
}
