import { useState, useEffect, useRef } from "react";
import useCognitoAuth from "./hooks/useCognitoAuth";

export default function App() {
  const [tabInfo, setTabInfo] = useState(null);
  const [windowId, setWindowId] = useState(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const containerRef = useRef(null);
  const { isAuthenticated, startLogin, getStoredAuthToken, logout } = useCognitoAuth();

  const setWindowInfo = (source) => {
    const nextWindowId = source?.windowId ?? source?.id;
    if (typeof nextWindowId !== "number") return;
    setWindowId((prev) => (prev == null ? nextWindowId : prev));
  };


  // load saved messages and subscribe to tab updates to display correct messages
  useEffect(() => {
    chrome.windows.getCurrent((win) => {
      setWindowInfo(win);
    });

    const onMessage = (message) => {
      if (windowId != null && message.windowId !== windowId) return;
      if (message.type === "TAB_UPDATE"){
        setTabInfo(message);
        setWindowInfo(message);
      }

    };
    chrome.runtime.onMessage.addListener(onMessage);

    // query active tab immediately
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (tab) {
        setWindowInfo(tab);
        setTabInfo({
        tabId: tab.id,
        windowId: tab.windowId,
        tabUrl: tab.url,
        tabTitle: tab.title});
      }
    });

    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [windowId]);

  // persist and auto-scroll when messages change
  useEffect(() => {
    // scroll to bottom on new message
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (tabInfo?.tabId) {
      const key = `messages_${tabInfo.tabId}`;
      chrome.storage.local.set({ [key]: messages });
    }
  }, [messages]);

  const pushMessage = (role, text) => {
    const msg = { id: Date.now(), role, text, ts: new Date().toISOString() };
    setMessages((m) => [...m, msg]);
    return msg;
  };

  // sends a request to content.json
  const getVideoData = async () => {
    if (!tabInfo?.tabId) return null;
    try {
      return await chrome.tabs.sendMessage(tabInfo.tabId, { type: "GET_VIDEO_DATA" });
    } catch (e) {
      console.warn("getVideoData failed", e);
      return null;
    }
  };

  //calls backend to fetch answer from backend lambda function
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const userMsg = pushMessage("user", text);
    setText("");

    const videoData = await getVideoData();
    const body = {
      question: userMsg.text,
      videoId: videoData?.videoId,
      currentTime: videoData?.currentTime,
      isPaused: videoData?.isPaused,
      playbackSpeed: videoData?.playbackSpeed,
    };

    const bearerToken = await getStoredAuthToken();
    if (!bearerToken) {
      pushMessage("assistant", "Please log in before sending a message.");
      return;
    }

    const pending = pushMessage("assistant", "…thinking");

    try {
      const res = await fetch("https://wlw5d67nle.execute-api.us-east-2.amazonaws.com/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        await logout();
        setMessages((m) =>
          m.map((msg) =>
            msg.id === pending.id ? { ...msg, text: "Session expired. Please log in again." } : msg
          )
        );
        return;
      }

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

  async function shouldPrefetchVideo(videoId) {
    if (!videoId) return false;
    const key = `prefetch:${videoId}`;
    const now = Date.now();

    const existing = await chrome.storage.session.get([key]);
    const lastTs = existing[key];

    if (lastTs && now - lastTs < PREFETCH_DEDUPE_MS) return false;

    await chrome.storage.session.set({ [key]: now });
    return true;
  }


  const PREFETCH_DEDUPE_MS = 10 * 60 * 1000; // 10 min
  async function preFetchVideo(videoId, bearerToken) {
    const shouldPreFetch = await shouldPrefetchVideo(videoId);
    if (!shouldPreFetch) return; //video was already pre fetched
    
    // request to prefetch video through backend lambda
    const res = await fetch("https://wlw5d67nle.execute-api.us-east-2.amazonaws.com/prefetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ videoId }),
    });
    console.log("prefetch status:", res.status, "videoId:", videoId);
  }

  // prefetches video (populates cache) when active video's ID changes
  useEffect(() => {
    const executePreFetch = async () => {
      if (!tabInfo?.tabId) return;
      const token = await getStoredAuthToken();
      if (!token) return;
      const videoData = await getVideoData();
      const videoId = videoData?.videoId;
      if (!videoId) return;
      await preFetchVideo(videoId, token);
    };
    executePreFetch();
  }, [tabInfo?.tabUrl])






 

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 12, width: 320, display: "flex", flexDirection: "column", height: "100%" }}>
        <h3 style={{ margin: "6px 0" }}>ClipChat</h3>
        <div
          style={{
            flex: 1,
            border: "1px solid #eee",
            borderRadius: 6,
            padding: 12,
            marginBottom: 8,
            minHeight: 200,
            background: "#fafafa",
            color: "#444",
          }}
        >
          Please log in to use ClipChat.
        </div>
        <button onClick={startLogin} style={{ marginBottom: 8, padding: "8px 12px" }}>
          Login with Cognito
        </button>
      </div>
    );
  }


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
