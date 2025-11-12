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
        // Find the transcript button
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
        
        // Get all transcript segments from the DOM
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
            const curr_time = getCurrentTime();
            const video_title = getVideoTitle();
            const channel_name = getChannelName();
            const transcript = await getVideoTranscript();
            const currentTranscriptSegment = getCurrentTranscriptSegment(transcript, curr_time);
                
            console.log("current video transcript segment:", currentTranscriptSegment);
            video_data_response = {
                time: curr_time,
                video_title: video_title,
                channel_name: channel_name,
                transcript: transcript,
                currentTranscriptSegment: currentTranscriptSegment
            }
            console.log("VIDEO DATA RESPONSE: ", video_data_response)
            sendResponse(video_data_response);
        })();
        
        return true; // Keep message channel open for async response
    }
})