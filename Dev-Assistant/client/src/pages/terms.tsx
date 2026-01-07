import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function Terms() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-4 px-4 max-w-4xl mx-auto">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">Terms of Service</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="prose dark:prose-invert max-w-none">
          <p className="text-muted-foreground text-sm mb-8">Last updated: January 2026</p>

          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using hndld ("the Service"), you accept and agree to be bound by 
            the terms and provisions of this agreement. If you do not agree to abide by these 
            terms, please do not use this service.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            hndld is a household operations management platform that enables coordination 
            between household assistants and family clients. The Service provides task management, 
            calendar integration, vendor tracking, and communication features.
          </p>

          <h2>3. User Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials 
            and for all activities that occur under your account. You agree to immediately notify 
            us of any unauthorized use of your account.
          </p>

          <h2>4. Privacy and Data</h2>
          <p>
            Your use of the Service is also governed by our Privacy Policy. Please review our 
            Privacy Policy to understand our practices regarding your personal information.
          </p>

          <h2>5. User Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service for any unlawful purpose</li>
            <li>Attempt to gain unauthorized access to any part of the Service</li>
            <li>Interfere with or disrupt the Service or servers</li>
            <li>Upload or transmit viruses or malicious code</li>
          </ul>

          <h2>6. Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are owned by 
            hndld and are protected by international copyright, trademark, patent, trade secret, 
            and other intellectual property laws.
          </p>

          <h2>7. Limitation of Liability</h2>
          <p>
            In no event shall hndld be liable for any indirect, incidental, special, consequential, 
            or punitive damages, including without limitation, loss of profits, data, use, goodwill, 
            or other intangible losses.
          </p>

          <h2>8. Changes to Terms</h2>
          <p>
            We reserve the right to modify or replace these Terms at any time. If a revision is 
            material, we will provide at least 30 days notice prior to any new terms taking effect.
          </p>

          <h2>9. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us through the application.
          </p>
        </div>
      </main>
    </div>
  );
}
