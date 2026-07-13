import { MockDB, Project, Designer } from './db';

// Simulate network latency (e.g. 500ms)
const delay = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms));

export const apiService = {
  // --- Auth Simulation ---
  async login(email: string): Promise<Designer> {
    await delay(600);
    const designer: Designer = {
      id: "des_ray",
      name: email.split('@')[0],
      email: email,
      created_at: new Date().toISOString()
    };
    MockDB.setCurrentDesigner(designer);
    return designer;
  },

  async logout(): Promise<void> {
    await delay(300);
    MockDB.setCurrentDesigner(null);
  },

  async getCurrentUser(): Promise<Designer | null> {
    return MockDB.getCurrentDesigner();
  },

  async updateProfile(profileData: {
    phone: string;
    payout_bank: string;
    account_number: string;
    business_name: string;
  }): Promise<Designer> {
    await delay(500);
    return MockDB.updateDesignerProfile(profileData);
  },

  // --- Designer Endpoints ---
  async getProjects(): Promise<Project[]> {
    await delay(400);
    return MockDB.getProjects();
  },

  async getProject(id: string): Promise<Project> {
    await delay(300);
    const proj = MockDB.getProject(id);
    if (!proj) throw new Error('Project not found');
    return proj;
  },

  async createProject(projectData: {
    title: string;
    client_email: string;
    price: number;
    original_file_key: string;
    preview_file_key: string;
  }): Promise<Project> {
    await delay(800);
    const id = `proj_${Math.random().toString(36).substr(2, 9)}`;
    const public_link_token = `${projectData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).substr(2, 5)}`;
    
    const newProject = MockDB.saveProject({
      id,
      title: projectData.title,
      client_email: projectData.client_email,
      price: projectData.price,
      status: 'Not Viewed',
      original_file_key: projectData.original_file_key,
      preview_file_key: projectData.preview_file_key,
      public_link_token
    });

    return newProject;
  },

  async deleteProject(id: string): Promise<void> {
    await delay(400);
    const success = MockDB.deleteProject(id);
    if (!success) throw new Error('Project not found');
  },

  async getAnalytics() {
    await delay(500);
    return MockDB.getAnalytics();
  },

  // --- Public / Client Endpoints ---
  async getPublicProject(token: string): Promise<Project> {
    await delay(600);
    const proj = MockDB.getProjectByToken(token);
    if (!proj) throw new Error('Project not found');
    return proj;
  },

  async markProjectAsViewed(token: string): Promise<Project> {
    await delay(200);
    const proj = MockDB.markAsViewed(token);
    if (!proj) throw new Error('Project not found');
    return proj;
  },

  async processPayment(token: string, cardDetails: { cardNumber: string; expiry: string; cvc: string }): Promise<Project> {
    await delay(1800); // simulate stripe checkout verification time
    
    if (!cardDetails.cardNumber || cardDetails.cardNumber.replace(/\s/g, '').length !== 16) {
      throw new Error('Invalid card details');
    }
    
    const mockRef = `ch_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const proj = MockDB.markAsPaid(token, mockRef);
    if (!proj) throw new Error('Payment process failed');
    return proj;
  },

  async downloadOriginal(token: string): Promise<string> {
    await delay(500);
    const proj = MockDB.getProjectByToken(token);
    if (!proj || proj.status !== 'Paid') {
      throw new Error('Access denied. Payment required.');
    }
    // Return original source file (which is a base64 encoded dataUrl)
    return proj.original_file_key;
  }
};
