import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageCircle, Send, Plus, ArrowLeft, User, Mic, MicOff, Loader2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Conversation, Message } from "@shared/schema";
import { PageTransition, StaggeredList } from "@/components/juice";

function MessagesSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-32" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}

function ConversationsList({ 
  conversations, 
  onSelect,
  onCreate 
}: { 
  conversations: Conversation[];
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap animate-fade-in-up">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Messages</h1>
        <Button size="sm" onClick={onCreate} data-testid="button-new-conversation">
          <Plus className="h-4 w-4 mr-2" />
          New
        </Button>
      </div>

      {conversations.length === 0 ? (
        <Card className="text-center py-8">
          <CardContent>
            <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No conversations yet</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={onCreate}
              data-testid="button-start-conversation"
            >
              Start a conversation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <StaggeredList className="space-y-2">
          {conversations.map((convo) => (
            <Card 
              key={convo.id} 
              className="cursor-pointer hover-elevate"
              onClick={() => onSelect(convo.id)}
              data-testid={`card-conversation-${convo.id}`}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {convo.title || "General Chat"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {convo.lastMessageAt 
                      ? formatDistanceToNow(new Date(convo.lastMessageAt), { addSuffix: true })
                      : "No messages yet"
                    }
                  </p>
                </div>
                <Badge variant="secondary" className="capitalize text-xs">
                  {convo.type?.replace(/_/g, " ").toLowerCase() || "chat"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </StaggeredList>
      )}
    </div>
  );
}

function MessageThread({ 
  conversationId, 
  onBack 
}: { 
  conversationId: string;
  onBack: () => void;
}) {
  const [newMessage, setNewMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const { data: conversationsData } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });
  
  const conversation = conversationsData?.find(c => c.id === conversationId);

  const { data: messages, isLoading } = useQuery<Message[]>({
    queryKey: ["/api/conversations", conversationId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", `/api/conversations/${conversationId}/messages`, { text });
      return res.json();
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    if (!newMessage.trim()) return;
    sendMutation.mutate(newMessage.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        try {
          const base64Data = (reader.result as string).split(",")[1];
          const res = await apiRequest("POST", "/api/ai/transcribe", { audioBase64: base64Data });
          if (!res.ok) {
            throw new Error("Transcription failed");
          }
          const data = await res.json();
          if (data.transcription) {
            setNewMessage((prev) => prev + (prev ? " " : "") + data.transcription);
          }
        } catch (error) {
          toast({
            title: "Transcription Error",
            description: "Failed to transcribe audio. Voice features may require a PRO plan.",
            variant: "destructive",
          });
        } finally {
          setIsTranscribing(false);
        }
      };
      reader.onerror = () => {
        toast({
          title: "Error",
          description: "Failed to read audio file",
          variant: "destructive",
        });
        setIsTranscribing(false);
      };
    } catch (error) {
      toast({
        title: "Transcription Error",
        description: "Failed to transcribe audio",
        variant: "destructive",
      });
      setIsTranscribing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      <div className="flex items-center gap-3 pb-4 border-b">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onBack}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="font-semibold" data-testid="text-conversation-title">
            {conversation?.title || "Conversation"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {messages?.length || 0} messages
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 py-4">
        {messages?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages?.map((msg) => (
              <div 
                key={msg.id} 
                className="flex gap-3"
                data-testid={`message-${msg.id}`}
              >
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {msg.senderId?.slice(0, 8) || "User"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {msg.createdAt 
                        ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })
                        : ""
                      }
                    </span>
                  </div>
                  <p className="text-sm">{msg.text}</p>
                  {msg.isVoice && msg.voiceTranscription && (
                    <p className="text-xs text-muted-foreground italic mt-1">
                      Transcribed: {msg.voiceTranscription}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="pt-4 border-t flex gap-2">
        <Button
          size="icon"
          variant={isRecording ? "destructive" : "outline"}
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing || sendMutation.isPending}
          data-testid="button-voice"
        >
          {isTranscribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isRecording ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRecording ? "Recording..." : "Type a message..."}
          disabled={sendMutation.isPending || isRecording}
          data-testid="input-message"
        />
        <Button 
          onClick={handleSend}
          disabled={!newMessage.trim() || sendMutation.isPending}
          data-testid="button-send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: conversations, isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations", {
        title: "New Conversation",
        type: "CLIENT_ASSISTANT",
      });
      return res.json();
    },
    onSuccess: (newConvo: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setSelectedConversation(newConvo.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <MessagesSkeleton />;

  return (
    <PageTransition>
    <div className="px-4 py-6 max-w-4xl mx-auto pb-24">
      {selectedConversation ? (
        <MessageThread 
          conversationId={selectedConversation} 
          onBack={() => setSelectedConversation(null)}
        />
      ) : (
        <ConversationsList
          conversations={conversations || []}
          onSelect={setSelectedConversation}
          onCreate={() => createMutation.mutate()}
        />
      )}
    </div>
    </PageTransition>
  );
}
