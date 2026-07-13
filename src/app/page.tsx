'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, Mail, Key, User, ArrowRight, CheckCircle2 } from 'lucide-react';
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
          router.push('/dashboard');
        } else {
          router.push('/dashboard/profile-setup');
        }
      }
    });
  }, [router]);

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
        user = await apiService.login(email);
      } else {
        // Register mock
        user = await apiService.login(email);
      }

      setSuccess(true);
      setTimeout(() => {
        if (user.profile_completed) {
          router.push('/dashboard');
        } else {
          router.push('/dashboard/profile-setup');
        }
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
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
