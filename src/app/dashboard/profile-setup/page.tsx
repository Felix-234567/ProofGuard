'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Phone, CreditCard, User, Building, Loader2 } from 'lucide-react';
import { apiService } from '@/lib/apiService';
import styles from './profile-setup.module.css';

const GH_BANKS = [
  'MTN Mobile Money',
  'Telecel Cash',
  'AT Money',
  'GCB Bank',
  'Ecobank Ghana',
  'Fidelity Bank Ghana',
  'Stanbic Bank',
  'Absa Bank Ghana',
  'CalBank',
  'Access Bank Ghana'
];

export default function ProfileSetup() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  // Form fields
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [bank, setBank] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  useEffect(() => {
    async function checkSession() {
      try {
        const user = await apiService.getCurrentUser();
        if (!user) {
          router.push('/');
          return;
        }
        // If profile is already completed, go straight to dashboard
        if (user.profile_completed) {
          router.push('/dashboard');
          return;
        }
        setBusinessName(user.name + ' Designs');
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
    
    if (!businessName || !phone || !bank || !accountNumber) {
      setError('Please fill in all settlement payout details.');
      return;
    }

    setSubmitting(true);
    try {
      await apiService.updateProfile({
        business_name: businessName,
        phone: phone,
        payout_bank: bank,
        account_number: accountNumber
      });
      
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to save payout profile.');
    } finally {
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
              <CreditCard size={20} className={styles.headerIcon} />
            </div>
            <h2>Payout Profile Setup</h2>
            <p>
              ProofGuard uses **Paystack Subaccounts** to route client payments directly to your mobile money or bank wallet instantly. Add your details below to finish setup.
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
                <label className="form-label" htmlFor="bank-select">Bank or Mobile Wallet</label>
                <select
                  id="bank-select"
                  value={bank}
                  onChange={(e) => setBank(e.target.value)}
                  className="form-input"
                  disabled={submitting}
                  required
                >
                  <option value="">Select payout network</option>
                  {GH_BANKS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label" htmlFor="acc-num">Account / Wallet Number</label>
                <div className={styles.inputWrapper}>
                  <CreditCard className={styles.inputIcon} />
                  <input
                    id="acc-num"
                    type="text"
                    placeholder="e.g. 0541234567"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
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
                  <span>Configuring subaccount...</span>
                </>
              ) : (
                <span>Complete Payout Setup</span>
              )}
            </button>
          </form>

          <p className={styles.secureNotice}>
            Payout routing is encrypted. Settlement takes place automatically via Paystack (Ghana Payout Services).
          </p>
        </div>
      </main>
    </div>
  );
}
