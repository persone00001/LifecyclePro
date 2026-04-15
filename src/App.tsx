import React, { useState, useEffect, useMemo } from 'react';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  serverTimestamp, 
  where,
  limit,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { 
  LayoutDashboard, 
  Package, 
  Truck, 
  Factory, 
  Users, 
  MessageSquare, 
  Plus, 
  ChevronRight, 
  LogOut, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Send,
  FileText,
  History,
  Menu,
  X,
  Edit2,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { cn } from './lib/utils';

// --- Types ---
type Role = 'Commercial' | 'Coordinator' | 'Logistics' | 'Production' | 'Admin';

interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: Role;
  department: string;
}

interface Project {
  id: string;
  title: string;
  description: string;
  type: 'Transformation' | 'Impression' | 'Finition';
  quantity: number;
  unit: string;
  deadline: string;
  clientName: string;
  status: 'Created' | 'Reviewed' | 'Waiting Materials' | 'Transferring' | 'Ready' | 'In Production' | 'Finished';
  createdBy: string;
  createdAt: any;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  projectId?: string;
  department?: string;
  content: string;
  createdAt: any;
}

// --- Constants ---
const STATUS_STEPS = [
  'Created', 
  'Reviewed', 
  'Waiting Materials', 
  'Transferring', 
  'Ready', 
  'In Production', 
  'Finished'
];

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  'Commercial': ['create_project', 'view_all'],
  'Coordinator': ['review_project', 'view_all', 'manage_stock'],
  'Logistics': ['create_transfer', 'view_all', 'manage_stock'],
  'Production': ['update_production', 'view_all'],
  'Admin': ['all']
};

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full px-3 py-2 rounded-md transition-colors text-sm",
      active 
        ? "bg-slate-900 text-white" 
        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
    )}
  >
    <Icon size={18} strokeWidth={2} />
    <span className="font-medium">{label}</span>
  </button>
);

const StatusBadge = ({ status }: { status: Project['status'] }) => {
  const translations: Record<string, string> = {
    'Created': 'Créé',
    'Reviewed': 'Révisé',
    'Waiting Materials': 'En attente de matériel',
    'Transferring': 'En transfert',
    'Ready': 'Prêt',
    'In Production': 'En production',
    'Finished': 'Terminé',
  };
  const colors: Record<string, string> = {
    'Created': 'bg-slate-100 text-slate-600 border-slate-200',
    'Reviewed': 'bg-blue-50 text-blue-600 border-blue-100',
    'Waiting Materials': 'bg-amber-50 text-amber-600 border-amber-100',
    'Transferring': 'bg-purple-50 text-purple-600 border-purple-100',
    'Ready': 'bg-emerald-50 text-emerald-600 border-emerald-100',
    'In Production': 'bg-indigo-50 text-indigo-600 border-indigo-100',
    'Finished': 'bg-green-50 text-green-600 border-green-100',
  };
  return (
    <span className={cn("px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider", colors[status])}>
      {translations[status] || status}
    </span>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string, onConfirm: () => void } | null>(null);
  const [projectFilters, setProjectFilters] = useState({
    status: 'all',
    client: 'all',
    type: 'all'
  });

  // Close sidebar on tab change (mobile)
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleNavigate = (tab: string, filters?: any) => {
    setActiveTab(tab);
    if (filters) {
      setProjectFilters(prev => ({ ...prev, ...filters }));
    }
  };

  // --- One-time Database Cleanup & Seeding ---
  useEffect(() => {
    const resetDatabase = async () => {
      // Only run if user is Admin and we haven't reset in this session/browser
      if (appUser?.role === 'Admin' && !localStorage.getItem('lifecycle_db_reset_v2')) {
        try {
          console.log("Starting database cleanup...");
          
          // 1. Delete existing projects (using current state)
          if (projects.length > 0) {
            for (const p of projects) {
              await deleteDoc(doc(db, 'projects', p.id));
            }
          }

          // 2. Seed new diverse test data
          const newTestData = [
            {
              title: 'Transformation Acier Industriel',
              description: 'Découpe laser et pliage pour structures métalliques.',
              type: 'Transformation',
              quantity: 250,
              unit: 'kg',
              deadline: format(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
              clientName: 'BTP Construction',
              status: 'In Production',
              createdBy: appUser.uid,
              createdAt: serverTimestamp()
            },
            {
              title: 'Impression Catalogues 2024',
              description: 'Impression offset haute qualité, 48 pages.',
              type: 'Impression',
              quantity: 2000,
              unit: 'feuille',
              deadline: format(new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
              clientName: 'Mode & Style',
              status: 'Reviewed',
              createdBy: appUser.uid,
              createdAt: serverTimestamp()
            },
            {
              title: 'Finition Vernis Sélectif',
              description: 'Application de vernis UV sur couvertures.',
              type: 'Finition',
              quantity: 800,
              unit: 'feuille',
              deadline: format(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
              clientName: 'Graphique Design',
              status: 'Ready',
              createdBy: appUser.uid,
              createdAt: serverTimestamp()
            },
            {
              title: 'Transfert Bobines Alu',
              description: 'Logistique interne vers atelier B.',
              type: 'Transformation',
              quantity: 500,
              unit: 'kg',
              deadline: format(new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
              clientName: 'AluNord',
              status: 'Transferring',
              createdBy: appUser.uid,
              createdAt: serverTimestamp()
            },
            {
              title: 'Impression Affiches A2',
              description: 'Série limitée pour exposition.',
              type: 'Impression',
              quantity: 150,
              unit: 'feuille',
              deadline: format(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
              clientName: 'Musée des Arts',
              status: 'Created',
              createdBy: appUser.uid,
              createdAt: serverTimestamp()
            }
          ];

          for (const p of newTestData) {
            await addDoc(collection(db, 'projects'), p);
          }

          localStorage.setItem('lifecycle_db_reset_v2', 'true');
          console.log("Database reset and seeded successfully.");
        } catch (error) {
          console.error("Error during database reset:", error);
        }
      }
    };

    if (appUser && projects.length >= 0) {
      resetDatabase();
    }
  }, [appUser, projects]);

  // --- Sync selected project with live data ---
  useEffect(() => {
    if (selectedProject) {
      const updated = projects.find(p => p.id === selectedProject.id);
      if (updated && (updated.status !== selectedProject.status || updated.title !== selectedProject.title)) {
        setSelectedProject(updated);
      }
    }
  }, [projects, selectedProject]);

  // --- Auth & User Setup ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      try {
        setUser(u);
        if (u) {
          const userDocRef = doc(db, 'users', u.uid);
          const userDoc = await getDoc(userDocRef);
          
          const isAdminEmail = u.email === 'persone00001@gmail.com';
          
          if (userDoc.exists()) {
            const data = userDoc.data() as AppUser;
            // Force Admin role if email matches, even if document exists
            if (isAdminEmail && data.role !== 'Admin') {
              await updateDoc(userDocRef, { role: 'Admin', department: 'Management' });
              setAppUser({ ...data, role: 'Admin', department: 'Management' });
            } else {
              setAppUser(data);
            }
          } else {
            // Check for a name in localStorage if it was just set during signup
            const pendingName = localStorage.getItem('pending_signup_name');
            const newUser: AppUser = {
              uid: u.uid,
              name: u.displayName || pendingName || u.email?.split('@')[0] || 'User',
              email: u.email || '',
              role: isAdminEmail ? 'Admin' : 'Commercial',
              department: isAdminEmail ? 'Management' : 'Sales'
            };
            await setDoc(userDocRef, newUser);
            setAppUser(newUser);
            localStorage.removeItem('pending_signup_name');
          }
        } else {
          setAppUser(null);
        }
      } catch (error) {
        console.error("Auth setup error:", error);
        // Handle error gracefully
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // --- Real-time Data ---
  useEffect(() => {
    if (!appUser) return;
    
    const qProjects = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsubProjects = onSnapshot(qProjects, (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
    });

    return () => {
      unsubProjects();
    };
  }, [appUser]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Google login error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        // This is usually fine to ignore or show a small toast, 
        // but we'll let the AuthForm handle it if we can.
        throw error;
      }
      throw error;
    }
  };
  const handleLogout = () => signOut(auth);

  const updateProjectStatus = async (projectId: string, newStatus: Project['status']) => {
    try {
      console.log(`Updating project ${projectId} to status ${newStatus}`);
      await updateDoc(doc(db, 'projects', projectId), { status: newStatus });
      await addDoc(collection(db, 'auditLogs'), {
        userId: appUser?.uid,
        action: `Status updated to ${newStatus}`,
        entity: 'project',
        entityId: projectId,
        timestamp: serverTimestamp()
      });
      setNotification({ message: "Statut mis à jour avec succès", type: 'success' });
    } catch (error) {
      console.error("Error updating project status:", error);
      setNotification({ message: "Échec de la mise à jour du statut. Vérifiez vos permissions.", type: 'error' });
    }
  };

  const updateProject = async (projectId: string, data: Partial<Project>) => {
    try {
      await updateDoc(doc(db, 'projects', projectId), data);
      await addDoc(collection(db, 'auditLogs'), {
        userId: appUser?.uid,
        action: `Project updated`,
        entity: 'project',
        entityId: projectId,
        timestamp: serverTimestamp()
      });
      setNotification({ message: "Projet mis à jour avec succès", type: 'success' });
    } catch (error) {
      console.error("Error updating project:", error);
      setNotification({ message: "Échec de la mise à jour du projet.", type: 'error' });
    }
  };

  const deleteProject = async (projectId: string) => {
    setConfirmModal({
      message: "Êtes-vous sûr de vouloir supprimer ce projet ?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'projects', projectId));
          await addDoc(collection(db, 'auditLogs'), {
            userId: appUser?.uid,
            action: `Projet supprimé`,
            entity: 'project',
            entityId: projectId,
            timestamp: serverTimestamp()
          });
          setSelectedProject(null);
          setNotification({ message: "Projet supprimé avec succès", type: 'success' });
        } catch (error) {
          console.error("Error deleting project:", error);
          setNotification({ message: "Échec de la suppression du projet.", type: 'error' });
        }
        setConfirmModal(null);
      }
    });
  };

  if (loading || (user && !appUser)) return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );

  if (!user) return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-50 p-4">
      <AuthForm onLogin={handleLogin} />
    </div>
  );

  return (
    <div className="h-screen w-screen flex bg-slate-50 overflow-hidden font-sans text-slate-900 relative">
      {/* Mobile Header */}
      <header className="lg:hidden absolute top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-900 rounded flex items-center justify-center">
            <RefreshCw className="text-white animate-spin-slow" size={16} />
          </div>
          <span className="text-lg font-bold tracking-tight">LifecyclePro</span>
        </div>
        <div className="flex items-center gap-2">
          {appUser?.role === 'Commercial' && (
            <button 
              onClick={() => setShowCreateModal(true)}
              className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-800 transition-all"
              title="Nouveau Projet"
            >
              <Plus size={18} />
            </button>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col p-4 z-50 transition-transform duration-300 lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between lg:justify-start gap-2 px-2 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-900 rounded flex items-center justify-center">
              <RefreshCw className="text-white animate-spin-slow" size={16} />
            </div>
            <span className="text-lg font-bold tracking-tight">LifecyclePro</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-1 text-slate-400 hover:text-slate-900">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5">
          <SidebarItem icon={LayoutDashboard} label="Tableau de bord" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={Package} label="Projets" active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} />
          <SidebarItem icon={Truck} label="Transferts" active={activeTab === 'transfers'} onClick={() => setActiveTab('transfers')} />
          <SidebarItem icon={Factory} label="Production" active={activeTab === 'production'} onClick={() => setActiveTab('production')} />
          {appUser?.role === 'Admin' && (
            <SidebarItem icon={Users} label="Utilisateurs" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
          )}
        </nav>

        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold">
              {appUser?.name[0]}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold truncate">{appUser?.name}</p>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{appUser?.role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
          >
            <LogOut size={14} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden pt-14 lg:pt-0">
        {/* Header (Desktop) */}
        <header className="hidden lg:flex h-14 bg-white border-b border-slate-200 items-center justify-between px-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            {activeTab === 'dashboard' ? 'Tableau de bord' : 
             activeTab === 'projects' ? 'Projets' : 
             activeTab === 'transfers' ? 'Transferts' : 
             activeTab === 'production' ? 'Production' : 
             activeTab === 'users' ? 'Utilisateurs' : activeTab}
          </h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Rechercher..." 
                className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-slate-900 w-48 outline-none"
              />
            </div>
            {appUser?.role === 'Commercial' && (
              <button 
                onClick={() => setShowCreateModal(true)}
                className="bg-slate-900 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2"
              >
                <Plus size={14} />
                Nouveau Projet
              </button>
            )}
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <DashboardView projects={projects} onNavigate={handleNavigate} />
            </div>
          )}
          {activeTab === 'projects' && (
            <ProjectsView 
              projects={projects} 
              onSelect={setSelectedProject} 
              filters={projectFilters}
              onFilterChange={setProjectFilters}
            />
          )}
          {activeTab === 'transfers' && <TransfersView projects={projects} />}
          {activeTab === 'production' && <ProductionView projects={projects} />}
          {activeTab === 'users' && <UsersManagementView />}
        </div>
      </main>

      {/* Detail Panel / Chat */}
      <AnimatePresence>
        {selectedProject && (
          <ProjectDetailPanel 
            project={selectedProject} 
            appUser={appUser!} 
            onClose={() => setSelectedProject(null)}
            onUpdateStatus={updateProjectStatus}
            onUpdateProject={updateProject}
            onDelete={deleteProject}
          />
        )}
      </AnimatePresence>

      {/* Modals */}
      {showCreateModal && (
        <CreateProjectModal 
          onClose={() => setShowCreateModal(false)} 
          appUser={appUser!} 
        />
      )}

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl z-[200] flex items-center gap-3 font-bold text-sm",
              notification.type === 'success' ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
            )}
          >
            {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-6"
            >
              <div className="flex items-center gap-3 text-amber-600">
                <AlertCircle size={24} />
                <h3 className="text-lg font-bold">Confirmation</h3>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg font-bold hover:bg-slate-50 transition-all text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all text-sm"
                >
                  Confirmer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-Views ---

function AuthForm({ onLogin }: { onLogin: () => Promise<void> }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuthError = (err: any) => {
    console.error("Auth error details:", err);
    const code = err.code || (err.message && err.message.includes('auth/') ? err.message.match(/auth\/[a-z-]+/)?.[0] : null);
    
    switch (code) {
      case 'auth/email-already-in-use':
        setError('Cet e-mail est déjà enregistré. Veuillez vous connecter.');
        break;
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        setError('Identifiants invalides. Vérifiez votre e-mail/mot de passe ou créez un compte.');
        break;
      case 'auth/invalid-email':
        setError('Format d\'e-mail invalide.');
        break;
      case 'auth/weak-password':
        setError('Le mot de passe doit comporter au moins 6 caractères.');
        break;
      case 'auth/operation-not-allowed':
        setError('La connexion par e-mail n\'est pas activée. Utilisez Google.');
        break;
      case 'auth/popup-closed-by-user':
        setError('Connexion Google annulée.');
        break;
      case 'auth/user-disabled':
        setError('Ce compte a été désactivé.');
        break;
      case 'auth/too-many-requests':
        setError('Trop de tentatives. Veuillez réessayer plus tard.');
        break;
      case 'auth/network-request-failed':
        setError('Erreur réseau. Vérifiez votre connexion.');
        break;
      default:
        setError(err.message || 'Une erreur d\'authentification s\'est produite.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Store name in localStorage to be picked up by onAuthStateChanged
        if (name) {
          localStorage.setItem('pending_signup_name', name);
        }
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await onLogin();
    } catch (err: any) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Veuillez d\'abord saisir votre adresse e-mail.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('E-mail de réinitialisation du mot de passe envoyé ! Vérifiez votre boîte de réception.');
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100"
    >
      <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-slate-200">
        <RefreshCw className="text-white animate-spin-slow" size={32} />
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2 text-center">LifecyclePro</h1>
      <p className="text-slate-500 mb-8 text-center">Plateforme de suivi du cycle de vie des produits d'entreprise</p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Nom complet</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
              placeholder="Jean Dupont"
            />
          </div>
        )}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">E-mail</label>
          <input 
            type="email" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
            placeholder="admin@example.com"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase">Mot de passe</label>
          <input 
            type="password" 
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
            placeholder="••••••••"
          />
        </div>
        
        {error && <p className="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded border border-red-100">{error}</p>}
        {message && <p className="text-xs text-green-600 mt-2 bg-green-50 p-2 rounded border border-green-100">{message}</p>}
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all disabled:opacity-50"
        >
          {loading ? 'Traitement...' : (isLogin ? 'Connexion' : 'S\'inscrire')}
        </button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-100"></div>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-400">Ou continuer avec</span>
        </div>
      </div>

      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full bg-white border border-slate-200 text-slate-700 py-2.5 rounded-xl font-semibold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" />
        Compte Google
      </button>
      
      <div className="mt-6 flex flex-col gap-2 text-center">
        <button 
          onClick={() => {
            setIsLogin(!isLogin);
            setError('');
            setMessage('');
          }}
          className="text-sm text-slate-900 font-semibold hover:underline"
        >
          {isLogin ? "Vous n'avez pas de compte ? S'inscrire" : "Vous avez déjà un compte ? Connexion"}
        </button>
        {isLogin && (
          <button 
            onClick={handleForgotPassword}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Mot de passe oublié ?
          </button>
        )}
      </div>
    </motion.div>
  );
}

function DashboardView({ projects, onNavigate }: { projects: Project[], onNavigate: (tab: string, filters?: any) => void }) {
  const stats = useMemo(() => {
    const total = projects.length;
    const inProduction = projects.filter(p => p.status === 'In Production').length;
    const finished = projects.filter(p => p.status === 'Finished').length;
    const pending = total - finished;
    
    // Status distribution for chart
    const statusCounts = STATUS_STEPS.reduce((acc, status) => {
      acc[status] = projects.filter(p => p.status === status).length;
      return acc;
    }, {} as Record<string, number>);

    const chartData = STATUS_STEPS.map(status => ({
      name: status === 'Waiting Materials' ? 'Matériel' : 
            status === 'Transferring' ? 'Transfert' : 
            status === 'In Production' ? 'Production' : status,
      value: statusCounts[status],
      fullStatus: status
    }));

    // Type distribution for pie chart
    const typeCounts = projects.reduce((acc, p) => {
      acc[p.type] = (acc[p.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const pieData = Object.keys(typeCounts).map(type => ({
      name: type,
      value: typeCounts[type]
    }));

    return { total, inProduction, finished, pending, chartData, pieData };
  }, [projects]);

  const COLORS = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <StatCard 
          label="Total des projets" 
          value={stats.total} 
          icon={FileText} 
          color="bg-slate-900"
          onClick={() => onNavigate('projects', { status: 'all' })}
        />
        <StatCard 
          label="En production" 
          value={stats.inProduction} 
          icon={Factory} 
          color="bg-indigo-600"
          onClick={() => onNavigate('projects', { status: 'In Production' })}
        />
        <StatCard 
          label="Terminé" 
          value={stats.finished} 
          icon={CheckCircle2} 
          color="bg-emerald-600"
          onClick={() => onNavigate('projects', { status: 'Finished' })}
        />
        <StatCard 
          label="En attente" 
          value={stats.pending} 
          icon={Clock} 
          color="bg-amber-500"
          onClick={() => onNavigate('projects', { status: 'Created' })}
        />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution Chart */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <LayoutDashboard size={16} className="text-slate-400" />
              Distribution par Statut
            </h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} onClick={(data) => onNavigate('projects', { status: data.fullStatus })}>
                  {stats.chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="cursor-pointer hover:opacity-80 transition-opacity" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Type Distribution Pie Chart */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm"
        >
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-6">
            <Package size={16} className="text-slate-400" />
            Types de Projets
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.pieData}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  onClick={(data) => onNavigate('projects', { type: data.name })}
                >
                  {stats.pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="cursor-pointer hover:opacity-80 transition-opacity" />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {stats.pieData.map((entry, index) => (
              <div key={entry.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="text-slate-500 font-medium">{entry.name}</span>
                </div>
                <span className="font-bold text-slate-900">{entry.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
        >
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Clock size={14} />
              Activité récente
            </h3>
            <button onClick={() => onNavigate('projects')} className="text-[10px] font-bold text-blue-600 hover:underline uppercase">Voir tout</button>
          </div>
          <div className="divide-y divide-slate-100">
            {projects.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onNavigate('projects')}>
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-semibold text-slate-900 truncate">{p.title}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight truncate">{p.clientName}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
        >
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <AlertCircle size={14} className="text-red-500" />
              Délais critiques
            </h3>
            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full uppercase">Urgent</span>
          </div>
          <div className="divide-y divide-slate-100">
            {projects.filter(p => p.status !== 'Finished').slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onNavigate('projects')}>
                <p className="text-sm font-semibold text-slate-900 truncate flex-1 pr-4">{p.title}</p>
                <p className="text-[10px] font-mono font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded whitespace-nowrap">{p.deadline}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, onClick }: any) {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      onClick={onClick}
      className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer group transition-all hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div className={cn("p-2.5 rounded-lg text-white shadow-lg shadow-slate-100 group-hover:scale-110 transition-transform", color)}>
          <Icon size={20} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-slate-400 group-hover:text-slate-600 transition-colors">
        <span>Voir les détails</span>
        <ChevronRight size={10} />
      </div>
    </motion.div>
  );
}

function ProjectsView({ 
  projects, 
  onSelect, 
  filters, 
  onFilterChange 
}: { 
  projects: Project[], 
  onSelect: (p: Project) => void,
  filters: { status: string, client: string, type: string },
  onFilterChange: (f: any) => void
}) {
  const { status: statusFilter, client: clientFilter, type: typeFilter } = filters;

  const setStatusFilter = (val: string) => onFilterChange({ ...filters, status: val });
  const setClientFilter = (val: string) => onFilterChange({ ...filters, client: val });
  const setTypeFilter = (val: string) => onFilterChange({ ...filters, type: val });

  const clients = useMemo(() => {
    const uniqueClients = Array.from(new Set(projects.map(p => p.clientName)));
    return uniqueClients.sort();
  }, [projects]);

  const types = useMemo(() => {
    const uniqueTypes = Array.from(new Set(projects.map(p => p.type)));
    return uniqueTypes.sort();
  }, [projects]);

  const filteredProjects = projects.filter(p => {
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchClient = clientFilter === 'all' || p.clientName === clientFilter;
    const matchType = typeFilter === 'all' || p.type === typeFilter;
    return matchStatus && matchClient && matchType;
  });

  const translations: Record<string, string> = {
    'Created': 'Créé',
    'Reviewed': 'Révisé',
    'Waiting Materials': 'En attente de matériel',
    'Transferring': 'En transfert',
    'Ready': 'Prêt',
    'In Production': 'En production',
    'Finished': 'Terminé',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg border border-slate-200">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statut</label>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full bg-slate-50 border-none rounded px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-slate-900 outline-none"
          >
            <option value="all">Tous les statuts</option>
            {STATUS_STEPS.map(s => (
              <option key={s} value={s}>{translations[s] || s}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client</label>
          <select 
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="block w-full bg-slate-50 border-none rounded px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-slate-900 outline-none"
          >
            <option value="all">Tous les clients</option>
            {clients.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</label>
          <select 
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="block w-full bg-slate-50 border-none rounded px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-slate-900 outline-none"
          >
            <option value="all">Tous les types</option>
            {types.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        
        <button 
          onClick={() => onFilterChange({ status: 'all', client: 'all', type: 'all' })}
          className="mt-auto text-[10px] font-bold text-slate-400 hover:text-slate-900 uppercase tracking-wider underline underline-offset-4"
        >
          Réinitialiser
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Projet</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statut</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date limite</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProjects.length > 0 ? filteredProjects.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => onSelect(p)}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                    <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{p.description}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 font-medium">{p.type}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 font-medium">{p.clientName}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-xs font-mono font-bold text-slate-500">{p.deadline}</td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="text-slate-300 group-hover:text-slate-900 transition-colors inline" size={14} />
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-xs italic">
                    Aucun projet ne correspond à vos filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredProjects.length > 0 ? filteredProjects.map(p => (
            <div 
              key={p.id} 
              className="p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
              onClick={() => onSelect(p)}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{p.title}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">{p.clientName}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                <span className="text-slate-500">{p.type}</span>
                <span className="text-slate-400 font-mono">{p.deadline}</span>
              </div>
            </div>
          )) : (
            <div className="p-8 text-center text-slate-400 text-xs italic">
              Aucun projet ne correspond à vos filtres.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductionView({ projects }: { projects: Project[] }) {
  const inProduction = projects.filter(p => p.status === 'In Production');
  const readyForProduction = projects.filter(p => p.status === 'Ready');

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 p-6 rounded-xl flex items-center gap-6 text-white shadow-lg shadow-slate-200">
        <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center">
          <Factory size={24} className="text-white" />
        </div>
        <div>
          <p className="text-lg font-bold">Suivi de production</p>
          <p className="text-sm opacity-70">{inProduction.length} projets en cours sur les lignes de production.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
            En cours de production ({inProduction.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inProduction.length > 0 ? inProduction.map(p => (
              <div key={p.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-bold text-slate-900">{p.title}</h4>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">{p.clientName}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Quantité</span>
                    <span className="font-bold">{p.quantity} {p.unit === 'feuille' ? 'feuilles' : p.unit}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Type</span>
                    <span className="font-bold">{p.type}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-red-500 uppercase">
                      <Clock size={12} />
                      Deadline: {p.deadline}
                    </div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="col-span-full bg-slate-50 border border-dashed border-slate-200 p-8 rounded-xl text-center">
                <p className="text-sm text-slate-400 italic">Aucun projet en cours de production.</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            Prêt pour production ({readyForProduction.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75">
            {readyForProduction.length > 0 ? readyForProduction.map(p => (
              <div key={p.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-bold text-slate-900">{p.title}</h4>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">{p.clientName}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Prêt depuis le dépôt logistique</span>
                  <span className="font-bold text-emerald-600">{p.quantity} {p.unit === 'feuille' ? 'feuilles' : p.unit}</span>
                </div>
              </div>
            )) : (
              <div className="col-span-full bg-slate-50 border border-dashed border-slate-200 p-8 rounded-xl text-center">
                <p className="text-sm text-slate-400 italic">Aucun projet en attente de démarrage.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TransfersView({ projects }: { projects: Project[] }) {
  const transferring = projects.filter(p => p.status === 'Transferring');
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 p-4 rounded-lg flex items-center gap-4 text-white">
        <Truck size={20} />
        <div>
          <p className="text-sm font-bold">Transferts actifs</p>
          <p className="text-xs opacity-70">{transferring.length} projets actuellement en phase logistique.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {transferring.map(p => (
          <div key={p.id} className="bg-white p-4 rounded-lg border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-50 rounded flex items-center justify-center text-slate-400">
                <Package size={20} />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-900">{p.title}</p>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Client: {p.clientName} • Qté: {p.quantity} {p.unit === 'feuille' ? 'feuilles' : p.unit}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">De</p>
                <p className="text-xs font-bold text-slate-900">Dépôt 1</p>
              </div>
              <ChevronRight className="text-slate-200" size={14} />
              <div className="text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">À</p>
                <p className="text-xs font-bold text-slate-900">Production</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UsersManagementView() {
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setAllUsers(snap.docs.map(d => d.data() as AppUser));
    });
  }, []);

  const updateUserRole = async (uid: string, newRole: Role) => {
    await updateDoc(doc(db, 'users', uid), { role: newRole });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Department</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {allUsers.map(u => (
            <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-bold text-slate-900">{u.name}</td>
              <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
              <td className="px-6 py-4">
                <select 
                  value={u.role}
                  onChange={(e) => updateUserRole(u.uid, e.target.value as Role)}
                  className="text-sm bg-slate-50 border-none rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Commercial">Commercial</option>
                  <option value="Coordinator">Coordinator</option>
                  <option value="Logistics">Logistics</option>
                  <option value="Production">Production</option>
                  <option value="Admin">Admin</option>
                </select>
              </td>
              <td className="px-6 py-4 text-sm text-slate-600">{u.department}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Modals & Panels ---

function ProjectDetailPanel({ project, appUser, onClose, onUpdateStatus, onUpdateProject, onDelete }: { project: Project, appUser: AppUser, onClose: () => void, onUpdateStatus: any, onUpdateProject: any, onDelete: any }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'messages'), 
      where('projectId', '==', project.id),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    });
  }, [project.id]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    await addDoc(collection(db, 'messages'), {
      senderId: appUser.uid,
      senderName: appUser.name,
      projectId: project.id,
      content: newMessage,
      createdAt: serverTimestamp()
    });
    setNewMessage('');
  };

  const handleStatusUpdate = async (newStatus: Project['status']) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdateStatus(project.id, newStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const currentStepIndex = STATUS_STEPS.indexOf(project.status);

  const canTransition = (role: Role | undefined, currentStatus: Project['status']) => {
    if (!role) return false;
    if (role === 'Admin') return true;
    if (currentStatus === 'Created') {
      return role === 'Commercial' || role === 'Coordinator';
    }
    if (currentStatus === 'Reviewed') {
      return role === 'Coordinator';
    }
    if (currentStatus === 'Waiting Materials' || currentStatus === 'Transferring') {
      return role === 'Logistics';
    }
    if (currentStatus === 'Ready' || currentStatus === 'In Production') {
      return role === 'Production';
    }
    return false;
  };

  if (!appUser) return null;

  const translations: Record<string, string> = {
    'Created': 'Créé',
    'Reviewed': 'Révisé',
    'Waiting Materials': 'En attente de matériel',
    'Transferring': 'En transfert',
    'Ready': 'Prêt',
    'In Production': 'En production',
    'Finished': 'Terminé',
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white shadow-xl border-l border-slate-200 flex flex-col z-50"
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{project.title}</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">ID du projet: {project.id.slice(0, 8)}</p>
        </div>
        <div className="flex items-center gap-2">
          {appUser.role === 'Admin' && (
            <>
              <button 
                onClick={() => setIsEditing(true)}
                className="p-1.5 hover:bg-blue-100 text-blue-600 rounded transition-colors"
                title="Modifier le projet"
              >
                <Edit2 size={16} />
              </button>
              <button 
                onClick={() => onDelete(project.id)}
                className="p-1.5 hover:bg-red-100 text-red-600 rounded transition-colors"
                title="Supprimer le projet"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded transition-colors">
            <Plus className="rotate-45 text-slate-500" size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Lifecycle Stepper */}
        <div className="space-y-4">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progression du cycle de vie</h4>
          <div className="relative">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-100"></div>
            <div className="space-y-6 relative">
              {STATUS_STEPS.map((step, idx) => {
                const isCompleted = idx < currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                const nextStep = STATUS_STEPS[idx + 1];
                const isAllowedToMove = canTransition(appUser.role, project.status);

                return (
                  <div key={step} className="flex items-start gap-4">
                    <div className={cn(
                      "w-6 h-6 rounded flex items-center justify-center z-10 transition-all duration-300 text-[10px] font-bold",
                      isCompleted ? "bg-emerald-500 text-white" : 
                      isCurrent ? "bg-slate-900 text-white" : 
                      "bg-white border border-slate-200 text-slate-300"
                    )}>
                      {isCompleted ? <CheckCircle2 size={12} /> : idx + 1}
                    </div>
                    <div className="flex-1 pt-0.5">
                      <p className={cn("text-xs font-bold", isCurrent ? "text-slate-900" : "text-slate-500")}>{translations[step] || step}</p>
                      {isCurrent && isAllowedToMove && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {idx < STATUS_STEPS.length - 1 && (
                            <button 
                              disabled={isUpdating}
                              onClick={() => handleStatusUpdate(STATUS_STEPS[idx + 1] as Project['status'])}
                              className={cn(
                                "text-[10px] bg-slate-900 text-white px-2.5 py-1 rounded font-bold hover:bg-slate-800 transition-all uppercase tracking-wider",
                                isUpdating && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              {isUpdating ? "Mise à jour..." : `Passer à ${translations[STATUS_STEPS[idx + 1]] || STATUS_STEPS[idx + 1]}`}
                            </button>
                          )}
                          {appUser.role === 'Admin' && idx > 0 && (
                            <button 
                              disabled={isUpdating}
                              onClick={() => handleStatusUpdate(STATUS_STEPS[idx - 1] as Project['status'])}
                              className={cn(
                                "text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-bold hover:bg-slate-200 transition-all uppercase tracking-wider flex items-center gap-1",
                                isUpdating && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              <ArrowLeft size={10} />
                              {isUpdating ? "Mise à jour..." : `Retour à ${translations[STATUS_STEPS[idx - 1]] || STATUS_STEPS[idx - 1]}`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Détails du projet</h4>
          <div className="grid grid-cols-2 gap-4">
            <DetailItem label="Client" value={project.clientName} />
            <DetailItem label="Type" value={project.type} />
            <DetailItem label="Quantité" value={`${project.quantity} ${project.unit === 'feuille' ? 'feuilles' : project.unit}`} />
            <DetailItem label="Date limite" value={project.deadline} />
          </div>
          <div className="p-3 bg-slate-50 rounded border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Description</p>
            <p className="text-xs text-slate-600 leading-relaxed">{project.description}</p>
          </div>
        </div>

        {/* Chat Section */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Communication interne</h4>
          <div className="bg-slate-50 rounded-lg p-4 h-64 overflow-y-auto space-y-3 border border-slate-100">
            {messages.map(m => (
              <div key={m.id} className={cn(
                "max-w-[80%] p-2 rounded text-xs",
                m.senderId === appUser.uid ? "ml-auto bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"
              )}>
                <p className="font-bold text-[9px] opacity-70 mb-0.5">{m.senderName}</p>
                <p>{m.content}</p>
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} className="flex gap-2">
            <input 
              type="text" 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Tapez un message..." 
              className="flex-1 bg-white border border-slate-200 rounded px-3 py-2 text-xs focus:ring-1 focus:ring-slate-900 outline-none"
            />
            <button className="bg-slate-900 text-white p-2 rounded hover:bg-slate-800 transition-colors">
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>

      {isEditing && (
        <EditProjectModal 
          project={project} 
          onClose={() => setIsEditing(false)} 
          onSave={(data) => {
            onUpdateProject(project.id, data);
            setIsEditing(false);
          }} 
        />
      )}
    </motion.div>
  );
}

function EditProjectModal({ project, onClose, onSave }: { project: Project, onClose: () => void, onSave: (data: Partial<Project>) => void }) {
  const [formData, setFormData] = useState({
    title: project.title,
    description: project.description,
    type: project.type,
    quantity: project.quantity,
    unit: project.unit,
    deadline: project.deadline,
    clientName: project.clientName
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xl font-bold">Modifier le projet</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <Plus className="rotate-45 text-slate-400" size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Titre du projet</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Quantité et Type d'unité</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="number" 
                required
                className="flex-1 px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
              />
              <select 
                className="flex-1 px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900 text-xs font-bold"
                value={`${formData.type}:${formData.unit}`}
                onChange={e => {
                  const [type, unit] = e.target.value.split(':');
                  setFormData({
                    ...formData, 
                    type: type as Project['type'], 
                    unit: unit
                  });
                }}
              >
                <option value="Transformation:kg">Transformation (kg)</option>
                <option value="Impression:feuille">Impression (feuille)</option>
                <option value="Finition:kg">Finition (kg)</option>
                <option value="Finition:feuille">Finition (feuille)</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Nom du client</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
              value={formData.clientName}
              onChange={e => setFormData({...formData, clientName: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Date limite</label>
            <input 
              required
              type="date" 
              className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
              value={formData.deadline}
              onChange={e => setFormData({...formData, deadline: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
            <textarea 
              required
              rows={3}
              className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900 resize-none"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>
          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-all"
            >
              Annuler
            </button>
            <button 
              type="submit"
              className="flex-1 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
            >
              Enregistrer les modifications
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string, value: any }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{label}</p>
      <p className="text-xs font-semibold text-slate-900 mt-0.5">{value}</p>
    </div>
  );
}

function CreateProjectModal({ onClose, appUser }: { onClose: () => void, appUser: AppUser }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Transformation' as Project['type'],
    quantity: 100,
    unit: 'kg',
    deadline: format(new Date(), 'yyyy-MM-dd'),
    clientName: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addDoc(collection(db, 'projects'), {
      ...formData,
      status: 'Created',
      createdBy: appUser.uid,
      createdAt: serverTimestamp()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xl font-bold">Créer un nouveau projet</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <Plus className="rotate-45 text-slate-400" size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Titre du projet</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Quantité et Type d'unité</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="number" 
                required
                className="flex-1 px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
              />
              <select 
                className="flex-1 px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900 text-xs font-bold"
                value={`${formData.type}:${formData.unit}`}
                onChange={e => {
                  const [type, unit] = e.target.value.split(':');
                  setFormData({
                    ...formData, 
                    type: type as Project['type'], 
                    unit: unit
                  });
                }}
              >
                <option value="Transformation:kg">Transformation (kg)</option>
                <option value="Impression:feuille">Impression (feuille)</option>
                <option value="Finition:kg">Finition (kg)</option>
                <option value="Finition:feuille">Finition (feuille)</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Nom du client</label>
            <input 
              required
              type="text" 
              className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
              value={formData.clientName}
              onChange={e => setFormData({...formData, clientName: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Date limite</label>
            <input 
              type="date" 
              className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
              value={formData.deadline}
              onChange={e => setFormData({...formData, deadline: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
            <textarea 
              rows={3}
              className="w-full px-4 py-2 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-slate-900"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all mt-4"
          >
            Créer le projet
          </button>
        </form>
      </motion.div>
    </div>
  );
}
