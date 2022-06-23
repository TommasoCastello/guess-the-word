init();//Canvas init on load
for (const div of document.getElementsByClassName('brushcontainer')) {
    div.addEventListener('click', function(){brush(this)});
}
document.getElementById('fillbg').addEventListener('click', fillbg);
var canvas, ctx, flag = false,
    prevX = 0,
    currX = 0,
    prevY = 0,
    currY = 0,
    dot_flag = false;
var selectedColor = "black",
    brushSize = 2;
function init() {
    canvas = document.getElementById('can');
    ctx = canvas.getContext("2d");
    w = canvas.width;
    h = canvas.height;
    canvas.addEventListener("mousemove", function (e) {
        findxy('move', e)
    }, false);
    canvas.addEventListener("mousedown", function (e) {
        findxy('down', e)
    }, false);
    canvas.addEventListener("mouseup", function (e) {
        findxy('up', e)
    }, false);
    canvas.addEventListener("mouseout", function (e) {
        findxy('out', e)
    }, false);
    let tmp = ctx.fillStyle;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = tmp;
}
/**
 * Function that, given an html object with the id
 * representing a color, checks if the color is allowed and
 * if it is, sets it as the current color.
 */
function color(obj) {
    var allowedColors = [
        "green",
        "blue",
        "red",
        "yellow",
        "orange",
        "purple",
        "pink",
        "brown",
        "gray",
        "black",
        "white"
    ];
    if (allowedColors.includes(obj.id)) {
        selectedColor = obj.id;
    }
}
/**
 * Function that, given an html object with the id
 * representing a brush size, sets the brush size.
 */
function brush(obj) {
    switch (obj.id) {
        case "small":
            brushSize = 2;
            break;
        case "medium":
            brushSize = 4;
            break;
        case "large":
            brushSize = 8;
            break;
        case "huge":
            brushSize = 12;
            break;
        case "enormous":
            brushSize = 16;
            break;
        case "default":
            brushSize = 2;
            break;
        default:
            brushSize = 2;
            break;
    }
}

function draw() {
    socket.emit('client canvas update', {
        x: currX,
        y: currY,
        x1: prevX,
        y1: prevY,
        color: selectedColor,
        size: brushSize,
        room: String(room),
        type: "draw"
    });
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.strokeStyle = selectedColor;
    ctx.fillStyle = selectedColor;
    ctx.lineWidth = brushSize;
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(currX, currY);
    ctx.stroke();
    ctx.closePath();
}

function erase() {
    if (username != currentDrawer || dontDraw) {
        return;
    }
    if (confirm("Sicuro di voler fare un clear?")) {
        socket.emit('client canvas update', {
            x: currX,
            y: currY,
            x1: prevX,
            y1: prevY,
            color: selectedColor,
            size: brushSize,
            room: String(room),
            type: "erase"
        });
        let tmp = ctx.fillStyle;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = tmp;
    }
}

function fillbg() {
    if (username != currentDrawer || dontDraw) {
        return;
    }
    if (confirm("Sicuro di voler fare un fill " + selectedColor + "?")) {
        socket.emit('client canvas update', {
            x: currX,
            y: currY,
            x1: prevX,
            y1: prevY,
            color: selectedColor,
            size: brushSize,
            room: String(room),
            type: "fill"
        });
        ctx.fillStyle = selectedColor;
        ctx.fillRect(0, 0, w, h);
    }
}

function save(data, name) {
    var link = document.createElement('a');
    link.download = name + '.jpg';
    link.href = data;
    link.click();
}

function findxy(res, e) {
    const rect = canvas.getBoundingClientRect();
    if (username != currentDrawer || dontDraw) {
        return;
    }
    if (res == 'down') {
        prevX = currX;
        prevY = currY;
        currX = e.pageX - rect.left;
        currY = e.pageY - rect.top;
        flag = true;
        dot_flag = true;
    }
    if (res == 'up' || res == "out") {
        flag = false;
    }
    if (res == 'move') {
        if (flag) {
            prevX = currX;
            prevY = currY;
            currX = e.pageX - rect.left;
            currY = e.pageY - rect.top;
            draw();
        }
    }
}