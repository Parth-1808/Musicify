-- ============================================================================
-- MUSIFY REFERRAL, VIP PASS & REMOTE PAYWALL CONTROL SCHEMA
-- Run this in your Supabase SQL Editor.
-- Safe & idempotent: applies cleanly over existing database.
-- ============================================================================

-- 1. App Configuration Table (Remote Feature Flags & Paywall Toggle)
CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Seed defaults: PAYWALL IS DISABLED BY DEFAULT!
-- Everything stays 100% free until you toggle 'paywall_enabled' to true.
INSERT INTO public.app_config (key, value, description)
VALUES 
    ('paywall_enabled', 'false'::jsonb, 'Master paywall switch. When false, all users get unlimited free songs. Toggle to true to enforce the 25-song quota.'),
    ('free_song_limit', '25'::jsonb, 'Base free songs allowed per user before paywall triggers.'),
    ('referral_bonus_songs', '5'::jsonb, 'Bonus free songs awarded to both parties per successful referral.'),
    ('vip_price_inr', '25'::jsonb, 'VIP monthly subscription price in INR.')
ON CONFLICT (key) DO UPDATE 
SET updated_at = NOW();

-- Enable RLS on app_config (Public read, admin write)
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view app config" ON public.app_config;
CREATE POLICY "Public can view app config" 
    ON public.app_config FOR SELECT 
    USING (true);

-- 2. Enhance Profiles Table with VIP, Quota & Referral Fields
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS has_unlimited_access BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS base_quota INT DEFAULT 25,
    ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id);

-- Helper to generate clean, readable 6-character referral code (e.g. M8F2K9)
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    done BOOLEAN;
BEGIN
    done := FALSE;
    WHILE NOT done LOOP
        new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 6));
        -- Ensure uniqueness
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = new_code) THEN
            done := TRUE;
        END IF;
    END LOOP;
    RETURN new_code;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Populate existing profiles with referral codes if missing
UPDATE public.profiles 
SET referral_code = public.generate_referral_code() 
WHERE referral_code IS NULL;

-- 3. Referrals Table (Tracks Invites & VIP Conversions)
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    referred_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
    referral_code TEXT NOT NULL,
    bonus_songs INT DEFAULT 5,
    has_converted_to_vip BOOLEAN DEFAULT FALSE,
    vip_converted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_converted ON public.referrals(has_converted_to_vip);

-- Enable RLS on referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own referral activity" ON public.referrals;
CREATE POLICY "Users can view their own referral activity"
    ON public.referrals FOR SELECT
    USING (auth.uid() = referrer_id OR auth.uid() = referred_user_id);

-- 4. Automatically Assign Referral Code on New User Signup
CREATE OR REPLACE FUNCTION public.handle_new_user_referral()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, referral_code, base_quota, has_unlimited_access)
    VALUES (
        new.id, 
        new.email, 
        split_part(new.email, '@', 1),
        public.generate_referral_code(),
        25,
        false
    )
    ON CONFLICT (id) DO UPDATE 
    SET email = EXCLUDED.email,
        display_name = COALESCE(public.profiles.display_name, split_part(EXCLUDED.email, '@', 1)),
        referral_code = COALESCE(public.profiles.referral_code, public.generate_referral_code());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-point trigger to enhanced handler
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_referral();

-- 5. Trigger: Auto-update Referrals when a Referred User Converted to VIP
CREATE OR REPLACE FUNCTION public.sync_referral_vip_conversion()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if user became VIP
    IF (NEW.is_vip = TRUE AND (OLD.is_vip IS NULL OR OLD.is_vip = FALSE)) OR 
       (NEW.vip_expires_at IS NOT NULL AND (OLD.vip_expires_at IS NULL OR NEW.vip_expires_at > OLD.vip_expires_at)) THEN
        UPDATE public.referrals
        SET has_converted_to_vip = TRUE,
            vip_converted_at = NOW()
        WHERE referred_user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_referral_vip ON public.profiles;
CREATE TRIGGER trg_sync_referral_vip
    AFTER UPDATE OF is_vip, vip_expires_at ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.sync_referral_vip_conversion();

-- ----------------------------------------------------------------------------
-- 6. RPC: Get User Quota, Referral Stats & Paywall State
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_quota(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_paywall_enabled BOOLEAN := FALSE;
    v_base_limit INT := 25;
    v_bonus_per_referral INT := 5;
    v_is_vip BOOLEAN := FALSE;
    v_has_unlimited BOOLEAN := FALSE;
    v_base_quota INT := 25;
    v_referral_code TEXT := '';
    v_total_referrals INT := 0;
    v_vip_conversions INT := 0;
    v_bonus_quota INT := 0;
    v_total_quota INT := 25;
    v_used_songs INT := 0;
    v_remaining INT := 25;
    v_can_add BOOLEAN := TRUE;
    v_referred_by UUID;
BEGIN
    -- 1. Read app config flags
    SELECT COALESCE((value)::boolean, false) INTO v_paywall_enabled
    FROM public.app_config WHERE key = 'paywall_enabled';

    SELECT COALESCE((value)::int, 25) INTO v_base_limit
    FROM public.app_config WHERE key = 'free_song_limit';

    SELECT COALESCE((value)::int, 5) INTO v_bonus_per_referral
    FROM public.app_config WHERE key = 'referral_bonus_songs';

    -- 2. Read profile details
    SELECT 
        COALESCE(is_vip, false),
        COALESCE(has_unlimited_access, false),
        COALESCE(base_quota, v_base_limit),
        COALESCE(referral_code, ''),
        referred_by
    INTO 
        v_is_vip,
        v_has_unlimited,
        v_base_quota,
        v_referral_code,
        v_referred_by
    FROM public.profiles
    WHERE id = p_user_id;

    -- If no profile exists, generate code on the fly
    IF v_referral_code = '' THEN
        v_referral_code := public.generate_referral_code();
        UPDATE public.profiles SET referral_code = v_referral_code WHERE id = p_user_id;
    END IF;

    -- 3. Calculate referral counts & bonus
    SELECT COUNT(*), COUNT(*) FILTER (WHERE has_converted_to_vip = TRUE)
    INTO v_total_referrals, v_vip_conversions
    FROM public.referrals
    WHERE referrer_id = p_user_id;

    v_bonus_quota := v_total_referrals * v_bonus_per_referral;
    v_total_quota := v_base_quota + v_bonus_quota;

    -- 4. Count songs used by this user
    SELECT COUNT(*) INTO v_used_songs
    FROM public.songs
    WHERE user_id = p_user_id;

    v_remaining := GREATEST(0, v_total_quota - v_used_songs);

    -- 5. Determine if user can add/download songs
    -- If paywall is OFF, or user is VIP, or user has Admin Unlimited Access -> ALWAYS ALLOW!
    IF NOT v_paywall_enabled OR v_is_vip OR v_has_unlimited THEN
        v_can_add := TRUE;
    ELSE
        v_can_add := (v_remaining > 0);
    END IF;

    RETURN jsonb_build_object(
        'paywall_enabled', v_paywall_enabled,
        'is_vip', v_is_vip,
        'has_unlimited_access', v_has_unlimited,
        'base_quota', v_base_quota,
        'bonus_quota', v_bonus_quota,
        'total_quota', v_total_quota,
        'used_songs', v_used_songs,
        'remaining_songs', v_remaining,
        'can_add_song', v_can_add,
        'referral_code', v_referral_code,
        'total_referrals', v_total_referrals,
        'vip_conversions', v_vip_conversions,
        'referred_by', v_referred_by
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 7. RPC: Apply a Friend's Referral Code (+5 Bonus Songs for Both)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_referral_code(p_user_id UUID, p_code TEXT)
RETURNS JSONB AS $$
DECLARE
    v_referrer_id UUID;
    v_clean_code TEXT;
    v_existing_ref UUID;
BEGIN
    v_clean_code := UPPER(TRIM(p_code));

    -- Check if user already used a referral code
    SELECT referred_by INTO v_existing_ref FROM public.profiles WHERE id = p_user_id;
    IF v_existing_ref IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'You have already redeemed a referral code.');
    END IF;

    -- Find the referrer
    SELECT id INTO v_referrer_id 
    FROM public.profiles 
    WHERE referral_code = v_clean_code;

    IF v_referrer_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code. Please check and try again.');
    END IF;

    -- Cannot refer yourself
    IF v_referrer_id = p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'You cannot use your own referral code!');
    END IF;

    -- Record referral
    INSERT INTO public.referrals (referrer_id, referred_user_id, referral_code, bonus_songs)
    VALUES (v_referrer_id, p_user_id, v_clean_code, 5)
    ON CONFLICT (referred_user_id) DO NOTHING;

    -- Link referrer in profile and give +5 bonus to the user too
    UPDATE public.profiles 
    SET referred_by = v_referrer_id,
        base_quota = COALESCE(base_quota, 25) + 5
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Referral applied! You and your friend both earned +5 songs bonus!',
        'bonus_songs', 5
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 8. ADMIN CONTROLS (For You To Run in SQL Editor Anytime)
-- ----------------------------------------------------------------------------

-- A. Toggle Paywall On/Off with 1 query:
-- SELECT public.admin_toggle_paywall(true);  -- Enforce paywall
-- SELECT public.admin_toggle_paywall(false); -- Make free for everyone
CREATE OR REPLACE FUNCTION public.admin_toggle_paywall(p_enabled BOOLEAN)
RETURNS TEXT AS $$
BEGIN
    UPDATE public.app_config 
    SET value = to_jsonb(p_enabled), updated_at = NOW()
    WHERE key = 'paywall_enabled';
    RETURN 'Paywall is now ' || CASE WHEN p_enabled THEN 'ENABLED (25-song quota enforced)' ELSE 'DISABLED (Unlimited free access for all)' END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Give Free Unlimited Access to Any User (by email or user ID):
-- SELECT public.admin_set_user_access('friend@gmail.com', true);
CREATE OR REPLACE FUNCTION public.admin_set_user_access(p_user_identifier TEXT, p_unlimited BOOLEAN)
RETURNS TEXT AS $$
DECLARE
    v_uid UUID;
BEGIN
    -- Check if UUID or email
    IF p_user_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_uid := p_user_identifier::UUID;
    ELSE
        SELECT id INTO v_uid FROM public.profiles WHERE LOWER(email) = LOWER(p_user_identifier);
    END IF;

    IF v_uid IS NULL THEN
        RETURN 'User not found: ' || p_user_identifier;
    END IF;

    UPDATE public.profiles
    SET has_unlimited_access = p_unlimited,
        is_vip = p_unlimited
    WHERE id = v_uid;

    RETURN 'User ' || p_user_identifier || ' unlimited access set to: ' || p_unlimited::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 9. ADMIN ANALYTICS VIEW: See Referrals & VIP Conversions Live!
-- ----------------------------------------------------------------------------
-- Run in Supabase SQL Editor: SELECT * FROM public.admin_referral_analytics;
CREATE OR REPLACE VIEW public.admin_referral_analytics AS
SELECT 
    p.email AS referrer_email,
    p.display_name AS referrer_name,
    p.referral_code,
    COUNT(r.id) AS total_friends_referred,
    COUNT(r.id) FILTER (WHERE r.has_converted_to_vip = TRUE) AS total_vip_conversions,
    ROUND(
        CASE WHEN COUNT(r.id) > 0 
             THEN (COUNT(r.id) FILTER (WHERE r.has_converted_to_vip = TRUE)::NUMERIC / COUNT(r.id)::NUMERIC) * 100 
             ELSE 0 
        END, 
        1
    ) AS conversion_rate_percent,
    MAX(r.created_at) AS last_referral_date
FROM public.profiles p
LEFT JOIN public.referrals r ON p.id = r.referrer_id
GROUP BY p.id, p.email, p.display_name, p.referral_code
HAVING COUNT(r.id) > 0
ORDER BY total_vip_conversions DESC, total_friends_referred DESC;
