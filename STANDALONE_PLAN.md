# Simple Chores Standalone App - Plan

## Decisions Made

| Decision | Choice |
|----------|--------|
| Backend | Supabase (PostgreSQL + Auth) |
| Web | React + Vite |
| Mobile | React Native + Expo |
| Codebase | Monorepo with Turborepo |
| Sharing | Multi-user households |
| Auth | Google + Email/Password + Apple |
| Offline | Full offline with sync |
| Conflicts | Keep all completions (append-only history) |
| Sync | PowerSync (SQLite <-> Supabase) |

## Tech Stack

```
packages/
  shared/           # TypeScript types, validation, business logic
  api/              # Supabase client, PowerSync config, shared queries
  design-tokens/    # Colors, spacing, typography - shared visual language

apps/
  web/              # React + Vite + TailwindCSS
  mobile/           # React Native + Expo
```

### Design Consistency Strategy

**Goal:** Platform-native feel (web feels like web, mobile feels like mobile) while maintaining visual consistency.

**Shared design tokens:**
```typescript
// packages/design-tokens/colors.ts
export const colors = {
  primary: '#4F46E5',
  primaryHover: '#4338CA',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#FFFFFF',
  surface: '#F9FAFB',
  text: '#111827',
  textMuted: '#6B7280',
} as const;

// packages/design-tokens/spacing.ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
```

**Platform implementation:**
- **Web:** Tailwind config imports tokens, uses CSS-native patterns (hover states, modals)
- **Mobile:** StyleSheet.create() uses tokens, uses native patterns (bottom sheets, haptics)

**What stays consistent:**
- Colors, spacing scale, typography scale
- Icon set (same icons both platforms)
- Component structure and naming
- User flows and information architecture

**What differs (intentionally):**
- Navigation patterns (tabs on mobile, sidebar on web)
- Interaction patterns (swipe on mobile, hover on web)
- Form inputs (native pickers on mobile, dropdowns on web)

### Feature Parity Commitment

**Core principle:** Every feature ships on all platforms (iOS, Android, Web) simultaneously. No platform gets left behind.

**iOS + Android consistency:**
- Same React Native codebase = same features by default
- UI should be nearly identical between iOS and Android
- Only differ where platform conventions are strong (e.g., back button placement)
- Test on both platforms before any release

**Cross-platform parity checklist (for every feature):**

| Feature | iOS | Android | Web | Notes |
|---------|-----|---------|-----|-------|
| Example | ✓ | ✓ | ✓ | Ship together |

**Development workflow:**
1. Design feature once (Figma or similar)
2. Implement in shared packages first (logic, API, types)
3. Build mobile UI (covers both iOS + Android)
4. Build web UI
5. Test all three before merging
6. No feature is "done" until it works everywhere

**Avoiding drift:**
- Shared feature flags - enable/disable features across all platforms at once
- Single backlog - no separate "iOS bugs" vs "Android bugs" lists
- Cross-platform QA checklist for every PR
- Automated testing on all platforms in CI

**Key Libraries:**

- **PowerSync** - offline-first sync between local SQLite and Supabase
- **TanStack Query** - data fetching/caching layer on top of PowerSync
- **Turborepo** - monorepo build orchestration
- **Zod** - shared validation schemas (works in both web/mobile)
- **Expo Router** - file-based routing for mobile
- **React Router** - routing for web

## Hosting (Free Tier)

| Component | Service | Cost |
|-----------|---------|------|
| Web app | Vercel | Free |
| Database | Supabase | Free (500MB) |
| Auth | Supabase Auth | Free (50k MAUs) |
| Sync | PowerSync | Free (2,500 users) |
| Mobile | Expo EAS | Free (limited builds) |

## Database Schema

```sql
-- Households (shared chore lists)
households (id, name, created_at, created_by)

-- Members link users to households
household_members (household_id, user_id, role, invited_at, joined_at)

-- Rooms within a household
rooms (id, household_id, name, icon, sort_order)

-- Chores
chores (id, household_id, room_id, name, frequency, frequency_value,
        next_due, assigned_to, created_by, created_at)

-- Completion history (append-only for conflict resolution)
completions (id, chore_id, completed_by, completed_at, synced_at)

-- Users
profiles (id, email, display_name, avatar_url)
```

## Conflict Resolution Strategy

Since completions are "keep all":

- `completions` table is append-only
- Offline completions get unique IDs (UUIDs) locally
- On sync, all completions merge without overwriting
- Chore `next_due` recalculates from latest completion timestamp
- History shows all completions, even if chore was completed twice offline

## Home Assistant Integration Mode

Users of the HA integration can optionally connect to the cloud service for hybrid functionality:

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Supabase Cloud                          │
│              (shared database + auth)                       │
└──────────────▲─────────────────────▲────────────────────────┘
               │                     │
               │ sync                │ sync
               │                     │
┌──────────────┴──────┐    ┌────────┴─────────────────────────┐
│   HA Integration    │    │   Standalone Apps                │
│   (local-first)     │    │   (React Web / React Native)     │
│                     │    │                                  │
│ - Works offline     │    │ - Works without HA               │
│ - Syncs when online │    │ - Full mobile experience         │
│ - HA dashboard UI   │    │ - Family members without HA      │
└─────────────────────┘    └──────────────────────────────────┘
```

### HA Integration Options

1. **Local Only (default)** - Works exactly as it does today, no cloud dependency
2. **Cloud Sync** - Optionally configure Supabase connection in integration options:
   - Link HA users to cloud accounts
   - Two-way sync of rooms, chores, completions
   - HA remains source of truth when online, works offline when cloud unavailable

### Privacy-First Design

**Core principle:** The HA integration works 100% locally by default. Zero cloud communication unless the user explicitly enables it.

**User reassurances:**
- Cloud sync is **OFF by default** - must be manually enabled in integration options
- Clear messaging: "Your data stays on your Home Assistant instance unless you enable cloud sync"
- No telemetry, analytics, or usage tracking from the HA integration
- Open source - users can verify nothing phones home

**Sync controls (when enabled):**
- Toggle sync on/off at any time
- Choose what syncs: chores, completions, history (granular control)
- "Pause sync" option for temporary offline periods
- "Delete cloud data" button - wipes their data from Supabase, keeps local
- Visual indicator showing sync status (local only / syncing / paused)

**Messaging in UI:**
```
[ ] Enable cloud sync

  Your chore data stays entirely on your Home Assistant
  instance. Enable cloud sync only if you want to:

  • Back up your data to the cloud
  • Share with family members who don't use Home Assistant
  • Use the Simple Chores mobile app

  You can disable this at any time and delete your cloud data.
```

### Config Flow Addition

```yaml
# New options in HA integration
cloud_sync_enabled: false  # OFF by default
cloud_url: ""  # Supabase project URL
cloud_api_key: ""  # Supabase anon key
household_id: ""  # Links this HA instance to a cloud household
sync_chores: true  # Granular: sync chore definitions
sync_completions: true  # Granular: sync completion history
sync_rooms: true  # Granular: sync room definitions
```

### Sync Behavior

- **HA -> Cloud**: Completions, new chores, room changes push to Supabase
- **Cloud -> HA**: Changes from mobile apps sync back to HA
- **Conflict Resolution**: Same append-only strategy for completions
- **HA Areas**: Synced as rooms with `source: "home_assistant"` flag

### Why HA Users Would Enable Cloud Sync

1. **Backups** - HA instance crashes, SD card corrupts, or migration fails? Chore data is safe in the cloud and can be restored or continued on standalone apps.

2. **Non-HA household members** - Partner, kids, or roommates who don't use (or want to learn) Home Assistant can just use the mobile app. They complete chores, it syncs back to HA.

3. **Remote access without VPN** - Check or complete chores from anywhere without Nabu Casa or VPN setup.

4. **Gradual migration** - If someone decides to move away from HA later, their data is already in the cloud.

## Development Phases

### Phase 1 - Foundation

- Monorepo setup with Turborepo
- Supabase project + schema
- Auth flow (Google, Email, Apple)
- PowerSync integration
- Shared types/validation

### Phase 2 - Core Features

- Household create/join/invite
- Rooms CRUD
- Chores CRUD
- Complete chore + auto-reschedule
- Basic UI for both web and mobile

### Phase 3 - Offline & Sync

- PowerSync offline configuration
- Conflict handling for completions
- Sync status indicators
- Offline queue visibility

### Phase 4 - HA Integration Sync

- Add cloud sync option to HA integration config flow
- Implement two-way sync logic in HA integration
- Map HA users to cloud accounts
- Handle HA Areas as synced rooms

### Phase 5 - Polish

- Push notifications (Expo + web push)
- Calendar view
- Stats/history
- Settings/preferences
- App store submission (if desired)

## Migration from HA Integration

For users who want to move fully to standalone:

```yaml
service: simple_chores.export_data
```

Outputs JSON that the standalone app can import during onboarding.

## Pricing Model

### Tiers

| Tier | Price | Limits |
|------|-------|--------|
| **Free** | $0 | 2 members, 20 chores, 90-day history, occasional ads |
| **Premium** | $3/mo or $30/yr | Unlimited members, unlimited chores, unlimited history, no ads |

### Home Assistant Users - Free Cloud Sync

Users who link their HA integration get Premium cloud sync features for free:
- Unlimited sync between HA and cloud
- Family members on standalone apps count against their tier limits
- Rewards the HA community who helped build/test the integration
- Encourages word-of-mouth in HA forums and Reddit

### Why This Works

- **Generous free tier** (20 chores) - Enough to be genuinely useful, builds goodwill
- **Simple choice** - No decision paralysis, just free or premium
- **Annual discount** (~17% off) - Encourages commitment, reduces churn
- **HA perk** - Differentiator, builds loyalty in a technical community that talks

### Ads Strategy (Free Tier)

- Non-intrusive banner ads (bottom of screen, not interstitial)
- No ads during active chore completion flow
- Consider: house ads promoting Premium before showing external ads

### Revenue Projections

| Users | Free (80%) | Premium (20%) | Monthly Revenue |
|-------|------------|---------------|-----------------|
| 1,000 | 800 | 200 | $600 |
| 5,000 | 4,000 | 1,000 | $3,000 |
| 10,000 | 8,000 | 2,000 | $6,000 |

*Assumes 20% conversion rate, which is optimistic - 5-10% is more typical for freemium apps*

Conservative estimate at 5% conversion:
- 10,000 users = 500 premium = $1,500/mo

## Infrastructure Cost Projection

| Users | Supabase | PowerSync | Vercel | Total |
|-------|----------|-----------|--------|-------|
| < 500 | Free | Free | Free | $0/mo |
| < 2,500 | Free | Free | Free | $0/mo |
| < 10,000 | $25/mo | $49/mo | Free | ~$74/mo |
| < 50,000 | $25/mo | $99/mo | $20/mo | ~$144/mo |

### Break-Even Analysis

- At $74/mo infrastructure cost, need ~25 premium users ($75/mo) to break even
- That's 125-500 total users depending on conversion rate (5-20%)
- Very achievable with organic growth from HA community
