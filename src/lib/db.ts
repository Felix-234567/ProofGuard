// Interface definitions
export interface Designer {
  id: string;
  name: string;
  email: string;
  created_at: string;
  phone?: string;
  payout_bank?: string;
  account_number?: string;
  business_name?: string;
  profile_completed?: boolean;
}

export interface Project {
  id: string;
  designer_id: string;
  title: string;
  client_email: string;
  price: number;
  status: 'Not Viewed' | 'Viewed' | 'Paid';
  original_file_key: string; // original image filename / base64 data
  preview_file_key: string;  // watermarked image base64 data
  public_link_token: string;
  created_at: string;
  viewed_at?: string;
  paid_at?: string;
}

export interface Payment {
  id: string;
  project_id: string;
  amount: number;
  payment_provider_ref: string;
  status: 'Pending' | 'Completed' | 'Failed';
  created_at: string;
}

// Initial mock projects data
const INITIAL_PROJECTS: Project[] = [
  {
    id: "proj_1",
    designer_id: "des_ray",
    title: "Brand Identity - Zenith Agency",
    client_email: "hello@zenithagency.co",
    price: 1800,
    status: "Paid",
    original_file_key: "/next.svg", // Use a placeholder path
    preview_file_key: "",
    public_link_token: "zenith-brand-identity-xyz",
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
    viewed_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    paid_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "proj_2",
    designer_id: "des_ray",
    title: "Mobile App Mockups - E-Shop",
    client_email: "product@eshop-intl.com",
    price: 3200,
    status: "Viewed",
    original_file_key: "/next.svg",
    preview_file_key: "",
    public_link_token: "eshop-mobile-screens-abc",
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    viewed_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "proj_3",
    designer_id: "des_ray",
    title: "Packaging Design - Bloom Botanical",
    client_email: "design@bloombotany.org",
    price: 950,
    status: "Not Viewed",
    original_file_key: "/next.svg",
    preview_file_key: "",
    public_link_token: "bloom-packaging-123",
    created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
  }
];

// Helper to check if running in browser
const isBrowser = () => typeof window !== 'undefined';

// Mock DB Controller
export const MockDB = {
  // --- Designers ---
  getCurrentDesigner(): Designer | null {
    if (!isBrowser()) return null;
    const designer = localStorage.getItem('pg_current_designer');
    if (!designer) {
      return null;
    }
    return JSON.parse(designer);
  },

  setCurrentDesigner(designer: Designer | null) {
    if (!isBrowser()) return;
    if (designer) {
      localStorage.setItem('pg_current_designer', JSON.stringify(designer));
    } else {
      localStorage.removeItem('pg_current_designer');
    }
  },

  updateDesignerProfile(profileData: {
    phone: string;
    payout_bank: string;
    account_number: string;
    business_name: string;
  }): Designer {
    const designer = this.getCurrentDesigner();
    if (!designer) throw new Error('No active session');
    
    const updated = {
      ...designer,
      ...profileData,
      profile_completed: true
    };
    this.setCurrentDesigner(updated);
    return updated;
  },

  // --- Projects ---
  getProjects(): Project[] {
    if (!isBrowser()) return [];
    const data = localStorage.getItem('pg_projects');
    if (!data) {
      // Initialize with default mock data
      localStorage.setItem('pg_projects', JSON.stringify(INITIAL_PROJECTS));
      return INITIAL_PROJECTS;
    }
    return JSON.parse(data);
  },

  getProject(id: string): Project | null {
    const projects = this.getProjects();
    return projects.find(p => p.id === id) || null;
  },

  getProjectByToken(token: string): Project | null {
    const projects = this.getProjects();
    return projects.find(p => p.public_link_token === token) || null;
  },

  saveProject(project: Omit<Project, 'designer_id' | 'created_at'>): Project {
    const designer = this.getCurrentDesigner();
    const newProject: Project = {
      ...project,
      designer_id: designer?.id || "des_ray",
      created_at: new Date().toISOString()
    };

    const projects = this.getProjects();
    // Update or Insert
    const idx = projects.findIndex(p => p.id === newProject.id);
    if (idx >= 0) {
      projects[idx] = newProject;
    } else {
      projects.push(newProject);
    }
    localStorage.setItem('pg_projects', JSON.stringify(projects));
    return newProject;
  },

  deleteProject(id: string): boolean {
    const projects = this.getProjects();
    const filtered = projects.filter(p => p.id !== id);
    if (filtered.length !== projects.length) {
      localStorage.setItem('pg_projects', JSON.stringify(filtered));
      return true;
    }
    return false;
  },

  // --- Client Side Actions ---
  markAsViewed(token: string): Project | null {
    const projects = this.getProjects();
    const idx = projects.findIndex(p => p.public_link_token === token);
    if (idx >= 0) {
      const proj = projects[idx];
      // Only set Viewed status if not already Paid
      if (proj.status === 'Not Viewed') {
        proj.status = 'Viewed';
        proj.viewed_at = new Date().toISOString();
        projects[idx] = proj;
        localStorage.setItem('pg_projects', JSON.stringify(projects));
      }
      return proj;
    }
    return null;
  },

  markAsPaid(token: string, paymentRef: string): Project | null {
    const projects = this.getProjects();
    const idx = projects.findIndex(p => p.public_link_token === token);
    if (idx >= 0) {
      const proj = projects[idx];
      if (proj.status !== 'Paid') {
        proj.status = 'Paid';
        proj.paid_at = new Date().toISOString();
        projects[idx] = proj;
        localStorage.setItem('pg_projects', JSON.stringify(projects));

        // Save a mock payment record
        const payment: Payment = {
          id: `pay_${Math.random().toString(36).substr(2, 9)}`,
          project_id: proj.id,
          amount: proj.price,
          payment_provider_ref: paymentRef,
          status: 'Completed',
          created_at: new Date().toISOString()
        };
        const payments = this.getPayments();
        payments.push(payment);
        localStorage.setItem('pg_payments', JSON.stringify(payments));
      }
      return proj;
    }
    return null;
  },

  // --- Payments ---
  getPayments(): Payment[] {
    if (!isBrowser()) return [];
    const data = localStorage.getItem('pg_payments');
    if (!data) {
      // Add default mock payment for our paid project
      const initialPayments: Payment[] = [
        {
          id: "pay_1",
          project_id: "proj_1",
          amount: 1800,
          payment_provider_ref: "ch_mock_123456",
          status: "Completed",
          created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
        }
      ];
      localStorage.setItem('pg_payments', JSON.stringify(initialPayments));
      return initialPayments;
    }
    return JSON.parse(data);
  },

  // --- Analytics Helper ---
  getAnalytics() {
    const projects = this.getProjects();
    const totalProjects = projects.length;
    const totalViewed = projects.filter(p => p.status === 'Viewed' || p.status === 'Paid').length;
    const totalPaid = projects.filter(p => p.status === 'Paid').length;
    
    const conversionRate = totalViewed > 0 
      ? Math.round((totalPaid / totalViewed) * 100) 
      : 0;

    const totalEarnings = projects
      .filter(p => p.status === 'Paid')
      .reduce((sum, p) => sum + p.price, 0);

    return {
      totalProjects,
      totalViewed,
      totalPaid,
      conversionRate,
      totalEarnings,
      recentProjects: projects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5)
    };
  }
};
