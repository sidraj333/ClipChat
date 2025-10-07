import { useState, useEffect } from "react";

export default function App() {
  const [tabInfo , setTabInfo] = useState(null);
  useEffect(() => {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TAB_UPDATE') {
        setTabInfo(message)
      }
    })
  });

  return (
    <div style={{ padding: "10px", width: "300px" }}>
      <h3>ClipChat</h3>
      <h1>Tab info</h1>
      {tabInfo ? (
        <div>
          <p>Title: {tabInfo.tabTitle}</p>
        </div>

      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}