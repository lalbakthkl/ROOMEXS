/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Calculator, 
  Users, 
  ShoppingBag, 
  History, 
  LogOut, 
  LogIn,
  ChevronRight,
  ChevronDown,
  Save,
  X,
  Share2,
  Check,
  AlertCircle,
  Sparkles,
  Home,
  Calendar,
  User as UserIcon,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Edit2,
  Delete
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  deleteDoc, 
  doc, 
  updateDoc,
  setDoc,
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, logOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from './firebase';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  Mail, 
  Lock, 
  UserPlus, 
  ArrowLeft,
  Eye,
  EyeOff,
  Github
} from 'lucide-react';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Member {
  id: string;
  name: string;
  roomRentEnabled: boolean;
  messBillEnabled: boolean;
  totalDays: number;
  uid: string;
}

interface Purchase {
  id: string;
  description: string;
  amount: number;
  date: string;
  memberId: string;
  uid: string;
}

interface Summary {
  id: string;
  month: string;
  totalRoomRent: number;
  totalPurchase: number;
  totalDays: number;
  perDayRate: number;
  memberDetails: string; // JSON string
  uid: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

// Error Handler
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Components
const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      setHasError(true);
      setErrorMsg(e.message);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black p-4">
        <div className="bg-slate-900 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border border-slate-800">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
          <p className="text-slate-400 mb-6">{errorMsg || 'An unexpected error occurred.'}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-red-500 text-white py-3 rounded-xl font-semibold hover:bg-red-600 transition-colors"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [totalRoomRent, setTotalRoomRent] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'members' | 'purchases' | 'history' | 'calculator' | 'approvals'>('members');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [pendingReg, setPendingReg] = useState<any>(null);
  
  // Calculator State
  const [calcInput, setCalcInput] = useState('');
  const [calcHistory, setCalcHistory] = useState<string[]>([]);
  const [calcResult, setCalcResult] = useState<number | null>(null);

  // Auth Listener
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubReg: (() => void) | null = null;

    // Safety timeout for auth readiness
    const timeout = setTimeout(() => {
      if (!isAuthReady) {
        console.warn("Auth check timed out, forcing ready state");
        setIsAuthReady(true);
      }
    }, 6000);

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const isDefaultAdmin = u.email === 'lalbakth@gmail.com' || u.email === 'sakeerputhan@gmail.com';
        if (isDefaultAdmin) {
          setIsAdmin(true);
          setIsApproved(true);
          setIsAuthReady(true);
        } else {
          // Check user profile for approval and admin status
          unsubProfile = onSnapshot(doc(db, 'users', u.uid), (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              setIsAdmin(data.role === 'admin');
              setIsApproved(data.approved === true);
            } else {
              setIsAdmin(false);
              setIsApproved(false);
            }
            setIsAuthReady(true);
          }, (err) => {
            console.error("Profile snapshot error:", err);
            setIsAuthReady(true);
          });
          
          // Check for pending registration
          unsubReg = onSnapshot(doc(db, 'registrations', u.uid), (regSnap) => {
            if (regSnap.exists()) {
              setPendingReg({ id: regSnap.id, ...regSnap.data() });
            } else {
              setPendingReg(null);
            }
          }, (err) => {
            console.error("Registration snapshot error:", err);
          });
        }
      } else {
        setIsAdmin(false);
        setIsApproved(false);
        setPendingReg(null);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsub();
      if (unsubProfile) unsubProfile();
      if (unsubReg) unsubReg();
      clearTimeout(timeout);
    };
  }, []);

  // Firestore Data Listeners
  useEffect(() => {
    if (!user) {
      setMembers([]);
      setPurchases([]);
      setSummaries([]);
      return;
    }

    const qMembers = collection(db, 'members');
    const unsubMembers = onSnapshot(qMembers, (snapshot) => {
      setMembers(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Member)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'members'));

    const qPurchases = collection(db, 'purchases');
    const unsubPurchases = onSnapshot(qPurchases, (snapshot) => {
      setPurchases(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Purchase)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'purchases'));

    const qSummaries = collection(db, 'summaries');
    const unsubSummaries = onSnapshot(qSummaries, (snapshot) => {
      setSummaries(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Summary)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'summaries'));

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setTotalRoomRent(snapshot.data().totalRoomRent || 0);
      }
    });

    let unsubRegs = () => {};
    if (isAdmin) {
      const qRegs = collection(db, 'registrations');
      unsubRegs = onSnapshot(qRegs, (snapshot) => {
        setRegistrations(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }

    return () => {
      unsubMembers();
      unsubPurchases();
      unsubSummaries();
      unsubSettings();
      unsubRegs();
    };
  }, [user]);

  // Calculations
  const calculations = useMemo(() => {
    const totalPurchase = purchases.reduce((sum, p) => sum + p.amount, 0);
    const messEnabledMembers = members.filter(m => m.messBillEnabled);
    const totalMessDays = messEnabledMembers.reduce((sum, m) => sum + m.totalDays, 0);
    const perDayRate = totalMessDays > 0 ? totalPurchase / totalMessDays : 0;
    
    const rentPayingMembers = members.filter(m => m.roomRentEnabled).length;
    const roomRentPerMember = rentPayingMembers > 0 ? totalRoomRent / rentPayingMembers : 0;

    const memberDetails = members.map(m => {
      const memberPurchases = purchases.filter(p => p.memberId === m.id).reduce((sum, p) => sum + p.amount, 0);
      const messBill = m.messBillEnabled ? m.totalDays * perDayRate : 0;
      const roomRent = m.roomRentEnabled ? roomRentPerMember : 0;
      const totalBill = messBill + roomRent;
      const balance = totalBill - memberPurchases;
      
      return {
        ...m,
        memberPurchases,
        messBill,
        roomRent,
        totalBill,
        balance
      };
    });

    return {
      totalPurchase,
      totalDays: totalMessDays,
      perDayRate,
      roomRentPerMember,
      memberDetails
    };
  }, [members, purchases, totalRoomRent]);

  const updateRoomRent = async (val: number) => {
    setTotalRoomRent(val);
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'settings', 'global'), { totalRoomRent: val }, { merge: true });
    } catch (err) {
      console.error("Error updating room rent:", err);
    }
  };

  // Actions
  const addMember = async (name: string, roomRentEnabled: boolean, messBillEnabled: boolean, totalDays: number) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'members'), {
        name,
        roomRentEnabled,
        messBillEnabled,
        totalDays,
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'members');
    }
  };

  const deleteMember = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'members', id));
      // Also delete related purchases
      const relatedPurchases = purchases.filter(p => p.memberId === id);
      for (const p of relatedPurchases) {
        await deleteDoc(doc(db, 'purchases', p.id));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'members');
    }
  };

  const updateMemberDays = async (id: string, newDays: number) => {
    try {
      await updateDoc(doc(db, 'members', id), { totalDays: newDays });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'members');
    }
  };

  const addPurchase = async (description: string, amount: number, memberId: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'purchases'), {
        description,
        amount,
        date: new Date().toISOString(),
        memberId,
        uid: user.uid
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'purchases');
    }
  };

  const deletePurchase = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'purchases', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'purchases');
    }
  };

  const approveUser = async (userId: string, email: string) => {
    try {
      await setDoc(doc(db, 'users', userId), {
        email,
        approved: true,
        role: 'user',
        createdAt: new Date().toISOString()
      });
      await deleteDoc(doc(db, 'registrations', userId));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };

  const rejectUser = async (userId: string) => {
    try {
      if (confirm('Are you sure you want to reject this registration request?')) {
        await deleteDoc(doc(db, 'registrations', userId));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'registrations');
    }
  };

  const saveSummary = async () => {
    if (!user) return;
    const month = format(new Date(), 'MMMM yyyy');
    try {
      await addDoc(collection(db, 'summaries'), {
        month,
        totalRoomRent,
        totalPurchase: calculations.totalPurchase,
        totalDays: calculations.totalDays,
        perDayRate: calculations.perDayRate,
        memberDetails: JSON.stringify(calculations.memberDetails),
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
      alert('Summary saved successfully!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'summaries');
    }
  };

  // Calculator Logic
  const handleCalc = (val: string) => {
    if (val === '=') {
      try {
        // Simple eval-like logic for basic math
        const result = Function(`"use strict"; return (${calcInput})`)();
        setCalcResult(result);
        setCalcHistory(prev => [...prev, `${calcInput} = ${result}`]);
        setCalcInput(result.toString());
      } catch {
        alert('Invalid calculation');
      }
    } else if (val === 'C') {
      setCalcInput('');
      setCalcResult(null);
    } else if (val === 'B') {
      setCalcInput(prev => prev.slice(0, -1));
    } else {
      setCalcInput(prev => prev + val);
    }
  };

  // PDF Generation Logic
  const generatePDF = () => {
    const doc = new jsPDF();
    const month = format(new Date(), 'MMMM yyyy');
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(41, 128, 185);
    doc.text('ROOMEX - Expense Report', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text(`Period: ${month}`, 105, 30, { align: 'center' });

    // Summary Section
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('General Summary', 14, 45);
    autoTable(doc, {
      startY: 50,
      head: [['Metric', 'Value']],
      body: [
        ['Total Room Rent', `AED ${totalRoomRent.toFixed(2)}`],
        ['Total Purchase', `AED ${calculations.totalPurchase.toFixed(2)}`],
        ['Total Mess Days', `${calculations.totalDays} days`],
        ['Per Day Rate', `AED ${calculations.perDayRate.toFixed(2)}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] }
    });

    // Member Details Section
    doc.text('Member Breakdown', 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Name', 'Days', 'Purchase', 'Mess Bill', 'Rent', 'Total', 'Payable']],
      body: calculations.memberDetails.map(m => [
        m.name,
        m.totalDays,
        `AED ${m.memberPurchases.toFixed(2)}`,
        `AED ${m.messBill.toFixed(2)}`,
        `AED ${m.roomRent.toFixed(2)}`,
        `AED ${m.totalBill.toFixed(2)}`,
        { 
          content: `AED ${m.balance.toFixed(2)}`, 
          styles: { textColor: m.balance < 0 ? [0, 150, 0] : [0, 0, 255] } 
        }
      ]),
      theme: 'grid',
      headStyles: { fillColor: [39, 174, 96] }
    });

    return { doc, filename: `ROOMEX_Report_${month.replace(' ', '_')}.pdf`, month };
  };

  const exportPDF = () => {
    const { doc, filename } = generatePDF();
    doc.save(filename);
  };

  const downloadSummaryPDF = (s: Summary) => {
    const doc = new jsPDF();
    const memberDetails = JSON.parse(s.memberDetails);
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(41, 128, 185);
    doc.text('ROOMEX - Expense Report', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text(`Period: ${s.month}`, 105, 30, { align: 'center' });

    // Summary Section
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('General Summary', 14, 45);
    autoTable(doc, {
      startY: 50,
      head: [['Metric', 'Value']],
      body: [
        ['Total Room Rent', `AED ${s.totalRoomRent.toFixed(2)}`],
        ['Total Purchase', `AED ${s.totalPurchase.toFixed(2)}`],
        ['Total Mess Days', `${s.totalDays} days`],
        ['Per Day Rate', `AED ${s.perDayRate.toFixed(2)}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] }
    });

    // Member Details Section
    doc.text('Member Breakdown', 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [['Name', 'Days', 'Purchase', 'Mess Bill', 'Rent', 'Total', 'Payable']],
      body: memberDetails.map((m: any) => [
        m.name,
        m.totalDays,
        `AED ${m.memberPurchases.toFixed(2)}`,
        `AED ${m.messBill.toFixed(2)}`,
        `AED ${m.roomRent.toFixed(2)}`,
        `AED ${m.totalBill.toFixed(2)}`,
        { 
          content: `AED ${m.balance.toFixed(2)}`, 
          styles: { textColor: m.balance < 0 ? [0, 150, 0] : [0, 0, 255] } 
        }
      ]),
      theme: 'grid',
      headStyles: { fillColor: [39, 174, 96] }
    });

    doc.save(`ROOMEX_Report_${s.month.replace(' ', '_')}.pdf`);
  };

  const sharePDF = async () => {
    const { doc, filename, month } = generatePDF();
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'ROOMEX Expense Report',
          text: `Check out the room and mess expense report for ${month}.`,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
          exportPDF(); // Fallback to download
        }
      }
    } else {
      // Fallback to WhatsApp text if file sharing is not supported
      const text = `ROOMEX Report - ${month}\nTotal Purchase: AED ${calculations.totalPurchase}\nPer Day Rate: AED ${calculations.perDayRate.toFixed(2)}\n\nCheck your payable amount in the app!`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      exportPDF(); // Also download the PDF for them
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-slate-500 text-xs font-medium animate-pulse">Initializing Secure Session...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {!user ? (
        <LoginScreen />
      ) : !isApproved ? (
        <VerificationScreen email={user.email || ''} pendingReg={pendingReg} />
      ) : (
        <div className="min-h-screen bg-black text-slate-100 font-sans pb-24">
          {/* Header */}
          <header className="bg-black/80 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-30 px-4 sm:px-6 py-4 sm:py-5">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-9 h-9 sm:w-11 h-11 bg-indigo-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-900/40">
                  <Calculator className="w-5 h-5 sm:w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight leading-none text-white">ROOMEX</h1>
                  <span className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Dashboard</span>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:gap-5">
                <div className="hidden sm:block text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Logged in as</p>
                  <p className="text-sm font-bold text-white">{user.email}</p>
                </div>
                <button 
                  onClick={logOut}
                  className="p-2 sm:p-2.5 bg-slate-800 text-slate-400 rounded-lg sm:rounded-xl hover:bg-red-950/30 hover:text-red-500 transition-all border border-slate-700"
                >
                  <LogOut className="w-4 h-4 sm:w-5 h-5" />
                </button>
              </div>
            </div>
          </header>

        <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            <StatCard label="Total Purchase" value={`AED ${calculations.totalPurchase.toLocaleString()}`} color="bg-emerald-600" icon={<ShoppingBag className="w-4 h-4 sm:w-5 h-5 text-white" />} />
            <StatCard label="Per Day Rate" value={`AED ${calculations.perDayRate.toFixed(2)}`} color="bg-indigo-600" icon={<Calculator className="w-4 h-4 sm:w-5 h-5 text-white" />} />
            <StatCard label="Total Days" value={`${calculations.totalDays}`} color="bg-amber-600" icon={<Users className="w-4 h-4 sm:w-5 h-5 text-white" />} />
            <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800 shadow-xl shadow-black/20 flex flex-col justify-between group hover:border-indigo-500/50 transition-colors">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <span className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Room Rent</span>
                <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-slate-800 text-slate-500 group-hover:bg-indigo-950/30 group-hover:text-indigo-400 transition-colors">
                  <Home className="w-3.5 h-3.5 sm:w-4 h-4" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-slate-500 font-bold text-lg sm:text-xl">AED</span>
                <input 
                  type="number" 
                  value={totalRoomRent || ''} 
                  onChange={(e) => updateRoomRent(Number(e.target.value))}
                  className="w-full font-display font-black text-2xl sm:text-3xl focus:outline-none bg-transparent placeholder-slate-700 text-white"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800 max-w-2xl mx-auto backdrop-blur-sm">
            <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users className="w-4 h-4" />} label="Members" />
            <TabButton active={activeTab === 'purchases'} onClick={() => setActiveTab('purchases')} icon={<ShoppingBag className="w-4 h-4" />} label="Purchases" />
            <TabButton active={activeTab === 'calculator'} onClick={() => setActiveTab('calculator')} icon={<Calculator className="w-4 h-4" />} label="Calculator" />
            <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History className="w-4 h-4" />} label="History" />
            {isAdmin && <TabButton active={activeTab === 'approvals'} onClick={() => setActiveTab('approvals')} icon={<ShieldCheck className="w-4 h-4" />} label="Approvals" />}
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'members' && (
              <motion.div 
                key="members"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                {isAdmin && <AddMemberForm onAdd={addMember} />}
                <div className="grid gap-4">
                  {calculations.memberDetails.map((m) => (
                    <MemberCard 
                      key={m.id} 
                      member={m} 
                      onDelete={deleteMember} 
                      onUpdateDays={updateMemberDays} 
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'purchases' && (
              <motion.div 
                key="purchases"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <AddPurchaseForm members={members} onAdd={addPurchase} />
                <div className="bg-slate-900 rounded-2xl sm:rounded-4xl border border-slate-800 shadow-xl shadow-black/20 overflow-hidden">
                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-800/50 border-b border-slate-800">
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Item Details</th>
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Buyer</th>
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] text-right">Amount</th>
                          <th className="px-8 py-5 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {purchases.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-800/30 transition-colors group">
                            <td className="px-8 py-5">
                              <p className="font-bold text-white">{p.description}</p>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{format(new Date(p.date), 'MMM dd, HH:mm')}</p>
                            </td>
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 bg-indigo-950/30 rounded-lg flex items-center justify-center text-[10px] font-black text-indigo-400 uppercase">
                                  {(members.find(m => m.id === p.memberId)?.name || '?')[0]}
                                </div>
                                <span className="text-sm font-bold text-slate-300">
                                  {members.find(m => m.id === p.memberId)?.name || 'Unknown'}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-5 text-right font-display font-black text-indigo-400 text-lg">AED {p.amount}</td>
                            <td className="px-8 py-5 text-right">
                              {isAdmin && (
                                <button 
                                  onClick={() => deletePurchase(p.id)} 
                                  className="w-9 h-9 flex items-center justify-center text-slate-600 hover:text-red-500 hover:bg-red-950/30 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile List */}
                  <div className="sm:hidden divide-y divide-slate-800">
                    {purchases.map((p) => (
                      <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white truncate">{p.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                              {members.find(m => m.id === p.memberId)?.name || 'Unknown'}
                            </span>
                            <span className="text-slate-700">•</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {format(new Date(p.date), 'MMM dd')}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <span className="font-display font-black text-indigo-400">AED {p.amount}</span>
                          {isAdmin && (
                            <button 
                              onClick={() => deletePurchase(p.id)} 
                              className="w-8 h-8 flex items-center justify-center text-slate-600 hover:text-red-500 bg-slate-800 rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {purchases.length === 0 && (
                    <div className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-3 opacity-20">
                        <ShoppingBag className="w-12 h-12" />
                        <p className="font-bold uppercase tracking-widest text-xs">No purchases recorded</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'calculator' && (
              <motion.div 
                key="calculator"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid lg:grid-cols-5 gap-8"
              >
                <div className="lg:col-span-3 bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="bg-slate-800/50 backdrop-blur-md p-6 rounded-3xl mb-8 text-right min-h-[140px] flex flex-col justify-end border border-slate-700/50">
                    <p className="text-slate-500 font-mono text-lg mb-2 tracking-wider">{calcInput || '0'}</p>
                    <p className="text-white text-5xl font-display font-black tracking-tight">{calcResult !== null ? calcResult : '0'}</p>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', 'B', '+', '='].map(btn => (
                      <button
                        key={btn}
                        onClick={() => handleCalc(btn)}
                        className={cn(
                          "h-16 rounded-2xl font-display font-bold text-xl transition-all active:scale-90 flex items-center justify-center",
                          btn === '=' ? "col-span-2 bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : 
                          ['/', '*', '-', '+'].includes(btn) ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                          btn === 'C' ? "bg-red-500/10 text-red-400 border border-red-500/20" : 
                          btn === 'B' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        )}
                      >
                        {btn === 'B' ? <Delete className="w-6 h-6" /> : btn}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-2 bg-slate-900 p-8 rounded-4xl border border-slate-800 shadow-xl shadow-black/20 flex flex-col h-[600px]">
                  <h3 className="font-bold text-slate-500 uppercase text-[10px] tracking-[0.2em] mb-6">Calculation History</h3>
                  <div className="space-y-4 flex-1 overflow-y-auto pr-2 scrollbar-hide hover:scrollbar-default">
                    {calcHistory.map((h, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-2xl border border-slate-800 group">
                        <span className="text-slate-400 font-medium font-mono">{h.split('=')[0]}</span>
                        <span className="text-indigo-400 font-display font-black">= {h.split('=')[1]}</span>
                      </div>
                    ))}
                    {calcHistory.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full py-12 opacity-20">
                        <History className="w-10 h-10 mb-3 text-slate-400" />
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">No history</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center px-2">
                  <h2 className="text-xl font-display font-black text-white tracking-tight">Saved Summaries</h2>
                  {isAdmin && (
                    <button 
                      onClick={saveSummary}
                      className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-900/20"
                    >
                      <Save className="w-4 h-4" />
                      Save Current
                    </button>
                  )}
                </div>
                <div className="grid gap-6">
                  {summaries.map((s) => (
                    <div key={s.id} className="bg-slate-900 p-8 rounded-4xl border border-slate-800 shadow-xl shadow-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-6 group hover:border-indigo-500/30 transition-all">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-slate-800 rounded-3xl flex items-center justify-center text-slate-500 border border-slate-700 group-hover:bg-indigo-950/30 group-hover:text-indigo-400 transition-colors">
                          <Calendar className="w-8 h-8" />
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-2xl text-white mb-1">{s.month}</h3>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total:</span>
                              <span className="text-sm font-bold text-slate-300">AED {s.totalPurchase.toFixed(2)}</span>
                            </div>
                            <div className="w-1 h-1 bg-slate-700 rounded-full" />
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rate:</span>
                              <span className="text-sm font-bold text-slate-300">AED {s.perDayRate.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button 
                          onClick={() => {
                            const details = JSON.parse(s.memberDetails);
                            console.table(details);
                            alert('Check console for detailed table view (feature coming soon to UI)');
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700 transition-all border border-slate-700 text-xs"
                        >
                          <ChevronRight className="w-4 h-4" />
                          Details
                        </button>
                        <button 
                          onClick={() => downloadSummaryPDF(s)}
                          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600/10 text-indigo-400 rounded-xl font-bold hover:bg-indigo-600/20 transition-all border border-indigo-500/20 text-xs"
                        >
                          <Download className="w-4 h-4" />
                          PDF
                        </button>
                        <button 
                          onClick={async () => {
                            if (isAdmin && confirm('Delete this summary?')) {
                              await deleteDoc(doc(db, 'summaries', s.id));
                            }
                          }}
                          className={cn(
                            "w-10 h-10 flex items-center justify-center bg-red-950/30 text-red-500 rounded-xl hover:bg-red-900/50 transition-all border border-red-900/20",
                            !isAdmin && "opacity-0 pointer-events-none"
                          )}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {summaries.length === 0 && (
                    <div className="bg-slate-900/50 py-24 rounded-4xl border border-dashed border-slate-800 flex flex-col items-center gap-4 opacity-30">
                      <History className="w-16 h-16 text-slate-500" />
                      <p className="font-display font-bold text-lg uppercase tracking-[0.3em] text-slate-500">No history found</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'approvals' && isAdmin && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-3xl font-display font-black text-white tracking-tight">Pending Approvals</h2>
                  <div className="px-4 py-2 bg-indigo-600/20 text-indigo-400 rounded-full text-xs font-bold uppercase tracking-widest border border-indigo-500/20">
                    {registrations.length} Pending
                  </div>
                </div>

                <div className="grid gap-4">
                  {registrations.map(reg => (
                    <div key={reg.id} className="bg-slate-900 p-6 rounded-3xl border border-slate-800 flex items-center justify-between group hover:border-slate-700 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 group-hover:text-indigo-400 transition-colors">
                          <UserIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-white font-bold">{reg.email}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Awaiting Approval</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => approveUser(reg.id, reg.email)}
                          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/20"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          Approve
                        </button>
                        <button 
                          onClick={() => rejectUser(reg.id)}
                          className="flex items-center gap-2 px-6 py-3 bg-red-500/10 text-red-500 rounded-2xl font-bold hover:bg-red-500/20 transition-all border border-red-500/20"
                        >
                          <X className="w-5 h-5" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                  {registrations.length === 0 && (
                    <div className="bg-slate-900/50 py-24 rounded-4xl border border-dashed border-slate-800 flex flex-col items-center gap-4 opacity-30">
                      <ShieldCheck className="w-16 h-16 text-slate-500" />
                      <p className="font-display font-bold text-lg uppercase tracking-[0.3em] text-slate-500">No pending approvals</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Action Buttons at the bottom */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center bg-slate-900/50 p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-800/50 backdrop-blur-sm">
            <button 
              onClick={exportPDF}
              className="flex items-center justify-center gap-3 bg-slate-800 text-slate-300 px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-bold hover:bg-slate-700 transition-all active:scale-95 border border-slate-700 text-sm sm:text-base"
            >
              <Download className="w-4 h-4 sm:w-5 h-5" />
              Download PDF
            </button>
            <button 
              onClick={sharePDF}
              className="flex items-center justify-center gap-3 bg-indigo-600 text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-xl shadow-indigo-900/20 text-sm sm:text-base"
            >
              <Share2 className="w-4 h-4 sm:w-5 h-5" />
              Share via WhatsApp
            </button>
          </div>
        </div>
      </div>
    )}
    </ErrorBoundary>
  );
}

// Sub-components
function StatCard({ label, value, color, icon }: { label: string, value: string, color: string, icon: React.ReactNode }) {
  return (
    <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-800 shadow-xl shadow-black/20 flex flex-col justify-between group hover:shadow-2xl hover:border-slate-700 transition-all">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <span className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">{label}</span>
        <div className={cn("p-1.5 sm:p-2 rounded-lg sm:rounded-xl shadow-lg", color)}>{icon}</div>
      </div>
      <span className="text-xl sm:text-3xl font-display font-black tracking-tight text-white">{value}</span>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl font-bold text-sm transition-all duration-300",
        active ? "bg-slate-800 text-indigo-400 shadow-lg shadow-black/20" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

const AddMemberForm: React.FC<{ onAdd: (name: string, rent: boolean, mess: boolean, days: number) => void | Promise<void> }> = ({ onAdd }) => {
  const [name, setName] = useState('');
  const [rent, setRent] = useState(true);
  const [mess, setMess] = useState(true);
  const [days, setDays] = useState(30);

  return (
    <div className="bg-slate-900 p-5 sm:p-8 rounded-2xl sm:rounded-4xl border border-slate-800 shadow-xl shadow-black/20">
      <h3 className="font-display font-bold text-white mb-5 sm:mb-6 flex items-center gap-3">
        <div className="w-7 h-7 sm:w-8 h-8 bg-indigo-950/30 rounded-lg sm:rounded-xl flex items-center justify-center">
          <Plus className="w-4 h-4 text-indigo-500" />
        </div>
        Add New Member
      </h3>
      <div className="grid sm:grid-cols-4 gap-4 sm:gap-5">
        <div className="space-y-1.5">
          <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
          <input 
            type="text" 
            placeholder="e.g. Rahul Sharma" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl sm:rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all text-white placeholder-slate-600 text-sm"
          />
        </div>
        <div className="flex flex-col gap-2 sm:gap-3">
          <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Settings</label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400">Rent</span>
              <button 
                onClick={() => setRent(!rent)}
                className={cn(
                  "w-8 h-4 sm:w-9 h-5 rounded-full transition-colors relative",
                  rent ? "bg-indigo-600" : "bg-slate-700"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-3 h-3 sm:w-4 h-4 bg-white rounded-full transition-all",
                  rent ? "right-0.5" : "left-0.5"
                )} />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400">Mess</span>
              <button 
                onClick={() => setMess(!mess)}
                className={cn(
                  "w-8 h-4 sm:w-9 h-5 rounded-full transition-colors relative",
                  mess ? "bg-emerald-600" : "bg-slate-700"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-3 h-3 sm:w-4 h-4 bg-white rounded-full transition-all",
                  mess ? "right-0.5" : "left-0.5"
                )} />
              </button>
            </div>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Days in Mess</label>
          <input 
            type="number" 
            placeholder="30" 
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl sm:rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all text-white placeholder-slate-600 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button 
            onClick={() => {
              if (name) {
                onAdd(name, rent, mess, days);
                setName('');
              }
            }}
            className="w-full bg-indigo-600 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 text-sm"
          >
            <Plus className="w-4 h-4 sm:w-5 h-5" />
            Add Member
          </button>
        </div>
      </div>
    </div>
  );
}

const MemberCard: React.FC<{ 
  member: any, 
  onDelete: (id: string) => void | Promise<void>,
  onUpdateDays: (id: string, days: number) => void | Promise<void>,
  isAdmin: boolean
}> = ({ member, onDelete, onUpdateDays, isAdmin }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedDays, setEditedDays] = useState(member.totalDays);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    await onUpdateDays(member.id, editedDays);
    setIsEditing(false);
  };

  return (
    <div className="bg-slate-900 p-4 sm:p-6 rounded-2xl sm:rounded-4xl border border-slate-800 shadow-xl shadow-black/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 group hover:border-indigo-500/30 transition-all">
      <div className="flex items-center gap-4 sm:gap-5">
        <div className="w-12 h-12 sm:w-16 h-16 bg-slate-800 rounded-2xl sm:rounded-3xl flex items-center justify-center text-slate-500 font-display font-black text-xl sm:text-2xl uppercase border border-slate-700 group-hover:bg-indigo-950/30 group-hover:text-indigo-400 transition-colors">
          {member.name[0]}
        </div>
        <div className="min-w-0">
          <h4 className="font-display font-bold text-lg sm:text-xl text-white mb-1 sm:mb-1.5 truncate">{member.name}</h4>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {isEditing && isAdmin ? (
              <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
                <input 
                  type="number" 
                  value={editedDays}
                  onChange={(e) => setEditedDays(Number(e.target.value))}
                  className="w-10 bg-transparent text-[10px] font-bold text-white focus:outline-none px-1"
                  autoFocus
                />
                <button onClick={handleSave} className="text-emerald-400 hover:text-emerald-500">
                  <Check className="w-3 h-3" />
                </button>
                <button onClick={() => { setIsEditing(false); setEditedDays(member.totalDays); }} className="text-red-400 hover:text-red-500">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <span 
                onClick={() => isAdmin && setIsEditing(true)}
                className={cn(
                  "text-[9px] sm:text-[10px] font-bold bg-slate-800 text-slate-400 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg uppercase tracking-widest flex items-center gap-1.5 transition-colors",
                  isAdmin ? "cursor-pointer hover:bg-slate-700" : "cursor-default"
                )}
              >
                {member.totalDays} Days
                {isAdmin && <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
              </span>
            )}
            {member.roomRentEnabled && (
              <span className="text-[9px] sm:text-[10px] font-bold bg-indigo-950/30 text-indigo-400 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg uppercase tracking-widest border border-indigo-900/30">
                Rent
              </span>
            )}
            {member.messBillEnabled && (
              <span className="text-[9px] sm:text-[10px] font-bold bg-emerald-950/30 text-emerald-400 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg uppercase tracking-widest border border-emerald-900/30">
                Mess
              </span>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8">
        <div className="text-left sm:text-right">
          <p className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-0.5 sm:mb-1">Payable</p>
          <p className={cn(
            "text-2xl sm:text-3xl font-display font-black tracking-tight",
            member.balance < 0 ? "text-emerald-400" : "text-indigo-500"
          )}>
            AED {member.balance.toFixed(0)}
            <span className="text-xs sm:text-sm font-bold ml-0.5 opacity-60">.{member.balance.toFixed(2).split('.')[1]}</span>
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-red-950/30 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border border-red-900/20 animate-in fade-in slide-in-from-right-2">
                <span className="text-[8px] sm:text-[10px] font-bold text-red-400 uppercase tracking-widest px-1 sm:px-2">Sure?</span>
                <button 
                  onClick={() => onDelete(member.id)}
                  className="p-1.5 sm:p-2 bg-red-500 text-white rounded-lg sm:rounded-xl hover:bg-red-600 transition-colors"
                >
                  <Check className="w-3.5 h-3.5 sm:w-4 h-4" />
                </button>
                <button 
                  onClick={() => setConfirmDelete(false)}
                  className="p-1.5 sm:p-2 bg-slate-800 text-slate-400 rounded-lg sm:rounded-xl hover:bg-slate-700 transition-colors"
                >
                  <X className="w-3.5 h-3.5 sm:w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setConfirmDelete(true)}
                className="w-10 h-10 sm:w-12 h-12 flex items-center justify-center text-slate-600 hover:text-red-500 hover:bg-red-950/30 rounded-xl sm:rounded-2xl transition-all border border-transparent hover:border-red-900/30"
              >
                <Trash2 className="w-4 h-4 sm:w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const AddPurchaseForm: React.FC<{ members: Member[], onAdd: (desc: string, amt: number, mid: string) => void | Promise<void> }> = ({ members, onAdd }) => {
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [mid, setMid] = useState('');
  const [showMiniCalc, setShowMiniCalc] = useState(false);
  const [miniCalcInput, setMiniCalcInput] = useState('');

  const handleMiniCalc = (val: string) => {
    if (val === '=') {
      try {
        const result = Function(`"use strict"; return (${miniCalcInput})`)();
        setAmt(result.toString());
        setShowMiniCalc(false);
        setMiniCalcInput('');
      } catch {
        alert('Invalid calculation');
      }
    } else if (val === 'C') {
      setMiniCalcInput('');
    } else if (val === 'B') {
      setMiniCalcInput(prev => prev.slice(0, -1));
    } else {
      setMiniCalcInput(prev => prev + val);
    }
  };

  return (
    <div className="bg-slate-900 p-8 rounded-4xl border border-slate-800 shadow-sm relative">
      <h3 className="font-display font-bold text-white mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-950/30 rounded-xl flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-indigo-500" />
          </div>
          Record Purchase
        </div>
        <button 
          onClick={() => setShowMiniCalc(!showMiniCalc)}
          className={cn(
            "p-2 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest",
            showMiniCalc ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
          )}
        >
          <Calculator className="w-3.5 h-3.5" />
          {showMiniCalc ? 'Close Calc' : 'Use Calc'}
        </button>
      </h3>

      <AnimatePresence>
        {showMiniCalc && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-20 right-8 z-50 bg-slate-800 p-4 rounded-3xl border border-slate-700 shadow-2xl w-64"
          >
            <div className="bg-slate-900 p-3 rounded-xl mb-3 text-right font-mono text-lg text-indigo-400 min-h-[48px] flex items-center justify-end">
              {miniCalcInput || '0'}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', 'B', '+', '='].map(btn => (
                <button
                  key={btn}
                  onClick={() => handleMiniCalc(btn)}
                  className={cn(
                    "h-10 rounded-lg font-bold text-sm transition-all active:scale-90 flex items-center justify-center",
                    btn === '=' ? "col-span-2 bg-indigo-600 text-white" : 
                    ['/', '*', '-', '+'].includes(btn) ? "bg-indigo-500/20 text-indigo-400" :
                    btn === 'C' ? "bg-red-500/20 text-red-400" : 
                    btn === 'B' ? "bg-amber-500/20 text-amber-400" : "bg-slate-700 text-slate-300"
                  )}
                >
                  {btn === 'B' ? <Delete className="w-4 h-4" /> : btn}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid sm:grid-cols-4 gap-5">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Item Description</label>
          <input 
            type="text" 
            placeholder="e.g. Vegetables" 
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all text-white"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Amount (AED)</label>
          <div className="relative">
            <input 
              type="number" 
              placeholder="0.00" 
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all text-white pr-12"
            />
            <Calculator 
              className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 cursor-pointer hover:text-indigo-400 transition-colors"
              onClick={() => setShowMiniCalc(!showMiniCalc)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Buyer</label>
          <select 
            value={mid}
            onChange={(e) => setMid(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-3.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all appearance-none cursor-pointer text-white"
          >
            <option value="">Select Buyer</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button 
            onClick={() => {
              if (desc && amt && mid) {
                onAdd(desc, Number(amt), mid);
                setDesc('');
                setAmt('');
                setMid('');
              }
            }}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20"
          >
            <Plus className="w-5 h-5" />
            Add Purchase
          </button>
        </div>
      </div>
    </div>
  );
}

const VerificationScreen: React.FC<{ email: string, pendingReg: any }> = ({ email }) => {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900/50 backdrop-blur-2xl p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl relative z-10 text-center"
      >
        <div className="w-20 h-20 bg-amber-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-amber-500/20">
          <ShieldCheck className="w-10 h-10 text-amber-500" />
        </div>
        <h1 className="text-3xl font-display font-black text-white tracking-tight mb-4">Account Pending</h1>
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          Your account <span className="text-white font-bold">{email}</span> is awaiting approval. 
          Please wait for the <span className="text-indigo-400 font-bold">Admin</span> to approve your registration. 
          You will be granted access automatically once approved.
        </p>

        <div className="space-y-6">
          <div className="p-6 bg-indigo-600/10 border border-indigo-500/20 rounded-3xl">
            <div className="flex items-center justify-center gap-3 text-indigo-400 mb-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest">Waiting for Admin</span>
            </div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">This screen will update automatically</p>
          </div>

          <button 
            onClick={() => auth.signOut()}
            className="w-full bg-slate-800 text-slate-400 py-4 rounded-2xl font-bold hover:bg-slate-700 transition-all"
          >
            Sign Out
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const LoginScreen: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'registrations', userCredential.user.uid), {
          email,
          createdAt: new Date().toISOString()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-slate-900/50 backdrop-blur-2xl p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-900/40 mb-6">
            <Calculator className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-display font-black text-white tracking-tight mb-2">ROOMEX</h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] tracking-[0.3em]">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl pl-12 pr-5 py-4 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all text-white placeholder-slate-600"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl pl-12 pr-12 py-4 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all text-white placeholder-slate-600"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-xs font-medium"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all active:scale-[0.98] shadow-xl shadow-indigo-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {isSignUp ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                {isSignUp ? 'Create Account' : 'Sign In'}
              </>
            )}
          </button>
        </form>

        <div className="mt-8 flex flex-col gap-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest"><span className="bg-slate-900 px-4 text-slate-500">Or continue with</span></div>
          </div>

          <button 
            onClick={signIn}
            className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold hover:bg-slate-700 transition-all active:scale-[0.98] flex items-center justify-center gap-3 border border-slate-700"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Google
          </button>
        </div>

        <p className="mt-10 text-center text-sm text-slate-500">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-indigo-400 font-bold hover:text-indigo-300 transition-colors"
          >
            {isSignUp ? 'Sign In' : 'Create one'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
