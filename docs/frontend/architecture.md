# Frontend Architecture & Design Guide

This document explains the routing structure, layout hierarchy, providers, styling system, and motion design patterns used in the Domus Next.js web application (`apps/web`).

---

## 🚦 Next.js Routing & Layouts
Domus uses the **Next.js App Router** pattern located in [apps/web/app/](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/app/).

### Hierarchy & Shell Wrapping
The page nesting and layout rendering follow this flow:
```
RootLayout (app/layout.tsx)
  └── Providers (components/providers.tsx)
        └── RealtimeProvider (providers/realtime-provider.tsx)
              └── AppShell (components/layout/app-shell.tsx)
                    └── PageTemplate (app/template.tsx)
                          └── Page Component (e.g. app/devices/page.tsx)
```

1. **[RootLayout](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/app/layout.tsx)**:
   - Configures the custom fonts: `Fira_Sans` (primary UI font) and `Fira_Code` (telemetry/monospaced code details).
   - Sets the global styling defaults (`bg-background text-foreground antialiased`).
   - Hooks up the `Providers` shell.

2. **[Providers wrapper](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/components/providers.tsx)**:
   - Orchestrates the state clients: `@tanstack/react-query`'s `QueryClientProvider` (staleTime 60s), `next-themes`'s `ThemeProvider` (class-based, defaultTheme: dark), and the WebSocket `RealtimeProvider`.
   - Mounts the global `Toaster` (`sonner`) with custom toast configurations.

3. **[AppShell Layout](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/components/layout/app-shell.tsx)**:
   - Serves as the navigation framework. Contains the collapsible sidebar, sidebar item tooltips, top-header path breadcrumbs, authentication state guard, active home selector dropdown, and the slide-out panel for notifications.
   - Monitors the WebSocket connection state and displays a micro-indicator in the layout.

4. **[PageTemplate wrapper](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/app/template.tsx)**:
   - Next.js templates create a *new instance* for each children on route navigation, unlike layouts which persist state.
   - This wrapper enforces transition animations between pages.

---

## 🎨 Design System & Theme
Domus uses a dark-themed, glassmorphic aesthetic centered around technical utility and premium micro-details. Styling rules are defined in [tailwind.config.ts](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/tailwind.config.ts) and [app/globals.css](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/app/globals.css).

### CSS Variables & HSL Colors
We avoid basic Tailwind utility colors (`bg-red-500`, `bg-blue-500`) in favor of contextual theme variables:
* **Backgrounds & Cards**:
  - `--background`: Base dark canvas HSL (e.g., charcoal/black spectrum)
  - `--card`: Semi-opaque panels for glassmorphic elements
  - `--muted`: Low-contrast elements (e.g. background grids, input tabs)
* **Borders**:
  - `--border`: Crisp line boundaries, calibrated for high-contrast border definition
* **Indicators**:
  - `--success`: Active/Online devices (soft green)
  - `--destructive` / `--error`: Alarms, offline devices, failed automations (hot amber/red)

### Glassmorphism Classes
To achieve the premium look, cards and dropdowns utilize backdrop blurs combined with thin, borders:
```css
.glass-panel {
  background: hsl(var(--card) / 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid hsl(var(--border) / 0.4);
}
```

---

## 🌀 Motion Design Principles
Animations in Domus are built with [Framer Motion](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/package.json#L24) and are constrained by **functional purpose** rather than decorative clutter.

### 1. Page Transitions
The page fade-and-rise transition is implemented inside [app/template.tsx](file:///d:/VS-Code/AI%20Expermients/Domus/apps/web/app/template.tsx):
* **Normal Transition**:
  - `initial`: `opacity: 0, y: 8, filter: "blur(4px)"`
  - `animate`: `opacity: 1, y: 0, filter: "blur(0px)"`
  - `transition`: Spring with `duration: 0.3` and `bounce: 0` (clean, responsive, snappy feel)
* **Accessibility**: Respects the user's browser settings. If `useReducedMotion()` returns `true`, the spring translation and blur filters are bypassed, fallback to a simple `opacity` fade.

### 2. Interactive States & Micro-interactions
* **Sidebar Icons**: Hovering over sidebar links scales icons up slightly (`scale-110`) using a quick spring hook.
* **Buttons / Device Toggles**: Flips and state transitions utilize snappy spring transitions.
* **Notification Badges**: Flashing indicators use infinite keyframe pulse animations to draw focus without being obtrusive.

### 3. Guidelines for Creating New Layouts
1. **Always read standard viewport contexts**: Make sure heroes and dashboards fit nicely without vertical overflow on typical displays.
2. **Never hardcode styles**: Use semantic Tailwind utility tokens matching the theme (`text-muted-foreground`, `border-border/60`, etc.).
3. **Respect Reduced Motion**: Always query `useReducedMotion` if introducing complex multi-axis translation or rotate animations.
