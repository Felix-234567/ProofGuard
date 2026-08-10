'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield, LogOut, ArrowLeft, BarChart3,
  TrendingUp, TrendingDown, HelpCircle
} from 'lucide-react';
import { apiService } from '@/lib/apiService';
import { Designer, Project } from '@/lib/db';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './analytics.module.css';

// Plot area inside the 500x200 chart viewBox: x 40->478, y 170 (zero) -> 30 (max).
const PLOT = { x0: 40, x1: 478, yTop: 30, yBottom: 170 };
const TICKS = [1, 0.75, 0.5, 0.25, 0];

type ActivityEvent = { id: string; at: number; kind: 'created' | 'viewed' | 'paid'; title: string };

/**
 * Timestamps are written server-side as DateTime.UtcNow but SQLite/D1 round-trips
 * them without a timezone designator. Treat a bare timestamp as UTC so day and
 * month bucketing does not drift by the viewer's offset.
 */
function parseTs(value?: string | null): number | null {
  if (!value) return null;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const ms = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Axis ceiling for a whole-number count. Always a multiple of 4 so the four
 *  quarter gridlines land on integers instead of repeating a rounded label. */
function niceMaxCount(peak: number): number {
  return Math.ceil(Math.max(4, peak) / 4) * 4;
}

/** Axis ceiling for a money series, floored at ₵100 so an empty chart still
 *  draws a sane scale rather than five ₵1 ticks. */
function niceMaxMoney(peak: number): number {
  if (peak <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(peak));
  const scaled = peak / pow;
  const step = [1, 2, 2.5, 4, 5, 10].find(s => s >= scaled) ?? 10;
  return Math.max(100, step * pow);
}

function scaleY(value: number, max: number): number {
  const ratio = max > 0 ? value / max : 0;
  return PLOT.yBottom - ratio * (PLOT.yBottom - PLOT.yTop);
}

function scaleX(index: number, count: number): number {
  if (count <= 1) return PLOT.x0;
  return PLOT.x0 + (index * (PLOT.x1 - PLOT.x0)) / (count - 1);
}

function formatCedis(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `₵${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `₵${Math.round(value)}`;
}

function relativeTime(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return `${Math.round(days / 30)} mo ago`;
}

function midnightOffset(daysAgo: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

/** Proofs first opened by a client, bucketed into each of the last 7 days. */
function dailyViews(projects: Project[]) {
  return Array.from({ length: 7 }, (_, slot) => {
    const daysAgo = 6 - slot;
    const from = midnightOffset(daysAgo);
    const to = midnightOffset(daysAgo - 1);
    const value = projects.filter(p => {
      const t = parseTs(p.viewed_at);
      return t !== null && t >= from && t < to;
    }).length;
    return {
      label: new Date(from).toLocaleDateString(undefined, { weekday: 'short' }),
      value
    };
  });
}

function viewsBetween(projects: Project[], fromDaysAgo: number, toDaysAgo: number): number {
  const from = midnightOffset(fromDaysAgo);
  const to = midnightOffset(toDaysAgo);
  return projects.filter(p => {
    const t = parseTs(p.viewed_at);
    return t !== null && t >= from && t < to;
  }).length;
}

/** Payments summed by the calendar month they landed in, for the last 6 months. */
function monthlyRevenue(projects: Project[]) {
  const now = new Date();
  return Array.from({ length: 6 }, (_, slot) => {
    const from = new Date(now.getFullYear(), now.getMonth() - (5 - slot), 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const value = projects.reduce((sum, p) => {
      const t = parseTs(p.paid_at);
      return t !== null && t >= from.getTime() && t < to.getTime() ? sum + p.price : sum;
    }, 0);
    return { label: from.toLocaleDateString(undefined, { month: 'short' }), value };
  });
}

function activityFeed(projects: Project[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const p of projects) {
    const created = parseTs(p.created_at);
    if (created !== null) events.push({ id: p.id, at: created, kind: 'created', title: p.title });
    const viewed = parseTs(p.viewed_at);
    if (viewed !== null) events.push({ id: p.id, at: viewed, kind: 'viewed', title: p.title });
    const paid = parseTs(p.paid_at);
    if (paid !== null) events.push({ id: p.id, at: paid, kind: 'paid', title: p.title });
  }
  return events.sort((a, b) => b.at - a.at).slice(0, 6);
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [designer, setDesigner] = useState<Designer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
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

        // Totals come from the aggregate endpoint; the project rows carry the
        // created_at / viewed_at / paid_at timestamps the charts are built from.
        const [analytics, projectList] = await Promise.all([
          apiService.getAnalytics(),
          apiService.getProjects()
        ]);
        setStats(analytics);
        setProjects(projectList);
      } catch (err) {
        console.error('Failed to load analytics', err);
        setLoadError(err instanceof Error ? err.message : 'Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  const views = useMemo(() => dailyViews(projects), [projects]);
  const revenue = useMemo(() => monthlyRevenue(projects), [projects]);
  const activity = useMemo(() => activityFeed(projects), [projects]);

  const viewsMax = useMemo(() => niceMaxCount(Math.max(...views.map(d => d.value))), [views]);
  const revenueMax = useMemo(() => niceMaxMoney(Math.max(...revenue.map(d => d.value))), [revenue]);

  const viewsTrend = useMemo(() => {
    const thisWeek = viewsBetween(projects, 6, -1);
    const priorWeek = viewsBetween(projects, 13, 6);
    if (priorWeek === 0) return thisWeek > 0 ? 100 : 0;
    return Math.round(((thisWeek - priorWeek) / priorWeek) * 100);
  }, [projects]);

  const outstandingRevenue = useMemo(
    () => projects.filter(p => p.status !== 'Paid').reduce((sum, p) => sum + p.price, 0),
    [projects]
  );
  const outstandingCount = projects.filter(p => p.status !== 'Paid').length;
  const revenueWindowTotal = revenue.reduce((sum, m) => sum + m.value, 0);

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

  const linePath = views
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i, views.length)},${scaleY(d.value, viewsMax)}`)
    .join(' ');
  const areaPath = `M ${PLOT.x0},${PLOT.yBottom} ${views
    .map((d, i) => `L ${scaleX(i, views.length)},${scaleY(d.value, viewsMax)}`)
    .join(' ')} L ${PLOT.x1},${PLOT.yBottom} Z`;
  const bandWidth = (PLOT.x1 - PLOT.x0) / revenue.length;

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

        {loadError && (
          <div className={`glass-panel ${styles.errorBanner}`} role="alert">
            {loadError}
          </div>
        )}

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
            <div className={styles.summaryValue}>₵{Math.round(outstandingRevenue).toLocaleString()}</div>
            <div className={styles.summaryChange}>
              Locked in {outstandingCount} unpaid preview{outstandingCount === 1 ? '' : 's'}
            </div>
          </div>

          <div className={`glass-panel ${styles.summaryCard}`}>
            <div className={styles.summaryLabel}>Conversion Rate</div>
            <div className={styles.summaryValue}>{stats.conversionRate}%</div>
            <div className={styles.summaryChange}>
              {stats.totalPaid} paid of {stats.totalProjects} proof{stats.totalProjects === 1 ? '' : 's'} created
            </div>
          </div>
        </section>

        {/* Charts Grid */}
        <section className={styles.chartsGrid}>
          {/* Chart 1: Line Chart - Weekly Proof Views */}
          <div className={`glass-panel ${styles.chartCard}`}>
            <div className={styles.chartHeader}>
              <div>
                <h3>Proofs Viewed (Last 7 Days)</h3>
                <p>First time each client opened a preview link</p>
              </div>
              <span className={viewsTrend < 0 ? styles.chartTagDown : styles.chartTag}>
                {viewsTrend < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                {viewsTrend > 0 ? '+' : ''}{viewsTrend}%
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
                {TICKS.map(t => (
                  <line
                    key={t}
                    x1={PLOT.x0}
                    y1={scaleY(t * viewsMax, viewsMax)}
                    x2={480}
                    y2={scaleY(t * viewsMax, viewsMax)}
                    stroke="var(--panel-border)"
                    strokeOpacity={t === 0 ? 0.9 : 0.4}
                  />
                ))}

                {TICKS.map(t => (
                  <text
                    key={t}
                    x="32"
                    y={scaleY(t * viewsMax, viewsMax) + 4}
                    textAnchor="end"
                    className={styles.chartText}
                  >
                    {Math.round(t * viewsMax)}
                  </text>
                ))}

                <path d={areaPath} fill="url(#lineGrad)" />

                <path
                  d={linePath}
                  fill="none"
                  stroke="var(--accent-green)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {views.map((d, i) => (
                  <circle
                    key={d.label}
                    cx={scaleX(i, views.length)}
                    cy={scaleY(d.value, viewsMax)}
                    r="3.5"
                    fill="var(--accent-green)"
                    stroke="var(--panel-bg)"
                    strokeWidth="1.5"
                  >
                    <title>{`${d.label}: ${d.value} viewed`}</title>
                  </circle>
                ))}

                {views.map((d, i) => (
                  <text
                    key={d.label}
                    x={scaleX(i, views.length)}
                    y="190"
                    textAnchor="middle"
                    className={styles.chartText}
                  >
                    {d.label}
                  </text>
                ))}
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
              <span className={styles.chartPrice}>
                Total: ₵{Math.round(revenueWindowTotal).toLocaleString()}
              </span>
            </div>
            <div className={styles.chartBody}>
              {/* Custom SVG Bar Chart */}
              <svg className={styles.svgChart} viewBox="0 0 500 200">
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-green)"/>
                    <stop offset="100%" stopColor="#10b981"/>
                  </linearGradient>
                </defs>

                {TICKS.map(t => (
                  <line
                    key={t}
                    x1={PLOT.x0}
                    y1={scaleY(t * revenueMax, revenueMax)}
                    x2={480}
                    y2={scaleY(t * revenueMax, revenueMax)}
                    stroke="var(--panel-border)"
                    strokeOpacity={t === 0 ? 0.9 : 0.4}
                  />
                ))}

                {TICKS.map(t => (
                  <text
                    key={t}
                    x="32"
                    y={scaleY(t * revenueMax, revenueMax) + 4}
                    textAnchor="end"
                    className={styles.chartText}
                  >
                    {t === 0 ? '0' : formatCedis(t * revenueMax)}
                  </text>
                ))}

                {/* Bars — the current month is highlighted; a zero month renders
                    as a flat baseline tick so the axis stays readable. */}
                {revenue.map((m, i) => {
                  const isCurrent = i === revenue.length - 1;
                  const centre = PLOT.x0 + bandWidth * (i + 0.5);
                  const barHeight = Math.max(m.value > 0 ? 2 : 0, PLOT.yBottom - scaleY(m.value, revenueMax));
                  return (
                    <rect
                      key={m.label}
                      x={centre - 15}
                      y={PLOT.yBottom - barHeight}
                      width="30"
                      height={barHeight}
                      rx="3"
                      fill={isCurrent ? 'url(#barGrad)' : 'var(--panel-bg-hover)'}
                      stroke={isCurrent ? 'none' : 'var(--panel-border)'}
                    >
                      <title>{`${m.label}: ₵${Math.round(m.value).toLocaleString()}`}</title>
                    </rect>
                  );
                })}

                {revenue.map((m, i) => (
                  <text
                    key={m.label}
                    x={PLOT.x0 + bandWidth * (i + 0.5)}
                    y="190"
                    textAnchor="middle"
                    className={styles.chartText}
                  >
                    {m.label}
                  </text>
                ))}
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
              <span title="Live log of proof creation, client views and payment unlocks">
                <HelpCircle size={15} className={styles.helpIcon} />
              </span>
            </div>
            
            <div className={styles.logList}>
              {activity.length === 0 && (
                <p className={styles.emptyNote}>
                  No activity yet. Upload a proof to start tracking views and payments.
                </p>
              )}

              {activity.map(event => (
                <div key={`${event.id}-${event.kind}`} className={styles.logItem}>
                  <span className={styles.logTime}>{relativeTime(event.at)}</span>
                  <span className={styles.logText}>
                    {event.kind === 'created' && <>Secured preview generated: <strong>{event.title}</strong></>}
                    {event.kind === 'viewed' && <>Client opened protected preview: <strong>{event.title}</strong></>}
                    {event.kind === 'paid' && <>Original file unlocked after payment: <strong>{event.title}</strong></>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
