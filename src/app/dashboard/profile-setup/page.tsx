'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Phone, Smartphone, Building, Loader2 } from 'lucide-react';
import { apiService } from '@/lib/apiService';
import styles from './profile-setup.module.css';

const MOMO_PROVIDERS = [
  { id: 'mtn', label: 'MTN Mobile Money' },
  { id: 'telecel', label: 'Telecel Cash' },
  { id: 'at', label: 'AT Money' },
];

export default function ProfileSetup() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Form fields
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [momoProvider, setMomoProvider] = useState('');
  const [momoNumber, setMomoNumber] = useState('');

  useEffect(() => {
    async function checkSession() {
      try {
        const user = await apiService.getCurrentUser();
        if (!user) {
          router.push('/');
          return;
        }

        // Check if profile is already completed in the database
        try {
          const dbProfile = await apiService.getProfile();
          // If database says profile is completed, sync to localStorage and redirect
          if (dbProfile.profile_completed) {
            const merged = { ...user, ...dbProfile, profile_completed: true };
            localStorage.setItem('pg_current_designer', JSON.stringify(merged));
            router.push('/dashboard');
            return;
          }

          // Pre-fill form with existing database values if any
          if (dbProfile.business_name) setBusinessName(dbProfile.business_name);
          if (dbProfile.phone) setPhone(dbProfile.phone);
          if (dbProfile.momo_provider) setMomoProvider(dbProfile.momo_provider);
          if (dbProfile.momo_number) setMomoNumber(dbProfile.momo_number);
        } catch (apiErr: any) {
          // Expired/revoked session — back to sign in
          if (apiErr?.message?.includes('sign in again')) {
            router.push('/');
            return;
          }
          // Designer doesn't exist in DB yet (404) or API hiccup — use default
          console.warn('Could not fetch profile from API, using localStorage only', apiErr);
          setBusinessName(user.name + ' Designs');
        }

        // If localStorage profile_completed is true but we got here, redirect anyway
        if (user.profile_completed) {
          router.push('/dashboard');
          return;
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!businessName || !phone || !momoProvider || !momoNumber) {
      setError('Please fill in all payout details.');
      return;
    }

    setSubmitting(true);

    try {
      const updatedDesigner = await apiService.updateProfile({
        business_name: businessName,
        phone: phone,
        momo_provider: momoProvider,
        momo_number: momoNumber
      });

      console.log('[ProfileSetup] Profile saved to database successfully:', updatedDesigner);

      // Sync the full response to localStorage
      if (typeof window !== 'undefined') {
        const localDesigner = await apiService.getCurrentUser();
        if (localDesigner) {
          const merged = { ...localDesigner, ...updatedDesigner, profile_completed: true };
          localStorage.setItem('pg_current_designer', JSON.stringify(merged));
        }
      }

      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err: any) {
      console.error('Profile save failed:', err);
      // Expired/revoked session — back to sign in
      if (err?.message?.includes('sign in again')) {
        router.push('/');
        return;
      }
      setError(err.message || 'Failed to save profile. Please try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className={`${styles.spinner} animate-spin-slow`} size={32} />
        <p>Loading security profile setup...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <Shield className={styles.logoIcon} />
          <span>ProofGuard</span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={`glass-panel ${styles.card}`}>
          <div className={styles.cardHeader}>
            <div className={styles.iconBg}>
              <Smartphone size={20} className={styles.headerIcon} />
            </div>
            <h2>Mobile Money Payout Setup</h2>
            <p>
              Set up your Mobile Money wallet to receive client payments directly. When a client pays, funds are sent straight to your MoMo number.
            </p>
          </div>

          {error && <div className={styles.errorMessage}>{error}</div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className="form-group">
              <label className="form-label" htmlFor="biz-name">Settlement Business Name</label>
              <div className={styles.inputWrapper}>
                <Building className={styles.inputIcon} />
                <input
                  id="biz-name"
                  type="text"
                  placeholder="e.g. Raymond Designs"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="form-input"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="phone-num">Payout Mobile Phone</label>
              <div className={styles.inputWrapper}>
                <Phone className={styles.inputIcon} />
                <input
                  id="phone-num"
                  type="tel"
                  placeholder="e.g. 054 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="form-input"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className="form-group" style={{ flex: 1.2 }}>
                <label className="form-label" htmlFor="momo-provider">Mobile Money Provider</label>
                <select
                  id="momo-provider"
                  value={momoProvider}
                  onChange={(e) => setMomoProvider(e.target.value)}
                  className="form-input"
                  disabled={submitting}
                  required
                >
                  <option value="">Select provider</option>
                  {MOMO_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" htmlFor="momo-number">Mobile Money Number</label>
                <div className={styles.inputWrapper}>
                  <Smartphone className={styles.inputIcon} />
                  <input
                    id="momo-number"
                    type="tel"
                    placeholder="e.g. 0541234567"
                    value={momoNumber}
                    onChange={(e) => setMomoNumber(e.target.value.replace(/\D/g, ''))}
                    className="form-input"
                    disabled={submitting}
                    required
                  />
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ height: '46px', marginTop: '10px' }} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className={styles.spinner} size={18} />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Complete Setup</span>
              )}
            </button>
          </form>

          <p className={styles.secureNotice}>
            Your MoMo number is stored securely. Payments from clients will be sent directly to this number.
          </p>
        </div>
      </main>
    </div>
  );
}
