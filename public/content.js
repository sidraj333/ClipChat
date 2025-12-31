// content script to access real time video playback on youtube video

console.log("content scripts running in the background 🚀")

function getVideoElement() {
    return document.querySelector("video")
} 

function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v')
}

function getVideoTitle() {
    const title_html_element = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
    return title_html_element ? title_html_element.textContent : '';
}

function getChannelName() {
    const channel_element = document.querySelector('ytd-channel-name yt-formatted-string a');
    return channel_element ? channel_element.textContent : '';
}

function getCurrentTime() {
    const video = getVideoElement();
    return video ? Math.floor(video.currentTime) : 0;
}

function getVideoDuration() {
    const video = getVideoElement();
    return video ? Math.floor(video.duration) : 0;
}

function getVideoDescription() {
    const descElement = document.querySelector('ytd-text-inline-expander#description-inline-expander yt-attributed-string span');
    return descElement ? descElement.textContent.trim() : '';
}

function getViewCount() {
    const viewElement = document.querySelector('ytd-video-view-count-renderer span.view-count');
    return viewElement ? viewElement.textContent.trim() : '';
}

function getUploadDate() {
    const dateElement = document.querySelector('ytd-video-primary-info-renderer #info-strings yt-formatted-string');
    return dateElement ? dateElement.textContent.trim() : '';
}

function getLikeCount() {
    const likeButton = document.querySelector('like-button-view-model button');
    const likeText = likeButton?.querySelector('[aria-label]')?.getAttribute('aria-label');
    return likeText || '';
}

function isLiveVideo() {
    const video = getVideoElement();
    return video ? video.duration === Infinity : false;
}

function getPlaybackSpeed() {
    const video = getVideoElement();
    return video ? video.playbackRate : 1;
}

function getVideoQuality() {
    const video = getVideoElement();
    if (!video) return null;
    return {
        width: video.videoWidth,
        height: video.videoHeight,
        quality: `${video.videoHeight}p`
    };
}

function isVideoPaused() {
    const video = getVideoElement();
    return video ? video.paused : true;
}

function getVideoTags() {
    const tagElements = document.querySelectorAll('a.yt-formatted-string[href^="/hashtag/"]');
    return Array.from(tagElements).map(tag => tag.textContent.trim());
}

function getChapters() {
    const chapterElements = document.querySelectorAll('ytd-macro-markers-list-item-renderer');
    return Array.from(chapterElements).map(chapter => {
        const time = chapter.querySelector('#time')?.textContent?.trim();
        const title = chapter.querySelector('#details h4')?.textContent?.trim();
        return { time, title, seconds: timestampToSeconds(time) };
    });
}

// Converts timestamp string to seconds (e.g., "4:45" -> 285, "1:23:45" -> 5025)
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

async function getVideoTranscript() {
    try {
        const transcriptButton = document.querySelector('button[aria-label="Show transcript"]');
        
        if (!transcriptButton) {
            console.log("Transcript button not found - may not be available for this video");
            return null;
        }
        
        // Open transcript panel if not already open
        const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
        if (!panel || panel.getAttribute('visibility') !== 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') {
            transcriptButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const transcriptSegments = document.querySelectorAll('ytd-transcript-segment-renderer');
        
        if (transcriptSegments.length === 0) {
            return null;
        }
        
        // Parse each segment and convert timestamps to seconds
        const transcript = Array.from(transcriptSegments).map(segment => {
            const timestamp = segment.querySelector('.segment-timestamp')?.textContent?.trim() || '';
            const text = segment.querySelector('.segment-text')?.textContent?.trim() || '';
            const seconds = timestampToSeconds(timestamp);
            return { timestamp, text, seconds };
        });
        
        const fullText = transcript.map(seg => seg.text).join(' ');
        
        return {
            segments: transcript,
            fullText: fullText
        };
        
    } catch (error) {
        console.error("Error fetching transcript:", error);
        return null;
    }
}

// Finds the transcript segment that matches the current video playback time
function getCurrentTranscriptSegment(transcriptData, currentTime) {
    if (!transcriptData || !transcriptData.segments) {
        return null;
    }
    
    for (let i = 0; i < transcriptData.segments.length; i++) {
        const currentSegment = transcriptData.segments[i];
        const nextSegment = transcriptData.segments[i + 1];
        
        // Handle last segment
        if (!nextSegment) {
            if (currentTime >= currentSegment.seconds) {
                return { ...currentSegment, index: i };
            }
        }
        
        // Check if current time falls within this segment
        if (currentTime >= currentSegment.seconds && currentTime < nextSegment.seconds) {
            return { ...currentSegment, index: i };
        }
    }
    
    return null;
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
            const transcript = await getVideoTranscript();
            const currentTranscriptSegment = getCurrentTranscriptSegment(transcript, curr_time);
                
            console.log("current video transcript segment:", currentTranscriptSegment);
            
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
                
                // Transcript
                transcript: transcript,
                currentTranscriptSegment: currentTranscriptSegment,
            }
            
            console.log("VIDEO DATA RESPONSE: ", video_data_response)
            sendResponse(video_data_response);
        })();
        
        return true; // Keep message channel open for async response
    }
});