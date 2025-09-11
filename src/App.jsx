import { useState } from "react";

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);

  // const handleSend = () => {
  //   if (!input.trim()) return;
  //   setMessages([...messages, { sender: "You", text: input }]);
  //   setInput("");
  // };

  return (
    <div style={{ padding: "10px", width: "300px" }}>
      <h3>ClipChat</h3>
    </div>
  );
}