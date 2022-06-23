//#region Variables and constants
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
const { time } = require('console');
const fs = require('fs');
const words = JSON.parse(fs.readFileSync('words.json', 'utf8'));
const maxPlayers = 12;
const defaultTime = 80;
const maxPoints = 1000;
var roomMap = {};

app.use(express.static(__dirname + '/public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
//#endregion
//#region Classes
class Room {
  constructor(id, owner, publicFlag) {
    console.log(id, owner);
    this.id = id;
    this.owner = owner;
    this.players = [];
    this.currentDrawer = owner;
    this.started = false;
    this.currentRound = -1;
    this.current3Words = [];
    this.currentWord = '';
    this.guessedCounter = 0;
    this.canvasImages = [];
    this.beforeWord = '';
    this.beforeDrawer = '';
    this.wordHint = '';
    this.timeLeft = defaultTime;
    this.timer;
    this.public = publicFlag;
  }
}

class Player {
  constructor(name, socketId) {
    this.name = name;
    this.points = 0;
    this.socketId = socketId;
    this.tries = 0;
    this.guessed = 0;
  }
}

class CanvasImage {
  constructor(data, name) {
    this.data = data;
    this.name = name;
  }
}
//#endregion
io.on('connection', (socket) => {

  socket.on('join room', (roomId, playerName) => {
    roomId = String(roomId);
    let newplayer = new Player(playerName, socket.id);
    if (roomId in roomMap) { // user try to join a game
      if (nameAlreadyInUse(roomMap[roomId].players, playerName)) {
        socket.emit('alert', "name already in use");
      } else if (roomMap[roomId].players.length >= maxPlayers) {
        socket.emit('alert', "room full");
      } else if (roomMap[roomId].started) {
        socket.emit('alert', "game already started, wait for it to end");
      } else {
        roomMap[roomId].players.push(newplayer);
        socket.join(String(roomId));
        socket.emit('room joined', roomId);
        //console.log(io.sockets.adapter.rooms);
        io.in(String(roomId)).emit('player updated', roomMap[roomId].players);
      }
    } else {
      socket.emit('alert', "room not found");
    }
  });

  socket.on('new room', (playerName, public) => {
    // create new room
    let roomId = 0;
    while (roomId in roomMap) {
      roomId++;
    }
    roomId = String(roomId);
    let owner = new Player(playerName, socket.id);
    let newRoom = new Room(roomId, owner, public);
    console.log(owner.name + " created room " + roomId);
    roomMap[roomId] = newRoom;

    // owner joins new room
    socket.emit('created room', roomId);
  });
  socket.on('chat message', (msg, roomId) => {
    roomId = String(roomId);
    if (!(roomId in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    let username = getUsername(socket, roomId);
    msg = msg.substring(0, 50);
    let message = username + ": " + msg;
    if (!(roomMap[roomId].started)
      || roomMap[roomId].currentDrawer.name == username) {
      io.in(roomId).emit('chat message', ({ color: 'black', msg: message }));
      return;
    }
    //get the user 
    let user = roomMap[roomId].players.find(player => player.name == username);
    if (user == undefined) {
      return;
    }
    user.tries++;
    if (String(msg).toLowerCase() == String(roomMap[roomId].currentWord).toLowerCase()) {
      user.guessed++;
      message = username + " " + "guessed correctly!";
      io.in(roomId).emit('chat message', ({ color: 'green', msg: message }));
      socket.emit('guessed correctly', roomMap[roomId].currentWord);
      //add points to player
      roomMap[roomId].players.forEach(player => {
        if (player.name == username) {
          player.points += getPoints(roomMap[roomId]);
          roomMap[roomId].currentDrawer.points += getDrawerPoints(roomMap[roomId]);
        }
      });
      roomMap[roomId].guessedCounter++;
      io.in(roomId).emit('player updated', roomMap[roomId].players);
    } else {
      io.in(roomId).emit('chat message', ({ color: 'black', msg: message }));
    }
  });
  socket.on('leave room', (roomId) => {
    if (roomId in roomMap) {
      let user = getUsername(socket, roomId);
      console.log(user + " disconnected from room " + roomId);
      if (roomMap[roomId].players.some(player => player.name == user)) {
        roomMap[roomId].players.splice(roomMap[roomId].players.indexOf(user), 1);
        io.in(roomId).emit('player updated', roomMap[roomId].players);
        if (roomMap[roomId].players.length == 0) {
          console.log("room " + roomId + " is empty, deleting");
          delete roomMap[roomId];
        }
      }
    }
  });
  socket.on('disconnect', (reason) => {
    console.log(reason);
    //find room where socketId == socket.id
    for (let room in roomMap) {
      if (roomMap[room].players.some(player => player.socketId == socket.id)) {
        let username = roomMap[room].players.find(player => player.socketId == socket.id).name;
        console.log(username + " disconnected from room " + room);
        roomMap[room].players.splice(roomMap[room].players.indexOf(username), 1);
        io.in(room).emit('player updated', roomMap[room].players);
        if (roomMap[room].players.length == 0) {
          console.log("room " + room + " is empty, deleting");
          delete roomMap[room];
        }
      }
    }
  });
  socket.on('destroy room', (roomId) => {
    if (!(roomId in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    let user = getUsername(socket, roomId);
    if (roomMap[roomId].owner.name != user) {
      socket.emit('alert', "you are not the owner of this room");
      return;
    }
    io.in(roomId).emit('room destroyed');
    console.log("deleting room " + roomId);
    delete roomMap[roomId];//idk if this works, copilot did it
  });
  socket.on('download images', (roomId) => {
    if (!(roomId in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    socket.emit('images downloaded', roomMap[roomId].canvasImages);
  });
  socket.on('client canvas update', (data) => {
    data.room = String(data.room);
    if (!(data.room in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    let username = getUsername(socket, data.room);
    if (username != roomMap[data.room].currentDrawer.name) {
      return;
    }
    io.in(data.room).emit('draw canvas', data);
  });
  socket.on('get drawer', (roomId) => {
    if (!(roomId in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    socket.emit('current drawer', roomMap[roomId].currentDrawer.name);
  });
  socket.on('start game', (roomId) => {
    if (!(roomId in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    let owner = getUsername(socket, roomId);
    if (roomMap[roomId].started) {
      socket.emit('alert', "game already started");
      return;
    }
    if (String(owner) != String(roomMap[roomId].owner.name)) {
      socket.emit('alert', "u have to be the owner to start the game");
      return;
    }
    if (roomMap[roomId].players.length < 2) {
      socket.emit('alert', "u have to have at least 2 players to start the game");
      return;
    }
    roomMap[roomId].started = true;
    roomMap[roomId].current3Words = getRandomWords();
    socket.emit('game started');
    socket.emit('words', roomMap[roomId].current3Words);
  });
  socket.on('word picked', (roomId, wordIndex) => {
    if (!(roomId in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    let username = getUsername(socket, roomId);
    if (username != roomMap[roomId].currentDrawer.name) {
      return;
    }
    roomMap[roomId].currentWord = roomMap[roomId].current3Words[wordIndex & 3];
    socket.emit('full word for drawer', roomMap[roomId].currentWord);
    console.log("picked word " + roomMap[roomId].currentWord);
    startRound(roomId, socket);
  });
  socket.on('canvas data send', (data, roomId) => {
    roomId = String(roomId);
    if (!(roomId in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    let user = getUsername(socket, roomId);
    if (user != roomMap[roomId].currentDrawer.name) {
      return;
    }
    console.log("canvas data received");
    // console.log(roomMap[roomId].beforeWord);
    // roomMap[roomId].canvasImages.forEach(image => {
    //   console.log(image.name);
    // });
    roomMap[roomId].canvasImages.push(new CanvasImage(data, roomMap[roomId].beforeWord));
    io.in(roomId).emit('image', roomMap[roomId].canvasImages[roomMap[roomId].canvasImages.length - 1]);
  });
  socket.on('get public rooms', () => {
    let privateRooms = [];
    for (let room in roomMap) {
      if (roomMap[room].public && !roomMap[room].started) {
        privateRooms.push(roomMap[room]);
      }
    }
    socket.emit('public rooms', privateRooms);
  });
});
function startRound(roomId, socket) {
  if (!(roomId in roomMap)) {
    socket.emit('alert', "room not found");
    return;
  }
  roomMap[roomId].guessedCounter = 0;
  roomMap[roomId].currentRound++;
  if (roomMap[roomId].currentRound == 0) {
    roomMap[roomId].currentDrawer = roomMap[roomId].players[0];
  }
  socket.emit('current drawer', roomMap[roomId].currentDrawer.name);
  roomMap[roomId].timer = setInterval(function () {
    if (roomMap[roomId].timeLeft == 0 || roomMap[roomId].guessedCounter == roomMap[roomId].players.length - 1) {
      // end round
      clearInterval(roomMap[roomId].timer);
      roomMap[roomId].timeLeft = defaultTime;
      io.in(roomId).emit('time up', roomMap[roomId].currentWord);
      roomMap[roomId].beforeWord = roomMap[roomId].currentWord;
      roomMap[roomId].currentWord = "";
      roomMap[roomId].wordHint = "";
      changeDrawer(roomId);
      if (roomMap[roomId].currentRound <= roomMap[roomId].players.length) {
        roomMap[roomId].current3Words = getRandomWords();
        io.to(roomMap[roomId].currentDrawer.socketId).emit('words', roomMap[roomId].current3Words);
      } else {
        let scoreboard = roomMap[roomId].players;

        scoreboard.sort(
          (a, b) => {
            return b.points - a.points;
          }
        );
        io.in(roomId).emit('scoreboard', roomMap[roomId].players);
      }
    } else {
      roomMap[roomId].timeLeft--;
      roomMap[roomId].wordHint = getWordHint(roomMap[roomId]);
      io.in(roomId).emit('word hint', roomMap[roomId].wordHint);
      io.in(roomId).emit('timer', { countdown: roomMap[roomId].timeLeft });
    }
  }, 1000);
}
// #region Generic functions
function getRandomWords() {
  let threeWords = [];
  for (let i = 0; i < 3; i++) {
    threeWords.push(words[parseInt(Math.random() * words.length)]);
  }
  return threeWords;
}
function nameAlreadyInUse(playerArray, name) {
  let flag = false;
  playerArray.forEach(playerInGame => {
    if (playerInGame.name == name) {
      flag = true;
    }
  });
  return flag;
}
function getPoints(room) {
  let players = room.players.length;
  let guessedCounter = room.guessedCounter;
  const step = maxPoints / players;
  return Math.floor(maxPoints - (step * guessedCounter));
}
function getDrawerPoints(room) {
  return Math.floor(maxPoints / (room.players.length - 1));
}
function getWordHint(room) {
  let word = room.currentWord;
  if (room.wordHint === '') {
    return "_".repeat(word.length);
  }
  if ((room.wordHint.split("_").length - 1) / room.wordHint.length <= 0.4) {
    return room.wordHint;
  }
  let totalTime = defaultTime;
  let timeLeft = room.timeLeft;
  let timeElapsed = totalTime - timeLeft;
  let previousHint = room.wordHint;
  let charIndex = Math.floor(Math.random() * previousHint.length);
  if (timeElapsed >= 20) {
    if (timeElapsed % 10 == 0) {
      let charArray = previousHint.split('');
      while (charArray[charIndex] != '_') {
        charIndex = Math.floor(Math.random() * previousHint.length);
      }
      charArray[charIndex] = word.split('')[charIndex];
      return charArray.join('');
    }
  }
  return room.wordHint;
}

function changeDrawer(roomId) {
  let index = roomMap[roomId].players.map(function (e) { return e.name; }).indexOf(roomMap[roomId].currentDrawer.name) + 1;
  index = index >= roomMap[roomId].players.length ? 0 : index;
  roomMap[roomId].beforeDrawer = roomMap[roomId].currentDrawer;
  roomMap[roomId].currentDrawer = roomMap[roomId].players[index];
  io.in(roomId).emit('current drawer', roomMap[roomId].currentDrawer.name);
}
function getUsername(socket, roomId) {
  roomId = String(roomId);
  if (!(roomId in roomMap)) {
    return undefined;
  }
  let player = roomMap[roomId].players.find(p => p.socketId == socket.id);
  if (player === undefined) {
    return undefined;
  }
  return player.name;
}
// #endregion
http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});