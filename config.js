'use strict';

module.exports = {
    // ── Server ─────────────────────────────────────────────────
    PORT:       process.env.PORT || 40000,

    // ── Cooldown ────────────────────────────────────────
    // Minimum ms between tunnel generations (global). Default: 3600000 (1 hr)
    COOLDOWN_MS: 3600000,

    // ── Pages ────────────────────────────────────────
    // Each key becomes a route: localhost:PORT/<key>
    // - title:   display name shown on the dashboard
    // - mainUrl: the primary link shown at the top
    // - port:    local port that `cloudflare tunnel` will expose
    // - type:    generatable, cycling, or static. Static sends to permanant url, generatable allows you to generate tunnels on demand, and cycling will autogenerate 3 tunnels, which expire every 3 hours.

    PAGES: {
        grapplegame: {
            title:   'Untitled Grapple Game',
            type:    'cycling',
            mainUrl: 'no_permanent_url_yet',
            port:    3000,
            googledoc: 'https://docs.google.com/document/d/1EsBujItdFgmLHt6Gyq8aFGv6fqH8IUp6t7Y3fyAAIH4/edit?usp=sharing',
        },
    }
};
