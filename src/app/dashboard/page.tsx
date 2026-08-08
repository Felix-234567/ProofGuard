'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Shield, LogOut, Plus, Search, DollarSign, 
  Eye, FileText, CheckCircle2, Copy, Trash2, 
  UploadCloud, X, Calendar, User, ExternalLink, BarChart3
} from 'lucide-react';
import { apiService } from '@/lib/apiService';
import { Project, Designer } from '@/lib/db';
import { generateWatermarkedPreview } from '@/lib/watermark';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './dashboard.module.css';

export default function Dashboard() {
  const router = useRouter();
  const [designer, setDesigner] = useState<Designer | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalViewed: 0,
    totalPaid: 0,
    conversionRate: 0,
    totalEarnings: 0
  });

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // New Project Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [price, setPrice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [processingFile, setProcessingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  // Copy Feedback State
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load User Data & Projects
  const loadData = async () => {
    try {
      const user = await apiService.getCurrentUser();
      if (!user) {
        router.push('/');
        return;
      }

      // Check profile_completed status (from localStorage, updated by updateProfile)
      if (!user.profile_completed) {
        // Hard redirect to guarantee fresh component lifecycle
        window.location.href = '/dashboard/profile-setup';
        return;
      }
      setDesigner(user);
      
      const projs = await apiService.getProjects();
      setProjects(projs);
      
      const analytics = await apiService.getAnalytics();
      setStats(analytics);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [router]);

  const handleLogout = async () => {
    await apiService.logout();
    router.push('/');
  };

  // Copy Client Link
  const handleCopyLink = (token: string, projectId: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${origin}/preview/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(projectId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Delete Project
  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await apiService.deleteProject(id);
        await loadData();
      } catch (err) {
        alert('Failed to delete project');
      }
    }
  };

  // Handle Project Creation
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    
    if (!title || !clientEmail || !price || !file) {
      setSubmitError('Please fill in all fields and upload a design file.');
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      setSubmitError('Please enter a valid price.');
      return;
    }

    setSubmitLoading(true);
    setProcessingFile(true);

    try {
      // 2. Submit to C# backend (watermarking is processed server-side)
      await apiService.createProject({
        title,
        client_email: clientEmail,
        price: priceNum,
        file: file
      });

      // Reset form
      setTitle('');
      setClientEmail('');
      setPrice('');
      setFile(null);
      setIsModalOpen(false);
      
      // Refresh list & stats
      await loadData();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create project');
    } finally {
      setSubmitLoading(false);
      setProcessingFile(false);
    }
  };

  // File Selector drag-and-drop helpers
  const [dragActive, setDragActive] = useState(false);
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith('image/')) {
        setFile(droppedFile);
      } else {
        setSubmitError('Please upload an image file (PNG/JPG/WEBP).');
      }
    }
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) || 
                          p.client_email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <span className="loading-spinner" />
        <p>Loading your creative space...</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      {/* Top Navbar */}
      <header className={`glass-panel ${styles.header}`}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>
            <Shield className={styles.logoIcon} />
            <span>ProofGuard</span>
          </div>
          <nav className={styles.navLinks}>
            <button className={styles.activeNavLink}>Projects</button>
            <button onClick={() => router.push('/dashboard/analytics')} className={styles.navLink}>
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

      {/* Main Content Area */}
      <main className={styles.main}>
        {/* Metrics Grid */}
        <section className={styles.metricsGrid}>
          <div className={`glass-panel ${styles.metricCard} glow-purple-hover`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Total Earnings</span>
              <div className={`${styles.metricIconBg} ${styles.iconPurple}`}>
                <DollarSign size={20} />
              </div>
            </div>
            <span className={styles.metricVal}>${stats.totalEarnings.toLocaleString()}</span>
            <p className={styles.metricSub}>Unlocked upon file delivery</p>
          </div>

          <div className={`glass-panel ${styles.metricCard} glow-blue-hover`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Conversion Rate</span>
              <div className={`${styles.metricIconBg} ${styles.iconBlue}`}>
                <CheckCircle2 size={20} />
              </div>
            </div>
            <span className={styles.metricVal}>{stats.conversionRate}%</span>
            <p className={styles.metricSub}>Client views that converted to paid</p>
          </div>

          <div className={`glass-panel ${styles.metricCard} glow-blue-hover`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Viewed Projects</span>
              <div className={`${styles.metricIconBg} ${styles.iconCyan}`}>
                <Eye size={20} />
              </div>
            </div>
            <span className={styles.metricVal}>{stats.totalViewed}</span>
            <p className={styles.metricSub}>Previews accessed by clients</p>
          </div>

          <div className={`glass-panel ${styles.metricCard} glow-purple-hover`}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Total Proofs</span>
              <div className={`${styles.metricIconBg} ${styles.iconPink}`}>
                <FileText size={20} />
              </div>
            </div>
            <span className={styles.metricVal}>{stats.totalProjects}</span>
            <p className={styles.metricSub}>Active projects shared</p>
          </div>
        </section>

        {/* Action Bar */}
        <section className={styles.actionBar}>
          <div className={styles.searchFilterGroup}>
            <div className={styles.searchWrapper}>
              <Search className={styles.searchIcon} size={18} />
              <input
                type="text"
                placeholder="Search projects or clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
              />
            </div>
            
            <div className={styles.filterWrapper}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`form-input ${styles.selectInput}`}
              >
                <option value="all">All Projects</option>
                <option value="not viewed">Not Viewed</option>
                <option value="viewed">Viewed</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>

          <button onClick={() => setIsModalOpen(true)} className="btn btn-primary">
            <Plus size={18} />
            <span>Create New Proof</span>
          </button>
        </section>

        {/* Project Listings Grid */}
        <section className={styles.projectListings}>
          {filteredProjects.length === 0 ? (
            <div className={`glass-panel ${styles.emptyState}`}>
              <FileText size={48} className={styles.emptyIcon} />
              <h3>No projects found</h3>
              <p>Create your first project proof to start delivering safely.</p>
              <button onClick={() => setIsModalOpen(true)} className="btn btn-secondary">
                <Plus size={16} />
                <span>Upload Now</span>
              </button>
            </div>
          ) : (
            <div className={styles.projectGrid}>
              {filteredProjects.map((p) => {
                // Determine Badge styling class
                let badgeClass = 'badge-not-viewed';
                if (p.status === 'Viewed') badgeClass = 'badge-viewed';
                if (p.status === 'Paid') badgeClass = 'badge-paid';

                return (
                  <div key={p.id} className={`glass-panel glass-panel-hover ${styles.projectCard}`}>
                    {/* Visual Thumbnail Preview */}
                    <div className={styles.cardThumbnailContainer}>
                      {p.public_link_token ? (
                        <img 
                          src={apiService.getPreviewUrl(p.public_link_token)} 
                          alt={p.title} 
                          className={styles.cardThumbnail} 
                          onContextMenu={(e) => e.preventDefault()}
                        />
                      ) : (
                        <div className={styles.thumbnailPlaceholder}>
                          <FileText size={28} />
                        </div>
                      )}
                      <span className={`badge ${badgeClass} ${styles.cardBadge}`}>{p.status}</span>
                    </div>

                    <div className={styles.cardContent}>
                      <div className={styles.cardHeaderArea}>
                        <h3 className={styles.cardTitle}>{p.title}</h3>
                        <span className={styles.cardPrice}>${p.price.toLocaleString()}</span>
                      </div>
                      
                      <div className={styles.cardInfoGrid}>
                        <div className={styles.infoRow}>
                          <User size={14} className={styles.infoIcon} />
                          <span>{p.client_email}</span>
                        </div>
                        <div className={styles.infoRow}>
                          <Calendar size={14} className={styles.infoIcon} />
                          <span>{new Date(p.created_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}</span>
                        </div>
                      </div>

                      <div className={styles.cardActions}>
                        <button 
                          onClick={() => handleCopyLink(p.public_link_token, p.id)}
                          className={`btn btn-secondary ${styles.actionBtn}`}
                          title="Copy Client Link"
                        >
                          {copiedId === p.id ? (
                            <>
                              <CheckCircle2 size={15} className={styles.copiedIcon} />
                              <span className={styles.copiedText}>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={15} />
                              <span>Link</span>
                            </>
                          )}
                        </button>

                        <a 
                          href={`/preview/${p.public_link_token}`} 
                          target="_blank"
                          rel="noreferrer"
                          className={`btn btn-secondary ${styles.actionBtn}`}
                          title="View Preview Page"
                        >
                          <ExternalLink size={15} />
                          <span>Open</span>
                        </a>

                        <button 
                          onClick={() => handleDelete(p.id)}
                          className={`btn btn-danger ${styles.deleteBtn}`}
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Upload/Creation Modal */}
      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={`glass-panel ${styles.modal} animate-fade-in`}>
            <div className={styles.modalHeader}>
              <h2>Create Project Proof</h2>
              <button onClick={() => setIsModalOpen(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            {submitError && <div className={styles.submitError}>{submitError}</div>}

            <form onSubmit={handleCreateProject} className={styles.modalForm}>
              <div className="form-group">
                <label className="form-label" htmlFor="proj-title">Project Title</label>
                <input
                  id="proj-title"
                  type="text"
                  placeholder="e.g. Zenith Agency Logo Design"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="form-input"
                  disabled={submitLoading}
                  required
                />
              </div>

              <div className={styles.formRow}>
                <div className="form-group" style={{ flex: 1.5 }}>
                  <label className="form-label" htmlFor="client-email">Client Email</label>
                  <input
                    id="client-email"
                    type="email"
                    placeholder="client@company.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="form-input"
                    disabled={submitLoading}
                    required
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" htmlFor="proj-price">Price (USD)</label>
                  <input
                    id="proj-price"
                    type="number"
                    placeholder="1200"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="form-input"
                    disabled={submitLoading}
                    required
                  />
                </div>
              </div>

              {/* Drag and Drop File Input */}
              <div className="form-group">
                <label className="form-label">Upload Design File (Original)</label>
                <div 
                  className={`${styles.dragArea} ${dragActive ? styles.dragActive : ''} ${file ? styles.fileLoaded : ''}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    id="file-upload"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setFile(e.target.files[0]);
                      }
                    }}
                    className={styles.fileInput}
                    disabled={submitLoading}
                  />
                  <label htmlFor="file-upload" className={styles.dragLabel}>
                    {file ? (
                      <div className={styles.fileDetails}>
                        <FileText size={32} className={styles.fileIcon} />
                        <span className={styles.fileName}>{file.name}</span>
                        <span className={styles.fileSize}>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                        <span className={styles.changeFile}>Click to replace</span>
                      </div>
                    ) : (
                      <div className={styles.dragContent}>
                        <UploadCloud size={36} className={styles.uploadIcon} />
                        <span className={styles.dragText}>Drag & drop original file here or <span className={styles.browseText}>browse</span></span>
                        <span className={styles.dragSub}>Supports PNG, JPG, WEBP (Max 10MB)</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="btn btn-secondary"
                  disabled={submitLoading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={submitLoading}
                >
                  {submitLoading ? (
                    <>
                      <span className="loading-spinner" />
                      <span>{processingFile ? 'Watermarking...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <span>Create & Share</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
