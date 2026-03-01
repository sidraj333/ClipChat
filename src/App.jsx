import { useState, useEffect, useRef } from "react";

export default function App() {
  const [tabInfo, setTabInfo] = useState(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const containerRef = useRef(null);

  // load saved messages and subscribe to tab updates
  useEffect(() => {
    const onMessage = (message) => {
      if (message.type === "TAB_UPDATE") setTabInfo(message);
    };
    chrome.runtime.onMessage.addListener(onMessage);

    // query active tab immediately
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (tab) setTabInfo({ tabId: tab.id, tabUrl: tab.url, tabTitle: tab.title });
    });

    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // persist and auto-scroll when messages or tab change
  useEffect(() => {
    // scroll to bottom on new message
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (tabInfo?.tabId) {
      const key = `messages_${tabInfo.tabId}`;
      chrome.storage.local.set({ [key]: messages });
    }
  }, [messages, tabInfo?.tabId]);

  const pushMessage = (role, text) => {
    const msg = { id: Date.now(), role, text, ts: new Date().toISOString() };
    setMessages((m) => [...m, msg]);
    return msg;
  };

  const getVideoData = async () => {
    if (!tabInfo?.tabId) return null;
    try {
      return await chrome.tabs.sendMessage(tabInfo.tabId, { type: "GET_VIDEO_DATA" });
    } catch (e) {
      console.warn("getVideoData failed", e);
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const userMsg = pushMessage("user", text);
    setText("");

    const videoData = await getVideoData();
    const body = {
      question: userMsg.text,
      videoId: videoData?.videoId,
      title: videoData?.title,
      channel: videoData?.channel,
      currentTime: videoData?.currentTime,
      duration: videoData?.duration,
    };

    const pending = pushMessage("assistant", "…thinking");

    try {
      const res = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setMessages((m) => m.map((msg) => (msg.id === pending.id ? { ...msg, text: data.answer } : msg)));
    } catch (err) {
      setMessages((m) => m.map((msg) => (msg.id === pending.id ? { ...msg, text: "Error: could not reach backend" } : msg)));
      console.error(err);
    }
  };

  // whenever tabInfo changes we should load that tab's messages
  useEffect(() => {
    if (!tabInfo?.tabId) {
      setMessages([]);
      return;
    }
    const key = `messages_${tabInfo.tabId}`;
    chrome.storage.local.get([key], (res) => {
      setMessages(res[key] || []);
    });
  }, [tabInfo?.tabId]);

  return (
    <div style={{ padding: 12, width: 320, display: "flex", flexDirection: "column", height: "100%" }}>
      <h3 style={{ margin: "6px 0" }}>ClipChat</h3>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          border: "1px solid #eee",
          borderRadius: 6,
          padding: 8,
          marginBottom: 8,
          minHeight: 200,
          maxHeight: "60vh",
          background: "#fafafa",
        }}
      >
        {messages.length === 0 ? (
          <div style={{ color: "#666" }}>No messages yet — ask something!</div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                marginBottom: 8,
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  background: m.role === "user" ? "#0b66ff" : "#e6e6e6",
                  color: m.role === "user" ? "#fff" : "#000",
                  padding: "8px 12px",
                  borderRadius: 8,
                  maxWidth: "80%",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {m.text}
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 6 }}>{new Date(m.ts).toLocaleTimeString()}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask ClipChat a question"
          style={{ flex: 1, padding: "8px 10px" }}
        />
        <button type="submit" disabled={!text.trim()} style={{ padding: "8px 12px" }}>
          Send
        </button>
      </form>
    </div>
  );
}