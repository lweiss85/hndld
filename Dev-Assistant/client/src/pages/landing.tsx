import { motion } from "framer-motion";
import { ChevronDown, Shield, Zap, CheckCircle } from "lucide-react";
import {
  IconSchedule,
  IconTasks,
  IconSpending,
  IconMessages,
  IconHome,
  IconComplete,
} from "@/components/icons/hndld-icons";

const ease = [0.22, 1, 0.36, 1];

const FEATURES = [
  {
    icon: IconTasks,
    title: "Task Management",
    desc: "Your team posts updates as they work. You see progress in real time — cleaning done, groceries delivered, repair complete.",
  },
  {
    icon: IconComplete,
    title: "One-Tap Approvals",
    desc: "New expense? Schedule change? Review and approve from anywhere. No back-and-forth. No chasing.",
  },
  {
    icon: IconSchedule,
    title: "Calendar Sync",
    desc: "Service visits, grocery runs, and household events — all synced with Google Calendar so nothing slips.",
  },
  {
    icon: IconSpending,
    title: "Spending Tracking",
    desc: "Every household expense logged and categorized. Monthly budgets, vendor invoices, and payment approval built in.",
  },
  {
    icon: IconMessages,
    title: "Staff Updates",
    desc: "Photo updates, completion notes, and requests — all in a calm feed designed for household communication.",
  },
  {
    icon: IconHome,
    title: "House Profile",
    desc: "Vendors, access codes, preferences, inventory, warranties — your household's complete record in one secure place.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Your team posts updates",
    desc: "Cleaning done. Groceries delivered. Repair completed. You'll know.",
  },
  {
    num: "02",
    title: "You approve with a tap",
    desc: "New expense? Schedule change? One tap and it's handled.",
  },
  {
    num: "03",
    title: "Everything stays organized",
    desc: "Contacts, codes, preferences — all in one secure place.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-sans grain-overlay">

      {/* Hero */}
      <section aria-label="Hero" className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20">

        <motion.div
          className="mb-10"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease }}
        >
          <img
            src="/hndldlogo.png"
            alt="hndld"
            className="h-16 w-auto"
          />
        </motion.div>

        <motion.h1
          className="text-center max-w-2xl font-display"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease }}
          data-testid="text-hero-heading"
        >
          <span className="block text-5xl md:text-7xl font-light text-foreground tracking-tight leading-[1.1]">
            Your Home,
          </span>
          <span className="block text-5xl md:text-7xl font-semibold text-primary tracking-tight leading-[1.1]">
            hndld.
          </span>
        </motion.h1>

        <motion.div
          className="mt-7 w-16 h-px bg-hndld-gold-500/50 mx-auto"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.6, delay: 0.3, ease }}
        />

        <motion.p
          className="mt-6 text-lg md:text-xl text-muted-foreground text-center max-w-md font-light leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease }}
        >
          The app for people who'd rather live in their home than manage it.
        </motion.p>

        <motion.div
          className="mt-12 flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease }}
        >
          <a
            href="/api/login"
            className="group relative px-10 py-4 bg-primary text-primary-foreground text-base font-medium rounded-full transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/25 shadow-lg shadow-primary/15"
            aria-label="Get started with hndld"
            data-testid="button-login"
          >
            Get Started
          </a>
          <span className="text-xs text-muted-foreground tracking-wide">Free to start · No credit card required</span>
        </motion.div>

        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, 8, 0] }}
          transition={{
            opacity: { delay: 1.5, duration: 0.5 },
            y: { delay: 1.5, duration: 2, repeat: Infinity, ease: "easeInOut" }
          }}
        >
          <ChevronDown aria-hidden="true" className="w-5 h-5 text-muted-foreground/40" />
        </motion.div>
      </section>

      {/* Gold divider */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-hndld-gold-500/30 to-transparent" />

      {/* Features Grid */}
      <section aria-label="Features overview" className="py-28 px-6 bg-card">
        <div className="max-w-5xl mx-auto">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">The Platform</p>
            <h2 className="text-3xl md:text-4xl font-display font-light text-foreground tracking-tight">
              Everything in its place
            </h2>
            <p className="mt-4 text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
              One calm space for approvals, updates, and household coordination.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                className="group p-6 rounded-2xl bg-background/60 border border-border/50 hover:border-hndld-gold-500/30 hover:shadow-md transition-all duration-300"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
              >
                <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center mb-4 group-hover:bg-hndld-gold-500/10 transition-colors">
                  <feature.icon size={20} className="text-primary/60 group-hover:text-hndld-gold-500 transition-colors" accentColor="transparent" />
                </div>
                <h3 className="font-display font-medium text-foreground text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Gold divider */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-hndld-gold-500/30 to-transparent" />

      {/* How It Works */}
      <section aria-label="How it works" className="py-28 px-6 bg-background">
        <div className="max-w-3xl mx-auto">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">How It Works</p>
            <h2 className="text-3xl md:text-4xl font-display font-light text-foreground tracking-tight">
              Three simple steps
            </h2>
          </motion.div>

          <div className="space-y-14">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                className="flex items-start gap-6 md:gap-10"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.6 }}
              >
                <span className="text-5xl md:text-6xl font-display font-light text-hndld-gold-500/35 shrink-0 leading-none pt-1">
                  {step.num}
                </span>
                <div>
                  <h3 className="text-xl font-display font-medium text-foreground">{step.title}</h3>
                  <p className="mt-2 text-muted-foreground text-base leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Gold divider */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-hndld-gold-500/30 to-transparent" />

      {/* Testimonial */}
      <section aria-label="Testimonial" className="py-28 px-6 bg-card">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="w-12 h-px bg-hndld-gold-500/60 mx-auto mb-10" />
          <blockquote className="text-2xl md:text-3xl font-display font-light text-foreground leading-[1.5] italic tracking-tight">
            "I used to spend my Sundays coordinating the week ahead. Now I spend them with my family."
          </blockquote>
          <div className="mt-10 w-12 h-px bg-hndld-gold-500/40 mx-auto" />
          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-display font-medium text-primary">SM</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">Sarah M.</p>
              <p className="text-xs text-muted-foreground">Denver, CO</p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Trust Indicators */}
      <section aria-label="Trust indicators" className="py-14 px-6 bg-background border-y border-border/30">
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-5">
            {[
              { icon: Shield, label: "Bank-level encryption" },
              { icon: IconSchedule, label: "Google Calendar sync", isHndld: true },
              { icon: CheckCircle, label: "SOC 2 compliant" },
              { icon: Zap, label: "Setup in 5 minutes" },
            ].map((item, i) => (
              <motion.span
                key={item.label}
                className="flex items-center gap-2 text-xs text-muted-foreground tracking-widest uppercase"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                {item.isHndld ? (
                  <IconSchedule aria-hidden="true" size={14} className="text-hndld-gold-500/60" />
                ) : (
                  <item.icon aria-hidden="true" className="w-3.5 h-3.5 text-hndld-gold-500/60" />
                )}
                {item.label}
              </motion.span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section aria-label="Call to action" className="py-28 px-6 bg-background">
        <motion.div
          className="max-w-xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6">Join Today</p>
          <h2 className="text-3xl md:text-5xl font-display font-light text-foreground tracking-tight leading-[1.1]">
            Ready to reclaim<br />your time?
          </h2>
          <p className="mt-6 text-base text-muted-foreground leading-relaxed">
            Join hundreds of households already using hndld.
          </p>
          <div className="mt-10 w-12 h-px bg-hndld-gold-500/50 mx-auto" />
          <a
            href="/api/login"
            className="inline-block mt-10 px-12 py-4 bg-primary text-primary-foreground text-base font-medium rounded-full transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/25 shadow-lg shadow-primary/15"
            aria-label="Get started free with hndld"
          >
            Get Started Free
          </a>
          <p className="mt-4 text-xs text-muted-foreground tracking-wide">No credit card required</p>
        </motion.div>
      </section>

      {/* Footer */}
      <footer aria-label="Site footer" className="py-12 px-6 bg-primary">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <span className="font-display font-medium text-primary-foreground text-lg tracking-wide">hndld</span>
            <div className="flex gap-8 text-xs tracking-widest uppercase text-primary-foreground/50">
              <a href="/privacy" className="hover:text-primary-foreground/80 transition-colors">Privacy</a>
              <a href="/terms" className="hover:text-primary-foreground/80 transition-colors">Terms</a>
              <a href="mailto:hello@hndld.com" className="hover:text-primary-foreground/80 transition-colors">Contact</a>
            </div>
            <span className="text-xs text-primary-foreground/35 tracking-wide">Made with care in Kansas</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
