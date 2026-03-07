import { Card, CardContent } from "@/components/ui/card";
import { IconAlert } from "@/components/icons/hndld-icons";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <IconAlert size={32} className="text-destructive" />
            <h1 className="font-display text-3xl font-light tracking-tight text-foreground">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-body text-muted-foreground">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
