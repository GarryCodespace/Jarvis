-- Jarvix Authentication Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- devices table (desktop installs)
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  app_version TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- sessions_audit table (non-PII audit log)
CREATE TABLE IF NOT EXISTS public.sessions_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('LOGIN', 'LOGOUT', 'TOKEN_REFRESH', 'FAILED')),
  user_agent TEXT,
  ip INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON public.devices(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_sessions_audit_user_id ON public.sessions_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_audit_created_at ON public.sessions_audit(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
DROP POLICY IF EXISTS "read own profile" ON public.profiles;
CREATE POLICY "read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
CREATE POLICY "insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update own profile" ON public.profiles;
CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for devices
DROP POLICY IF EXISTS "see own devices" ON public.devices;
CREATE POLICY "see own devices" ON public.devices
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert own device" ON public.devices;
CREATE POLICY "insert own device" ON public.devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update own device" ON public.devices;
CREATE POLICY "update own device" ON public.devices
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for sessions_audit
DROP POLICY IF EXISTS "read own audit" ON public.sessions_audit;
CREATE POLICY "read own audit" ON public.sessions_audit
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert own audit" ON public.sessions_audit;
CREATE POLICY "insert own audit" ON public.sessions_audit
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at for profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to create profile automatically when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.devices TO authenticated;
GRANT ALL ON public.sessions_audit TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Jarvix authentication schema setup completed successfully!';
    RAISE NOTICE 'Tables created: profiles, devices, sessions_audit';
    RAISE NOTICE 'RLS policies enabled and configured';
    RAISE NOTICE 'Automatic profile creation trigger installed';
END $$;