const express = require("express")
const http = require("http")
const app = express()
const port = process.env.PORT || 5000
const server = http.createServer(app)
const socket = require("socket.io")
const Room = require('./models/room')
const getWord = require('./api/getWord')
const io = socket(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})
io.on("connection", (socket) => {
    console.log("A client connected: ", socket.id);
    console.log("Active connections:", io.engine.clientsCount);

    socket.on("disconnect", () => {
        console.log("A client disconnected: ", socket.id);
        console.log("Active connections:", io.engine.clientsCount);
    });

    // create room socket
    socket.on("createRoom", async ({ nickname, name, occupancy, maxRounds }) => {
        try {
            const roomExist = await Room.findOne({ name });
            if (roomExist) {
                socket.emit("notCorrectGame", "Room with that game already exists!");
                return;
            }
            const word = getWord();
            let room = new Room({
                name,
                word,
                occupancy,
                maxRounds,
            });
            const player = {
                socketID: socket.id,
                nickname,
                isPartyLeader: true
            };
            room.players.push(player);
            await room.save();
            socket.join(name);
            io.to(name).emit("updateRoom", room);
        } catch (error) {
            console.error(error);
            socket.emit("error", "An error occurred while creating the game.");
        }
    });

    // join room socket
    socket.on("joinRoom", async ({ nickname, name }) => {
        try {
            const room = await Room.findOne({ name });
            if (!room) {
                socket.emit('notCorrectGame', "Please enter a valid room name")
                return;
            }
            if (room.isJoin) {
                const player = {
                    socketID: socket.id,
                    nickname,
                }
                room.players.push(player)
                socket.join(name);

                if (room.players.length === room.occupancy) {
                    room.isJoin = false;
                }
                room.turn = room.players[room.turnIndex];
                await room.save()
                io.to(name).emit('updateRoom', room)
            }
            else {
                socket.emit('notCorrectGame', "The game is in progress, please try again.")

            }
        } catch (error) {
            console.log("Failed to join the room")
            console.log(error)
        }
    })

    // white board sockets
    socket.on('paint', ({ details, roomName }) => {
        if (!details) details = {};
        io.to(roomName).emit('points', { details: details })
        socket.emit('points', { details: details }); // ensure sender gets it
    });

    // color socket
    socket.on('color-change', ({ color, roomName }) => {
        io.to(roomName).emit('color-change', color)
        socket.emit('color-change', color)
    })

    // stroke width socket
    socket.on('stroke-width', ({ stroke, roomName }) => {
        io.to(roomName).emit('stroke-width', stroke)
        socket.emit('stroke-width', stroke)
    })
    // clear screen socket
    socket.on('clean-screen', (roomName) => {
        io.to(roomName).emit('clean-screen', '');
    })

    // Message socket
    socket.on('msg', async ({ username, msg, roomName, word, guessedUserCtr, totalTime, totalTimeTaken }) => {
        try {
            if (msg === word) {
                let room = await Room.findOne({ name: roomName })
                let userPlayer = room.players.filter((player) => player.nickname === username)
                if (totalTimeTaken !== 0) {
                    userPlayer[0].points += Math.round((200 / totalTimeTaken) * 10)
                }
                room = await room.save()
                io.to(roomName).emit('msg', {
                    username: username,
                    msg: "Guessed it!",
                    guessedUserCtr: guessedUserCtr + 1
                })
                socket.emit("closeInput", '')
            }
            else {
                io.to(roomName).emit('msg', {
                    username: username,
                    msg: msg,
                    guessedUserCtr: guessedUserCtr
                })
            }
        } catch (error) {
            console.log(error)
        }
    })

    socket.on('change-turn', async (name) => {
        try {
            let room = await Room.findOne({ name });
            let idx = room.turnIndex
            if (idx + 1 == room.players.length) {
                room.currentRound += 1;
            }
            if (room.currentRound <= room.maxRounds) {
                const word = getWord()
                room.word = word
                room.turnIndex = (idx + 1) % room.players.length
                room.turn = room.players[room.turnIndex]
                room = await room.save()
                io.to(name).emit('change-turn', room)
            }
            else {
                io.to(name).emit("show-leaderboard", room.players)
            }
        } catch (error) {
            console.log(error)
        }
    })

    socket.on('updateScore', async (name) => {
        try {
            const room = await Room.findOne({ name })
            io.to(name).emit('updatedScore', room)
        } catch (error) {
            console.log(error)
        }
    })

    socket.on("disconnect", async () => {
        try {
            let room = await Room.findOne({ "players.socketID": socket.id })
            for (let i = 0; i < room.players.length; i++) {
                if (room.players[i].socketID === socket.id) {
                    room.players.splice(i, 1);
                    break;
                }
            }
            room = await room.save()
            if (room.players.length == 1) {
                socket.broadcast.to(room.name).emit('show-leaderboard', room.players);
            }
            else {
                socket.broadcast.to(room.name).emit('user-disconnected', room);

            }
        } catch (error) {
            console.log(error)
        }
    })
});


const connect = require("./mongoose")

app.use(express.json())
connect()

server.listen(port, "0.0.0.0", () => {
    console.log("Server started running on port ", port)
})

