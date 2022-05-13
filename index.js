const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

const maxPlayers = 3;

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
class Room{
  constructor(id, owner) {
    this.id = id;
    this.owner = owner;
    this.players = [];
  }
}

class Player{
  constructor(name){
    this.name = name;
    this.points = 0;
  }
}

let roomMap = {};

io.on('connection', (socket, roomId) => {

  socket.on('join room', (roomId, playerName) => {
    let newplayer = new Player(playerName);
    if(roomId in roomMap){ // user try to join a game
      if(nameAlreadyInUse(roomMap[roomId].players, playerName)){
        socket.emit('alert', "name already in use");
      }else if(roomMap[roomId].players.length >= maxPlayers){
        socket.emit('alert', "room full");
      }else{
        socket.emit('alert', "welcome " + playerName + "!");
        roomMap[roomId].players.push(newplayer);
        socket.join(roomId);
      }
    }else{
      socket.emit('alert', "room not found");
    }
  });

  socket.on('new room', () => {
    // create new room
    let roomId = roomMap.length++;
    while(roomId in roomMap){
      roomId++;
    }
    let owner = new Player(playerName);
    let newRoom = new Room(roomId, owner);
    roomMap[roomId] = newRoom;

    // owner joins new room
    socket.emit('created room', roomId);
  });
  socket.on('chat message', (msg, roomId) => {
    io.in(roomId).emit('chat message', msg);
  });

});

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