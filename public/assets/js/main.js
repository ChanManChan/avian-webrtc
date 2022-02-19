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
const videoStates = {
    none: 0,
    camera: 1,
    screenShare: 2
}
const peerConnections = {}, remoteVideoStream = {}, remoteAudioStream = {}, rtpAudioSenders = {}
let connectedUsers = []
let serverProcess, myConnectionId, localVideoPlayer, audio, isAudioMute = true, videoState = videoStates.none


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
        eventProcess()
        localVideoPlayer = document.getElementById("localVideoPlayer")
        connectedUsers = [...existingUsers]
        connected = true
        connectedUsers.forEach(user => {
            addUser({ ...user })
            registerNewConnection(user.connectionId)
        })
    })
    socket.on("new node", nodeData => {
        connectedUsers.push(nodeData)
        addUser({ ...nodeData })
        registerNewConnection(nodeData.connectionId)
    })
    socket.on("sdp process", async data => {
        await processClient({ ...data })
    })
}

function eventProcess() {
    $("#micToggleBtn").click(async () => {
        if (!audio) {
            await loadAudio()
        }
        if (!audio) {
            alert("Missing audio permissions")
            return
        }
        if (isAudioMute) {
            audio.enabled = true
            $(this).html("<span class='material-icons'>mic</span>")
            updateMediaSenders(audio, rtpAudioSenders)
        } else {
            audio.enabled = false
            $(this).html("<span class='material-icons'>mic_off</span>")
            removeMediaSenders(rtpAudioSenders)
        }
        isAudioMute = !isAudioMute
    })
    $("#videoCamToggle").click(async () => {
        if (videoState == videoStates.camera) {
            await videoProcess(videoStates.none)
        } else {
            await videoProcess(videoStates.camera)
        }
    })
    $("#videoCamToggle").click(async () => {
        if (videoState == videoStates.camera) {
            await videoProcess(videoStates.none)
        } else {
            await videoProcess(videoStates.camera)
        }
    })
    $("#screenShareBtn").click(async () => {
        if (videoState == videoStates.screenShare) {
            await videoProcess(videoStates.none)
        } else {
            await videoProcess(videoStates.screenShare)
        }
    })
}

async function videoProcess(newVideoState) {
    try {
        let videoStream = null
        if (newVideoState == videoStates.camera) {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 }, audio: false })
        } else if (newVideoState == videoStates.screenShare) {
            videoStream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1920, height: 1080 }, audio: false })
        }
        if (videoStream && videoStream.getVideoTracks().length > 0) {
            const videoTrack = videoStream.getVideoTracks()[0]
            if (videoTrack) {
                localVideoPlayer.srcObject = new MediaStream([videoTrack])
            }
        }
    } catch (error) {
        console.error(error)
        return
    }
    videoState = newVideoState

}

async function processClient({ message, fromConnectionId }) {
    message = JSON.parse(message)
    if (message.answer) {
        await peerConnections[fromConnectionId].setRemoteDescription(new RTCSessionDescription(message.answer))
    } else if (message.offer) {
        if (!peerConnections[fromConnectionId]) {
            registerNewConnection(fromConnectionId)
        }
        await peerConnections[fromConnectionId].setRemoteDescription(new RTCSessionDescription(message.offer))
        const answer = await peerConnections[fromConnectionId].createAnswer()
        await peerConnections[fromConnectionId].setLocalDescription(answer)
        serverProcess(JSON.stringify({ answer }), fromConnectionId)
    } else if (message.icecandidate) {
        if (!peerConnections[fromConnectionId]) {
            registerNewConnection(fromConnectionId)
        }
        try {
            await peerConnections[fromConnectionId].addIceCandidate(message.icecandidate)
        } catch (error) {
            console.error(error)
        }
    }
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
        if (!remoteVideoStream[connectionId]) {
            remoteVideoStream[connectionId] = new MediaStream()
        }
        if (!remoteAudioStream[connectionId]) {
            remoteAudioStream[connectionId] = new MediaStream()
        }
        if (event.track.kind == "video") {
            remoteVideoStream[connectionId].getVideoTracks()
                .forEach(t => remoteVideoStream[connectionId].removeTrack(t))
            remoteVideoStream[connectionId].addTrack(event.track)
            const remoteVideoPlayer = document.getElementById("v_" + connectionId)
            remoteVideoPlayer.srcObject = null
            remoteVideoPlayer.srcObject = remoteVideoStream[connectionId]
            remoteVideoPlayer.load()
        } else if (event.track.kind == "audio") {
            remoteAudioStream[connectionId].getAudioTracks()
                .forEach(t => remoteAudioStream[connectionId].removeTrack(t))
            remoteAudioStream[connectionId].addTrack(event.track)
            const remoteAudioPlayer = document.getElementById("a_" + connectionId)
            remoteAudioPlayer.srcObject = null
            remoteAudioPlayer.srcObject = remoteAudioStream[connectionId]
            remoteAudioPlayer.load()
        }
    }
    peerConnections[connectionId] = connection
    return connection
}

async function setOffer(connectionId) {
    const connection = peerConnections[connectionId]
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    serverProcess(JSON.stringify({ offer: connection.localDescription }), connectionId)
}