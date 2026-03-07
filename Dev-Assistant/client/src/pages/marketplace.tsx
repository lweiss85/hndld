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
import { Search, MapPin } from "lucide-react";
import { IconRatings, IconProfile } from "@/components/icons/hndld-icons";
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
        <IconRatings
          key={star}
          size={14}
          accentColor={star <= Math.round(rating) ? "#C9A96E" : "transparent"}
          className={cn(
            star <= Math.round(rating)
              ? "text-hndld-gold-500"
              : "text-primary/15"
          )}
        />
      ))}
    </div>
  );
}

function ProviderCardSkeleton() {
  return (
    <Card className="border-border bg-card/80">
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
      <Card className="border-border bg-card/80 hover:shadow-[0_4px_16px_rgba(26,29,46,0.08)] transition-shadow cursor-pointer">
        <CardContent className="p-4">
          {sponsored && (
            <span className="text-[10px] font-medium uppercase tracking-widest text-primary/40 mb-2 block">
              Sponsored
            </span>
          )}
          <div className="flex gap-3">
            {provider.profilePhotoUrl ? (
              <img
                src={provider.profilePhotoUrl}
                alt={provider.displayName}
                className="h-14 w-14 rounded-full object-cover shrink-0 border border-border"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-primary/5 flex items-center justify-center shrink-0">
                <IconProfile size={28} className="text-primary/30" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-[15px] truncate">
                {provider.displayName}
              </h3>
              {provider.tagline && (
                <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                  {provider.tagline}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                {provider.averageRating != null && provider.averageRating > 0 && (
                  <div className="flex items-center gap-1">
                    <StarRating rating={provider.averageRating} />
                    <span className="text-xs text-muted-foreground">
                      ({provider.totalReviews})
                    </span>
                  </div>
                )}
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
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
                      className="text-[10px] px-2 py-0 h-5 bg-primary/5 text-primary/70 border-0 font-medium"
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
    <div className="min-h-screen bg-background">
      <div className="px-4 py-6 space-y-5 max-w-2xl mx-auto">
        <h1 className="font-display text-3xl font-light tracking-tight text-foreground">
          Marketplace
        </h1>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-card/90 border-border text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary/20"
            aria-label="Search providers"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          <Select value={category} onValueChange={(val) => setCategory(val === "ALL" ? "" : val)}>
            <SelectTrigger className="w-auto min-w-[120px] h-8 text-xs bg-card/90 border-border text-foreground">
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
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-card/90 border-border text-foreground hover:bg-primary/5"
            )}
            onClick={() => setVerified(!verified)}
          >
            Verified
          </Button>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-auto min-w-[140px] h-8 text-xs bg-card/90 border-border text-foreground">
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
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    All Providers
                  </h2>
                )}
                {filtered.map((provider) => (
                  <ProviderCard key={provider.slug} provider={provider} />
                ))}
              </section>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
                  <Search className="h-7 w-7 text-primary/25" />
                </div>
                <h3 className="font-display text-xl font-light tracking-tight text-foreground mb-1.5">
                  No providers found
                </h3>
                <p className="text-sm text-muted-foreground max-w-[300px] leading-relaxed">
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
