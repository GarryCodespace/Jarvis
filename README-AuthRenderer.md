# Jarvix Authentication Renderer

This document describes the React + TypeScript renderer implementation for Jarvix's authentication system with Supabase integration.

## 🏗️ Architecture Overview

The renderer provides a complete authentication UI using:
- **React 19** with TypeScript for type safety
- **Zustand** for state management
- **Supabase** client (anon key only) for authentication
- **TailwindCSS** for styling
- **Vite** for bundling and development

## 📋 Required IPC Contract

The renderer expects the Electron preload to expose `window.electron.auth` with these methods:

### Methods (async/invoke)
```typescript
interface ElectronAuth {
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  getCachedSession(): Promise<SerializedSession | null>;
  ensureDeviceRegistered(): Promise<void>;
  audit(event: 'LOGIN'|'LOGOUT'|'TOKEN_REFRESH'|'FAILED'): Promise<void>;
}
```

### Events (on/off)
```typescript
// Event handlers that renderer will assign
auth.loginSuccess = (session: SerializedSession) => void;
auth.loginFailed = (message: string) => void;
auth.loggedOut = () => void;
```

## 🌍 Environment Variables

Create a `.env` file in your project root:

```env
# Required Supabase configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional
VITE_APP_ENV=dev
```

## 🗄️ Database Schema

Run this SQL in your Supabase dashboard:

```sql
-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- devices (desktop installs)
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  platform text,
  app_version text,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

-- sessions_audit (non-PII)
create table if not exists public.sessions_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event text,
  user_agent text,
  ip inet,
  created_at timestamptz default now()
);

-- RLS Policies
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

alter table public.devices enable row level security;
create policy "see own devices" on public.devices
  for select using (auth.uid() = user_id);
create policy "insert own device" on public.devices
  for insert with check (auth.uid() = user_id);
create policy "update own device" on public.devices
  for update using (auth.uid() = user_id);

alter table public.sessions_audit enable row level security;
create policy "read own audit" on public.sessions_audit
  for select using (auth.uid() = user_id);
create policy "insert own audit" on public.sessions_audit
  for insert with check (auth.uid() = user_id);
```

## 📁 File Structure

```
/renderer
├── index.tsx                    # React entry point
├── App.tsx                      # Main app component
├── index.html                   # HTML template
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
├── /common
│   └── types.ts                # Shared TypeScript types
├── /lib
│   └── supabaseClient.ts       # Supabase client and session hydration
├── /state
│   └── authStore.ts            # Zustand auth store with IPC integration
├── /components
│   ├── Spinner.tsx             # Loading components
│   ├── Toasts.tsx              # Toast notification system
│   └── /Auth
│       ├── AuthGate.tsx        # Main auth wrapper component
│       ├── WelcomeCard.tsx     # Cluely-style welcome screen
│       ├── LoginMethods.tsx    # Authentication method selector
│       ├── EmailPasswordForm.tsx # Email/password authentication
│       ├── MagicLinkForm.tsx   # Magic link authentication
│       └── ProfileMenu.tsx     # User profile and device management
└── /styles
    └── index.css               # TailwindCSS styles
```

## 🚀 How to Run Locally

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

3. **Run Supabase migrations** (in Supabase dashboard):
   - Copy the SQL schema from section above
   - Run in SQL Editor

4. **Development mode**:
   ```bash
   # In renderer directory
   npm run dev
   
   # Or build for production
   npm run build
   ```

5. **Integration with Electron**:
   - Ensure your Electron main process implements the IPC contract
   - Update your Electron HTML to point to the built renderer files
   - Test authentication flows end-to-end

## 🔐 Authentication Flows

### 1. App Launch
1. Renderer initializes and calls `auth.getCachedSession()`
2. If session exists → hydrate Supabase client → show authenticated UI
3. If no session → show welcome screen with login options

### 2. Google OAuth
1. User clicks "Continue with Google"
2. Calls `window.electron.auth.signInWithGoogle()`
3. Main process handles OAuth flow
4. On success → `auth.loginSuccess` event → renderer hydrates session

### 3. Email/Password
1. User enters credentials in `EmailPasswordForm`
2. Direct call to `supabase.auth.signInWithPassword()`
3. On success → renderer hydrates session and calls `auth.audit('LOGIN')`

### 4. Magic Link
1. User enters email in `MagicLinkForm`
2. Direct call to `supabase.auth.signInWithOtp()`
3. User clicks link in email → handled by main process deep link
4. Main process validates and emits `auth.loginSuccess`

### 5. Sign Out
1. User clicks sign out in `ProfileMenu`
2. Calls `window.electron.auth.signOut()`
3. Main process clears session and emits `auth.loggedOut`
4. Renderer clears state and shows welcome screen

## 🎨 UI Components

### AuthGate
- Wraps entire app and manages authentication state
- Shows loading, welcome, error, or authenticated UI based on status
- Automatically initializes auth on mount

### WelcomeCard
- Cluely-style welcome screen with Jarvix branding
- Three feature highlights with icons
- Clean, centered layout

### LoginMethods
- Primary Google OAuth button
- Secondary email/password option
- Tertiary magic link option
- Expandable forms for email-based methods

### ProfileMenu
- Top-right dropdown with user info
- Device management modal
- Sign out action

## 🧪 Testing

The components are designed to be testable with mocked `window.electron` APIs:

```typescript
// Mock setup for tests
const mockElectron = {
  auth: {
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
    getCachedSession: jest.fn(),
    ensureDeviceRegistered: jest.fn(),
    audit: jest.fn(),
    loginSuccess: null,
    loginFailed: null,
    loggedOut: null,
  },
};

Object.defineProperty(window, 'electron', {
  value: mockElectron,
});
```

## 🔧 Configuration

### Vite Configuration
- React plugin enabled
- TypeScript support
- Path aliases for clean imports
- TailwindCSS integration

### TailwindCSS
- Dark mode support
- Custom component classes
- Responsive design utilities

## 🚨 Security Notes

1. **No service-role keys in renderer** - only anon key is used
2. **Session persistence handled by main process** - renderer never stores tokens
3. **RLS policies enforce data access** - users can only see their own data
4. **CSP headers prevent external resource loading**
5. **All privileged operations delegated to main process**

## 🐛 Troubleshooting

### Common Issues

1. **"Missing Supabase environment variables"**
   - Ensure `.env` file has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

2. **"window.electron is undefined"**
   - Ensure Electron preload script is properly set up
   - Check that preload exposes the auth IPC contract

3. **Authentication loops or errors**
   - Check browser console for detailed error messages
   - Verify Supabase project is properly configured
   - Ensure RLS policies are applied

4. **UI not responsive or styled incorrectly**
   - Ensure TailwindCSS is properly configured
   - Check that `index.css` is imported in `index.tsx`

### Debug Mode

Enable debug logging:
```typescript
// In development, add to authStore.ts
const DEBUG = import.meta.env.VITE_APP_ENV === 'dev';
if (DEBUG) console.log('Auth debug:', { status, user, error });
```

## 📦 Dependencies

### Runtime Dependencies
- `@supabase/supabase-js` - Supabase client
- `react` - React framework
- `react-dom` - React DOM rendering
- `zustand` - State management

### Development Dependencies
- `typescript` - TypeScript support
- `vite` - Build tool and dev server
- `@vitejs/plugin-react` - Vite React plugin
- `tailwindcss` - CSS framework
- `autoprefixer` - CSS vendor prefixing

## 🎯 Next Steps

1. **Profile editing** - Add inline profile editing in ProfileMenu
2. **Device management** - Add device removal/renaming capabilities  
3. **Session management** - Add session timeout and refresh handling
4. **Theme switcher** - Add light/dark mode toggle
5. **Accessibility** - Enhance ARIA labels and keyboard navigation