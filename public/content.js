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

// the page title (not the <title> tag) is nested inside a h1 element.
function getVideoTitle() {
    const title_html_element = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
    return title_html_element ? title_html_element.textContent : '';
} 

// channel name link element
function getChannelName() {
    const channel_element = document.querySelector('ytd-channel-name yt-formatted-string a');
    return channel_element ? channel_element.textContent : '';
} 

// current playback position in seconds (rounded down)
function getCurrentTime() {
    const video = getVideoElement();
    return video ? Math.floor(video.currentTime) : 0;
} 

// total length of the video in seconds (rounded down)
function getVideoDuration() {
    const video = getVideoElement();
    return video ? Math.floor(video.duration) : 0;
} 

// grab the description text below the video player
function getVideoDescription() {
    const descElement = document.querySelector('ytd-text-inline-expander#description-inline-expander yt-attributed-string span');
    return descElement ? descElement.textContent.trim() : '';
} 

// e.g. "1,234 views" text
function getViewCount() {
    const viewElement = document.querySelector('ytd-video-view-count-renderer span.view-count');
    return viewElement ? viewElement.textContent.trim() : '';
} 

// upload date string below the title
function getUploadDate() {
    const dateElement = document.querySelector('ytd-video-primary-info-renderer #info-strings yt-formatted-string');
    return dateElement ? dateElement.textContent.trim() : '';
} 

// Like button's aria-label contains the count (e.g. "12K likes")
function getLikeCount() {
    const likeButton = document.querySelector('like-button-view-model button');
    const likeText = likeButton?.querySelector('[aria-label]')?.getAttribute('aria-label');
    return likeText || '';
} 

// live streams have duration Infinity
function isLiveVideo() {
    const video = getVideoElement();
    return video ? video.duration === Infinity : false;
} 

// current playback rate (1.0, 1.5 etc.)
function getPlaybackSpeed() {
    const video = getVideoElement();
    return video ? video.playbackRate : 1;
} 

// videoWidth/Height reflect the currently selected quality level
function getVideoQuality() {
    const video = getVideoElement();
    if (!video) return null;
    return {
        width: video.videoWidth,
        height: video.videoHeight,
        quality: `${video.videoHeight}p`
    };
} 

// true if playback is currently paused
function isVideoPaused() {
    const video = getVideoElement();
    return video ? video.paused : true;
} 

// hashtags shown under the video
function getVideoTags() {
    const tagElements = document.querySelectorAll('a.yt-formatted-string[href^="/hashtag/"]');
    return Array.from(tagElements).map(tag => tag.textContent.trim());
} 

// YouTube displays chapter markers when the creator added them; scrape each one
function getChapters() {
    const chapterElements = document.querySelectorAll('ytd-macro-markers-list-item-renderer');
    return Array.from(chapterElements).map(chapter => {
        const time = chapter.querySelector('#time')?.textContent?.trim();
        const title = chapter.querySelector('#details h4')?.textContent?.trim();
        return { time, title, seconds: timestampToSeconds(time) };
    });
} 

// Converts a timestamp like "4:45" or "1:23:45" into seconds for comparison
function timestampToSeconds(timestamp) {
    if (!timestamp) return 0;
    
    const parts = timestamp.split(':').map(Number);
    
    if (parts.length === 2) {
        // MM:SS format
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        // HH:MM:SS format
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
} 



// Listens for requests from the extension UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("video data requested to chrome listener")
    
    if (message.type === 'GET_VIDEO_DATA') {
        (async () => {
            const videoId = getVideoId();
            const curr_time = getCurrentTime();
            const duration = getVideoDuration();
            const video_title = getVideoTitle();
            const channel_name = getChannelName();
            const description = getVideoDescription();
            const viewCount = getViewCount();
            const uploadDate = getUploadDate();
            const likeCount = getLikeCount();
            const isLive = isLiveVideo();
            const isPaused = isVideoPaused();
            const playbackSpeed = getPlaybackSpeed();
            const quality = getVideoQuality();
            const tags = getVideoTags();
            const chapters = getChapters();
                
            
            const video_data_response = {
                // Core video info
                videoId: videoId,
                videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
                title: video_title,
                channel: channel_name,
                description: description,
                
                // Playback info
                currentTime: curr_time,
                duration: duration,
                progress: duration > 0 ? (curr_time / duration * 100).toFixed(1) : 0,
                isPaused: isPaused,
                isLive: isLive,
                playbackSpeed: playbackSpeed,
                quality: quality,
                
                // Metadata
                viewCount: viewCount,
                uploadDate: uploadDate,
                likeCount: likeCount,
                tags: tags,
                chapters: chapters,
                
            }
            
            console.log("VIDEO DATA RESPONSE: ", video_data_response)
            sendResponse(video_data_response);
        })();
        
        return true; // Keep message channel open for async response
    }
});