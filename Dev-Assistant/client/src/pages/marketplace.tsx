import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Star, User, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { value: "CLEANING", label: "Cleaning" },
  { value: "PERSONAL_ASSISTANT", label: "Personal Assistant" },
  { value: "LANDSCAPING", label: "Landscaping" },
  { value: "HANDYMAN", label: "Handyman" },
  { value: "POOL_SERVICE", label: "Pool Service" },
  { value: "PET_CARE", label: "Pet Care" },
  { value: "MEAL_PREP", label: "Meal Prep" },
  { value: "ORGANIZING", label: "Organizing" },
] as const;

const SORT_OPTIONS = [
  { value: "rating", label: "Top Rated" },
  { value: "distance", label: "Nearest" },
  { value: "response_time", label: "Fastest Response" },
  { value: "price_low", label: "Price: Low to High" },
  { value: "price_high", label: "Price: High to Low" },
] as const;

const BADGE_LABELS: Record<string, string> = {
  VERIFIED: "Verified",
  TOP_RATED: "Top Rated",
  FAST_RESPONDER: "Fast Responder",
  RELIABLE: "Reliable",
  VETERAN: "Veteran",
  NEIGHBOR_FAVORITE: "Neighbor Favorite",
};

interface MarketplaceProvider {
  slug: string;
  displayName: string;
  tagline: string | null;
  profilePhotoUrl: string | null;
  verificationStatus: string;
  servicesOffered: any;
  serviceAreas: any;
  averageRating: number | null;
  totalReviews: number;
  responseTimeMinutes: number | null;
  badges: string[];
  isFeatured?: boolean;
  sponsoredLabel?: string;
}

interface MarketplaceResponse {
  providers: MarketplaceProvider[];
  featured: MarketplaceProvider[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-3.5 w-3.5",
            star <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-[#1D2A44]/20"
          )}
        />
      ))}
    </div>
  );
}

function ProviderCardSkeleton() {
  return (
    <Card className="border-[#1D2A44]/8 bg-white/80">
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Skeleton className="h-14 w-14 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderCard({ provider, sponsored = false }: { provider: MarketplaceProvider; sponsored?: boolean }) {
  return (
    <Link href={`/marketplace/${provider.slug}`}>
      <Card className="border-[#1D2A44]/8 bg-white/80 hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          {sponsored && (
            <span className="text-[10px] font-medium uppercase tracking-widest text-[#1D2A44]/40 mb-2 block">
              Sponsored
            </span>
          )}
          <div className="flex gap-3">
            {provider.profilePhotoUrl ? (
              <img
                src={provider.profilePhotoUrl}
                alt={provider.displayName}
                className="h-14 w-14 rounded-full object-cover shrink-0 border border-[#1D2A44]/10"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-[#1D2A44]/5 flex items-center justify-center shrink-0">
                <User className="h-7 w-7 text-[#1D2A44]/30" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[#1D2A44] text-[15px] truncate">
                {provider.displayName}
              </h3>
              {provider.tagline && (
                <p className="text-sm text-[#1D2A44]/60 line-clamp-1 mt-0.5">
                  {provider.tagline}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                {provider.averageRating != null && provider.averageRating > 0 && (
                  <div className="flex items-center gap-1">
                    <StarRating rating={provider.averageRating} />
                    <span className="text-xs text-[#1D2A44]/50">
                      ({provider.totalReviews})
                    </span>
                  </div>
                )}
                <span className="text-xs text-[#1D2A44]/40 flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  Nearby
                </span>
              </div>
              {provider.badges.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {provider.badges.slice(0, 3).map((badge) => (
                    <Badge
                      key={badge}
                      variant="secondary"
                      className="text-[10px] px-2 py-0 h-5 bg-[#1D2A44]/5 text-[#1D2A44]/70 border-0 font-medium"
                    >
                      {BADGE_LABELS[badge] || badge}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [verified, setVerified] = useState(false);
  const [sortBy, setSortBy] = useState("rating");

  const queryParams = new URLSearchParams();
  if (category) queryParams.set("category", category);
  if (verified) queryParams.set("verified", "true");
  if (sortBy) queryParams.set("sortBy", sortBy);

  const { data, isLoading } = useQuery<MarketplaceResponse>({
    queryKey: [`/api/v1/marketplace/providers?${queryParams.toString()}`],
  });

  const providers = data?.providers ?? [];
  const featured = data?.featured ?? [];

  const filtered = searchQuery
    ? providers.filter(
        (p) =>
          p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.tagline && p.tagline.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : providers;

  return (
    <div className="min-h-screen bg-[#F6F2EA]">
      <div className="px-4 py-6 space-y-5 max-w-2xl mx-auto" style={{ fontFamily: "Inter, sans-serif" }}>
        <h1 className="text-2xl font-bold text-[#1D2A44] tracking-tight">
          Marketplace
        </h1>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#1D2A44]/40" />
          <Input
            placeholder="Search providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white/90 border-[#1D2A44]/10 text-[#1D2A44] placeholder:text-[#1D2A44]/35 focus-visible:ring-[#1D2A44]/20"
            aria-label="Search providers"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          <Select value={category} onValueChange={(val) => setCategory(val === "ALL" ? "" : val)}>
            <SelectTrigger className="w-auto min-w-[120px] h-8 text-xs bg-white/90 border-[#1D2A44]/10 text-[#1D2A44]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={verified ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-8 text-xs shrink-0",
              verified
                ? "bg-[#1D2A44] text-white hover:bg-[#1D2A44]/90"
                : "bg-white/90 border-[#1D2A44]/10 text-[#1D2A44] hover:bg-[#1D2A44]/5"
            )}
            onClick={() => setVerified(!verified)}
          >
            Verified
          </Button>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-auto min-w-[140px] h-8 text-xs bg-white/90 border-[#1D2A44]/10 text-[#1D2A44]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <ProviderCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-[#1D2A44]/50 uppercase tracking-wider">
                  Featured
                </h2>
                {featured.map((provider) => (
                  <ProviderCard
                    key={provider.slug}
                    provider={provider}
                    sponsored
                  />
                ))}
              </section>
            )}

            {filtered.length > 0 ? (
              <section className="space-y-3">
                {featured.length > 0 && (
                  <h2 className="text-sm font-semibold text-[#1D2A44]/50 uppercase tracking-wider">
                    All Providers
                  </h2>
                )}
                {filtered.map((provider) => (
                  <ProviderCard key={provider.slug} provider={provider} />
                ))}
              </section>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-[#1D2A44]/5 flex items-center justify-center mb-4">
                  <Search className="h-7 w-7 text-[#1D2A44]/25" />
                </div>
                <h3 className="font-semibold text-[#1D2A44] text-lg mb-1">
                  No providers found
                </h3>
                <p className="text-sm text-[#1D2A44]/50 max-w-xs">
                  Try adjusting your filters or search to find the right service provider.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
