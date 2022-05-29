const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
const { time } = require('console');
const fs = require('fs');
const words = JSON.parse(fs.readFileSync('words.json', 'utf8'));
const maxPlayers = 12;
const defaultTime = 80;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

class Room {
  constructor(id, owner) {
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
    this.wordHint = '';
    this.timeLeft = defaultTime;
    this.timer;
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
  constructor(data, name){
    this.data = data;
    this.name = name;
  }
}
var roomMap = {};

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
        socket.emit('alert', "welcome " + playerName + "!");
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

  socket.on('new room', (playerName) => {
    // create new room
    let roomId1 = 0;
    while (roomId1 in roomMap) {
      roomId1++;
    }
    roomId1 = String(roomId1);
    let owner = new Player(playerName, socket.id);
    let newRoom = new Room(String(roomId1), owner);
    console.log(owner.name + " created room " + roomId1);
    roomMap[roomId1] = newRoom;

    // owner joins new room
    socket.emit('created room', roomId1);
  });
  socket.on('chat message', (msg, roomId1, username) => {
    roomId1 = String(roomId1);
    if (!(roomId1 in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    let message = username + ": " + msg;
    if (!(roomMap[roomId1].started)
      || roomMap[roomId1].currentDrawer.name == username) {
      io.in(roomId1).emit('chat message', ({ color: 'black', msg: message }));
      return;
    }
    //get the user 
    let user = roomMap[roomId1].players.find(player => player.name == username);
    user.tries++;
    if (String(msg).toLowerCase() == String(roomMap[roomId1].currentWord).toLowerCase()) {
      user.guessed++;
      message = username + "guessed correctly!";
      io.in(roomId1).emit('chat message', ({ color: 'green', msg: message }));
      socket.emit('guessed correctly', roomMap[roomId1].currentWord);
      //add points to player
      roomMap[roomId1].players.forEach(player => {
        if (player.name == username) {
          player.points += getPoints(roomMap[roomId1]);
        }
      });
      roomMap[roomId1].guessedCounter++;
      io.in(roomId1).emit('player updated', roomMap[roomId1].players);
    } else {
      io.in(roomId1).emit('chat message', ({ color: 'black', msg: message }));
    }
  });
  socket.on('leave room', (room, user) => {
    console.log(user + " disconnected from room " + room);
    if (room in roomMap) {
      if (roomMap[room].players.some(player => player.name == user)){ 
        roomMap[room].players.splice(roomMap[room].players.indexOf(user), 1);
        io.in(room).emit('player updated', roomMap[room].players);
        if(roomMap[room].players.length == 0){
          console.log("room " + room + " is empty, deleting");
          delete roomMap[room];
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
        if(roomMap[room].players.length == 0){
          console.log("room " + room + " is empty, deleting");
          delete roomMap[room];
        }
      }
    }
  });
  socket.on('destroy room', (room, user) => {
    console.log(roomMap[room].players);
    if (!(room in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    if (roomMap[room].owner.name != user) {
      socket.emit('alert', "you are not the owner of this room");
      return;
    }
    io.in(room).emit('room destroyed');
    console.log("deleting room " + room);
    delete roomMap[room];//idk if this works, copilot did it
  });
  socket.on('download images', (room) => {
    if (!(room in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    socket.emit('images downloaded', roomMap[room].canvasImages);
  });
  socket.on('client canvas update', (data) => {
    data.room = String(data.room);
    if (!(data.room in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    if (data.username != roomMap[data.room].currentDrawer.name) {
      return;
    }
    io.in(data.room).emit('draw canvas', data);
  });
  socket.on('get drawer', (room) => {
    if (!(room in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    socket.emit('current drawer', roomMap[room].currentDrawer.name);
  });
  socket.on('start game', (room, owner) => {
    if (!(room in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    if (roomMap[room].started) {
      socket.emit('alert', "game already started");
      return;
    }
    if (String(owner) != String(roomMap[room].owner.name)) {
      socket.emit('alert', "u have to be the owner to start the game");
      return;
    }
    if(roomMap[room].players.length < 2){
      socket.emit('alert', "u have to have at least 2 players to start the game");
      return;
    }
    roomMap[room].started = true;
    roomMap[room].current3Words = getRandomWords();
    socket.emit('game started');
    socket.emit('words', roomMap[room].current3Words);
  });
  socket.on('word picked', (room, username, wordIndex) => {
    if (!(room in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    if (username != roomMap[room].currentDrawer.name) {
      return;
    }
    roomMap[room].currentWord = roomMap[room].current3Words[wordIndex & 3];
    socket.emit('full word for drawer', roomMap[room].currentWord);
    console.log("picked word " + roomMap[room].currentWord);
    startRound(room, socket);
  });
  socket.on('canvas data send', (data, user, room) => {
    room = String(room);
    if (!(room in roomMap)) {
      socket.emit('alert', "room not found");
      return;
    }
    if (user != roomMap[room].currentDrawer.name) {
      return;
    }
    roomMap[room].canvasImages.push(new CanvasImage(data, roomMap[room].beforeWord+"_by_"+user));
  });
});

function startRound(room, socket) {
  if (!(room in roomMap)) {
    socket.emit('alert', "room not found");
    return;
  }
  roomMap[room].guessedCounter = 0;
  roomMap[room].currentRound++;
  socket.emit('current drawer', roomMap[room].currentDrawer.name);
  roomMap[room].timer = setInterval(function () {
    if (roomMap[room].timeLeft == 0 || roomMap[room].guessedCounter == roomMap[room].players.length - 1) {
      // end round
      clearInterval(roomMap[room].timer);
      roomMap[room].timeLeft = defaultTime;
      io.in(room).emit('time up', roomMap[room].currentWord);
      roomMap[room].beforeWord = roomMap[room].currentWord;
      roomMap[room].currentWord = "";
      roomMap[room].wordHint = "";
      changeDrawer(room);
      console.log("round ended", roomMap[room].currentDrawer.name);
      if(roomMap[room].currentRound <= roomMap[room].players.length){
        console.log("starting next round");
        roomMap[room].current3Words = getRandomWords();

        io.to(roomMap[room].currentDrawer.socketId).emit('words', roomMap[room].current3Words);
      }else{
        // TODO fare la fine della partita (non del round)
        let scoreboard = roomMap[room].players.map(player => {
          return {
            name: player.name,
            score: player.score,
            tries: player.tries,
            guessed: player.guessed
          }
        });
        scoreboard.sort((a, b) => b.score - a.score);
        io.in(room).emit('scoreboard', roomMap[room].players);
      }
    } else {
      roomMap[room].timeLeft--;
      roomMap[room].wordHint = getWordHint(roomMap[room]);
      console.log("wordHInt", roomMap[room].wordHint);
      io.in(room).emit('word hint', roomMap[room].wordHint);
      io.in(room).emit('timer', { countdown: roomMap[room].timeLeft });
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
  const maxPoints = 1000;
  let players = room.players.length;
  let guessedCounter = room.guessedCounter;
  const step = maxPoints / players;
  return Math.floor(maxPoints - (step * guessedCounter));
}
function getWordHint(room) {
  let word = room.currentWord;
  if(room.wordHint === ''){
    return "_ ".repeat(word.length);
  }
  if((room.wordHint.split("_").length - 1) / room.wordHint.length  <= 0.4){
    console.log("skip percentuale");
    return room.wordHint;
  }
  let totalTime = defaultTime;
  let timeLeft = room.timeLeft;
  let timeElapsed = totalTime - timeLeft;
  let previousHint = room.wordHint;
  let charIndex = Math.floor(Math.random() * previousHint.length);
  if(timeElapsed >= 20){
    if(timeElapsed % 10 == 0){
      let charArray = previousHint.split('');
      while(charArray[charIndex] != '_'){
        charIndex =  Math.floor(Math.random() * previousHint.length);
      }
      charArray[charIndex] = word.split('')[charIndex];
      return spaceString(charArray.join(''));
    }
  }
  return room.wordHint;
}

function changeDrawer(room) {
  let index = roomMap[room].players.map(function(e) { return e.name; }).indexOf(roomMap[room].currentDrawer.name) + 1;
  console.log("index", index);
  index = index >= roomMap[room].players.length ? 0 : index;
  console.log("old drawer", roomMap[room].currentDrawer);
  roomMap[room].currentDrawer = roomMap[room].players[index];
  console.log("new drawer",roomMap[room].currentDrawer);
  io.in(room).emit('current drawer', roomMap[room].currentDrawer.name);
}
function spaceString(string){
  return string.split("").join(" ");
}
// #endregion
http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});