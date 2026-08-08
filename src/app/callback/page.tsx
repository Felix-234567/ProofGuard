'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiService } from '@/lib/apiService';
import styles from './callback.module.css';

export default function PaystackCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function initCallback() {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setErrorMsg('Missing project token in callback URL.');
        return;
      }

      let attempts = 0;
      const maxAttempts = 10;
      const useDirectVerifyAfter = 3;

      const checkPayment = async () => {
        attempts++;
        try {
          const project = await apiService.getPublicProject(token);

          if (project.status === 'Paid') {
            setStatus('success');
            setTimeout(() => router.push(`/preview/${token}`), 1500);
            return;
          }

          if (attempts >= useDirectVerifyAfter) {
            const verified = await apiService.verifyPayment(token);
            if (verified) {
              setStatus('success');
              setTimeout(() => router.push(`/preview/${token}`), 1500);
              return;
            }
          }

          if (attempts < maxAttempts) {
            setTimeout(checkPayment, 1000);
          } else {
            setStatus('error');
            setErrorMsg('Payment verification timed out. Please contact support if you have completed payment.');
          }
        } catch (err: unknown) {
          if (attempts < maxAttempts) {
            setTimeout(checkPayment, 1000);
          } else {
            setStatus('error');
            setErrorMsg(
              err instanceof Error ? err.message : 'Failed to verify payment status.'
            );
          }
        }
      };

      setTimeout(checkPayment, 500);
    }

    initCallback();
  }, [router, searchParams]);

  return (
    <div className={styles.container}>
      <div className={`glass-panel ${styles.card}`}>
        {status === 'processing' && (
          <>
            <Loader2 className={styles.spinner} size={40} />
            <h2 className={styles.title}>Verifying Payment</h2>
            <p className={styles.subtitle}>
              Please wait while we confirm your Paystack payment...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className={styles.successIcon} size={40} />
            <h2 className={styles.title}>Payment Verified!</h2>
            <p className={styles.subtitle}>Redirecting to your proof...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className={styles.errorIcon} size={40} />
            <h2 className={styles.title}>Payment Verification</h2>
            <p className={styles.subtitle}>{errorMsg}</p>
          </>
        )}
      </div>
    </div>
  );
}
