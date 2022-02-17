const express = require('express')
const path = require('path')

const app = express()
const PORT = 3000
const server = app.listen(PORT, () => console.log("Listening on port " + PORT))
const io = require('socket.io')(server, { pingTimeout: 60000 })

app.use(express.static(path.join(__dirname, "./public")))
const userConnections = []

io.on("connection", socket => {

    socket.on("setup", meetingData => {
        const newNode = {
            connectionId: socket.id,
            userId: meetingData.userId,
            meetingId: meetingData.meetingId
        }

        // inform others in the same room about the new connection
        const existingUsers = userConnections.filter(u => u.meetingId == meetingData.meetingId)
        existingUsers.forEach(u => socket.to(u.connectionId).emit("new node", newNode))

        userConnections.push(newNode)
        socket.emit("connected", existingUsers)
    })

})