import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function Privacy() {
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
          <h1 className="text-xl font-semibold">Privacy Policy</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="prose dark:prose-invert max-w-none">
          <p className="text-muted-foreground text-sm mb-8">Last updated: January 2026</p>

          <h2>1. Information We Collect</h2>
          <p>We collect information you provide directly to us, such as:</p>
          <ul>
            <li>Account information (name, email address)</li>
            <li>Household data (tasks, calendar events, vendor information)</li>
            <li>Communication data (requests, updates, comments)</li>
            <li>Usage data (how you interact with the Service)</li>
          </ul>

          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide, maintain, and improve the Service</li>
            <li>Send you notifications and updates</li>
            <li>Respond to your comments and questions</li>
            <li>Monitor and analyze trends and usage</li>
            <li>Detect and prevent fraudulent transactions and abuse</li>
          </ul>

          <h2>3. Information Sharing</h2>
          <p>
            We do not sell, trade, or otherwise transfer your personal information to outside 
            parties except as described in this policy. We may share information with:
          </p>
          <ul>
            <li>Other members of your household (as permitted by your role)</li>
            <li>Service providers who assist in operating the Service</li>
            <li>Law enforcement when required by law</li>
          </ul>

          <h2>4. Data Security</h2>
          <p>
            We implement appropriate security measures to protect your personal information. 
            However, no method of transmission over the Internet or electronic storage is 
            100% secure, and we cannot guarantee absolute security.
          </p>

          <h2>5. Data Retention</h2>
          <p>
            We retain your information for as long as your account is active or as needed to 
            provide you services. You may request deletion of your data at any time.
          </p>

          <h2>6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Export your data</li>
            <li>Opt out of marketing communications</li>
          </ul>

          <h2>7. Cookies</h2>
          <p>
            We use cookies and similar technologies to maintain your session, remember your 
            preferences, and improve your experience. You can control cookies through your 
            browser settings.
          </p>

          <h2>8. Third-Party Services</h2>
          <p>
            The Service may contain links to third-party websites or services. We are not 
            responsible for the privacy practices of these third parties.
          </p>

          <h2>9. Children's Privacy</h2>
          <p>
            The Service is not intended for children under 13. We do not knowingly collect 
            personal information from children under 13.
          </p>

          <h2>10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any 
            changes by posting the new Privacy Policy on this page.
          </p>

          <h2>11. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please contact us through 
            the application.
          </p>
        </div>
      </main>
    </div>
  );
}
