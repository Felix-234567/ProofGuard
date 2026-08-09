import { Project, Designer } from './db';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://proofguard.onrender.com';

function mapProjectToFrontend(p: any): Project {
  return {
    id: p.id,
    designer_id: p.designerId || p.designer_id || "",
    title: p.title,
    client_email: p.clientEmail || p.client_email || "",
    price: p.price,
    status: p.status,
    original_file_key: p.originalFileKey || p.original_file_key || "",
    preview_file_key: p.previewFileKey || p.preview_file_key || "",
    public_link_token: p.publicLinkToken || p.public_link_token || "",
    created_at: p.createdAt || p.created_at || "",
    viewed_at: p.viewedAt || p.viewed_at || undefined,
    paid_at: p.paidAt || p.paid_at || undefined
  };
}

export const apiService = {
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('pg_token');
    // Guard against the literal string "null" or empty token
    if (!token || token === 'null' || token === 'undefined') return null;
    return token;
  },

  /**
   * Try to refresh the Firebase ID token. Firebase ID tokens expire after
   * ~1 hour — if Firebase still has a live session, this returns a brand-new
   * token; otherwise (session revoked/signed out) it returns null.
   */
  async refreshToken(): Promise<string | null> {
    try {
      const { getCurrentFirebaseUser, refreshIdToken } = await import('./firebase');
      const user = getCurrentFirebaseUser();
      if (!user) return null;
      const freshToken = await refreshIdToken(user);
      if (typeof window !== 'undefined') {
        localStorage.setItem('pg_token', freshToken);
      }
      return freshToken;
    } catch {
      // Firebase not configured, no current user, or refresh failed
      return null;
    }
  },

  /**
   * Authenticated fetch that transparently refreshes an expired Firebase ID
   * token. On a 401 it refreshes once and retries; if refresh fails the
   * session is cleared and a clear "sign in again" error is thrown.
   */
  async authedFetch(path: string, init?: RequestInit, retried = false): Promise<Response> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No auth token found. Please sign in again.');
    }

    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.status === 401 && !retried) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        return this.authedFetch(path, init, true);
      }
      // Refresh failed — the session is truly gone; clean up and ask to sign in.
      await this.logout();
      throw new Error('Session expired. Please sign in again.');
    }

    return res;
  },

  // --- Auth & Profile ---
  /**
   * Store a Firebase session after successful authentication.
   * Saves the Firebase ID token and designer profile to localStorage.
   */
  setFirebaseSession(idToken: string, user: { uid: string; email: string | null; displayName?: string | null }): Designer {
    const designer: Designer = {
      id: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email || '',
      created_at: new Date().toISOString()
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('pg_token', idToken);
      localStorage.setItem('pg_current_designer', JSON.stringify(designer));
    }
    return designer;
  },

  /**
   * Authenticate via Firebase email/password.
   * Falls back to mock localStorage auth when Firebase is not configured.
   */
  async login(email: string, password?: string): Promise<Designer> {
    // Try Firebase first if password is provided
    if (password) {
      try {
        const { signIn, getFirebaseToken } = await import('./firebase');
        const firebaseUser = await signIn(email, password);
        const idToken = await getFirebaseToken(firebaseUser);
        return this.setFirebaseSession(idToken, firebaseUser);
      } catch (fbErr: any) {
        // If Firebase isn't configured (config error), fall through to mock
        if (fbErr.message?.includes('Firebase is not configured')) {
          // fall through to mock below
        } else {
          throw fbErr; // Real Firebase error — surface it
        }
      }
    }

    // Fallback: mock localStorage auth (for dev when Firebase isn't configured)
    const mockToken = `mock-token-${email}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem('pg_token', mockToken);
      const designer: Designer = {
        id: email,
        name: email.split('@')[0],
        email: email,
        created_at: new Date().toISOString()
      };
      localStorage.setItem('pg_current_designer', JSON.stringify(designer));
      return designer;
    }
    throw new Error("Local storage not accessible");
  },

  /**
   * Sign up via Firebase email/password.
   * Falls back to mock when Firebase is not configured.
   */
  async signup(email: string, password: string, displayName?: string): Promise<Designer> {
    try {
      const { signUp, getFirebaseToken } = await import('./firebase');
      const firebaseUser = await signUp(email, password);
      const idToken = await getFirebaseToken(firebaseUser);
      return this.setFirebaseSession(idToken, {
        uid: firebaseUser.uid,
        email: firebaseUser.email || email,
        displayName: displayName || firebaseUser.displayName
      });
    } catch (fbErr: any) {
      if (fbErr.message?.includes('Firebase is not configured')) {
        // Fallback: same as login mock
        return this.login(email);
      }
      throw fbErr;
    }
  },

  /**
   * Sign in with Google via Firebase popup.
   */
  async signInWithGoogle(): Promise<Designer> {
    try {
      const { signInWithGoogle: firebaseGoogleSignIn, getFirebaseToken } = await import('./firebase');
      const firebaseUser = await firebaseGoogleSignIn();
      const idToken = await getFirebaseToken(firebaseUser);
      return this.setFirebaseSession(idToken, {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName
      });
    } catch (fbErr: any) {
      if (fbErr.message?.includes('Firebase is not configured') || 
          fbErr?.code === 'auth/popup-blocked') {
        throw fbErr;
      }
      // Handle Firebase Google auth errors gracefully
      throw new Error(fbErr?.message || 'Google sign-in failed. Please try again.');
    }
  },

  async logout(): Promise<void> {
    // Try Firebase sign-out, ignore if not configured
    try {
      const { signOutUser } = await import('./firebase');
      await signOutUser();
    } catch { /* Firebase not configured — ignore */ }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('pg_token');
      localStorage.removeItem('pg_current_designer');
    }
  },

  async getCurrentUser(): Promise<Designer | null> {
    if (typeof window === 'undefined') return null;
    // Must have both a valid token AND a designer profile to be considered logged in
    const token = this.getToken();
    if (!token) {
      // Clean up stale designer data if token is missing
      localStorage.removeItem('pg_current_designer');
      return null;
    }
    const designer = localStorage.getItem('pg_current_designer');
    if (!designer) {
      // Clean up stale token if designer data is missing
      localStorage.removeItem('pg_token');
      return null;
    }
    return JSON.parse(designer);
  },

  /** GET /api/designers/profile — the authenticated designer's full profile. */
  async getProfile(): Promise<Designer> {
    const res = await this.authedFetch('/api/designers/profile');
    if (!res.ok) {
      const errMsg = await res.text();
      throw new Error(errMsg || 'Failed to load profile');
    }
    return res.json();
  },

  async updateProfile(profileData: {
    phone: string;
    momo_provider: string;
    momo_number: string;
    business_name: string;
  }): Promise<Designer> {
    const res = await this.authedFetch('/api/designers/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        business_name: profileData.business_name,
        phone: profileData.phone,
        momo_provider: profileData.momo_provider,
        momo_number: profileData.momo_number
      })
    });

    if (!res.ok) {
      const errMsg = await res.text();
      throw new Error(errMsg || 'Failed to update profile');
    }

    const updatedDesigner = await res.json();

    // Also update localStorage so the frontend Designer cache stays in sync
    if (typeof window !== 'undefined') {
      const localDesigner = await this.getCurrentUser();
      if (localDesigner) {
        const merged = {
          ...localDesigner,
          ...updatedDesigner,
          profile_completed: true
        };
        localStorage.setItem('pg_current_designer', JSON.stringify(merged));
      }
    }

    return updatedDesigner;
  },

  // --- Designer Endpoints ---
  async getProjects(): Promise<Project[]> {
    const res = await this.authedFetch('/api/projects');

    if (!res.ok) {
      throw new Error(await res.text() || 'Failed to fetch projects');
    }

    const data = await res.json();
    return data.map(mapProjectToFrontend);
  },

  async getProject(id: string): Promise<Project> {
    const res = await this.authedFetch(`/api/projects/${id}`);

    if (!res.ok) {
      throw new Error('Project not found');
    }

    const data = await res.json();
    return mapProjectToFrontend(data);
  },

  async createProject(projectData: {
    title: string;
    client_email: string;
    price: number;
    file: File;
  }): Promise<Project> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No auth token found. Please sign in again.');
    }
    const formData = new FormData();
    formData.append('title', projectData.title);
    formData.append('clientEmail', projectData.client_email);
    formData.append('price', projectData.price.toString());
    formData.append('file', projectData.file);

    const res = await this.authedFetch('/api/projects', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const errMsg = await res.text();
      throw new Error(errMsg || 'Failed to create project');
    }

    const data = await res.json();
    return mapProjectToFrontend(data);
  },

  async deleteProject(id: string): Promise<void> {
    const res = await this.authedFetch(`/api/projects/${id}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const errMsg = await res.text();
      throw new Error(errMsg || 'Failed to delete project');
    }
  },

  async getAnalytics() {
    const res = await this.authedFetch('/api/projects/analytics');

    if (!res.ok) {
      throw new Error('Failed to load analytics');
    }

    const data = await res.json();
    return {
      totalProjects: data.totalProjects,
      totalViewed: data.viewedProjects,
      totalPaid: data.paidProjects,
      conversionRate: Math.round(data.conversionRate * 100),
      totalEarnings: data.totalEarnings,
      recentProjects: [] // will be loaded from getProjects() on the dashboard page
    };
  },

  // --- Public / Client Endpoints ---
  async getPublicProject(token: string): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/api/public/projects/${token}`);
    if (!res.ok) {
      throw new Error('Project not found');
    }
    const data = await res.json();
    return mapProjectToFrontend(data);
  },

  async markProjectAsViewed(token: string): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/api/public/projects/${token}/view`, {
      method: 'POST'
    });
    if (!res.ok) {
      throw new Error('Failed to mark project as viewed');
    }
    const data = await res.json();
    return mapProjectToFrontend(data);
  },

  async processPayment(token: string): Promise<Project> {
    const res = await fetch(`${API_BASE_URL}/api/public/projects/${token}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const errMsg = await res.text();
      throw new Error(errMsg || 'Payment process failed');
    }

    const payResponse = await res.json();

    if (payResponse.authorizationUrl) {
      window.location.href = payResponse.authorizationUrl;
      return new Promise(() => {});
    }

    return this.getPublicProject(token);
  },

  async verifyPayment(token: string): Promise<boolean> {
    const res = await fetch(`${API_BASE_URL}/api/public/projects/${token}/verify-payment`);

    if (!res.ok) {
      return false;
    }

    const data = await res.json();
    return data.verified === true;
  },

  getPreviewUrl(token: string): string {
    return `${API_BASE_URL}/api/public/projects/${token}/download-preview`;
  },

  async downloadOriginal(token: string): Promise<string> {
    // Returns redirect download link
    return `${API_BASE_URL}/api/public/projects/${token}/download-original`;
  }
};
