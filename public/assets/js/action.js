/* eslint-disable no-undef */

$("#joinMeetingNavBtn").click(() => {
    $(".code-input").focus()
})

$("#joinBtn").click(() => {
    const meetingCode = $(".code-input").val().trim()
    const meetingUrl = window.location.origin + "?meetingId=" + meetingCode
    window.location.href = meetingUrl
})

$(".newMeetingBtn").click(() => {
    const meetingCode = Math.floor(Math.random() * 100000000)
    const meetingUrl = window.location.origin + "?meetingId=" + meetingCode
    window.location.href = meetingUrl
})