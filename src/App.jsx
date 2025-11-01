import { useState, useEffect, useRef } from "react";

export default function App() {
  const [tabInfo , setTabInfo] = useState(null);
  const [videoData, setVideoData] = useState(null);
  const [text, setText] = useState("");
  const inputRef = useRef(null);
  useEffect(() => {
    //listener to display correct chat for each tab
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TAB_UPDATE') {
        setTabInfo(message)
      }
    })
  }, []);
  const getVideoData = async () => {
    if (!tabInfo?.tabId){
      console.log("tabinfo has no id: ", tabInfo)
      return;
    } 
    console.log("getting video data for tab: ", tabInfo.tabId)
    try {
      const response = await chrome.tabs.sendMessage(tabInfo.tabId, {type: "GET_VIDEO_DATA"})
      console.log("response from content scripts: ", response)
      setVideoData(response)
    } catch (error) {
      console.log("Error: ", error)
    }
  }
  const handleSubmit = () => {
    console.log("pressed button")
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