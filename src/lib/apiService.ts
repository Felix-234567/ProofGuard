import { Project, Designer } from './db';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5059';

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
    return localStorage.getItem('pg_token');
  },

  // --- Auth & Profile ---
  async login(email: string): Promise<Designer> {
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

  async logout(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pg_token');
      localStorage.removeItem('pg_current_designer');
    }
  },

  async getCurrentUser(): Promise<Designer | null> {
    if (typeof window === 'undefined') return null;
    const designer = localStorage.getItem('pg_current_designer');
    return designer ? JSON.parse(designer) : null;
  },

  async updateProfile(profileData: {
    phone: string;
    payout_bank: string;
    account_number: string;
    business_name: string;
  }): Promise<Designer> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('No active session');
    
    const updated = {
      ...user,
      ...profileData,
      profile_completed: true
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('pg_current_designer', JSON.stringify(updated));
    }
    return updated;
  },

  // --- Designer Endpoints ---
  async getProjects(): Promise<Project[]> {
    const token = this.getToken();
    const res = await fetch(`${API_BASE_URL}/api/projects`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error(await res.text() || 'Failed to fetch projects');
    }

    const data = await res.json();
    return data.map(mapProjectToFrontend);
  },

  async getProject(id: string): Promise<Project> {
    const token = this.getToken();
    const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

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
    const formData = new FormData();
    formData.append('title', projectData.title);
    formData.append('clientEmail', projectData.client_email);
    formData.append('price', projectData.price.toString());
    formData.append('file', projectData.file);

    const res = await fetch(`${API_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
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
    // Delete is currently mocked since C# Web API does not expose DELETE route
    return new Promise((resolve) => setTimeout(resolve, 200));
  },

  async getAnalytics() {
    const token = this.getToken();
    const res = await fetch(`${API_BASE_URL}/api/projects/analytics`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

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

  async processPayment(token: string, cardDetails?: { cardNumber: string; expiry: string; cvc: string }): Promise<Project> {
    // Calls C# backend Paystack checkout initiation endpoint
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

    // If a Paystack checkout URL is returned, redirect to it
    if (payResponse.authorizationUrl) {
      window.location.href = payResponse.authorizationUrl;
      // Return a temporary state; the redirect will take over
      return new Promise(() => {}); 
    }

    // Dev bypass: immediately fetches the updated Paid project status
    return this.getPublicProject(token);
  },

  async downloadOriginal(token: string): Promise<string> {
    // Returns redirect download link
    return `${API_BASE_URL}/api/public/projects/${token}/download-original`;
  }
};
