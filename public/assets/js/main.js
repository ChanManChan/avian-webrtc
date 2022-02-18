let connected = false
const socket = io("http://localhost:3000")
const urlParams = new URLSearchParams(window.location.search)
const meetingId = urlParams.get("meetingId")
const userId = window.prompt("Enter your username")
const meetingData = {
    userId,
    meetingId
}
const iceConfiguration = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun.stun1.l.google.com:19302"
        }
    ]
}
const peerConnections = {}
let connectedUsers = []
let serverProcess, myConnectionId

if (!userId || !meetingId) {
    alert("Username or meeting id is missing")
    window.location.href = "/action.html"
} else {
    eventProcessForSignalingServer()
}

function eventProcessForSignalingServer() {
    const SDPFunction = function (data, toConnectionId) {
        socket.emit("sdp process", { message: data, toConnectionId })
    }

    socket.emit("setup", meetingData)
    socket.on("connected", existingUsers => {
        serverProcess = SDPFunction
        myConnectionId = socket.id
        connectedUsers = [...existingUsers]
        connected = true
    })
    socket.on("new node", nodeData => {
        connectedUsers.push(nodeData)
        addUser({ ...nodeData })
        registerNewConnection(nodeData.connectionId)
    })
}

function addUser({ connectionId, userId, meetingId }) {
    const userTemplate = `
    <div id="${connectionId}" class="userbox other">
        <h2 style="font-size: 14px;">${userId}</h2>
        <div>
            <video id="v_${connectionId}" autoplay muted></video>
            <audio id="a_${connectionId}" autoplay controls muted style="display: none;"></audio>
        </div>
    </div>`
    $("#usersContainer").append(userTemplate)
}

function registerNewConnection(connectionId) {
    const connection = new RTCPeerConnection(iceConfiguration)
    connection.onnegotiationneeded = async function (event) {
        await setOffer(connectionId)
    }
    connection.onicecandidate = function (event) {
        if (event.candidate) {
            serverProcess(JSON.stringify({ icecandidate: event.candidate }), connectionId)
        }
    }
    connection.ontrack = function (event) {

    }
    peerConnections[connectionId] = connection
}

async function setOffer(connectionId) {
    const connection = peerConnections[connectionId]
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    serverProcess(JSON.stringify({ offer: connection.localDescription }), connectionId)
}