import { motion } from "framer-motion";
import { ChevronDown, Shield, Calendar, Zap } from "lucide-react";

const ease = [0.22, 1, 0.36, 1];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-sans grain-overlay">

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
          className="mt-6 w-12 h-px bg-hndld-gold-500/60"
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
            className="group relative px-10 py-4 bg-primary text-primary-foreground text-base font-medium rounded-full transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-primary/20"
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

          <motion.div
            className="relative mx-auto max-w-3xl"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease }}
          >
            <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-secondary/60 to-accent/40 p-6 md:p-8 shadow-xl shadow-black/[0.03]">
              <div className="h-full rounded-2xl bg-card shadow-sm overflow-hidden border border-border/50">
                <div className="h-12 bg-accent/50 border-b border-border/30 flex items-center px-5">
                  <div className="w-7 h-7 rounded-full bg-secondary" />
                  <span className="ml-3 font-display font-medium text-foreground text-sm">This Week</span>
                </div>
                <div className="p-5 space-y-3">
                  <div className="h-20 rounded-xl bg-gradient-to-r from-secondary/60 to-accent/40 skeleton-shimmer" />
                  <div className="h-14 rounded-xl bg-accent/50" />
                  <div className="h-14 rounded-xl bg-accent/30" />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

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
            {[
              { num: "01", title: "Your team posts updates", desc: "Cleaning done. Groceries delivered. Repair completed. You'll know." },
              { num: "02", title: "You approve with a tap", desc: "New expense? Schedule change? One tap and it's handled." },
              { num: "03", title: "Everything stays organized", desc: "Contacts, codes, preferences — all in one secure place." },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                className="flex items-start gap-6 md:gap-8"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.6 }}
              >
                <span className="text-4xl md:text-5xl font-display font-light text-hndld-gold-500/40 shrink-0">{step.num}</span>
                <div>
                  <h3 className="text-lg font-display font-medium text-foreground">{step.title}</h3>
                  <p className="mt-1.5 text-muted-foreground text-base leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Testimonial" className="py-28 px-6 bg-card">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <div className="w-8 h-px bg-hndld-gold-500/50 mx-auto mb-10" />
          <blockquote className="text-xl md:text-2xl font-display font-light text-foreground leading-relaxed italic">
            "I used to spend my Sundays coordinating the week ahead. Now I spend them with my family."
          </blockquote>
          <div className="mt-8 flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary" />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">Sarah M.</p>
              <p className="text-xs text-muted-foreground">Denver, CO</p>
            </div>
          </div>
        </motion.div>
      </section>

      <section aria-label="Trust indicators" className="py-12 px-6 bg-background border-y border-border/30">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-x-10 gap-y-3 text-xs text-muted-foreground tracking-wide uppercase">
          <span className="flex items-center gap-2">
            <Shield aria-hidden="true" className="w-3.5 h-3.5" /> Bank-level encryption
          </span>
          <span className="flex items-center gap-2">
            <Calendar aria-hidden="true" className="w-3.5 h-3.5" /> Google Calendar sync
          </span>
          <span className="flex items-center gap-2">
            <Zap aria-hidden="true" className="w-3.5 h-3.5" /> Setup in 5 minutes
          </span>
        </div>
      </section>

      <section aria-label="Call to action" className="py-28 px-6 bg-background">
        <motion.div
          className="max-w-xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-display font-light text-foreground tracking-tight">
            Ready to reclaim your time?
          </h2>
          <p className="mt-5 text-base text-muted-foreground leading-relaxed">
            Join hundreds of households already using hndld.
          </p>
          <a
            href="/api/login"
            className="inline-block mt-10 px-10 py-4 bg-primary text-primary-foreground text-base font-medium rounded-full transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-primary/20"
            aria-label="Get started free with hndld"
          >
            Get Started Free
          </a>
        </motion.div>
      </section>

      <footer aria-label="Site footer" className="py-10 px-6 bg-primary text-primary-foreground/60">
        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center justify-between gap-5">
          <span className="font-display font-medium text-primary-foreground text-base">hndld</span>
          <div className="flex gap-8 text-xs tracking-wide">
            <a href="/privacy" className="hover:text-primary-foreground transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-primary-foreground transition-colors">Terms</a>
            <a href="mailto:hello@hndld.com" className="hover:text-primary-foreground transition-colors">Contact</a>
          </div>
          <span className="text-xs text-primary-foreground/40">Made with care in Kansas</span>
        </div>
      </footer>
    </div>
  );
}
