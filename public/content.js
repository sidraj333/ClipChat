// content.js is injected into every YouTube page by the extension.
// Its job is to scrape video details (title, time, transcript, etc.) from the
// page so that the extension's popup/panel can display them or send them to
// the backend.  Since this script runs in the page context, it operates on the
// DOM of YouTube's video player.

console.log("content scripts running in the background 🚀") // useful for debugging


// helper: return the <video> element on the page (there is usually only one)
function getVideoElement() {
    return document.querySelector("video")
}  

// parse the query string to extract the 'v' parameter which is the video ID
function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v')
} 

// current playback position in seconds (rounded down)
function getCurrentTime() {
    const video = getVideoElement();
    return video ? Math.floor(video.currentTime) : 0;
} 


// current playback rate (1.0, 1.5 etc.)
function getPlaybackSpeed() {
    const video = getVideoElement();
    return video ? video.playbackRate : 1;
} 



// true if playback is currently paused
function isVideoPaused() {
    const video = getVideoElement();
    return video ? video.paused : true;
} 




// Listens for requests from the extension UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("video data requested to chrome listener")
    
    if (message.type === 'GET_VIDEO_DATA') {
        (async () => {
            const videoId = getVideoId();
            const curr_time = getCurrentTime();
            const isPaused = isVideoPaused();
            const playbackSpeed = getPlaybackSpeed();

                
            
            const video_data_response = {
                // Core video info
                videoId: videoId,
                currentTime: curr_time,
                isPaused: isPaused,
                playbackSpeed: playbackSpeed,
                
            }
            
            console.log("VIDEO DATA RESPONSE: ", video_data_response)
            sendResponse(video_data_response);
        })();
        
        return true; // Keep message channel open for async response
    }
});