import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageCircle, Send, X, Sparkles, Check, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  action?: {
    type: "create_request";
    data: {
      title: string;
      description?: string;
      category: string;
      urgency: string;
    };
    confirmMessage: string;
  };
  confirmed?: boolean;
}

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const newMessages = messages.map(m => ({ role: m.role, content: m.content }));
      newMessages.push({ role: "user" as const, content: userMessage });
      const response = await apiRequest("POST", "/api/ai/chat", { messages: newMessages });
      return response.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: data.response,
        action: data.action
      }]);
    },
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; category: string; urgency: string }) => {
      const response = await apiRequest("POST", "/api/ai/chat/create-request", data);
      return response.json();
    },
    onSuccess: (data, variables) => {
      setMessages(prev => prev.map((msg, idx) => {
        if (idx === prev.length - 1 && msg.action) {
          return { ...msg, confirmed: true, content: data.message };
        }
        return msg;
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    },
  });

  const handleConfirmRequest = (action: ChatMessage["action"]) => {
    if (!action || action.type !== "create_request") return;
    createRequestMutation.mutate(action.data);
  };

  const handleDeclineRequest = () => {
    setMessages(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        const last = updated[updated.length - 1];
        if (last.action) {
          updated[updated.length - 1] = { 
            ...last, 
            action: undefined, 
            content: "No problem! Let me know if you need anything else." 
          };
        }
      }
      return updated;
    });
  };

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    
    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    chatMutation.mutate(userMessage);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isOpen) {
    return (
      <div 
        style={{ 
          position: 'fixed', 
          bottom: '6rem', 
          right: '1rem', 
          left: 'auto',
          zIndex: 9999 
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              className="h-12 w-12 rounded-full shadow-lg bg-[#1D2A44] hover:bg-[#2a3a5a]"
              onClick={() => setIsOpen(true)}
              aria-label="Open AI assistant"
              data-testid="button-ai-chat-open"
            >
              <Sparkles className="h-5 w-5 text-[#F6F2EA]" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">AI Assistant</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      style={{ 
        position: 'fixed', 
        bottom: '6rem', 
        right: '1rem', 
        left: 'auto',
        zIndex: 9999 
      }}
    >
    <Card 
      className="w-80 sm:w-96 shadow-2xl border-0 overflow-hidden"
      data-testid="card-ai-chat"
    >
      <CardHeader className="p-3 bg-[#1D2A44] text-[#F6F2EA]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <CardTitle className="text-sm font-medium">AI Assistant</CardTitle>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/20"
                onClick={() => setIsOpen(false)}
                aria-label="Close AI assistant"
                data-testid="button-ai-chat-close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      
      <ScrollArea className="h-72" ref={scrollRef}>
        <CardContent className="p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
              <p className="text-sm">Ask me anything about your household</p>
              <p className="text-xs mt-1 opacity-75">Try: "What's on my schedule this week?"</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
              data-testid={`chat-message-${msg.role}-${idx}`}
            >
              {msg.content}
              {msg.action && !msg.confirmed && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-border/50">
                  <Button
                    size="sm"
                    variant="default"
                    className="flex-1 h-7 text-xs"
                    onClick={() => handleConfirmRequest(msg.action)}
                    disabled={createRequestMutation.isPending}
                  >
                    <Check className="h-3 w-3 mr-1" aria-hidden="true" />
                    Yes, submit it
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    onClick={handleDeclineRequest}
                    disabled={createRequestMutation.isPending}
                  >
                    <XCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                    No thanks
                  </Button>
                </div>
              )}
              {msg.confirmed && (
                <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Request submitted
                </div>
              )}
            </div>
          ))}
          
          {chatMutation.isPending && (
            <div className="flex gap-2" aria-busy="true" aria-label="Loading response">
              <Skeleton className="h-4 w-4 rounded-full animate-pulse" />
              <Skeleton className="h-4 w-4 rounded-full animate-pulse delay-75" />
              <Skeleton className="h-4 w-4 rounded-full animate-pulse delay-150" />
            </div>
          )}
        </CardContent>
      </ScrollArea>
      
      <div className="p-3 border-t">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="flex-1"
            disabled={chatMutation.isPending}
            aria-label="Chat message"
            data-testid="input-ai-chat"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || chatMutation.isPending}
                aria-label="Send message"
                data-testid="button-ai-chat-send"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </form>
      </div>
    </Card>
    </div>
  );
}
