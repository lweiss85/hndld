import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  Send,
  Calendar,
  User,
  Tag,
  XCircle,
  CheckCircle2,
  MessageSquare,
  Inbox,
} from "lucide-react";

interface BookingRequest {
  id: string;
  serviceCategory: string;
  serviceType: string;
  providerName?: string;
  requestedDate?: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "COMPLETED";
  quotedPrice?: number;
  finalPrice?: number;
  notes?: string;
  createdAt?: string;
}

interface BookingMessage {
  id: string;
  senderName?: string;
  text: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200" },
  ACCEPTED: { label: "Accepted", className: "bg-blue-100 text-blue-800 border-blue-200" },
  DECLINED: { label: "Declined", className: "bg-red-100 text-red-800 border-red-200" },
  CANCELLED: { label: "Cancelled", className: "bg-gray-100 text-gray-600 border-gray-200" },
  COMPLETED: { label: "Completed", className: "bg-green-100 text-green-800 border-green-200" },
};

function BookingsSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function BookingMessages({ bookingId }: { bookingId: string }) {
  const [messageText, setMessageText] = useState("");
  const { toast } = useToast();

  const { data: messages, isLoading } = useQuery<BookingMessage[]>({
    queryKey: [`/api/v1/marketplace/booking-requests/${bookingId}/messages`],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      return apiRequest("POST", `/api/v1/marketplace/booking-requests/${bookingId}/messages`, { text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/marketplace/booking-requests/${bookingId}/messages`],
      });
      setMessageText("");
      toast({ title: "Message sent" });
    },
    onError: () => {
      toast({ title: "Failed to send message", variant: "destructive" });
    },
  });

  return (
    <div className="mt-3 pt-3 border-t border-[#1D2A44]/10 space-y-3">
      <h4 className="text-xs font-medium text-[#1D2A44]/60 uppercase tracking-wide flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        Messages
      </h4>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      ) : messages && messages.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className="p-2.5 rounded-xl bg-[#1D2A44]/5 text-sm">
              {msg.senderName && (
                <span className="font-medium text-[#1D2A44] text-xs">{msg.senderName}</span>
              )}
              <p className="text-[#1D2A44]/80">{msg.text}</p>
              <span className="text-[10px] text-[#1D2A44]/40">
                {format(new Date(msg.createdAt), "MMM d, h:mm a")}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#1D2A44]/40">No messages yet</p>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Type a message…"
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && messageText.trim()) {
              sendMessageMutation.mutate(messageText.trim());
            }
          }}
          className="text-sm bg-white/60 border-[#1D2A44]/10 focus:border-[#1D2A44]/30"
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            if (messageText.trim()) {
              sendMessageMutation.mutate(messageText.trim());
            }
          }}
          disabled={!messageText.trim() || sendMessageMutation.isPending}
          className="shrink-0 text-[#1D2A44]/60 hover:text-[#1D2A44]"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function BookingCard({ booking }: { booking: BookingRequest }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.PENDING;

  const confirmMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/marketplace/booking-requests/${booking.id}/confirm`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/marketplace/booking-requests"] });
      toast({ title: "Booking confirmed" });
    },
    onError: () => {
      toast({ title: "Failed to confirm booking", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/marketplace/booking-requests/${booking.id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/marketplace/booking-requests"] });
      toast({ title: "Booking cancelled" });
    },
    onError: () => {
      toast({ title: "Failed to cancel booking", variant: "destructive" });
    },
  });

  const price = booking.finalPrice ?? booking.quotedPrice;

  return (
    <Card
      className="rounded-2xl border-[#1D2A44]/8 bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5 text-[#1D2A44]/50 shrink-0" />
              <span className="text-xs font-medium text-[#1D2A44]/50 uppercase tracking-wide truncate">
                {booking.serviceCategory}
              </span>
            </div>
            <h3 className="font-semibold text-[#1D2A44] truncate" style={{ fontFamily: "Inter, sans-serif" }}>
              {booking.serviceType}
            </h3>
            {booking.providerName && (
              <p className="text-sm text-[#1D2A44]/60 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {booking.providerName}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-[#1D2A44]/50">
              {booking.requestedDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(booking.requestedDate), "MMM d, yyyy")}
                </span>
              )}
              {price != null && (
                <span className="font-medium text-[#1D2A44]/70">
                  ${(price / 100).toFixed(2)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <Badge variant="outline" className={`${statusCfg.className} text-xs`}>
              {statusCfg.label}
            </Badge>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-[#1D2A44]/30" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#1D2A44]/30" />
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2">
              {booking.status === "ACCEPTED" && (
                <Button
                  size="sm"
                  onClick={() => confirmMutation.mutate()}
                  disabled={confirmMutation.isPending}
                  className="bg-[#1D2A44] hover:bg-[#1D2A44]/90 text-white"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Confirm Booking
                </Button>
              )}
              {(booking.status === "PENDING" || booking.status === "ACCEPTED") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
              )}
            </div>

            <BookingMessages bookingId={booking.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyBookingsPage() {
  const [activeTab, setActiveTab] = useState("all");

  const { data: bookings, isLoading } = useQuery<BookingRequest[]>({
    queryKey: ["/api/v1/marketplace/booking-requests"],
  });

  if (isLoading) return <BookingsSkeleton />;

  const filtered = bookings?.filter((b) => {
    if (activeTab === "all") return true;
    if (activeTab === "pending") return b.status === "PENDING";
    if (activeTab === "accepted") return b.status === "ACCEPTED";
    if (activeTab === "completed") return b.status === "COMPLETED";
    return true;
  }) ?? [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F2EA", fontFamily: "Inter, sans-serif" }}>
      <div className="px-4 py-6 space-y-5 max-w-4xl mx-auto">
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "#1D2A44" }}
        >
          My Bookings
        </h1>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full bg-[#1D2A44]/5 rounded-xl p-1">
            <TabsTrigger
              value="all"
              className="flex-1 text-xs font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1D2A44] data-[state=active]:shadow-sm text-[#1D2A44]/50"
            >
              All
            </TabsTrigger>
            <TabsTrigger
              value="pending"
              className="flex-1 text-xs font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1D2A44] data-[state=active]:shadow-sm text-[#1D2A44]/50"
            >
              Pending
            </TabsTrigger>
            <TabsTrigger
              value="accepted"
              className="flex-1 text-xs font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1D2A44] data-[state=active]:shadow-sm text-[#1D2A44]/50"
            >
              Accepted
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className="flex-1 text-xs font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#1D2A44] data-[state=active]:shadow-sm text-[#1D2A44]/50"
            >
              Completed
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {filtered.length === 0 ? (
          <Card className="rounded-2xl border-[#1D2A44]/8 bg-white/80">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="w-12 h-12 mb-3" style={{ color: "#1D2A44", opacity: 0.25 }} />
              <p className="font-medium" style={{ color: "#1D2A44" }}>
                No bookings found
              </p>
              <p className="text-sm mt-1" style={{ color: "#1D2A44", opacity: 0.5 }}>
                {activeTab === "all"
                  ? "You haven't made any booking requests yet."
                  : `No ${activeTab} bookings right now.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}