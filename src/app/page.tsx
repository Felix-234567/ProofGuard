'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, Key, User, ArrowRight, CheckCircle2, Globe } from 'lucide-react';
import { apiService } from '@/lib/apiService';
import styles from './auth.module.css';

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Check if already logged in
  useEffect(() => {
    apiService.getCurrentUser().then((user) => {
      if (user) {
        if (user.profile_completed) {
          window.location.href = '/dashboard';
        } else {
          window.location.href = '/dashboard/profile-setup';
        }
      }
    });
  }, []);  // empty deps — runs once on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!email || !password || (!isLogin && !name)) {
        throw new Error('Please fill in all fields.');
      }
      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters.');
      }

      let user;
      if (isLogin) {
        user = await apiService.login(email, password);
      } else {
        user = await apiService.signup(email, password, name);
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = user.profile_completed ? '/dashboard' : '/dashboard/profile-setup';
      }, 1000);
    } catch (err: any) {
      // Map Firebase error codes to user-friendly messages
      const msg = err.message || 'An error occurred. Please try again.';
      if (msg.includes('auth/user-not-found') || msg.includes('auth/wrong-password') || msg.includes('auth/invalid-credential')) {
        setError('Invalid email or password. Please try again.');
      } else if (msg.includes('auth/email-already-in-use')) {
        setError('An account with this email already exists. Please sign in instead.');
      } else if (msg.includes('auth/weak-password')) {
        setError('Password must be at least 6 characters.');
      } else if (msg.includes('auth/invalid-email')) {
        setError('Please enter a valid email address.');
      } else if (msg.includes('auth/too-many-requests')) {
        setError('Too many attempts. Please try again later.');
      } else if (msg.includes('auth/operation-not-allowed') || msg.includes('auth/unauthorized-continue-uri') || msg.includes('auth/popup-blocked')) {
        setError('Email/Password sign-in is not enabled. Please enable it in your Firebase Console under Authentication > Sign-in method, or use Google sign-in.');
      } else if (msg.includes('Firebase is not configured')) {
        setError('Firebase is not configured. Please set up your .env file with Firebase credentials.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Left side: branding/visuals */}
      <div className={styles.brandingSection}>
        <div className={styles.brandingContent}>
          <div className={styles.logoBadge}>
            <Shield className={styles.logoIcon} />
            <span>ProofGuard</span>
          </div>
          
          <h1 className={styles.brandingTitle}>
            Secure your work. <br />
            <span className={styles.gradientText}>Guarantee your pay.</span>
          </h1>
          
          <p className={styles.brandingSubtitle}>
            Watermark-gated proofing and delivery made simple. Share protected, low-res design previews and automatically unlock the clean, full-resolution files upon client payment.
          </p>

          {/* Interactive visual showcase */}
          <div className={styles.showcaseCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardDot} />
              <div className={styles.cardDot} />
              <div className={styles.cardDot} />
              <span className={styles.cardTitle}>Client Preview</span>
            </div>
            
            <div className={styles.cardBody}>
              <div className={styles.mockWatermarkGrid}>
                {[...Array(12)].map((_, i) => (
                  <span key={i} className={styles.watermarkText}>PROOFGUARD</span>
                ))}
              </div>
              
              <div className={styles.lockStatus}>
                <Lock className={styles.lockIcon} />
                <span>Locked until payment</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side: Login form */}
      <div className={styles.formSection}>
        <div className={`glass-panel ${styles.formCard} glow-purple-hover`}>
          <div className={styles.formHeader}>
            <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
            <p>{isLogin ? 'Sign in to manage your project proofs' : 'Start protecting your design business today'}</p>
          </div>

          {error && <div className={styles.errorMessage}>{error}</div>}
          
          {success ? (
            <div className={styles.successMessage}>
              <CheckCircle2 className={styles.successIcon} />
              <span>Authentication successful! Redirecting...</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              {!isLogin && (
                <div className="form-group">
                  <label className="form-label" htmlFor="name">Full Name</label>
                  <div className={styles.inputWrapper}>
                    <User className={styles.inputIcon} />
                    <input
                      id="name"
                      type="text"
                      className="form-input"
                      placeholder="Raymond"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" htmlFor="email">Email Address</label>
                <div className={styles.inputWrapper}>
                  <Mail className={styles.inputIcon} />
                  <input
                    id="email"
                    type="email"
                    className="form-input"
                    placeholder="ray@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">Password</label>
                <div className={styles.inputWrapper}>
                  <Key className={styles.inputIcon} />
                  <input
                    id="password"
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <button type="submit" className={`btn btn-primary ${styles.submitBtn}`} disabled={loading}>
                {loading ? <span className="loading-spinner" /> : (
                  <>
                    <span>{isLogin ? 'Sign In' : 'Sign Up'}</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className={styles.divider}>
                <span className={styles.dividerLine} />
                <span className={styles.dividerText}>or</span>
                <span className={styles.dividerLine} />
              </div>

              {/* Google Sign-In Button */}
              <button
                type="button"
                onClick={async () => {
                  setError('');
                  setLoading(true);
                  try {
                    const user = await apiService.signInWithGoogle();
                    setSuccess(true);
                    setTimeout(() => {
                      router.push(user.profile_completed ? '/dashboard' : '/dashboard/profile-setup');
                    }, 1000);
                  } catch (err: any) {
                    const msg = err.message || '';
                    if (msg.includes('Firebase is not configured')) {
                      setError('Firebase is not configured. Please set up your .env file with Firebase credentials.');
                    } else if (err?.code === 'auth/popup-blocked') {
                      setError('Popup was blocked. Please allow popups for this site to use Google sign-in.');
                    } else if (msg.includes('auth/popup-closed-by-user')) {
                      // User closed the popup — just ignore
                    } else {
                      setError(msg || 'Google sign-in failed. Please try again.');
                    }
                  } finally {
                    setLoading(false);
                  }
                }}
                className={styles.googleBtn}
                disabled={loading}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>{isLogin ? 'Sign in with Google' : 'Sign up with Google'}</span>
              </button>
            </form>
          )}

          <div className={styles.formFooter}>
            <button 
              className={styles.switchBtn} 
              onClick={() => setIsLogin(!isLogin)}
              disabled={loading}
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
