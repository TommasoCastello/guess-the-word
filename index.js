const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;
const fs = require('fs');
const words = JSON.parse(fs.readFileSync('words.json', 'utf8'));
const maxPlayers = 3;
const defaultTime = 10;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

class Room{
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
    this.timeLeft = defaultTime;
    this.timer;
  }
}

class Player{
  constructor(name){
    this.name = name;
    this.points = 0;
  }
}

var roomMap = {};

io.on('connection', (socket, roomId) => {

  socket.on('join room', (roomId, playerName) => {
    let newplayer = new Player(playerName);
    if(roomId in roomMap){ // user try to join a game
      if(nameAlreadyInUse(roomMap[roomId].players, playerName)){
        socket.emit('alert', "name already in use");
      }else if(roomMap[roomId].players.length >= maxPlayers){
        socket.emit('alert', "room full");
      }else if(roomMap[roomId].started){
        socket.emit('alert', "game already started, wait for it to end");
      }else{
        socket.emit('alert', "welcome " + playerName + "!");
        roomMap[roomId].players.push(newplayer);
        socket.join(String(roomId));
        socket.emit('room joined', roomId);
        console.log(io.sockets.adapter.rooms);
        io.in(String(roomId)).emit('player updated', roomMap[roomId].players);
      }
    }else{
      socket.emit('alert', "room not found");
    }
  });

  socket.on('new room', (playerName) => {
    // create new room
    let roomId1 = 0;
    while(roomId1 in roomMap){
      roomId1++;
    }
    roomId1 = String(roomId1);
    let owner = new Player(playerName);
    let newRoom = new Room(String(roomId1), owner);
    console.log(owner.name + " created room " + roomId1);
    roomMap[roomId1] = newRoom;

    // owner joins new room
    socket.emit('created room', roomId1);
  });
  socket.on('chat message', (msg, roomId1, username) => {
    io.in(String(roomId1)).emit('chat message', (username + ": " + msg));
  });
  socket.on('leave room', (room, user) => {
    console.log(user + " disconnected from room " + room);
    if(room in roomMap){
      if(user in roomMap[room].players){
        roomMap[room].players.splice(roomMap[room].players.indexOf(user), 1);
        io.in(roomId).emit('player updated', roomMap[roomId].players);
      }
    }
  });
  socket.on('destroy room', (room, user) => {
    console.log(roomMap[room].players);
    if(!(room in roomMap)){
      socket.emit('alert', "room not found");
      return;
    }
    if(!(roomMap[room].players.some(player => player.name == user))){
      socket.emit('alert', "you are not in this room");
      return;
    }
    if(roomMap[room].owner.name != user){
      socket.emit('alert', "you are not the owner of this room");
      return;
    }
    io.in(room).emit('room destroyed');
    delete roomMap[room];//idk if this works, copilot did it
  });
  socket.on('client canvas update', (data) => {
    data.room = String(data.room);
    if(!(data.room in roomMap)){
      socket.emit('alert', "room not found");
      return;
    }
    if(data.username != roomMap[data.room].currentDrawer.name){
      return;
    }
    io.in(data.room).emit('draw canvas', data);
  });
  socket.on('get drawer', (room) => {
    if(!(room in roomMap)){
      socket.emit('alert', "room not found");
      return;
    }
    socket.emit('current drawer', roomMap[room].currentDrawer.name);
  });
  socket.on('start game' , (room, owner) => {
    if(!(room in roomMap)){
      socket.emit('alert', "room not found");
      return;
    }
    if(roomMap[room].started){
      socket.emit('alert', "game already started");
      return;
    }
    console.log(roomMap[room].owner.name);
    if(String(owner) != String(roomMap[room].owner.name)){
      socket.emit('alert', "u have to be the owner to start the game");
      return;
    }
    roomMap[room].started = true;
    roomMap[room].current3Words = getRandomWords();
    socket.emit('words', roomMap[room].current3Words);
  });
  socket.on('words request', (room) => {
    room = String(room);
    if(!(room in roomMap)){
      socket.emit('alert', "room not found");
      return;
    }
    roomMap[room].current3Words = getRandomWords();
    socket.emit('words', roomMap[room].current3Words);
  });
  socket.on('word picked', (room, username, wordIndex) => {
    if(!(room in roomMap)){
      socket.emit('alert', "room not found");
      return;
    }
    if(username != roomMap[room].currentDrawer.name){
      return;
    }
    roomMap[room].currentWord = roomMap[room].current3Words[wordIndex&3];
    socket.emit('full word for drawer', roomMap[room].currentWord);
    console.log("picked word "+roomMap[room].currentWord);
    startRound(room, socket);
  });
});

function startRound(room, socket){
  if(!(room in roomMap)){
    socket.emit('alert', "room not found");
    return;
  }
  roomMap[room].currentRound++;
  roomMap[room].currentDrawer = roomMap[room].players[roomMap[room].currentRound%(roomMap[room].players.length)];
  //console.log(roomMap[room]);
  socket.emit('current drawer', roomMap[room].currentDrawer.name);
  roomMap[room].timer = setInterval(function() {
    if(roomMap[room].timeLeft == 0){
      // end round
      clearInterval(roomMap[room].timer);
      roomMap[room].timeLeft = defaultTime;
      io.in(room).emit('time up', roomMap[room].currentWord);
    }else{
      roomMap[room].timeLeft--;
      io.in(room).emit('timer', { countdown: roomMap[room].timeLeft });
    }
  }, 1000);
}

function getRandomWords(){
  let threeWords = [];
  for(let i = 0; i < 3; i++){
    threeWords.push(words[parseInt(Math.random() * words.length)]);
  }
  return threeWords;
}


function nameAlreadyInUse(playerArray, name){
  playerArray.forEach(playerInGame => {
    if(playerInGame.name == name){
      return true;
    }
  });
  return false;
}

http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});