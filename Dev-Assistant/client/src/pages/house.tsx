import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Building2, 
  Key, 
  Wifi, 
  Thermometer,
  Shield,
  FileText,
  Plus,
  BookOpen,
  ChevronRight,
  Users,
  FolderOpen
} from "lucide-react";
import { useUser } from "@/lib/user-context";

const HOUSE_SECTIONS = [
  { 
    icon: Key, 
    title: "Access Codes", 
    description: "Gate, garage, alarm codes",
    count: 4
  },
  { 
    icon: Wifi, 
    title: "Wi-Fi Networks", 
    description: "Network names and passwords",
    count: 2
  },
  { 
    icon: Thermometer, 
    title: "Utilities", 
    description: "Electric, gas, water accounts",
    count: 3
  },
  { 
    icon: Shield, 
    title: "Insurance", 
    description: "Home, auto, umbrella policies",
    count: 3
  },
  { 
    icon: FileText, 
    title: "Documents", 
    description: "Warranties, manuals, contracts",
    count: 12
  },
];

export default function House() {
  const { activeRole } = useUser();
  
  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">House</h1>
        <Button size="sm" variant="outline" data-testid="button-add-info">
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg" data-testid="text-household-name">My Household</h2>
              <p className="text-sm text-muted-foreground">Household information hub</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {HOUSE_SECTIONS.map((section) => (
          <Card 
            key={section.title} 
            className="hover-elevate cursor-pointer"
            data-testid={`card-section-${section.title.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <section.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{section.title}</h3>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </div>
                <div className="text-sm text-muted-foreground shrink-0">
                  {section.count} items
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <Link href="/files">
          <Card 
            className="hover-elevate cursor-pointer bg-gradient-to-r from-primary/5 to-transparent border-primary/20"
            data-testid="card-files"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">Files</h3>
                  <p className="text-sm text-muted-foreground">Receipts, documents, photos</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/playbooks">
          <Card 
            className="hover-elevate cursor-pointer"
            data-testid="card-playbooks"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">Playbooks</h3>
                  <p className="text-sm text-muted-foreground">Standard operating procedures</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {activeRole === "ASSISTANT" && (
        <Link href="/organizations">
          <Card 
            className="hover-elevate cursor-pointer"
            data-testid="card-organizations"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">Organizations</h3>
                  <p className="text-sm text-muted-foreground">Multi-household management</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      <p className="text-center text-sm text-muted-foreground py-4">
        Full house management features coming soon
      </p>
    </div>
  );
}
