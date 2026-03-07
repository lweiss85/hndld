import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, FileText, ArrowRight } from "lucide-react";
import { IconTasks, IconReferrals, IconSettings } from "@/components/icons/hndld-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation } from "wouter";
import type { Task, Update, Vendor, Preference } from "@shared/schema";

interface SearchResults {
  tasks: Task[];
  updates: Update[];
  vendors: Vendor[];
  preferences: Preference[];
  totalCount: number;
}

const filterOptions = [
  { id: "tasks", label: "Tasks", icon: IconTasks },
  { id: "updates", label: "Updates", icon: FileText },
  { id: "vendors", label: "Vendors", icon: IconReferrals },
  { id: "preferences", label: "Preferences", icon: IconSettings },
];

export function GlobalSearchTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Search"
            data-testid="button-global-search"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Search (⌘K)</TooltipContent>
      </Tooltip>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>(["tasks", "updates", "vendors", "preferences"]);
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
    }
  }, [open]);

  const { data: results, isLoading } = useQuery<SearchResults>({
    queryKey: [`/api/search?q=${encodeURIComponent(query)}&types=${activeFilters.join(",")}`],
    enabled: query.length >= 2,
  });

  const toggleFilter = (filterId: string) => {
    setActiveFilters(prev => 
      prev.includes(filterId) 
        ? prev.filter(f => f !== filterId)
        : [...prev, filterId]
    );
  };

  const handleResultClick = (type: string, item: any) => {
    onOpenChange(false);
    switch (type) {
      case "tasks":
        setLocation(`/tasks?id=${item.id}`);
        break;
      case "updates":
        setLocation("/updates");
        break;
      case "vendors":
        setLocation("/vendors");
        break;
      case "preferences":
        setLocation("/household");
        break;
    }
  };

  const hasResults = results && results.totalCount > 0;
  const showEmptyState = query.length >= 2 && !isLoading && !hasResults;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Search across tasks, updates, vendors, and preferences</DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground mr-3" aria-hidden="true" />
          <Input
            ref={inputRef}
            placeholder="Search tasks, updates, vendors..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 focus-visible:ring-0 px-0 text-base"
            aria-label="Search tasks, updates, vendors, and preferences"
            data-testid="input-global-search"
          />
          {query && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear search</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-2 border-b" role="group" aria-label="Search filters">
          {filterOptions.map((filter) => {
            const isActive = activeFilters.includes(filter.id);
            return (
              <Badge
                key={filter.id}
                variant={isActive ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleFilter(filter.id)}
                role="checkbox"
                aria-checked={isActive}
                aria-label={`Filter by ${filter.label}`}
                data-testid={`filter-${filter.id}`}
              >
                <filter.icon className="h-3 w-3 mr-1" aria-hidden="true" />
                {filter.label}
              </Badge>
            );
          })}
        </div>

        <ScrollArea className="max-h-[400px]">
          {isLoading && query.length >= 2 && (
            <div className="p-8 text-center text-muted-foreground" aria-busy="true" aria-label="Searching">
              Searching...
            </div>
          )}

          {showEmptyState && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <Search className="h-8 w-8 text-muted-foreground/30 mb-4" aria-hidden="true" />
              <h3 className="font-display text-lg font-light tracking-tight text-foreground mb-1">No results found</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Try a different search term for "{query}".</p>
            </div>
          )}

          {!query && (
            <div className="p-8 text-center text-muted-foreground">
              <p>Start typing to search...</p>
              <p className="text-xs mt-2">Tip: Use Cmd/Ctrl + K to open search</p>
            </div>
          )}

          {hasResults && (
            <div className="p-2">
              {results.tasks.length > 0 && (
                <SearchResultSection
                  title="Tasks"
                  icon={IconTasks}
                  items={results.tasks}
                  onItemClick={(item) => handleResultClick("tasks", item)}
                  renderItem={(task: Task) => (
                    <div>
                      <div className="font-medium text-sm">{task.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] h-4">
                          {task.status}
                        </Badge>
                        <span>{task.category}</span>
                      </div>
                    </div>
                  )}
                />
              )}

              {results.updates.length > 0 && (
                <SearchResultSection
                  title="Updates"
                  icon={FileText}
                  items={results.updates}
                  onItemClick={(item) => handleResultClick("updates", item)}
                  renderItem={(update: Update) => (
                    <div className="text-sm line-clamp-2">{update.text}</div>
                  )}
                />
              )}

              {results.vendors.length > 0 && (
                <SearchResultSection
                  title="Vendors"
                  icon={IconReferrals}
                  items={results.vendors}
                  onItemClick={(item) => handleResultClick("vendors", item)}
                  renderItem={(vendor: Vendor) => (
                    <div>
                      <div className="font-medium text-sm">{vendor.name}</div>
                      {vendor.category && (
                        <div className="text-xs text-muted-foreground">{vendor.category}</div>
                      )}
                    </div>
                  )}
                />
              )}

              {results.preferences.length > 0 && (
                <SearchResultSection
                  title="Preferences"
                  icon={IconSettings}
                  items={results.preferences}
                  onItemClick={(item) => handleResultClick("preferences", item)}
                  renderItem={(pref: Preference) => (
                    <div>
                      <div className="font-medium text-sm">{pref.key}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{pref.value}</div>
                    </div>
                  )}
                />
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface SearchResultSectionProps<T> {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: T[];
  onItemClick: (item: T) => void;
  renderItem: (item: T) => JSX.Element;
}

function SearchResultSection<T extends { id: string }>({ 
  title, 
  icon: Icon, 
  items, 
  onItemClick, 
  renderItem 
}: SearchResultSectionProps<T>) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wide">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {title}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onItemClick(item)}
          className="p-2 rounded-lg cursor-pointer hover-elevate active-elevate-2"
          role="button"
          tabIndex={0}
          aria-label={`View ${title.toLowerCase()} result`}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemClick(item); } }}
          data-testid={`search-result-${item.id}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              {renderItem(item)}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
}
