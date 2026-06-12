import React, { useState, useRef, useEffect, useMemo } from "react";
import { Plane, Send, Brain, Bot, HelpCircle, AlertCircle } from "lucide-react";
import { ChatMessage, FlightContext } from "../types";

interface AeroExpertProps {
  flightContext: FlightContext;
}

export default function AeroExpert({ flightContext }: AeroExpertProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");

  const chatContainerRef = useRef<HTMLDivElement | null>(null);

  // Suggested preset prompts to help student pilots explore aerodynamics
  const suggestedPrompts = [
    "How does increasing air density affect lift and takeoff run?",
    "Explain my current Lift-to-Drag (L/D) ratio. Can it be optimized?",
    "At this speed, are compressibility effects critical?",
    "How do Reynolds and Mach numbers relate to this design?"
  ];

  // Auto-scroll to the bottom of the conversation window
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isSubmitting]);

  // Insert initial system message welcoming the pilot
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome-system",
          sender: "expert",
          text: `**AEROSPACE COCKPIT SYSTEM ONLINE**  
Welcome Pilot! I am your server-side **Gemini Aerospace Expert Flight Advisor**.

I am fully synchronized with your flight configuration:
- Aircraft: **${flightContext.aircraftName}**
- Speed: **${flightContext.velocity.toFixed(0)} m/s** (Mach: **${flightContext.mach.toFixed(3)}**)
- Normal Wing Scale (S): **${flightContext.wingArea.toFixed(1)} m²**

Ask me anything about flight mechanics, lift/drag coefficients, supersonic fluid dynamics, or optimization of your takeoff runway run!`
        }
      ]);
    }
  }, [flightContext.aircraftName, flightContext.velocity, flightContext.mach, flightContext.wingArea]);

  // Format full message history as text sequence for context
  const getHistoryText = () => {
    return messages
      .slice(1) // exclude initial greeting
      .map((m) => `${m.sender === "user" ? "Q:" : "A:"} ${m.text}`)
      .join("\n\n");
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isSubmitting) return;

    setErrorText("");
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: textToSend,
          flightContext,
          history: getHistoryText(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Server was unable to process the aerodynamic query.");
      }

      const data = await response.json();

      const expertMsg: ChatMessage = {
        id: `expert-${Date.now()}`,
        sender: "expert",
        text: data.answer,
      };

      setMessages((prev) => [...prev, expertMsg]);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Network timeout connecting to Aerospace model.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputText);
  };

  // Safe and beautiful markdown visual custom renderer
  const renderMessageContent = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      let content = line;

      // Render Headers (### or ##)
      if (content.startsWith("###")) {
        return (
          <h5 key={idx} className="text-sm font-semibold text-sky-300 uppercase tracking-wide mt-3 mb-1 font-sans">
            {content.replace(/^###\s*/, "")}
          </h5>
        );
      }
      if (content.startsWith("##")) {
        return (
          <h4 key={idx} className="text-base font-bold text-sky-400 mt-4 mb-1.5 font-sans border-b border-sky-400/10 pb-0.5">
            {content.replace(/^##\s*/, "")}
          </h4>
        );
      }

      // Render Bullets / Lists
      const isBullet = content.trim().startsWith("- ") || content.trim().startsWith("* ");
      if (isBullet) {
        const plainText = content.trim().replace(/^[-*]\s*/, "");
        return (
          <li key={idx} className="ml-4 list-disc text-xs text-slate-300 leading-relaxed mb-1">
            {renderBoldTags(plainText)}
          </li>
        );
      }

      // Check for code block indicators
      if (content.trim().startsWith("```")) {
        return null; // hide code markers
      }

      // Standard body paragraph
      if (!content.trim()) return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-xs text-slate-300 leading-relaxed mb-2">
          {renderBoldTags(content)}
        </p>
      );
    });
  };

  // Helper inside renderer to process inline **bold** tags
  const renderBoldTags = (text: string) => {
    const regex = /\*\*(.*?)\*\*/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // push text before match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      // push bold element
      parts.push(
        <strong key={match.index} className="font-semibold text-white">
          {match[1]}
        </strong>
      );
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div id="aero-expert-container" className="bg-[#0d1117] border border-slate-800 rounded-xl flex flex-col h-[520px] overflow-hidden">
      {/* Header Panel */}
      <div className="bg-slate-950/50 px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-semibold text-xs text-slate-200 uppercase tracking-wider">Aeronautical Expert Advisor</h3>
            <p className="text-[9px] text-slate-400 font-mono leading-none mt-0.5">
              Powered by Gemini AI (Server-Side)
            </p>
          </div>
        </div>
        <div className="text-[9px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 font-mono">
          MODEL: gemini-3.5-flash
        </div>
      </div>

      {/* Suggested Prompts Banner */}
      {messages.length <= 1 && (
        <div className="p-2.5 bg-slate-950/45 border-b border-slate-850">
          <p className="text-[9px] font-mono uppercase text-slate-500 font-bold tracking-wider mb-1 flex items-center gap-1">
            <HelpCircle className="w-3 h-3 text-sky-400" />
            INVESTIGATIONS PRESETS:
          </p>
          <div className="flex flex-wrap gap-1">
            {suggestedPrompts.map((p) => (
              <button
                key={p}
                onClick={() => handleSendMessage(p)}
                className="cursor-pointer text-[9px] text-left text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 border border-sky-500/15 hover:border-sky-500/25 rounded px-2 py-0.5 transition-colors leading-tight font-sans"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-950/20"
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2.5 max-w-[90%] ${
              m.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
            }`}
          >
            {/* Avatar block */}
            <div
              className={`w-6 h-6 rounded flex items-center justify-center shrink-0 border text-[9px] font-mono select-none ${
                m.sender === "user"
                  ? "bg-slate-800 border-slate-700 text-slate-300"
                  : "bg-sky-500/10 border-sky-500/30 text-sky-450 text-sky-400 font-bold"
              }`}
            >
              {m.sender === "user" ? "PIL" : "EXP"}
            </div>

            {/* Bubble block */}
            <div
              className={`rounded p-2.5 text-[11px] shadow-sm ${
                m.sender === "user"
                  ? "bg-sky-500 text-slate-950 font-semibold"
                  : "bg-slate-900/60 border border-slate-800 text-slate-300"
              }`}
            >
              {m.sender === "user" ? (
                <p className="leading-relaxed font-sans">{m.text}</p>
              ) : (
                renderMessageContent(m.text)
              )}
            </div>
          </div>
        ))}

        {/* Loading / Writing state indicators */}
        {isSubmitting && (
          <div className="flex gap-2.5 max-w-[90%] mr-auto">
            <div className="w-6 h-6 rounded bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center text-[9px] font-bold font-mono">
              EXP
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
              </span>
              <span className="font-mono text-[9px] tracking-wider uppercase animate-pulse">
                Advisor computing Matrices...
              </span>
            </div>
          </div>
        )}

        {errorText && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded p-2.5 text-xs flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Aerodynamic Link Failure</p>
              <p className="text-slate-400/90 mt-0.5">{errorText}</p>
            </div>
          </div>
        )}
      </div>

      {/* Input container */}
      <form onSubmit={handleSubmit} className="p-2.5 bg-slate-950/40 border-t border-slate-800/80">
        <div className="flex gap-1.5">
          <input
            id="aero-agent-chat-input"
            type="text"
            disabled={isSubmitting}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask Aerospace Advisor (e.g. 'How does speed affect normal force?')"
            className="flex-1 bg-slate-900 border border-slate-800 focus:border-sky-500 text-white rounded px-2.5 py-1.5 text-xs focus:outline-none placeholder:text-slate-600 focus:ring-1 focus:ring-sky-505 disabled:opacity-50 font-sans"
          />
          <button
            id="aero-agent-send-btn"
            type="submit"
            disabled={!inputText.trim() || isSubmitting}
            className="cursor-pointer bg-sky-500 hover:bg-sky-600 disabled:bg-slate-800 text-slate-950 disabled:text-slate-600 rounded px-3.5 flex items-center justify-center transition-colors shrink-0"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </form>
    </div>
  );
}
