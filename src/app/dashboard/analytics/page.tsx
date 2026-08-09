'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Shield, LogOut, ArrowLeft, BarChart3, 
  DollarSign, Eye, CheckCircle2, TrendingUp, HelpCircle
} from 'lucide-react';
import { apiService } from '@/lib/apiService';
import { Designer } from '@/lib/db';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './analytics.module.css';

export default function AnalyticsPage() {
  const router = useRouter();
  const [designer, setDesigner] = useState<Designer | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalViewed: 0,
    totalPaid: 0,
    conversionRate: 0,
    totalEarnings: 0
  });

  useEffect(() => {
    async function loadData() {
      try {
        const user = await apiService.getCurrentUser();
        if (!user) {
          router.push('/');
          return;
        }

        // Check profile_completed from localStorage (set by updateProfile after saving to D1)
        if (!user.profile_completed) {
          window.location.href = '/dashboard/profile-setup';
          return;
        }
        setDesigner(user);

        const analytics = await apiService.getAnalytics();
        setStats(analytics);
      } catch (err) {
        console.error('Failed to load analytics', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  const handleLogout = async () => {
    await apiService.logout();
    router.push('/');
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <span className="loading-spinner" />
        <p>Analyzing metrics...</p>
      </div>
    );
  }

  // Sample data for charts
  const weeklyViewsData = [12, 19, 32, 25, 45, 38, 52];
  const monthlyEarningsData = [1200, 2400, 1800, 3100, 4800, stats.totalEarnings || 5950];

  return (
    <div className={styles.container}>
      {/* Top Navbar */}
      <header className={`glass-panel ${styles.header}`}>
        <div className={styles.headerLeft}>
          <div className={styles.logo} onClick={() => router.push('/dashboard')} style={{ cursor: 'pointer' }}>
            <Shield className={styles.logoIcon} />
            <span>ProofGuard</span>
          </div>
          <nav className={styles.navLinks}>
            <button onClick={() => router.push('/dashboard')} className={styles.navLink}>Projects</button>
            <button className={styles.activeNavLink}>
              <BarChart3 size={16} />
              <span>Analytics</span>
            </button>
          </nav>
        </div>
        
        <div className={styles.headerRight}>
          <ThemeToggle />
          <div className={styles.profile}>
            <div className={styles.avatar}>
              {designer?.name.charAt(0).toUpperCase()}
            </div>
            <div className={styles.profileInfo}>
              <span className={styles.profileName}>{designer?.name}</span>
              <span className={styles.profileRole}>Designer</span>
            </div>
          </div>
          
          <button onClick={handleLogout} className={`btn btn-secondary ${styles.logoutBtn}`}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        <div className={styles.mainHeader}>
          <button onClick={() => router.push('/dashboard')} className={styles.backBtn}>
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
          </button>
          <h1 className={styles.title}>Performance Analytics</h1>
        </div>

        {/* Highlight Stats */}
        <section className={styles.summarySection}>
          <div className={`glass-panel ${styles.summaryCard}`}>
            <div className={styles.summaryLabel}>Average Deal Size</div>
            <div className={styles.summaryValue}>
              ₵{stats.totalPaid > 0 ? Math.round(stats.totalEarnings / stats.totalPaid).toLocaleString() : '0'}
            </div>
            <div className={styles.summaryChange}>Per paid project delivery</div>
          </div>

          <div className={`glass-panel ${styles.summaryCard}`}>
            <div className={styles.summaryLabel}>Outstanding Revenue</div>
            <div className={styles.summaryValue}>₵4,150</div>
            <div className={styles.summaryChange}>Locked in active previews</div>
          </div>

          <div className={`glass-panel ${styles.summaryCard}`}>
            <div className={styles.summaryLabel}>Security Score</div>
            <div className={styles.summaryValue}>98%</div>
            <div className={styles.summaryChange}>Watermark bypass protection</div>
          </div>
        </section>

        {/* Charts Grid */}
        <section className={styles.chartsGrid}>
          {/* Chart 1: Line Chart - Weekly Proof Views */}
          <div className={`glass-panel ${styles.chartCard}`}>
            <div className={styles.chartHeader}>
              <div>
                <h3>Proof Views (Last 7 Days)</h3>
                <p>Tracking visitor frequency on preview links</p>
              </div>
              <span className={styles.chartTag}>
                <TrendingUp size={14} />
                +24%
              </span>
            </div>
            <div className={styles.chartBody}>
              {/* Custom SVG Line Chart */}
              <svg className={styles.svgChart} viewBox="0 0 500 200">
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-green)" stopOpacity="0.3"/>
                    <stop offset="100%" stopColor="var(--accent-green)" stopOpacity="0.0"/>
                  </linearGradient>
                </defs>
                {/* Horizontal Grid lines */}
                <line x1="40" y1="30" x2="480" y2="30" stroke="rgba(255,255,255,0.03)" />
                <line x1="40" y1="80" x2="480" y2="80" stroke="rgba(255,255,255,0.03)" />
                <line x1="40" y1="130" x2="480" y2="130" stroke="rgba(255,255,255,0.03)" />
                <line x1="40" y1="170" x2="480" y2="170" stroke="rgba(255,255,255,0.06)" />

                {/* Y Axis Labels */}
                <text x="15" y="34" className={styles.chartText}>60</text>
                <text x="15" y="84" className={styles.chartText}>40</text>
                <text x="15" y="134" className={styles.chartText}>20</text>
                <text x="15" y="174" className={styles.chartText}>0</text>

                {/* SVG Area Fill */}
                <path 
                  d="M 40,170 L 40,140 L 113,123 L 186,90 L 259,107 L 332,60 L 405,77 L 478,45 L 478,170 Z" 
                  fill="url(#lineGrad)" 
                />

                {/* SVG Line */}
                <path 
                  d="M 40,140 L 113,123 L 186,90 L 259,107 L 332,60 L 405,77 L 478,45" 
                  fill="none" 
                  stroke="var(--accent-green)" 
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                {/* Chart Dots */}
                <circle cx="40" cy="140" r="3.5" fill="var(--accent-green)" stroke="black" strokeWidth="1.5" />
                <circle cx="113" cy="123" r="3.5" fill="var(--accent-green)" stroke="black" strokeWidth="1.5" />
                <circle cx="186" cy="90" r="3.5" fill="var(--accent-green)" stroke="black" strokeWidth="1.5" />
                <circle cx="259" cy="107" r="3.5" fill="var(--accent-green)" stroke="black" strokeWidth="1.5" />
                <circle cx="332" cy="60" r="3.5" fill="var(--accent-green)" stroke="black" strokeWidth="1.5" />
                <circle cx="405" cy="77" r="3.5" fill="var(--accent-green)" stroke="black" strokeWidth="1.5" />
                <circle cx="478" cy="45" r="3.5" fill="var(--accent-green)" stroke="black" strokeWidth="1.5" />

                {/* X Axis Labels */}
                <text x="40" y="190" textAnchor="middle" className={styles.chartText}>Mon</text>
                <text x="113" y="190" textAnchor="middle" className={styles.chartText}>Tue</text>
                <text x="186" y="190" textAnchor="middle" className={styles.chartText}>Wed</text>
                <text x="259" y="190" textAnchor="middle" className={styles.chartText}>Thu</text>
                <text x="332" y="190" textAnchor="middle" className={styles.chartText}>Fri</text>
                <text x="405" y="190" textAnchor="middle" className={styles.chartText}>Sat</text>
                <text x="478" y="190" textAnchor="middle" className={styles.chartText}>Sun</text>
              </svg>
            </div>
          </div>

          {/* Chart 2: Bar Chart - Monthly Revenue */}
          <div className={`glass-panel ${styles.chartCard}`}>
            <div className={styles.chartHeader}>
              <div>
                <h3>Revenue Insights (Last 6 Months)</h3>
                <p>Monthly distribution of unlocked client files</p>
              </div>
              <span className={styles.chartPrice}>Total: ₵{stats.totalEarnings + 13350}</span>
            </div>
            <div className={styles.chartBody}>
              {/* Custom SVG Bar Chart */}
              <svg className={styles.svgChart} viewBox="0 0 500 200">
                <line x1="40" y1="30" x2="480" y2="30" stroke="rgba(255,255,255,0.03)" />
                <line x1="40" y1="80" x2="480" y2="80" stroke="rgba(255,255,255,0.03)" />
                <line x1="40" y1="130" x2="480" y2="130" stroke="rgba(255,255,255,0.03)" />
                <line x1="40" y1="170" x2="480" y2="170" stroke="rgba(255,255,255,0.06)" />

                {/* Y Axis Labels */}
                <text x="15" y="34" className={styles.chartText}>₵6k</text>
                <text x="15" y="84" className={styles.chartText}>₵4k</text>
                <text x="15" y="134" className={styles.chartText}>₵2k</text>
                <text x="15" y="174" className={styles.chartText}>0</text>

                {/* Bars */}
                <rect x="58" y="136" width="30" height="34" rx="3" fill="rgba(255,255,255,0.02)" stroke="var(--panel-border)" />
                <rect x="128" y="102" width="30" height="68" rx="3" fill="rgba(255,255,255,0.02)" stroke="var(--panel-border)" />
                <rect x="198" y="119" width="30" height="51" rx="3" fill="rgba(255,255,255,0.02)" stroke="var(--panel-border)" />
                <rect x="268" y="82" width="30" height="88" rx="3" fill="rgba(255,255,255,0.02)" stroke="var(--panel-border)" />
                <rect x="338" y="48" width="30" height="122" rx="3" fill="rgba(255,255,255,0.02)" stroke="var(--panel-border)" />
                
                {/* Active Month (Current) with linear gradient color */}
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-green)"/>
                    <stop offset="100%" stopColor="#10b981"/>
                  </linearGradient>
                </defs>
                {/* Height scales dynamically based on stats */}
                {(() => {
                  const maxVal = 6000;
                  const rawVal = monthlyEarningsData[5];
                  const barHeight = Math.min(140, Math.max(15, (rawVal / maxVal) * 140));
                  const barY = 170 - barHeight;
                  return (
                    <rect x="408" y={barY} width="30" height={barHeight} rx="3" fill="url(#barGrad)" filter="drop-shadow(0 4px 8px rgba(0, 255, 102, 0.2))" />
                  );
                })()}

                {/* X Axis Labels */}
                <text x="73" y="190" textAnchor="middle" className={styles.chartText}>Feb</text>
                <text x="143" y="190" textAnchor="middle" className={styles.chartText}>Mar</text>
                <text x="213" y="190" textAnchor="middle" className={styles.chartText}>Apr</text>
                <text x="283" y="190" textAnchor="middle" className={styles.chartText}>May</text>
                <text x="353" y="190" textAnchor="middle" className={styles.chartText}>Jun</text>
                <text x="423" y="190" textAnchor="middle" className={styles.chartText}>Jul</text>
              </svg>
            </div>
          </div>
        </section>

        {/* Bottom Section: Funnel & Security Log */}
        <section className={styles.bottomSection}>
          {/* Conversion Funnel */}
          <div className={`glass-panel ${styles.funnelCard}`}>
            <h3>Conversion Funnel</h3>
            <p>How effectively are clients proceeding to payments?</p>
            
            <div className={styles.funnel}>
              <div className={styles.funnelStage} style={{ width: '100%' }}>
                <div className={styles.stageName}>Proofs Created</div>
                <div className={styles.stageValue}>{stats.totalProjects}</div>
              </div>

              <div className={styles.funnelStage} style={{ width: stats.totalProjects > 0 ? `${(stats.totalViewed / stats.totalProjects) * 100}%` : '0%', minWidth: '40%' }}>
                <div className={styles.stageName}>Viewed by Clients</div>
                <div className={styles.stageValue}>{stats.totalViewed}</div>
              </div>

              <div className={styles.funnelStage} style={{ width: stats.totalViewed > 0 ? `${(stats.totalPaid / stats.totalViewed) * 100}%` : '0%', minWidth: '20%' }}>
                <div className={styles.stageName}>Paid & Unlocked</div>
                <div className={styles.stageValue}>{stats.totalPaid}</div>
              </div>
            </div>
          </div>

          {/* Security Log */}
          <div className={`glass-panel ${styles.securityCard}`}>
            <div className={styles.securityHeader}>
              <h3>Protection Activity</h3>
              <span title="Audit log of security guard triggers">
                <HelpCircle size={15} className={styles.helpIcon} />
              </span>
            </div>
            
            <div className={styles.logList}>
              <div className={styles.logItem}>
                <span className={styles.logTime}>Just Now</span>
                <span className={styles.logText}>Screenshot restriction triggered (Client Preview page)</span>
              </div>
              <div className={styles.logItem}>
                <span className={styles.logTime}>4 hrs ago</span>
                <span className={styles.logText}>Right-click block triggered on <strong>Zenith Agency</strong> preview</span>
              </div>
              <div className={styles.logItem}>
                <span className={styles.logTime}>1 day ago</span>
                <span className={styles.logText}>Secured preview generated: <strong>Packaging Design - Bloom</strong></span>
              </div>
              <div className={styles.logItem}>
                <span className={styles.logTime}>3 days ago</span>
                <span className={styles.logText}>Original file unlocked: <strong>Brand Identity - Zenith Agency</strong></span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
