//#region Variables and constants
var username;
var room;
var currentDrawer;
var public = true;
var dontDraw = true;
var socket = io();
var messages = document.getElementById('messages');
var form = document.getElementById('form');
var input = document.getElementById('input');
var guessed = false;
//#endregion
//#region Onload functions
form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (input.value) {
        socket.emit('chat message', input.value, room);
        input.value = '';
    }
});
refreshRooms();
document.getElementById('togglepopup').addEventListener('click', togglePopup);
document.getElementById('createRoom').addEventListener('click', createroom);
document.getElementById('private').addEventListener('click', togglePublic);
document.getElementById('joinroom').addEventListener('click', joinRoom);
document.getElementById('refreshrooms').addEventListener('click', refreshRooms);
document.getElementById('leaveroom').addEventListener('click', leaveRoom);
document.getElementById('startgamebutton').addEventListener('click', startGame);
document.getElementById('playagain').addEventListener('click', leaveRoom);
document.getElementById('cw1').addEventListener('click', function(){sendWordChoice(0)});
document.getElementById('cw2').addEventListener('click', function(){sendWordChoice(1)});
document.getElementById('cw3').addEventListener('click', function(){sendWordChoice(2)});
//#endregion
//#region Socket.on
//#region Ui
socket.on('alert', function (msg) {
    showPopup(msg);
});
socket.on('player updated', function (players) {
    var playerslist = document.getElementById("players");
    playerslist.innerHTML = "";
    for (var i = 0; i < players.length; i++) {
        var player = document.createElement("li");
        player.innerText = players[i].name + " - " + players[i].points;
        playerslist.appendChild(player);
    }
});
socket.on('chat message', function (msgObj) {
    console.log(msgObj.msg);
    var item = document.createElement('li');
    item.textContent = msgObj.msg;
    item.style.color = msgObj.color;
    messages.appendChild(item);
    messages.scrollTo(0, messages.scrollHeight);
});
socket.on('public rooms', function (rooms) {
    console.log(rooms);
    let container = document.getElementById("publicrooms");
    container.innerHTML = "<tr><th>Room code</th><th>Players</th><th><input class='mfbutton' type='button' onclick='refreshRooms()' value='REFRESH'></th></tr>";
    for (let i = 0; i < rooms.length; i++) {
        let row = document.createElement("tr");
        let roomcode = document.createElement("td");
        roomcode.innerText = rooms[i].id;
        let players = document.createElement("td");
        players.innerText = rooms[i].players.length;
        let join = document.createElement("td");
        join.colSpan = "100";
        let joinbutton = document.createElement("button");
        joinbutton.innerText = "Join";
        joinbutton.classList += "mfsmallbutton";
        joinbutton.onclick = function () {
            joinRoom(rooms[i].id);
        };
        join.appendChild(joinbutton);
        row.appendChild(roomcode);
        row.appendChild(players);
        row.appendChild(join);
        container.appendChild(row);
    }
});
socket.on('words', async function (words) {
    dontDraw = true;
    document.getElementById("cw1").innerText = words[0];
    document.getElementById("cw2").innerText = words[1];
    document.getElementById("cw3").innerText = words[2];
    document.getElementById('input').disabled = true;
    await sleep(500);
    let op = 0;
    document.getElementById("choosewordcontainer").style.opacity = op;
    document.getElementById("choosewordcontainer").style.visibility = "visible";
    let timer = setInterval(function () {
        op += 0.05;
        document.getElementById("choosewordcontainer").style.opacity = op;
        if (op >= 1) {
            clearInterval(timer);
        }
    }, 50);

});
socket.on('timer', function (data) {
    console.log(data.countdown);
    document.getElementById('time').innerText = data.countdown;
});
socket.on('current drawer', function (drawer) {
    currentDrawer = drawer;
    document.getElementById("drawer").innerText = drawer;
});
socket.on('image', function (image) {
    console.log("received image " + image.name);
    let container = document.getElementById("images");
    let img = document.createElement("img");
    img.src = image.data;
    img.onclick = function () {
        save(image.data, image.name);
    }
    container.appendChild(img);
});
socket.on('scoreboard', function (obj) {
    console.log(obj);
    console.log(images);
    document.getElementById('game').style.display = "none";
    document.getElementById("scoreboard").style.display = "block";
    var table = document.getElementById('scoreboardtable');
    var tbody = document.createElement('tbody');
    for (var i = 0; i < obj.length; i++) {
        var player = document.createElement("tr");
        let name = obj[i].name;
        let points = obj[i].points + " points";
        if (obj[i].points == 1) {
            points = obj[i].points + " point";
        }
        let percentage = (obj[i].guessed / obj[i].tries * 100).toFixed(0) + "%";
        percentage += "(" + obj[i].guessed + "/" + obj[i].tries + ")";
        player.innerHTML = "<td>" + (i + 1) + "</td><td>" + name + "</td><td>" + points + "</td><td>" +
            percentage + "</td>";
        tbody.appendChild(player);
    }
    table.appendChild(tbody);
});
socket.on('full word for drawer', function (word) {
    document.getElementById('word').innerText = word;
});
socket.on('word hint', function (word) {
    if (currentDrawer == username || guessed) {
        return;
    }
    document.getElementById('word').innerText = word;
});
socket.on('guessed correctly', function (word) {
    document.getElementById('word').innerText = word;
    document.getElementById('input').disabled = true;
    guessed = true;
});
socket.on('game started', function () {
    document.getElementById('startgamebutton').style.display = 'none';
});
//#endregion
//#region Room management
socket.on('created room', function (roomId) {
    console.log("created room " + roomId);
    socket.emit('join room', roomId, username);
});
socket.on('room joined', function (roomId) {
    room = roomId;
    console.log("joined room " + roomId);
    document.getElementById("login").style.display = "none";
    document.getElementById("game").style.display = "block";
    document.getElementById("room").innerText = "Room " + roomId;
    document.getElementById("word").innerText = "GUESS THE WORD";
    document.getElementById("time").innerText = "";
});
socket.on('room destroyed', function () {
    window.location.reload();
});
//#endregion
//#region Drawing
socket.on('draw canvas', function (data) {
    var ctx = document.getElementById("can").getContext("2d");
    switch (data.type) {
        case 'erase':
            let tmp = ctx.fillStyle;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = tmp;
            break;
        case 'fill':
            ctx.fillStyle = data.color;
            ctx.fillRect(0, 0, w, h);
            break;
        case 'draw':
            ctx.beginPath();
            ctx.lineCap = "round";
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.size;
            ctx.lineJoin = "round";
            ctx.moveTo(data.x, data.y);
            ctx.lineTo(data.x1, data.y1);
            ctx.stroke();
            break;
    }
});
//#endregion
socket.on('time up', function (word) {
    document.getElementById('time').innerText = "Time's up!";
    document.getElementById('word').innerText = word;
    currentDrawer = ""; //prevents drawing for everyone
    document.getElementById('input').disabled = false;
    guessed = false;
    socket.emit('canvas data send',
        document.getElementById('can').toDataURL("image/jpg"),
        room);
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
});
socket.on('images downloaded', function (images) {
    console.log(images);
    for (const img of images) {
        save(img.data, img.name);
    }
});
//#endregion
//#region Ingame UI functions
function leaveRoom() {
    socket.emit('leave room', room);
    window.location.reload();
}

function destroyRoom() {
    socket.emit('destroy room', room);
}

function startGame() {
    socket.emit('start game', room);
}

function sendWordChoice(index) {
    document.getElementById('choosewordcontainer').style.visibility = 'hidden';
    socket.emit('get drawer', room);
    dontDraw = false;
    socket.emit('word picked', room, parseInt(index));
}
//#endregion
//#region Popup
function togglePopup(message) {
    let $slider = document.getElementById('slider');
    let isOpen = $slider.classList.contains('slide-in');
    //console.log($slider.classList);
    if (!message) {
        message = "";
    }
    document.getElementById('popupmessage').innerText = message;
    if (isOpen) {
        $slider.removeAttribute('class', 'slide-in');
        $slider.setAttribute('class', 'slide-out');
    } else {
        $slider.removeAttribute('class', 'slide-out');
        $slider.setAttribute('class', 'slide-in');
    }
    return !isOpen;
}
async function showPopup(message) {
    if (togglePopup(message)) {
        await sleep(1500);
        togglePopup(message);
        return;
    }
    await sleep(1000);
    togglePopup(message);
    await sleep(1500);
    togglePopup(message);
}
//#endregion
//#region Window and device functions
//if user is on a mobile device, disable log in
if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    document.getElementById('login').style.display = 'none';
    document.getElementById('mobile').style.display = 'block';
}
//on resize if screen is smaller than 1060px, hide current section and show error
window.addEventListener('resize', function () {
    //get all sections
    let sections = document.getElementsByTagName('section');
    //get current section
    let currentSection;
    for (const section of sections) {
        if (section.style.display != 'none') {
            currentSection = section;
            break;
        }
    }
    if (currentSection.id != 'game' && document.getElementById('error').style.display == 'none') {
        return;
    }
    if (window.innerWidth < 1300 || window.innerHeight < 850) {
        document.getElementById('game').style.display = 'none';
        document.getElementById('error').style.display = 'block';
    } else {
        document.getElementById('game').style.display = 'block';
        document.getElementById('error').style.display = 'none';
    }
});
//#endregion
//#region Login section functions
function togglePublic() {
    if (public) {
        public = false;
        document.getElementById('private').value = 'PRIVATE';
    } else {
        public = true;
        document.getElementById('private').value = 'PUBLIC';
    }
    console.log(public);
}

function createroom() {
    var usernamein = document.forms["login"]["username"].value;
    if (usernamein == "" || usernamein == null || usernamein.length > 20 || (/^\s*$/.test(usernamein))) {
        showPopup("Fill with valid username username");
        return;
    }
    username = usernamein;
    document.getElementById('startgamebutton').style.display = "block";
    console.log("room is " + public);
    socket.emit('new room', username, public);
}

function refreshRooms() {
    socket.emit('get public rooms');
}

function joinRoom(supposedRoom) {
    var usernamein = document.forms["login"]["username"].value;
    if (!supposedRoom) {
        var roomcodein = document.forms["login"]["roomcode"].value;
    } else {
        var roomcodein = supposedRoom;
    }
    if (usernamein == "" || roomcodein == "" || usernamein == null || roomcodein == null) {
        showPopup("Please fill in all fields");
        return;
    }
    username = usernamein;
    room = roomcodein;
    socket.emit('join room', room, username);
}
//#endregion
//#region Generic functions
async function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    });
}
//#endregion