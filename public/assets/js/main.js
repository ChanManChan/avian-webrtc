let socket
const urlParams = new URLSearchParams(window.location.search)
const meetingId = urlParams.get("meetingId")
const userId = window.prompt("Enter your username")

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
    socket = io.connect()
    socket.on("connect", () => {
        alert("socket connected on client side")
    })
}