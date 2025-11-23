import { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

interface RagChatWidgetProps {
  packageId?: string;
  moduleId?: string;
  analysisId: string;
}

export default function RagChatWidget({ packageId, moduleId, analysisId }: RagChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [chatId, setChatId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load existing chat history for this analysis when component mounts
  useEffect(() => {
    if (analysisId && isOpen) {
      loadChatHistory();
    }
  }, [analysisId, isOpen]);

  const loadChatHistory = async () => {
    setLoadingHistory(true);
    try {
      // First, try to find existing chat for this analysis
      const chatsResponse = await fetch(`/api/rag-chats?analysisId=${analysisId}`);
      if (chatsResponse.ok) {
        const chats = await chatsResponse.json();
        if (chats.length > 0) {
          // Use the most recent chat for this analysis
          const existingChat = chats[0];
          setChatId(existingChat.id);
          
          // Load its message history
          const historyResponse = await fetch(`/api/rag-chat/${existingChat.id}/history`);
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            const loadedMessages: Message[] = historyData.messages.map((msg: any) => ({
              id: msg.id.toString(),
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt,
            }));
            setMessages(loadedMessages);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load chat history:', err);
      // Don't show error to user, just start fresh
    } finally {
      setLoadingHistory(false);
    }
  };

  const sendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/rag-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage.content,
          chatId: chatId || undefined,
          analysisId: analysisId || undefined,
          packageId: packageId || undefined,
          moduleId: moduleId || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();
      
      if (!chatId) {
        setChatId(data.chatId);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      // Optionally, add an error message to the chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ Error: ${err.message}`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const resetChat = () => {
    setMessages([]);
    setChatId(null);
    setError(null);
  };

  return (
    <>
      {/* Floating Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl transition-all hover:scale-110 z-50 animate-bounce"
          title="Open AI Chat"
        >
          💬
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-card rounded-lg shadow-2xl flex flex-col z-50 border border-border">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-t-lg flex justify-between items-center">
            <div>
              <h3 className="font-bold text-lg">🤖 AI Assistant</h3>
              <p className="text-xs opacity-90">Ask me anything about this analysis</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={resetChat}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded p-1 transition-colors"
                title="New Chat"
              >
                🔄
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded px-2 text-xl font-bold transition-colors"
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
            {loadingHistory && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-muted-foreground text-sm">Loading chat history...</p>
              </div>
            )}
            
            {!loadingHistory && messages.length === 0 && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">👋</div>
                <p className="text-muted-foreground text-sm">
                  Hello! I'm your AI assistant.
                  <br />
                  Ask me anything about this Sui package analysis!
                </p>
                <div className="mt-6 text-left bg-card p-4 rounded-lg shadow-sm border border-border">
                  <p className="text-xs text-muted-foreground font-semibold mb-2">Example questions:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• What does this package do?</li>
                    <li>• Explain the main modules</li>
                    <li>• Are there any security risks?</li>
                    <li>• How do these modules interact?</li>
                  </ul>
                </div>
              </div>
            )}
            
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-foreground shadow-sm border border-border'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      msg.role === 'user' ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    }`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-card text-foreground rounded-lg p-3 shadow-sm border border-border">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-destructive text-sm">❌ {error}</p>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-4 bg-card rounded-b-lg">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your question..."
                disabled={loading}
                className="flex-1 px-3 py-2 border border-input bg-background rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-sm disabled:opacity-50 disabled:cursor-not-allowed text-foreground placeholder:text-muted-foreground"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !inputValue.trim()}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {loading ? '...' : '📤'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Press Enter to send • Shift+Enter for new line
            </p>
          </div>
        </div>
      )}
    </>
  );
}

