import { motion } from "framer-motion";
import { Home, ChevronDown, Shield, Calendar, Zap } from "lucide-react";

const ease = [0.22, 1, 0.36, 1];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">

      <section aria-label="Hero" className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20 bg-gradient-to-b from-background via-background to-accent">

        <motion.div
          className="mb-12"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease }}
        >
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center">
            <Home aria-hidden="true" className="w-8 h-8 text-primary" />
          </div>
        </motion.div>

        <motion.h1
          className="text-center max-w-2xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease }}
          data-testid="text-hero-heading"
        >
          <span className="block text-5xl md:text-7xl font-light text-foreground tracking-tight">
            Your Home,
          </span>
          <span className="block text-5xl md:text-7xl font-semibold text-primary tracking-tight">
            hndld.
          </span>
        </motion.h1>

        <motion.p
          className="mt-8 text-xl md:text-2xl text-muted-foreground text-center max-w-xl font-light leading-relaxed"
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
            className="group relative px-10 py-4 bg-primary text-primary-foreground text-lg font-medium rounded-full transition-all duration-300 hover:scale-[1.02] shadow-xl shadow-primary/25"
            aria-label="Get started with hndld"
            data-testid="button-login"
          >
            Get Started
          </a>
          <span className="text-sm text-muted-foreground">Free to start · No credit card required</span>
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
          <ChevronDown aria-hidden="true" className="w-6 h-6 text-muted-foreground/60" />
        </motion.div>
      </section>

      <section aria-label="Features overview" className="py-24 px-6 bg-card">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-3xl md:text-4xl font-light text-foreground">
              Everything in its place
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-md mx-auto">
              One calm space for approvals, updates, and household coordination.
            </p>
          </motion.div>

          <motion.div
            className="relative mx-auto max-w-4xl"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease }}
          >
            <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-secondary to-accent p-8 shadow-2xl shadow-black/5 dark:shadow-black/20">
              <div className="h-full rounded-2xl bg-card shadow-lg overflow-hidden border border-border">
                <div className="h-14 bg-accent border-b border-border flex items-center px-5">
                  <div className="w-8 h-8 rounded-full bg-secondary" />
                  <span className="ml-3 font-medium text-foreground">This Week</span>
                </div>
                <div className="p-5 space-y-4">
                  <div className="h-24 rounded-xl bg-gradient-to-r from-secondary to-accent" />
                  <div className="h-16 rounded-xl bg-accent" />
                  <div className="h-16 rounded-xl bg-accent" />
                </div>
              </div>
            </div>

            <motion.div
              className="absolute -top-6 -right-6 w-24 h-24 rounded-2xl bg-accent -z-10"
              animate={{ y: [0, -10, 0], rotate: [0, 2, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-secondary -z-10"
              animate={{ y: [0, 10, 0], rotate: [0, -2, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        </div>
      </section>

      <section aria-label="How it works" className="py-24 px-6 bg-background">
        <div className="max-w-4xl mx-auto">
          <motion.h2
            className="text-3xl md:text-4xl font-light text-foreground text-center mb-20"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            How it works
          </motion.h2>

          <div className="space-y-16">
            {[
              { num: "01", title: "Your team posts updates", desc: "Cleaning done. Groceries delivered. Repair completed. You'll know." },
              { num: "02", title: "You approve with a tap", desc: "New expense? Schedule change? One tap and it's handled." },
              { num: "03", title: "Everything stays organized", desc: "Contacts, codes, preferences — all in one secure place." },
            ].map((step, i) => (
              <motion.div
                key={step.num}
                className="flex items-start gap-8"
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.6 }}
              >
                <span className="text-6xl font-light text-muted-foreground/30">{step.num}</span>
                <div>
                  <h3 className="text-xl font-medium text-foreground">{step.title}</h3>
                  <p className="mt-2 text-muted-foreground text-lg">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section aria-label="Testimonial" className="py-32 px-6 bg-card">
        <motion.div
          className="max-w-3xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <blockquote className="text-2xl md:text-3xl font-light text-foreground leading-relaxed italic">
            "I used to spend my Sundays coordinating the week ahead. Now I spend them with my family."
          </blockquote>
          <div className="mt-8 flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary" />
            <div className="text-left">
              <p className="font-medium text-foreground">Sarah M.</p>
              <p className="text-sm text-muted-foreground">Denver, CO</p>
            </div>
          </div>
        </motion.div>
      </section>

      <section aria-label="Trust indicators" className="py-16 px-6 bg-background border-y border-border">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-x-12 gap-y-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Shield aria-hidden="true" className="w-4 h-4" /> Bank-level encryption
          </span>
          <span className="flex items-center gap-2">
            <Calendar aria-hidden="true" className="w-4 h-4" /> Google Calendar sync
          </span>
          <span className="flex items-center gap-2">
            <Zap aria-hidden="true" className="w-4 h-4" /> Setup in 5 minutes
          </span>
        </div>
      </section>

      <section aria-label="Call to action" className="py-32 px-6 bg-gradient-to-b from-card to-background">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-light text-foreground">
            Ready to reclaim your time?
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Join hundreds of households already using hndld.
          </p>
          <a
            href="/api/login"
            className="inline-block mt-10 px-12 py-5 bg-primary text-primary-foreground text-lg font-medium rounded-full transition-all duration-300 hover:scale-[1.02] shadow-xl shadow-primary/25"
            aria-label="Get started free with hndld"
          >
            Get Started Free
          </a>
        </motion.div>
      </section>

      <footer aria-label="Site footer" className="py-12 px-6 bg-primary text-primary-foreground/70">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <span className="font-medium text-primary-foreground">hndld</span>
          <div className="flex gap-8 text-sm">
            <a href="/privacy" className="hover:text-primary-foreground transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-primary-foreground transition-colors">Terms</a>
            <a href="mailto:hello@hndld.com" className="hover:text-primary-foreground transition-colors">Contact</a>
          </div>
          <span className="text-sm">Made with care in Kansas</span>
        </div>
      </footer>
    </div>
  );
}
