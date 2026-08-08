import type { NextConfig } from "next";

// DEBUG: verify env vars are loaded at startup
console.log('[next.config] API_URL:', process.env.NEXT_PUBLIC_API_URL || '(using default)');
console.log('[next.config] Firebase key present:', !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
console.log('[next.config] Paystack key configured:', !!process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_SECRET_KEY !== 'sk_test_placeholder');

const nextConfig: NextConfig = {
  // Environment variables explicitly passed to the browser bundle.
  // NOTE: NEXT_PUBLIC_* vars are auto-exposed by Next.js from .env files.
  // We only explicitly set non-Firebase vars here to avoid overriding
  // the auto-exposed values from .env with empty-string fallbacks.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5059',
  },
};

export default nextConfig;
