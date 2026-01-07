# hndld Design Guidelines

## Design Philosophy

**Brand Promise:** White-glove luxury concierge service - think Chanel app meets high-end hotel concierge, not productivity software.

**Core Principles:**
- Minimalist elegance with strategic white space
- Premium typography with refined hierarchy
- Subtle animations that signal quality
- Calm, reassuring, personalized experiences

---

## Color Palette

### WHITE_GLOVE Theme (Light - Default)

**Primary Colors:**
- Porcelain Background: `#F6F2EA` (warm, inviting cream)
- Ink Navy: `#1D2A44` (sophisticated primary)
- Champagne: `#E7D8B1` (subtle luxury accent)

**Surface Colors:**
- Card: `#FFFFFF` (crisp white for elevation)
- Surface2: `#FBF8F2` (subtle section distinction)
- Border: `#E6E0D8` (soft, warm gray)

**Semantic Colors (muted, premium feel):**
- Success: `#2E7D5B` (refined green)
- Warning: `#B07A2A` (warm amber)
- Destructive: `#B23A3A` (subdued red)

### EVENING_SERVICE Theme (Dark)

**Primary Colors:**
- Background: Deep charcoal with warm undertone
- Navy accent: Lighter navy for dark mode visibility
- Champagne: Works in both themes

---

## Typography

**Font Family:** Inter (via system fonts)
- Display/Hero: Inter 600 (optional serif for special moments)
- Headings: Inter 600 (Semibold)
- Body: Inter 400 (Regular)
- Labels/Metadata: Inter 500 (Medium)

**Typography Scale:**
```
Hero display:     32px / 2rem    - font-weight: 600
Page title:       24px / 1.5rem  - font-weight: 600
Section header:   14px / 0.875rem - font-weight: 600, uppercase, tracking-wide
Card title:       16px / 1rem    - font-weight: 500
Body text:        15px / 0.9375rem - font-weight: 400, line-height: 1.75
Metadata:         13px / 0.8125rem - font-weight: 400
Small:            12px / 0.75rem - font-weight: 400
```

**Letter Spacing:**
- Uppercase labels: +0.025em (tracking-wide)
- Body text: Normal

**Line Height:**
- Body text: 1.5-1.75 (more generous than default)

---

## Spacing & Layout

**Luxury Spacing Principle:** More generous than you think - create breathing room.

**Spacing Scale:**
- Component padding: p-5 to p-6 (20-24px)
- Card internal padding: p-6 (24px)
- Card spacing: space-y-4 (16px)
- Section gaps: gap-8 (32px)
- Screen padding: px-4 py-8

**Container Strategy:**
- Mobile: Full width with px-4
- Maximum width: max-w-4xl mx-auto
- Bottom nav: Hidden overflow, safe area padding

---

## Shadows & Elevation

**Luxury Shadow System (soft, wide spreads):**
```css
--shadow-luxury-sm: 0 2px 8px rgba(26, 29, 46, 0.04)
--shadow-luxury-md: 0 4px 16px rgba(26, 29, 46, 0.06)
--shadow-luxury-lg: 0 8px 32px rgba(26, 29, 46, 0.08)
--shadow-luxury-xl: 0 16px 64px rgba(26, 29, 46, 0.12)
```

**Elevation Strategy:**
- Cards: Very subtle shadow (shadow-sm)
- Floating elements: Soft, wide shadows
- Modals/sheets: shadow-xl with blur

---

## Animations & Transitions

**Timing Functions:**
- Smooth: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-luxury)
- Bounce (subtle): `cubic-bezier(0.68, -0.55, 0.265, 1.55)`

**Duration:**
- Micro-interactions: 150-200ms
- Page transitions: 200-300ms
- Loading states: 1.5-2s loops

**Animation Library:**
- `animate-fade-in-up`: Fade + slide up for cards
- `animate-scale-in`: Scale from 0.95 for modals
- `animate-shimmer`: Elegant shimmer for loading

**Transition Principles:**
- All interactions use ease curves
- Button press: Scale to 0.98 (very subtle)
- Card hover (desktop): translateY(-2px) + shadow increase
- Page transitions: Crossfade between views

---

## Components

### Cards
- Rounded corners: rounded-2xl (22px)
- Padding: p-6
- Subtle border OR shadow (not both)
- Hover: Gentle lift with shadow increase

### Buttons
- Primary: Navy background, porcelain text
- Size variants: sm, default, lg, icon
- No custom height/width on icon buttons
- Built-in hover/active states (never override)

### Badges
- Small pill shape: px-2 py-0.5
- Rounded-full
- Muted colors for status

### Navigation
**Bottom Tab Bar:**
- Glass morphism effect (subtle blur)
- 4-5 tabs max
- Active: Solid fill, inactive: Ghost

### Empty States
- Large elegant icon (48-64px)
- Calming headline: "All set." / "Nothing urgent."
- Single sentence context
- Optional CTA button

---

## Micro-interactions

**Allowed Animations:**
- Pull-to-refresh: Elegant arc
- Loading: Shimmer with champagne highlight
- Success: Gentle scale-up + fade-in checkmark
- Tab transitions: Smooth crossfade
- Scroll: Subtle fade-in-up for cards

**Forbidden:**
- Bouncing, spinning, flashy effects
- Layout changes on hover
- Jarring transitions

---

## Language & Tone

**Write like a luxury concierge:**
- Confident: "Handled." not "Task marked as complete."
- Reassuring: "We'll take care of it." not "Request submitted."
- Warm: "Good morning, Lauren" not "Hello, user"
- Efficient: "Done." not "Your action has been successfully processed."

**Greetings:**
- Morning (5am-12pm): "Good morning"
- Afternoon (12pm-5pm): "Good afternoon"
- Evening (5pm-9pm): "Good evening"
- Night (9pm-5am): "Good evening"

---

## Accessibility

- Touch targets: minimum 44x44px
- Color contrast: WCAG AAA for text
- Focus indicators: Visible, elegant outline
- Form labels: Always visible above inputs
- Error states: Muted red + icon + clear message

---

## PWA Elements

- Install prompt: Elegant banner (dismissible)
- Offline indicator: Toast notification
- Theme color: Navy (#1D2A44)
