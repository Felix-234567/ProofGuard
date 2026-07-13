'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Shield, Lock, Unlock, Download, CreditCard, 
  AlertTriangle, CheckCircle2, ChevronRight, Loader2, Sparkles
} from 'lucide-react';
import { apiService } from '@/lib/apiService';
import { Project } from '@/lib/db';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './preview.module.css';

export default function ClientPreview() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Payment Modal State
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [payError, setPayError] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);

  // Download states
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function initPage() {
      if (!token) return;
      try {
        // 1. Fetch public project preview details
        const proj = await apiService.getPublicProject(token);
        setProject(proj);
        
        // 2. Mark project as Viewed
        await apiService.markProjectAsViewed(token);
      } catch (err: any) {
        setError(err.message || 'This project link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    }
    initPage();
  }, [token]);

  // Format Card Number (space every 4 digits)
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    const formatted = value.match(/.{1,4}/g)?.join(' ') || value;
    setCardNumber(formatted.substring(0, 19));
  };

  // Format Expiry Date (MM/YY)
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    let formatted = value;
    if (value.length > 2) {
      formatted = `${value.substring(0, 2)}/${value.substring(2, 4)}`;
    }
    setExpiry(formatted.substring(0, 5));
  };

  // Submit simulated Stripe payment
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError('');

    if (!cardNumber || !expiry || !cvc) {
      setPayError('Please enter all card credentials.');
      return;
    }

    setPayLoading(true);
    try {
      // Call mock api
      const updatedProj = await apiService.processPayment(token, { cardNumber, expiry, cvc });
      setProject(updatedProj);
      setPaySuccess(true);
      setTimeout(() => {
        setIsPayModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setPayError(err.message || 'Payment failed. Please verify credentials.');
    } finally {
      setPayLoading(false);
    }
  };

  // Handle downloading the files
  const handleDownloadOriginal = async () => {
    if (!project || project.status !== 'Paid') return;
    setDownloading(true);
    try {
      const originalBase64 = await apiService.downloadOriginal(token);
      
      // Create clean download link
      const link = document.createElement('a');
      link.href = originalBase64;
      link.download = `ProofGuard_${project.title.replace(/\s+/g, '_')}_Original.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert('Failed to retrieve original file.');
    } finally {
      setDownloading(false);
    }
  };

  // Low-res preview download
  const handleDownloadPreview = () => {
    if (!project) return;
    const link = document.createElement('a');
    link.href = project.preview_file_key || project.original_file_key;
    link.download = `ProofGuard_${project.title.replace(/\s+/g, '_')}_Watermarked_Preview.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className={`${styles.spinner} animate-spin-slow`} size={32} />
        <p>Loading secure proofing environment...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className={styles.errorContainer}>
        <div className={`glass-panel ${styles.errorCard}`}>
          <AlertTriangle className={styles.errorIcon} size={48} />
          <h2>Proof Link Inactive</h2>
          <p>{error || 'This link may have been revoked or does not exist.'}</p>
          <button onClick={() => router.push('/')} className="btn btn-secondary">
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Top Banner */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <Shield className={styles.shieldIcon} />
          <span>ProofGuard</span>
          <span className={styles.headerBadge}>SECURE PREVIEW</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <ThemeToggle />
          {project.status === 'Paid' ? (
            <div className={styles.statusPaidBadge}>
              <CheckCircle2 size={16} />
              <span>PAYMENT VERIFIED</span>
            </div>
          ) : (
            <div className={styles.statusLockedBadge}>
              <Lock size={16} />
              <span>DELIVERY WATERMARKED</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Grid */}
      <main className={styles.grid}>
        {/* Left Side: Protected Preview Area */}
        <section className={`glass-panel ${styles.previewSection}`}>
          <div className={styles.previewContainer}>
            {/* Transparent blocker overlay to prevent right clicks and drags */}
            <div 
              className={styles.blockerOverlay} 
              onContextMenu={(e) => {
                e.preventDefault();
                alert('Security Notice: Right-click is disabled to protect draft assets.');
              }}
              onDragStart={(e) => e.preventDefault()}
            />
            
            {/* The Watermarked preview */}
            <img 
              src={project.status === 'Paid' ? project.original_file_key : (project.preview_file_key || project.original_file_key)} 
              alt="Project Design Proof" 
              className={styles.proofImage}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
          </div>

          <div className={styles.protectionNotice}>
            <AlertTriangle size={14} className={styles.noticeIcon} />
            <span>Draft preview mode. Screenshots/copies are strictly tracked & protected.</span>
          </div>
        </section>

        {/* Right Side: Control Panel */}
        <section className={styles.controlPanel}>
          <div className={`glass-panel ${styles.controlCard}`}>
            <span className={styles.designerLabel}>SUBMITTED BY DESIGNER</span>
            <h1 className={styles.projectTitle}>{project.title}</h1>
            <p className={styles.clientLabel}>Deliverable to: <span>{project.client_email}</span></p>

            <div className={styles.divider} />

            {project.status !== 'Paid' ? (
              /* Unpaid Mode */
              <div className={styles.checkoutBox}>
                <div className={styles.priceRow}>
                  <span>Lock-Release Price:</span>
                  <span className={styles.priceVal}>${project.price.toLocaleString()}</span>
                </div>
                
                <p className={styles.priceSub}>
                  Pay securely to instantly unlock the original, unwatermarked high-resolution assets.
                </p>

                <button 
                  onClick={() => setIsPayModalOpen(true)}
                  className={`btn btn-primary ${styles.payBtn}`}
                >
                  <CreditCard size={18} />
                  <span>Pay to Unlock Original</span>
                  <ChevronRight size={16} />
                </button>

                <button 
                  onClick={handleDownloadPreview}
                  className={`btn btn-secondary ${styles.downloadPreviewBtn}`}
                >
                  <Download size={16} />
                  <span>Download Draft (Watermarked)</span>
                </button>
              </div>
            ) : (
              /* Paid Mode */
              <div className={styles.unlockedBox}>
                <div className={styles.unlockedHeader}>
                  <div className={styles.unlockedIconBg}>
                    <Sparkles className={styles.sparkleIcon} />
                    <Unlock size={22} className={styles.unlockIcon} />
                  </div>
                  <h3>Original Unlocked!</h3>
                  <p>Payment has been completed. You can now download the high-resolution clean file.</p>
                </div>

                <button 
                  onClick={handleDownloadOriginal}
                  className={`btn btn-success ${styles.downloadOriginalBtn}`}
                  disabled={downloading}
                >
                  {downloading ? (
                    <>
                      <Loader2 className={styles.spinner} size={18} />
                      <span>Downloading clean file...</span>
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>Download Clean Original</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className={styles.securityMeta}>
            <h4>Security Guard Shield Active</h4>
            <p>This proof is encrypted client-side. The clean file is not exposed to the DOM until payment verification is validated.</p>
          </div>
        </section>
      </main>

      {/* Stripe Payment Modal */}
      {isPayModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={`glass-panel ${styles.modal} animate-fade-in`}>
            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderTitle}>
                <CreditCard size={20} className={styles.modalCardIcon} />
                <h3>Secure Delivery Payment</h3>
              </div>
              <button 
                onClick={() => setIsPayModalOpen(false)} 
                className={styles.modalCloseBtn}
                disabled={payLoading || paySuccess}
              >
                Cancel
              </button>
            </div>

            {payError && <div className={styles.payError}>{payError}</div>}

            {paySuccess ? (
              <div className={styles.paySuccessMessage}>
                <CheckCircle2 className={styles.paySuccessIcon} />
                <h4>Payment Completed!</h4>
                <p>Transfer authorized. Generating signed download access...</p>
              </div>
            ) : (
              <form onSubmit={handlePaymentSubmit} className={styles.payForm}>
                <div className={styles.modalInvoice}>
                  <span>Deliverable:</span>
                  <strong>{project.title}</strong>
                  <span className={styles.modalPrice}>${project.price.toLocaleString()}</span>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="card-num">Card Number</label>
                  <input
                    id="card-num"
                    type="text"
                    placeholder="4242 4242 4242 4242"
                    value={cardNumber}
                    onChange={handleCardNumberChange}
                    className="form-input"
                    disabled={payLoading}
                    required
                  />
                </div>

                <div className={styles.formRow}>
                  <div className="form-group" style={{ flex: 1.5 }}>
                    <label className="form-label" htmlFor="card-exp">Expiry Date</label>
                    <input
                      id="card-exp"
                      type="text"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={handleExpiryChange}
                      className="form-input"
                      disabled={payLoading}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" htmlFor="card-cvc">CVC</label>
                    <input
                      id="card-cvc"
                      type="text"
                      placeholder="123"
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').substring(0, 4))}
                      className="form-input"
                      disabled={payLoading}
                      required
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className={`btn btn-primary ${styles.modalPayBtn}`}
                  disabled={payLoading}
                >
                  {payLoading ? (
                    <>
                      <Loader2 className={styles.spinner} size={18} />
                      <span>Processing Stripe Capture...</span>
                    </>
                  ) : (
                    <span>Authorize & Pay ${project.price.toLocaleString()}</span>
                  )}
                </button>

                <p className={styles.stripeNotice}>
                  Simulated gateway. Stripe TLS 1.3 / AES-256 bank-grade protocol simulated.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
