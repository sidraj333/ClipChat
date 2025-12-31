import { useState, useEffect, useRef } from "react";

export default function App() {
  const [tabInfo , setTabInfo] = useState(null);
  // const [videoData, setVideoData] = useState(null);
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    //listener to retrieve current tab information
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TAB_UPDATE') {
        setTabInfo(message)
      }
    })
  }, []);


  const getVideoData = async () => {
    //returns current video data sent from content.js
    if (!tabInfo?.tabId){
      console.log("tabinfo has no id: ", tabInfo)
      return;
    } 
    console.log("getting video data for tab: ", tabInfo.tabId)
    try {
      const response = await chrome.tabs.sendMessage(tabInfo.tabId, {type: "GET_VIDEO_DATA"})
      console.log("response from content scripts: ", response)
      console.log("about to return ", response)
      return response
    } catch (error) {
      console.log("Error: ", error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    console.log("EVENT OBJECT")
    console.log(e)
    const videoData = await getVideoData();
    console.log("DEBUG VIDEO DATA")
    console.log(videoData)
    try {
      const body = {
        question: text,
        
        // Core info
        videoId: videoData?.videoId,
        videoUrl: videoData?.videoUrl,
        title: videoData?.title,
        channel: videoData?.channel,
        description: videoData?.description,
        
        // Playback info
        currentTime: videoData?.currentTime,
        duration: videoData?.duration,
        progress: videoData?.progress,
        isPaused: videoData?.isPaused,
        isLive: videoData?.isLive,
        playbackSpeed: videoData?.playbackSpeed,
        
        // Transcript data
        fullTranscript: videoData?.transcript?.fullText,
        currentSegment: videoData?.currentTranscriptSegment,
        transcriptSegments: videoData?.transcript?.segments,
        
        // Optional metadata
        chapters: videoData?.chapters,
        tags: videoData?.tags,
        viewCount: videoData?.viewCount,
        uploadDate: videoData?.uploadDate
      };  
      console.log("sending the following object to backend")
      console.log(body)
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
      });
  
      const data = await response.json();
      console.log("Backend response:", data);
      alert(`Backend says: ${data.answer}`);
  
    } catch (error) {
      console.error('Error:', error);
      alert(`Error connecting to backend: ${error.message}`); 
    }
  }

  return (
    <div style={{ padding: "10px", width: "300px" }}>
      <h3>ClipChat</h3>
      {tabInfo ? (
        <div>
          <form onSubmit={handleSubmit}>
            <input
              value={text}
              onChange = {(e) => setText(e.target.value)}
              placeholder="Ask ClipChat a question"
            />
            <button type="submit" disabled={!text.trim()} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">
              Send
            </button>
          </form>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}