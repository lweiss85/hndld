import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Star,
  Clock,
  CheckCircle2,
  Briefcase,
  DollarSign,
  Timer,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ProviderService {
  id: string;
  name: string;
  description: string;
  priceMin: number;
  priceMax: number;
  duration: string;
}

interface ProviderBadge {
  id: string;
  label: string;
  icon?: string;
}

interface ProviderReview {
  id: string;
  rating: number;
  text: string;
  authorName: string;
  createdAt: string;
  qualityRating?: number;
  punctualityRating?: number;
  valueRating?: number;
}

interface ProviderData {
  id: string;
  slug: string;
  displayName: string;
  tagline: string;
  coverPhoto?: string;
  profilePhoto?: string;
  jobsCompleted: number;
  rating: number;
  responseTime: string;
  completionRate: number;
  badges: ProviderBadge[];
  services: ProviderService[];
  reviews: ProviderReview[];
  ratingBreakdown: {
    overall: number;
    quality: number;
    punctuality: number;
    value: number;
  };
}

function ProviderDetailSkeleton() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F2EA" }}>
      <Skeleton className="h-48 w-full" />
      <div className="px-4 -mt-12 space-y-6 pb-24">
        <div className="flex items-end gap-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${
            star <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-[#1D2A44]/20"
          }`}
        />
      ))}
    </div>
  );
}

function RatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-24 shrink-0" style={{ color: "#1D2A44" }}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-[#1D2A44]/10">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${(value / 5) * 100}%` }}
        />
      </div>
      <span className="text-sm font-medium w-8 text-right" style={{ color: "#1D2A44" }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

const TIME_SLOTS = [
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
];

export default function ProviderDetailPage() {
  const [, params] = useRoute("/marketplace/:slug");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const slug = params?.slug;

  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [bookingData, setBookingData] = useState({
    serviceId: "",
    requestedDate: "",
    timeSlot: "",
    sqft: "",
    bedrooms: "",
    bathrooms: "",
    specialInstructions: "",
    flexibleDates: false,
  });

  const { data: provider, isLoading, error } = useQuery<ProviderData>({
    queryKey: [`/api/v1/marketplace/providers/${slug}`],
    enabled: !!slug,
  });

  const bookingMutation = useMutation({
    mutationFn: async (data: typeof bookingData) => {
      return apiRequest("POST", "/api/v1/marketplace/booking-requests", {
        providerSlug: slug,
        serviceId: data.serviceId,
        requestedDate: data.requestedDate,
        timeSlot: data.timeSlot,
        propertyDetails: {
          sqft: data.sqft ? parseInt(data.sqft) : undefined,
          bedrooms: data.bedrooms ? parseInt(data.bedrooms) : undefined,
          bathrooms: data.bathrooms ? parseInt(data.bathrooms) : undefined,
        },
        specialInstructions: data.specialInstructions || undefined,
        flexibleDates: data.flexibleDates,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/v1/marketplace/providers/${slug}`] });
      setShowBookingDialog(false);
      setBookingData({
        serviceId: "",
        requestedDate: "",
        timeSlot: "",
        sqft: "",
        bedrooms: "",
        bathrooms: "",
        specialInstructions: "",
        flexibleDates: false,
      });
      toast({
        title: "Booking requested",
        description: "The provider will review your request shortly.",
      });
    },
    onError: () => {
      toast({
        title: "Booking failed",
        description: "Could not submit your booking request. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <ProviderDetailSkeleton />;

  if (error || !provider) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ backgroundColor: "#F6F2EA", color: "#1D2A44", fontFamily: "Inter, sans-serif" }}
      >
        <h2 className="text-xl font-semibold mb-2">Provider not found</h2>
        <p className="text-sm opacity-60 mb-6">This provider may no longer be available.</p>
        <Button variant="outline" onClick={() => navigate("/marketplace")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Marketplace
        </Button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-24"
      style={{ backgroundColor: "#F6F2EA", color: "#1D2A44", fontFamily: "Inter, sans-serif" }}
    >
      <div className="relative">
        {provider.coverPhoto ? (
          <img
            src={provider.coverPhoto}
            alt=""
            className="w-full h-48 object-cover"
          />
        ) : (
          <div
            className="w-full h-48"
            style={{
              background: "linear-gradient(135deg, #1D2A44 0%, #3B5278 50%, #6B8CBF 100%)",
            }}
          />
        )}
        <button
          onClick={() => navigate("/marketplace")}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm"
          aria-label="Back to marketplace"
        >
          <ArrowLeft className="h-5 w-5" style={{ color: "#1D2A44" }} />
        </button>
      </div>

      <div className="px-4 -mt-12 space-y-6">
        <div className="flex items-end gap-4">
          {provider.profilePhoto ? (
            <img
              src={provider.profilePhoto}
              alt={provider.displayName}
              className="w-24 h-24 rounded-full border-4 border-[#F6F2EA] object-cover shadow-lg"
            />
          ) : (
            <div
              className="w-24 h-24 rounded-full border-4 border-[#F6F2EA] shadow-lg flex items-center justify-center text-2xl font-bold text-white"
              style={{ backgroundColor: "#1D2A44" }}
            >
              {provider.displayName.charAt(0)}
            </div>
          )}
          <div className="flex-1 pb-1">
            <h1 className="text-xl font-bold" style={{ color: "#1D2A44" }}>
              {provider.displayName}
            </h1>
            {provider.tagline && (
              <p className="text-sm mt-0.5" style={{ color: "#1D2A44", opacity: 0.6 }}>
                {provider.tagline}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card className="border-0 shadow-sm" style={{ backgroundColor: "white" }}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#1D2A44" }}>
                <Briefcase className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: "#1D2A44" }}>
                  {provider.jobsCompleted}
                </p>
                <p className="text-xs" style={{ color: "#1D2A44", opacity: 0.5 }}>Jobs Done</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm" style={{ backgroundColor: "white" }}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-400">
                <Star className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: "#1D2A44" }}>
                  {provider.rating.toFixed(1)}
                </p>
                <p className="text-xs" style={{ color: "#1D2A44", opacity: 0.5 }}>Rating</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm" style={{ backgroundColor: "white" }}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500">
                <Clock className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: "#1D2A44" }}>
                  {provider.responseTime}
                </p>
                <p className="text-xs" style={{ color: "#1D2A44", opacity: 0.5 }}>Response</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm" style={{ backgroundColor: "white" }}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-500">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold" style={{ color: "#1D2A44" }}>
                  {provider.completionRate}%
                </p>
                <p className="text-xs" style={{ color: "#1D2A44", opacity: 0.5 }}>Completion</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {provider.badges && provider.badges.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#1D2A44", opacity: 0.5 }}>
              Badges
            </h2>
            <div className="flex flex-wrap gap-2">
              {provider.badges.map((badge) => (
                <Badge
                  key={badge.id}
                  variant="secondary"
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "#1D2A44", color: "#F6F2EA" }}
                >
                  {badge.icon && <span className="mr-1">{badge.icon}</span>}
                  {badge.label}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {provider.services && provider.services.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#1D2A44", opacity: 0.5 }}>
              Services
            </h2>
            <div className="space-y-3">
              {provider.services.map((service) => (
                <Card key={service.id} className="border-0 shadow-sm" style={{ backgroundColor: "white" }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold" style={{ color: "#1D2A44" }}>
                          {service.name}
                        </h3>
                        {service.description && (
                          <p className="text-sm mt-1" style={{ color: "#1D2A44", opacity: 0.6 }}>
                            {service.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                      <span className="flex items-center gap-1 text-sm font-medium" style={{ color: "#1D2A44" }}>
                        <DollarSign className="h-3.5 w-3.5" />
                        {service.priceMin === service.priceMax
                          ? `$${service.priceMin}`
                          : `$${service.priceMin} – $${service.priceMax}`}
                      </span>
                      {service.duration && (
                        <span className="flex items-center gap-1 text-sm" style={{ color: "#1D2A44", opacity: 0.5 }}>
                          <Timer className="h-3.5 w-3.5" />
                          {service.duration}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {provider.ratingBreakdown && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#1D2A44", opacity: 0.5 }}>
              Rating Breakdown
            </h2>
            <Card className="border-0 shadow-sm" style={{ backgroundColor: "white" }}>
              <CardContent className="p-4 space-y-3">
                <RatingBar label="Overall" value={provider.ratingBreakdown.overall} />
                <RatingBar label="Quality" value={provider.ratingBreakdown.quality} />
                <RatingBar label="Punctuality" value={provider.ratingBreakdown.punctuality} />
                <RatingBar label="Value" value={provider.ratingBreakdown.value} />
              </CardContent>
            </Card>
          </div>
        )}

        {provider.reviews && provider.reviews.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#1D2A44", opacity: 0.5 }}>
              Reviews ({provider.reviews.length})
            </h2>
            <div className="space-y-3">
              {provider.reviews.map((review) => (
                <Card key={review.id} className="border-0 shadow-sm" style={{ backgroundColor: "white" }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm" style={{ color: "#1D2A44" }}>
                        {review.authorName}
                      </span>
                      <StarRating rating={review.rating} />
                    </div>
                    {review.text && (
                      <p className="text-sm mb-2" style={{ color: "#1D2A44", opacity: 0.7 }}>
                        {review.text}
                      </p>
                    )}
                    <p className="text-xs" style={{ color: "#1D2A44", opacity: 0.4 }}>
                      {new Date(review.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 p-4 border-t"
        style={{ backgroundColor: "#F6F2EA", borderColor: "#1D2A44" + "15" }}
      >
        <Button
          className="w-full h-12 text-base font-semibold rounded-xl"
          style={{ backgroundColor: "#1D2A44", color: "#F6F2EA" }}
          onClick={() => setShowBookingDialog(true)}
        >
          Request Booking
        </Button>
      </div>

      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#1D2A44" }}>Request Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label style={{ color: "#1D2A44" }}>Service</Label>
              <Select
                value={bookingData.serviceId}
                onValueChange={(val) => setBookingData({ ...bookingData, serviceId: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {provider?.services?.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label style={{ color: "#1D2A44" }}>Requested Date</Label>
              <Input
                type="date"
                value={bookingData.requestedDate}
                onChange={(e) => setBookingData({ ...bookingData, requestedDate: e.target.value })}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div className="space-y-2">
              <Label style={{ color: "#1D2A44" }}>Time Slot</Label>
              <Select
                value={bookingData.timeSlot}
                onValueChange={(val) => setBookingData({ ...bookingData, timeSlot: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label style={{ color: "#1D2A44" }}>Property Details</Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Input
                    type="number"
                    placeholder="Sq ft"
                    value={bookingData.sqft}
                    onChange={(e) => setBookingData({ ...bookingData, sqft: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    placeholder="Beds"
                    value={bookingData.bedrooms}
                    onChange={(e) => setBookingData({ ...bookingData, bedrooms: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    placeholder="Baths"
                    value={bookingData.bathrooms}
                    onChange={(e) => setBookingData({ ...bookingData, bathrooms: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label style={{ color: "#1D2A44" }}>Special Instructions</Label>
              <Textarea
                placeholder="Any special requests or details..."
                value={bookingData.specialInstructions}
                onChange={(e) =>
                  setBookingData({ ...bookingData, specialInstructions: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label style={{ color: "#1D2A44" }}>Flexible on dates?</Label>
              <Switch
                checked={bookingData.flexibleDates}
                onCheckedChange={(checked) =>
                  setBookingData({ ...bookingData, flexibleDates: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full h-11 font-semibold rounded-xl"
              style={{ backgroundColor: "#1D2A44", color: "#F6F2EA" }}
              disabled={
                !bookingData.serviceId ||
                !bookingData.requestedDate ||
                !bookingData.timeSlot ||
                bookingMutation.isPending
              }
              onClick={() => bookingMutation.mutate(bookingData)}
            >
              {bookingMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
