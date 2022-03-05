/* eslint-disable no-unused-vars */
const express = require('express')
const path = require('path')
const fs = require('fs')

const app = express()
const PORT = 3000
const server = app.listen(PORT, () => console.log("Listening on port " + PORT))
const io = require('socket.io')(server, { pingTimeout: 60000 })
const expressFileUpload = require('express-fileupload')

app.use(express.static(path.join(__dirname, "./public")))
app.use(expressFileUpload())
let userConnections = []

io.on("connection", socket => {

    socket.on("setup", meetingData => {
        const newNode = {
            connectionId: socket.id,
            userId: meetingData.userId,
            meetingId: meetingData.meetingId
        }

        // inform others in the same room about the new connection
        const existingUsers = userConnections.filter(u => u.meetingId == meetingData.meetingId)
        existingUsers.forEach(u => socket.to(u.connectionId).emit("new node", { ...newNode, userCount: existingUsers.length + 1 }))

        userConnections.push(newNode)
        socket.emit("connected", existingUsers)
    })

    socket.on("sdp process", data => {
        socket.to(data.toConnectionId).emit("sdp process", {
            message: data.message,
            fromConnectionId: socket.id
        })
    })

    socket.on("disconnect", () => {
        const disconnectedUser = userConnections.find(c => c.connectionId == socket.id)
        if (disconnectedUser) {
            const meetingId = disconnectedUser.meetingId
            userConnections = userConnections.filter(c => c.connectionId != socket.id)
            const otherUsersInMeeting = userConnections.filter(c => c.meetingId == meetingId)
            otherUsersInMeeting.forEach(user => socket.to(user.connectionId).emit("user disconnected", { connectionId: socket.id, userCount: otherUsersInMeeting.length }))
        }
    })

    socket.on("meeting message", message => {
        const user = userConnections.find(u => u.connectionId == socket.id)
        if (user) {
            const meetingId = user.meetingId
            const from = user.userId
            const existingUsers = userConnections.filter(u => u.meetingId == meetingId)
            existingUsers.forEach(u => socket.to(u.connectionId).emit("forward message", { from, message }))
        }
    })

    socket.on("meeting file transfer", data => {
        const user = userConnections.find(u => u.connectionId == socket.id)
        if (user) {
            const meetingId = user.meetingId
            const existingUsers = userConnections.filter(u => u.meetingId == meetingId)
            existingUsers.forEach(u => socket.to(u.connectionId).emit("forward attachment", { ...data }))
        }
    })
})

app.post("/attachment", (req, res, next) => {
    const data = req.body
    const attachment = req.files.attachment
    const dir = `public/attachments/${data.meetingId}/`
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir)
    }

    attachment.mv(dir + attachment.name, function(error) {
        if (error) {
            console.error("Could not upload the attachment: ", error)
            res.sendStatus(500)
        }
    })

    res.status(200).send("File uploaded successfully")
})