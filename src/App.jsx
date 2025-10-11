import { useState, useEffect } from "react";

export default function App() {
  const [tabInfo , setTabInfo] = useState(null);
  const [videoData, setVideoData] = useState(null)
  useEffect(() => {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TAB_UPDATE') {
        setTabInfo(message)
      }
    })
  });
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
  return (
    <div style={{ padding: "10px", width: "300px" }}>
      <h3>ClipChat</h3>
      <h1>Tab info</h1>
      {tabInfo ? (
        <div>
          <p>Title: {tabInfo.tabTitle}</p>
          <button onClick = {getVideoData}>clickme</button>
        </div>

      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}