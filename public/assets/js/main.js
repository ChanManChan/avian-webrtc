let connected = false
const socket = io("http://localhost:3000")
const urlParams = new URLSearchParams(window.location.search)
const meetingId = urlParams.get("meetingId")
const userId = window.prompt("Enter your username")
const meetingData = {
    userId,
    meetingId
}
let connectedUsers = []

if (!userId || !meetingId) {
    alert("Username or meeting id is missing")
    window.location.href = "/action.html"
} else {
    init(userId, meetingId)
}

function init(userId, meetingId) {
    eventProcessForSignalingServer()
}

function eventProcessForSignalingServer() {
    socket.emit("setup", meetingData)
    socket.on("connected", existingUsers => {
        connectedUsers = [...existingUsers]
        connected = true
    })
    socket.on("new node", nodeData => {
        connectedUsers.push(nodeData)
        addUser({ ...nodeData })
    })
}

function addUser({ connectionId, userId, meetingId }) {

}