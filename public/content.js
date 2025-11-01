// content script to access real time video playback on youtube video

console.log("content scripts running in the background 🚀")

function getVideoElement() {
    return document.querySelector("video")
} 

function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v')
}

function getCurrentTime() {
    const video = getVideoElement();
    return video ? Math.floor(video.currentTime) : 0;
  }



//listens for requests from app.jsx
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_VIDEO_DATA') {
        curr_time = getCurrentTime()
        sendResponse(
            {
                time: curr_time
            }
        )
    }
})