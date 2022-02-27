/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
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
            urls: "stun:stun1.l.google.com:19302"
        }
    ]
}
const videoStates = {
    none: 0,
    camera: 1,
    screenShare: 2
}
const peerConnections = {}, remoteVideoStream = {}, remoteAudioStream = {}, rtpAudioSenders = {}, rtpVideoSenders = {}
let serverProcess, myConnectionId, localVideoPlayer, audio, isAudioMute = true, videoState = videoStates.none, videoCamTrack

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
        $("#me h2").text(userId + "(Me)")
        eventProcess()
        localVideoPlayer = document.getElementById("localVideoPlayer")
        existingUsers.forEach(user => {
            addUser({ ...user })
            registerNewConnection(user.connectionId)
        })
    })
    socket.on("new node", nodeData => {
        addUser({ ...nodeData })
        registerNewConnection(nodeData.connectionId)
    })
    socket.on("sdp process", async data => {
        await processClient({ ...data })
    })
    socket.on("user disconnected", disconnectedUser => {
        $("#" + disconnectedUser.connectionId).remove()
        closeConnection(disconnectedUser.connectionId)
    })
}

function closeConnection(connectionId) {
    if (peerConnections[connectionId]) {
        peerConnections[connectionId].close()
        peerConnections[connectionId] = null
    }
    if (remoteAudioStream[connectionId]) {
        remoteAudioStream[connectionId].getTracks().forEach(t => {
            if (t.stop) t.stop()
        })
        remoteAudioStream[connectionId] = null
    }
    if (remoteVideoStream[connectionId]) {
        remoteVideoStream[connectionId].getTracks().forEach(t => {
            if (t.stop) t.stop()
        })
        remoteVideoStream[connectionId] = null
    }
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
            $("#micToggleBtn").html("<span class='material-icons'>mic</span>")
            updateMediaSenders(audio, rtpAudioSenders)
        } else {
            audio.enabled = false
            $("#micToggleBtn").html("<span class='material-icons'>mic_off</span>")
            removeMediaSenders(rtpAudioSenders)
        }
        isAudioMute = !isAudioMute
    })
    $("#videoCamToggle").click(async () => {
        if (videoState == videoStates.camera) {
            $("#videoCamToggle").html("<span class='material-icons'>videocam_off</span>")
            await videoProcess(videoStates.none)
            removeVideoStream(rtpVideoSenders)
        } else {
            $("#videoCamToggle").html("<span class='material-icons'>videocam_on</span>")
            await videoProcess(videoStates.camera)
        }
    })
    $("#screenShareBtn").click(async () => {
        if (videoState == videoStates.screenShare) {
            $("#screenShareBtn").html("Present Now<span class='material-icons'>present_to_all</span>")
            await videoProcess(videoStates.none)
            removeVideoStream(rtpVideoSenders)
        } else {
            $("#screenShareBtn").html("Cancel Presentation<span class='material-icons'>cancel_presentation</span>")
            await videoProcess(videoStates.screenShare)
        }
    })
}

async function videoProcess(newVideoState) {
    try {
        let videoStream = null
        if (newVideoState == videoStates.camera) {
            $("#screenShareBtn").html("Present Now<span class='material-icons'>present_to_all</span>")
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 }, audio: false })
        } else if (newVideoState == videoStates.screenShare) {
            $("#videoCamToggle").html("<span class='material-icons'>videocam_off</span>")
            videoStream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1920, height: 1080 }, audio: false })
            videoStream.oninactive = () => {
                removeVideoStream(rtpVideoSenders)
                $("#screenShareBtn").html("Present Now<span class='material-icons'>present_to_all</span>")
            }
        }
        if (videoStream && videoStream.getVideoTracks().length > 0) {
            videoCamTrack = videoStream.getVideoTracks()[0]
            if (videoCamTrack) {
                localVideoPlayer.srcObject = new MediaStream([videoCamTrack])
                updateMediaSenders(videoCamTrack, rtpVideoSenders)
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

function addUser({ connectionId, userId }) {
    const userTemplate = `
    <div id="${connectionId}" class="userbox other">
        <h2 style="font-size: 14px;">${userId}</h2>
        <div class="mediaContainer">
            <video id="v_${connectionId}" autoplay muted></video>
            <audio id="a_${connectionId}" autoplay controls style="display: none;"></audio>
        </div>
    </div>`
    $("#usersContainer").append(userTemplate)
}

function registerNewConnection(connectionId) {
    const connection = new RTCPeerConnection(iceConfiguration)
    connection.onnegotiationneeded = async function () {
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
    if (videoState == videoStates.camera || videoState == videoStates.screenShare) {
        updateMediaSenders(videoCamTrack, rtpVideoSenders)
    }
    return connection
}

async function setOffer(connectionId) {
    const connection = peerConnections[connectionId]
    const offer = await connection.createOffer()
    await connection.setLocalDescription(offer)
    serverProcess(JSON.stringify({ offer: connection.localDescription }), connectionId)
}

function validConnectionStatus(connection) {
    const validConnectionStates = ["new", "connecting", "connected"]
    if (connection &&  validConnectionStates.includes(connection.connectionState)) {
        return true
    } else {
        return false
    }
}

async function loadAudio() {
    try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
        audio = audioStream.getAudioTracks()[0]
        audio.enabled = false
    } catch (error) {
        console.error(error)
    }
}

async function updateMediaSenders(track, rtpSenders) {
    for (const connectionId in peerConnections) {
        if (validConnectionStatus(peerConnections[connectionId])) {
            if (rtpSenders[connectionId] && rtpSenders[connectionId].track) {
                rtpSenders[connectionId].replaceTrack(track)
            } else {
                rtpSenders[connectionId] = peerConnections[connectionId].addTrack(track)
            }
        }
    }
}

function removeVideoStream(rtpVideoSenders) {
    if (videoCamTrack) {
        videoCamTrack.stop()
        videoCamTrack = null
        localVideoPlayer.srcObject = null
        removeMediaSenders(rtpVideoSenders)
    }
}

function removeMediaSenders(rtpSenders) {
    for (const connectionId in peerConnections) {
        if (rtpSenders[connectionId] && validConnectionStatus(peerConnections[connectionId])) {
            peerConnections[connectionId].removeTrack(rtpSenders[connectionId])
            rtpSenders[connectionId] = null
        }
    }
}