import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Send, X, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
      const response = await apiRequest("POST", "/api/ai/chat", { messages: newMessages });
      return response.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    },
  });

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
      <Button
        size="icon"
        className="fixed bottom-24 right-4 z-40 h-12 w-12 rounded-full shadow-lg bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
        onClick={() => setIsOpen(true)}
        data-testid="button-ai-chat-open"
      >
        <Sparkles className="h-5 w-5 text-white" />
      </Button>
    );
  }

  return (
    <Card 
      className="fixed bottom-24 right-4 z-40 w-80 sm:w-96 shadow-2xl border-0 overflow-hidden"
      data-testid="card-ai-chat"
    >
      <CardHeader className="p-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <CardTitle className="text-sm font-medium">AI Assistant</CardTitle>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-white/80 hover:text-white hover:bg-white/20"
            onClick={() => setIsOpen(false)}
            data-testid="button-ai-chat-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <ScrollArea className="h-72" ref={scrollRef}>
        <CardContent className="p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
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
            </div>
          ))}
          
          {chatMutation.isPending && (
            <div className="flex gap-2">
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
            data-testid="input-ai-chat"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || chatMutation.isPending}
            data-testid="button-ai-chat-send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
