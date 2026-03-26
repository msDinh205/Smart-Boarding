import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ClipboardCheck, 
  Home, 
  UserCheck, 
  Calendar, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle2, 
  Loader2,
  Mountain,
  Sparkles,
  ChevronRight,
  Info,
  Trash2,
  LayoutDashboard,
  History,
  LogIn,
  LogOut,
  User,
  TrendingUp,
  Award,
  BookOpen,
  BarChart3,
  Search,
  Filter,
  X
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell,
  Legend
} from 'recharts';
import { format, getWeek, getYear, startOfWeek, endOfWeek } from 'date-fns';
import { vi } from 'date-fns/locale';
import { ImageUpload } from './components/ImageUpload';
import { analyzeDiscipline } from './services/geminiService';
import { AnalysisResult } from './types';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  limit
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export default function App() {
  const CLASSES = [
    '6A', '6B', '7A', '7B', '7C', '8A', '8B', '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B'
  ];

  const [className, setClassName] = useState(CLASSES[0]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [view, setView] = useState<'input' | 'dashboard'>('input');
  const [subView, setSubView] = useState<'daily' | 'weekly'>('daily');
  const [history, setHistory] = useState<any[]>([]);
  const [journalScore, setJournalScore] = useState<number>(10);
  const [goodGradesCount, setGoodGradesCount] = useState<number>(0);
  const [dashboardFilter, setDashboardFilter] = useState({
    class: 'All',
    startDate: '',
    endDate: ''
  });
  
  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Fetch history
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'daily_scores'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'daily_scores');
    });
    return () => unsubscribe();
  }, [user]);
  const [uniformImage, setUniformImage] = useState<string | null>(null);
  const [diningImage, setDiningImage] = useState<string | null>(null);
  const [cleaningImage, setCleaningImage] = useState<string | null>(null);

  // Manual notes for each category
  const [manualNotes, setManualNotes] = useState({
    classDiscipline: '',
    dorm: '',
    dining: '',
    cleaning: ''
  });

  const [dormRooms, setDormRooms] = useState<{ id: number; score: number; image: string | null; notes: string }[]>([
    { id: 1, score: 3, image: null, notes: '' }
  ]);

  // Update manualNotes.dorm when dormRooms change
  useEffect(() => {
    const avg = dormRooms.reduce((a, b) => a + b.score, 0) / dormRooms.length;
    const roundedAvg = Math.round(avg * 1000) / 1000;
    const details = dormRooms.map(r => `P${r.id}: ${r.score}đ${r.notes ? ` (${r.notes})` : ''}`).join(', ');
    setManualNotes(prev => ({ 
      ...prev, 
      dorm: `Điểm trung bình ${dormRooms.length} phòng: ${roundedAvg}đ. Chi tiết: ${details}` 
    }));
  }, [dormRooms]);
  
  const [attendanceData, setAttendanceData] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);

  const [dailyScores, setDailyScores] = useState({
    friday: 10,
    saturday: 10,
    sunday: 10,
    monday: 10,
    tuesday: 10,
    wednesday: 10,
    thursday: 10
  });

  const [weeklyViolations, setWeeklyViolations] = useState<string[]>([]);

  // Fetch daily scores for the current competition week (Friday to Thursday)
  useEffect(() => {
    if (!user || !className || !selectedDate) return;

    const date = new Date(selectedDate);
    // Find the Friday of the current competition week
    // Friday is day 5. Mapping: Fri(5)->0, Sat(6)->1, Sun(0)->2, Mon(1)->3, Tue(2)->4, Wed(3)->5, Thu(4)->6
    const daysSinceFriday = (date.getDay() + 2) % 7;
    const friday = new Date(date);
    friday.setDate(date.getDate() - daysSinceFriday);
    friday.setHours(0, 0, 0, 0);

    const thursday = new Date(friday);
    thursday.setDate(friday.getDate() + 6);
    thursday.setHours(23, 59, 59, 999);

    const startDateStr = friday.toISOString().split('T')[0];
    const endDateStr = thursday.toISOString().split('T')[0];

    const q = query(
      collection(db, 'daily_scores'),
      where('className', '==', className),
      where('date', '>=', startDateStr),
      where('date', '<=', endDateStr)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const scores = {
        friday: 10,
        saturday: 10,
        sunday: 10,
        monday: 10,
        tuesday: 10,
        wednesday: 10,
        thursday: 10
      };
      const violations: string[] = [];

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const docDate = new Date(data.date);
        const dayMapping: Record<number, string> = {
          0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
        };
        const dayKey = dayMapping[docDate.getDay()];
        if (dayKey in scores) {
          (scores as any)[dayKey] = data.score ?? 10;
        }

        if (data.details) {
          violations.push(`${data.date}: ${data.details}`);
        }
      });

      setDailyScores(scores);
      setWeeklyViolations(violations);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'daily_scores');
    });

    return () => unsubscribe();
  }, [user, className, selectedDate]);

  const handleAnalyze = async () => {
    if (!className) {
      alert("Vui lòng nhập tên lớp.");
      return;
    }
    
    const hasDormData = dormRooms.some(r => r.image || r.notes);
    const hasData = hasDormData || uniformImage || diningImage || cleaningImage || 
                    attendanceData || Object.values(manualNotes).some(v => v.trim());
                    
    if (!hasData) {
      alert("Vui lòng cung cấp ít nhất một loại dữ liệu (ảnh, báo cáo hoặc lỗi thủ công).");
      return;
    }

    setLoading(true);
    setVerified(false);
    try {
      const data = await analyzeDiscipline(
        className,
        selectedDate,
        dormRooms.map(r => r.image).filter(Boolean) as string[],
        uniformImage || undefined,
        diningImage || undefined,
        cleaningImage || undefined,
        attendanceData || undefined,
        manualNotes
      );
      setResult(data);
      
      // Update daily scores locally for immediate feedback
      const date = new Date(selectedDate);
      const dayMapping: Record<number, string> = {
        0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday'
      };
      const dayKey = dayMapping[date.getDay()];
      setDailyScores(prev => ({
        ...prev,
        [dayKey]: data.scores.disciplineTotal
      }));
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Có lỗi xảy ra trong quá trình phân tích. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!user) {
      alert("Vui lòng đăng nhập để lưu điểm.");
      return;
    }
    if (!result) return;

    setSaving(true);
    try {
      // Save Daily Score
      const dailyData = {
        className: className,
        date: selectedDate,
        score: result.scores.disciplineTotal,
        scores: result.scores,
        details: result.pedagogicalMessage,
        authorUid: user.uid,
        createdAt: serverTimestamp()
      };
      console.log("Saving daily score:", dailyData);
      try {
        await addDoc(collection(db, 'daily_scores'), dailyData);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'daily_scores');
      }

      setVerified(true);
      alert("Đã phê duyệt và lưu kết quả thành công!");
    } catch (error: any) {
      console.error("Verification failed:", error);
      let errorMessage = "Có lỗi xảy ra khi lưu kết quả.";
      try {
        const parsedError = JSON.parse(error.message);
        errorMessage = `Lỗi Firestore: ${parsedError.error} (Operation: ${parsedError.operationType})`;
      } catch (e) {
        errorMessage = error.message || errorMessage;
      }
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa bản ghi này?")) return;
    
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'daily_scores', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'daily_scores');
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      {/* Header */}
      <header className="bg-primary text-secondary py-8 px-6 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
          <Mountain size={200} />
        </div>
        <div className="max-w-5xl mx-auto relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent rounded-2xl shadow-inner">
              <ClipboardCheck size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Smart Boarding 4.0: Giải pháp Số hóa Nề nếp và Học tập</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3 bg-white/5 p-2 pr-4 rounded-2xl border border-white/10">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-10 h-10 rounded-xl shadow-sm" />
                ) : (
                  <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center">
                    <User size={20} className="text-white" />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white">{user.displayName}</span>
                  <button onClick={logout} className="text-[10px] font-bold text-accent uppercase tracking-widest text-left hover:text-accent/80 transition-colors">Đăng xuất</button>
                </div>
              </div>
            ) : (
              <button 
                onClick={loginWithGoogle}
                className="flex items-center gap-2 bg-white text-primary px-5 py-2.5 rounded-2xl font-bold text-sm shadow-lg hover:bg-secondary transition-all"
              >
                <LogIn size={18} />
                Đăng nhập Google
              </button>
            )}
          </div>
        </div>
      </header>

      {/* View Switcher */}
      <div className="bg-white border-b border-primary/5 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 flex items-center gap-8">
          <button 
            onClick={() => setView('input')}
            className={cn(
              "py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
              view === 'input' ? "border-accent text-primary" : "border-transparent text-primary/40 hover:text-primary/60"
            )}
          >
            Chấm điểm mới
          </button>
          <button 
            onClick={() => setView('dashboard')}
            className={cn(
              "py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2",
              view === 'dashboard' ? "border-accent text-primary" : "border-transparent text-primary/40 hover:text-primary/60"
            )}
          >
            Bảng tổng hợp
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6">
        <AnimatePresence mode="wait">
          {view === 'input' ? (
            <motion.div 
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Sub-View Switcher */}
              <div className="flex bg-primary/5 p-1 rounded-2xl w-fit mx-auto lg:mx-0">
                <button 
                  onClick={() => setSubView('daily')}
                  className={cn(
                    "px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                    subView === 'daily' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary/60"
                  )}
                >
                  Chấm điểm ngày
                </button>
                <button 
                  onClick={() => setSubView('weekly')}
                  className={cn(
                    "px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                    subView === 'weekly' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary/60"
                  )}
                >
                  Tổng kết tuần
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {subView === 'daily' ? (
                  <>
                    {/* Left Column: Input */}
                    <div className="lg:col-span-5 space-y-8">
                      {(() => {
                        const dayOfWeek = new Date(selectedDate).getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                        if (isWeekend) {
                          return (
                            <section className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 space-y-6">
                              <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-xs">
                                <AlertTriangle size={16} className="text-red-500" />
                                <span>Ghi nhận vi phạm cuối tuần ({dayOfWeek === 6 ? 'Thứ 7' : 'Chủ Nhật'})</span>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Tên lớp</label>
                                  <select 
                                    className="w-full p-3 rounded-xl border-2 border-primary/10 bg-primary/5 focus:border-primary/30 focus:ring-0 transition-all text-sm appearance-none cursor-pointer"
                                    value={className}
                                    onChange={(e) => setClassName(e.target.value)}
                                  >
                                    {CLASSES.map(cls => (
                                      <option key={cls} value={cls}>{cls}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Ngày chấm điểm</label>
                                  <input 
                                    type="date"
                                    className="w-full p-3 rounded-xl border-2 border-primary/10 bg-primary/5 focus:border-primary/30 focus:ring-0 transition-all text-sm"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                  />
                                </div>
                              </div>

                              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 space-y-3">
                                <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                                  <span className="font-bold uppercase block mb-1">Quy tắc cuối tuần:</span>
                                  Cuối tuần không chấm theo tiêu chí hàng ngày (phòng ở, bàn ăn, vệ sinh...). 
                                  Chỉ cần ghi nhận nếu có bất kỳ lỗi vi phạm nào. Nếu có lỗi, lớp sẽ bị <span className="text-red-600 font-bold">trừ 2đ</span> trực tiếp vào điểm trung bình tuần.
                                </p>
                              </div>

                              <div className="space-y-4">
                                <ImageUpload 
                                  label="Ảnh minh chứng vi phạm (nếu có)" 
                                  image={uniformImage} 
                                  onImageChange={setUniformImage} 
                                />
                                <div className="space-y-2">
                                  <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Mô tả vi phạm</label>
                                  <textarea 
                                    className="w-full h-48 p-4 rounded-xl border-2 border-primary/10 bg-primary/5 focus:border-primary/30 focus:ring-0 transition-all text-sm resize-none"
                                    placeholder="Nhập các lỗi vi phạm (vd: học sinh trốn trại, đánh nhau, mất trật tự, vi phạm nội quy...)"
                                    value={attendanceData}
                                    onChange={(e) => setAttendanceData(e.target.value)}
                                  />
                                </div>
                              </div>

                              <button 
                                onClick={handleAnalyze}
                                disabled={loading}
                                className={cn(
                                  "w-full py-4 rounded-2xl font-bold text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20",
                                  loading ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary/90 active:scale-[0.98]"
                                )}
                              >
                                {loading ? (
                                  <>
                                    <Loader2 className="animate-spin" size={20} />
                                    <span>Đang kiểm tra...</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles size={20} />
                                    <span>Xác nhận vi phạm</span>
                                  </>
                                )}
                              </button>
                            </section>
                          );
                        }

                        return (
                          <section className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 space-y-6">
                            <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-xs">
                              <Sparkles size={16} className="text-accent" />
                              <span>Dữ liệu đầu vào</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Tên lớp</label>
                                <select 
                                  className="w-full p-3 rounded-xl border-2 border-primary/10 bg-primary/5 focus:border-primary/30 focus:ring-0 transition-all text-sm appearance-none cursor-pointer"
                                  value={className}
                                  onChange={(e) => setClassName(e.target.value)}
                                >
                                  {CLASSES.map(cls => (
                                    <option key={cls} value={cls}>{cls}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Ngày chấm điểm</label>
                                <input 
                                  type="date"
                                  className="w-full p-3 rounded-xl border-2 border-primary/10 bg-primary/5 focus:border-primary/30 focus:ring-0 transition-all text-sm"
                                  value={selectedDate}
                                  onChange={(e) => setSelectedDate(e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-3">
                                {/* Dorm Rooms Scoring Section */}
                                <div className="bg-white p-4 rounded-2xl border border-primary/5 space-y-4">
                                  <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider flex items-center gap-1.5">
                                      <Home size={12} className="text-accent" />
                                      Chấm điểm phòng ở (TB cộng)
                                    </label>
                                    <button 
                                      onClick={() => setDormRooms(prev => [...prev, { id: prev.length + 1, score: 3, image: null, notes: '' }])}
                                      className="text-[9px] font-bold text-accent uppercase tracking-widest px-2 py-0.5 bg-accent/5 rounded-full hover:bg-accent/10 transition-colors"
                                    >
                                      + Thêm phòng
                                    </button>
                                  </div>
                                  
                                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                                    {dormRooms.map((room, index) => (
                                      <div key={index} className="p-3 bg-primary/5 rounded-xl border border-primary/5 space-y-3">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-bold text-primary/40 uppercase">Phòng {room.id}</span>
                                            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-primary/10">
                                              <span className="text-[9px] font-bold text-primary/40 uppercase">Điểm:</span>
                                              <input 
                                                type="number"
                                                min="0"
                                                max="3"
                                                step="0.001"
                                                className="w-12 bg-transparent border-none p-0 text-xs font-black text-primary focus:ring-0"
                                                value={room.score}
                                                onChange={(e) => {
                                                  const newScore = parseFloat(e.target.value) || 0;
                                                  setDormRooms(prev => prev.map((r, i) => i === index ? { ...r, score: newScore } : r));
                                                }}
                                              />
                                            </div>
                                          </div>
                                          {dormRooms.length > 1 && (
                                            <button 
                                              onClick={() => setDormRooms(prev => prev.filter((_, i) => i !== index))}
                                              className="text-red-400 hover:text-red-600 transition-colors p-1"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          <ImageUpload 
                                            label={`Ảnh P${room.id}`}
                                            image={room.image} 
                                            onImageChange={(img) => setDormRooms(prev => prev.map((r, i) => i === index ? { ...r, image: img } : r))}
                                          />
                                          <ManualInput 
                                            placeholder={`Ghi chú lỗi P${room.id}...`}
                                            value={room.notes}
                                            onChange={(val) => setDormRooms(prev => prev.map((r, i) => i === index ? { ...r, notes: val } : r))}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  
                                  <div className="flex items-center justify-between px-3 py-2 bg-accent/5 rounded-lg border border-accent/10">
                                    <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Điểm TB cộng ({dormRooms.length} phòng):</span>
                                    <span className="text-sm font-black text-accent">
                                      {(dormRooms.reduce((a, b) => a + b.score, 0) / dormRooms.length).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}đ
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <ImageUpload 
                                  label="Lớp học & Tác phong" 
                                  image={uniformImage} 
                                  onImageChange={setUniformImage} 
                                />
                                <ManualInput 
                                  placeholder="Nhập lỗi lớp học (vd: vắng muộn, không khăn quàng...)" 
                                  value={manualNotes.classDiscipline}
                                  onChange={(val) => setManualNotes(prev => ({ ...prev, classDiscipline: val }))}
                                />
                              </div>

                              <div className="space-y-3">
                                <ImageUpload 
                                  label="Bàn ăn" 
                                  image={diningImage} 
                                  onImageChange={setDiningImage} 
                                />
                                <ManualInput 
                                  placeholder="Nhập lỗi bàn ăn (vd: chưa dọn khay, rác sàn...)" 
                                  value={manualNotes.dining}
                                  onChange={(val) => setManualNotes(prev => ({ ...prev, dining: val }))}
                                />
                              </div>

                              <div className="space-y-3">
                                <ImageUpload 
                                  label="Vệ sinh khu vực" 
                                  image={cleaningImage} 
                                  onImageChange={setCleaningImage} 
                                />
                                <ManualInput 
                                  placeholder="Nhập lỗi vệ sinh (vd: còn rác, chưa quét...)" 
                                  value={manualNotes.cleaning}
                                  onChange={(val) => setManualNotes(prev => ({ ...prev, cleaning: val }))}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium text-primary/80 uppercase tracking-wider">Báo cáo thực tế / Chuyên cần</label>
                              <textarea 
                                className="w-full h-32 p-4 rounded-xl border-2 border-primary/10 bg-primary/5 focus:border-primary/30 focus:ring-0 transition-all text-sm resize-none"
                                placeholder="Nhập danh sách vắng mặt, lỗi vi phạm đặc biệt (thuốc lá, đánh bài...)"
                                value={attendanceData}
                                onChange={(e) => setAttendanceData(e.target.value)}
                              />
                            </div>

                            <button 
                              onClick={handleAnalyze}
                              disabled={loading}
                              className={cn(
                                "w-full py-4 rounded-2xl font-bold text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20",
                                loading ? "bg-primary/50 cursor-not-allowed" : "bg-primary hover:bg-primary/90 active:scale-[0.98]"
                              )}
                            >
                              {loading ? (
                                <>
                                  <Loader2 className="animate-spin" size={20} />
                                  <span>Đang soi xét...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={20} />
                                  <span>Gợi ý chấm điểm</span>
                                </>
                              )}
                            </button>
                          </section>
                        );
                      })()}
                    </div>

                    {/* Right Column: Results */}
                    <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {!result && !loading ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border-2 border-dashed border-primary/10 opacity-60"
              >
                <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6">
                  <ClipboardCheck size={40} className="text-primary/20" />
                </div>
                <h3 className="text-lg font-bold text-primary/40">Sẵn sàng hỗ trợ Thầy/Cô</h3>
                <p className="text-sm text-primary/30 max-w-xs mt-2">
                  Vui lòng cung cấp hình ảnh hoặc báo cáo để AI đối chiếu với bảng tiêu chí nề nếp.
                </p>
              </motion.div>
            ) : loading ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center p-12 space-y-6"
              >
                <div className="relative">
                  <Loader2 className="animate-spin text-accent" size={64} />
                  <Mountain className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary/20" size={24} />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-primary">Đang đối soát tiêu chí...</h3>
                  <p className="text-sm text-primary/60 mt-2 italic">"Cẩn thận như soi từng hạt ngô trên nương..."</p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                {/* Class Info */}
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-primary/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/5 text-primary rounded-xl">
                      <UserCheck size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Lớp: {result.className || className}</h3>
                      <p className="text-[10px] text-primary/40 font-medium tracking-widest uppercase">
                        {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Score Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <ScoreCard icon={<ClipboardCheck size={18} />} label="Lớp học" score={result.scores.classDiscipline} max={3} />
                  <ScoreCard icon={<Home size={18} />} label="Phòng ở" score={result.scores.dorm} max={3} />
                  <ScoreCard icon={<UserCheck size={18} />} label="Bàn ăn" score={result.scores.dining} max={2} />
                  <ScoreCard icon={<Calendar size={18} />} label="Vệ sinh" score={result.scores.cleaning} max={2} />
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-primary/40 uppercase tracking-wider">Tổng điểm nề nếp ngày</span>
                    <div className="text-3xl font-black text-primary">{result.scores.disciplineTotal}<span className="text-sm text-primary/20 font-bold">/10</span></div>
                  </div>
                  <div className="p-3 bg-primary/5 text-primary rounded-2xl">
                    <ClipboardCheck size={24} />
                  </div>
                </div>

                {/* Weekly Progress Section */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                      <TrendingUp size={18} className="text-accent" />
                      Tiến độ nề nếp tuần (Thứ 6 - Thứ 5)
                    </h3>
                    <div className="bg-accent/10 text-accent px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                      Trung bình: {(() => {
                        const weekdayScores = [
                          dailyScores.friday,
                          dailyScores.monday,
                          dailyScores.tuesday,
                          dailyScores.wednesday,
                          dailyScores.thursday
                        ];
                        const baseAvg = weekdayScores.reduce((a, b) => a + b, 0) / 5;
                        let finalAvg = baseAvg;
                        if (dailyScores.saturday < 10) finalAvg -= 2;
                        if (dailyScores.sunday < 10) finalAvg -= 2;
                        return Math.max(0, finalAvg);
                      })().toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}đ
                    </div>
                  </div>

                  <p className="text-[10px] text-primary/40 italic">
                    * Ghi chú: Thứ 7 & CN chỉ theo dõi vi phạm. Nếu có lỗi sẽ trừ trực tiếp 2đ vào điểm trung bình của các ngày thường (T6, T2, T3, T4, T5).
                  </p>

                  <div className="grid grid-cols-7 gap-2">
                    {[
                      { key: 'friday', label: 'T6' },
                      { key: 'saturday', label: 'T7' },
                      { key: 'sunday', label: 'CN' },
                      { key: 'monday', label: 'T2' },
                      { key: 'tuesday', label: 'T3' },
                      { key: 'wednesday', label: 'T4' },
                      { key: 'thursday', label: 'T5' }
                    ].map((day) => (
                      <div key={day.key} className="flex flex-col items-center gap-2">
                        <div className="h-24 w-full bg-primary/5 rounded-lg relative overflow-hidden">
                          <motion.div 
                            initial={{ height: 0 }}
                            animate={{ height: `${(dailyScores as any)[day.key] * 10}%` }}
                            className={cn(
                              "absolute bottom-0 left-0 right-0 transition-all",
                              (day.key === 'saturday' || day.key === 'sunday') ? (
                                (dailyScores as any)[day.key] >= 10 ? "bg-green-500" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                              ) : (
                                (dailyScores as any)[day.key] >= 8 ? "bg-green-500" : 
                                (dailyScores as any)[day.key] >= 5 ? "bg-accent" : "bg-red-500"
                              )
                            )}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-primary/40 uppercase">{day.label}</span>
                        <span className="text-[10px] font-black text-primary">
                          {(day.key === 'saturday' || day.key === 'sunday') ? (
                            (dailyScores as any)[day.key] < 10 ? "-2đ" : "0đ"
                          ) : (
                            (dailyScores as any)[day.key]
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pedagogical Message */}
                <section className="bg-primary text-secondary p-8 rounded-3xl shadow-xl relative overflow-hidden">
                  <div className="absolute -bottom-4 -right-4 opacity-10">
                    <Mountain size={120} />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles size={18} className="text-accent" />
                      <span className="text-xs font-bold uppercase tracking-widest opacity-70">Nhận xét sư phạm</span>
                    </div>
                    <blockquote className="text-lg md:text-xl font-serif italic leading-relaxed">
                      "{result.pedagogicalMessage}"
                    </blockquote>
                  </div>
                </section>

                {/* Deductions List */}
                <section className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5">
                  <h3 className="text-sm font-bold text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
                    <AlertCircle size={18} className="text-accent" />
                    Chi tiết vi phạm (AI Gợi ý)
                  </h3>
                  <div className="space-y-3">
                    {result.deductions.map((item, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        key={idx} 
                        className="flex items-center justify-between gap-3 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100"
                      >
                        <div className="flex gap-3 items-start">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                          <div>
                            <span className="font-bold text-primary block text-xs uppercase mb-0.5">{item.category}</span>
                            <span className="text-slate-600">{item.reason}</span>
                          </div>
                        </div>
                        <span className="font-bold text-red-500 shrink-0">-{item.points}đ</span>
                      </motion.div>
                    ))}
                    {result.deductions.length === 0 && (
                      <p className="text-sm text-primary/40 text-center py-4 italic">Không phát hiện vi phạm nào.</p>
                    )}
                  </div>
                </section>

                {/* Special Support Case */}
                {result.specialSupportCase?.isSpecial && (
                  <section className="bg-amber-50 p-6 rounded-3xl border border-amber-200 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                        <AlertCircle size={20} />
                      </div>
                      <h4 className="text-sm font-bold text-amber-900 uppercase tracking-wider">Trường hợp cần hỗ trợ đặc biệt</h4>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-amber-800 font-medium">{result.specialSupportCase.reason}</p>
                      <div className="flex gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest",
                          result.specialSupportCase.type === 'skill' ? "bg-blue-100 text-blue-700" :
                          result.specialSupportCase.type === 'attitude' ? "bg-red-100 text-red-700" : "bg-purple-100 text-purple-700"
                        )}>
                          {result.specialSupportCase.type === 'skill' ? "Thiếu kỹ năng" :
                           result.specialSupportCase.type === 'attitude' ? "Ý thức chưa tốt" : "Dấu hiệu tâm lý"}
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {/* Educational Suggestions */}
                {result.educationalSuggestions && result.educationalSuggestions.length > 0 && (
                  <section className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 space-y-4">
                    <h3 className="text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                      <Award size={18} className="text-green-500" />
                      Giải pháp giáo dục tích cực
                    </h3>
                    <div className="space-y-3">
                      {result.educationalSuggestions.map((suggestion, idx) => (
                        <div key={idx} className="flex gap-3 items-start p-3 bg-green-50/50 rounded-xl border border-green-100/50">
                          <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
                          <p className="text-sm text-slate-700 leading-relaxed">{suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Attendance Alert */}
                {result.attendanceAlert && (
                  <section className="bg-red-50 p-6 rounded-3xl border border-red-100 flex gap-4 items-start">
                    <div className="p-2 bg-red-100 text-red-600 rounded-xl">
                      <AlertCircle size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-red-900 uppercase tracking-wider mb-1">Cảnh báo quan trọng</h4>
                      <p className="text-sm text-red-700 leading-relaxed">{result.attendanceAlert}</p>
                    </div>
                  </section>
                )}

                {/* Verification Action */}
                <div className="pt-4 space-y-4">
                  <p className="text-xs text-center text-primary/40 italic">
                    Mời Thầy/Cô kiểm tra lại hình ảnh để xác nhận lỗi trước khi phê duyệt kết quả cuối cùng.
                  </p>
                  {!verified ? (
                    <button 
                      onClick={handleVerify}
                      disabled={saving}
                      className={cn(
                        "w-full py-4 bg-accent text-white rounded-2xl font-bold shadow-lg shadow-accent/20 hover:bg-accent/90 transition-all flex items-center justify-center gap-2",
                        saving && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={20} />
                          <span>Phê duyệt kết quả</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="w-full py-4 bg-green-100 text-green-700 rounded-2xl font-bold flex items-center justify-center gap-2 border border-green-200">
                      <CheckCircle2 size={20} />
                      <span>Đã phê duyệt & Lưu điểm</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </>
        ) : (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-12 space-y-8"
          >
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-primary/5 space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-black text-primary">Tổng kết tuần thi đua</h2>
                  <p className="text-sm text-primary/40 font-medium">Lớp {className} • Tuần từ Thứ 6 đến Thứ 5</p>
                </div>
                <div className="flex gap-4">
                  <div className="p-4 bg-accent/5 rounded-2xl text-right">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest block mb-1">TB Nề nếp</span>
                    <span className="text-2xl font-black text-accent">
                      {(() => {
                        const weekdayScores = [
                          dailyScores.friday,
                          dailyScores.monday,
                          dailyScores.tuesday,
                          dailyScores.wednesday,
                          dailyScores.thursday
                        ];
                        const weekdayAvg = weekdayScores.reduce((a, b) => a + b, 0) / 5;
                        return Math.max(0, weekdayAvg).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                      })()}đ
                    </span>
                  </div>
                  <div className="p-4 bg-primary/5 rounded-2xl text-right border border-primary/10">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest block mb-1">Điểm TB Lớp</span>
                    <span className="text-3xl font-black text-primary">
                      {(() => {
                        const weekdayScores = [
                          dailyScores.friday,
                          dailyScores.monday,
                          dailyScores.tuesday,
                          dailyScores.wednesday,
                          dailyScores.thursday
                        ];
                        const avgDiscipline = weekdayScores.reduce((a, b) => a + b, 0) / 5;
                        const diemNeNep = avgDiscipline;
                        const diemThu7 = dailyScores.saturday < 10 ? 2 : 0;
                        const diemChuNhat = dailyScores.sunday < 10 ? 2 : 0;
                        
                        let bonusPoints = 0;
                        if (goodGradesCount > 0) {
                          if (goodGradesCount <= 5) bonusPoints = 2;
                          else if (goodGradesCount <= 10) bonusPoints = 4;
                          else if (goodGradesCount <= 15) bonusPoints = 6;
                          else if (goodGradesCount <= 20) bonusPoints = 8;
                          else bonusPoints = 10;
                        }

                        const classAvg = (0.45 * diemNeNep) + (0.45 * journalScore) + (0.1 * bonusPoints) - (diemThu7 + diemChuNhat);
                        return Math.max(0, classAvg).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                      })()}đ
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-primary/5 p-6 rounded-2xl border border-primary/10">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider flex items-center gap-2">
                    <BookOpen size={12} className="text-accent" />
                    Điểm Sổ đầu bài (Tuần)
                  </label>
                  <input 
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    className="w-full p-3 rounded-xl border-2 border-primary/10 bg-white focus:border-primary/30 focus:ring-0 transition-all text-sm font-bold"
                    value={journalScore}
                    onChange={(e) => setJournalScore(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-primary/60 uppercase tracking-wider flex items-center gap-2">
                    <Award size={12} className="text-accent" />
                    Số điểm 9, 10 trong tuần
                  </label>
                  <input 
                    type="number"
                    min="0"
                    className="w-full p-3 rounded-xl border-2 border-primary/10 bg-white focus:border-primary/30 focus:ring-0 transition-all text-sm font-bold"
                    value={goodGradesCount}
                    onChange={(e) => setGoodGradesCount(parseInt(e.target.value) || 0)}
                  />
                  <div className="text-[9px] text-primary/40 italic">
                    {goodGradesCount > 0 ? `Điểm thưởng: +${(() => {
                      if (goodGradesCount <= 5) return 2;
                      if (goodGradesCount <= 10) return 4;
                      if (goodGradesCount <= 15) return 6;
                      if (goodGradesCount <= 20) return 8;
                      return 10;
                    })()}đ` : 'Chưa có điểm thưởng'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
                {[
                  { key: 'friday', label: 'Thứ 6' },
                  { key: 'saturday', label: 'Thứ 7' },
                  { key: 'sunday', label: 'Chủ Nhật' },
                  { key: 'monday', label: 'Thứ 2' },
                  { key: 'tuesday', label: 'Thứ 3' },
                  { key: 'wednesday', label: 'Thứ 4' },
                  { key: 'thursday', label: 'Thứ 5' }
                ].map((day) => (
                  <div key={day.key} className="p-4 bg-primary/5 rounded-2xl border border-primary/5 flex flex-col items-center gap-2">
                    <span className="text-[10px] font-bold text-primary/40 uppercase">{day.label}</span>
                    <span className={cn(
                      "text-xl font-black",
                      (day.key === 'saturday' || day.key === 'sunday') ? (
                        (dailyScores as any)[day.key] < 10 ? "text-red-500" : "text-green-500"
                      ) : (
                        (dailyScores as any)[day.key] >= 8 ? "text-green-500" : 
                        (dailyScores as any)[day.key] >= 5 ? "text-accent" : "text-red-500"
                      )
                    )}>
                      {(day.key === 'saturday' || day.key === 'sunday') ? (
                        (dailyScores as any)[day.key] < 10 ? "-2đ" : "0đ"
                      ) : (
                        (dailyScores as any)[day.key]
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                  <AlertCircle size={18} className="text-accent" />
                  Chi tiết các lỗi vi phạm trong tuần
                </h3>
                <div className="space-y-3">
                  {weeklyViolations.length > 0 ? (
                    weeklyViolations.map((v, idx) => (
                      <div key={idx} className="p-4 bg-red-50 rounded-2xl border border-red-100 flex gap-4 items-start">
                        <div className="p-2 bg-red-100 text-red-600 rounded-xl shrink-0">
                          <AlertCircle size={16} />
                        </div>
                        <p className="text-sm text-red-700 leading-relaxed">{v}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center bg-green-50 rounded-3xl border border-green-100">
                      <Sparkles size={32} className="text-green-400 mx-auto mb-3" />
                      <p className="text-sm text-green-700 font-medium">Tuyệt vời! Không có lỗi vi phạm nào được ghi nhận trong tuần này.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
    ) : (
      <motion.div
        key="dashboard"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="space-y-8"
      >
        <Dashboard 
          history={history} 
          filter={dashboardFilter}
          setFilter={setDashboardFilter}
          onDelete={handleDelete}
          classes={CLASSES}
        />
      </motion.div>
    )}
  </AnimatePresence>
</main>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-primary/5 text-center">
        <p className="text-xs text-primary/40 font-medium uppercase tracking-[0.2em]">
          Smart Boarding 4.0: Giải pháp Số hóa Nề nếp và Học tập &copy; 2026
        </p>
      </footer>
    </div>
  );
}

function Dashboard({ 
  history, 
  filter, 
  setFilter,
  onDelete,
  classes
}: { 
  history: any[], 
  filter: any,
  setFilter: (f: any) => void,
  onDelete: (id: string) => void,
  classes: string[]
}) {
  const filteredHistory = history.filter(h => {
    const matchesClass = filter.class === 'All' || h.className === filter.class;
    const matchesStartDate = !filter.startDate || h.date >= filter.startDate;
    const matchesEndDate = !filter.endDate || h.date <= filter.endDate;
    return matchesClass && matchesStartDate && matchesEndDate;
  });

  // Stats calculation
  const totalRecords = filteredHistory.length;
  const avgScore = totalRecords > 0 
    ? (filteredHistory.reduce((acc, curr) => acc + curr.score, 0) / totalRecords).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : '0,000';
  
  const classStats = classes.map(cls => {
    const classRecords = filteredHistory.filter(h => h.className === cls);
    const avg = classRecords.length > 0
      ? (classRecords.reduce((acc, curr) => acc + curr.score, 0) / classRecords.length).toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
      : '0,000';
    return { name: cls, avg: parseFloat(avg.replace(',', '.') as string) };
  }).filter(s => s.avg > 0);

  // Chart data (last 10 entries for trend)
  const trendData = [...filteredHistory].reverse().slice(-10).map(h => ({
    name: h.date,
    score: h.score,
    class: h.className
  }));

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 flex items-center gap-4">
          <div className="p-3 bg-primary/5 text-primary rounded-2xl">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">Tổng số bản ghi</p>
            <p className="text-2xl font-black text-primary">{totalRecords}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 flex items-center gap-4">
          <div className="p-3 bg-accent/5 text-accent rounded-2xl">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">Điểm trung bình</p>
            <p className="text-2xl font-black text-accent">{avgScore}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 flex items-center gap-4">
          <div className="p-3 bg-green-50 text-green-600 rounded-2xl">
            <Award size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">Lớp dẫn đầu</p>
            <p className="text-2xl font-black text-green-600">
              {classStats.length > 0 ? classStats.reduce((a, b) => a.avg > b.avg ? a : b).name : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-primary/5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 bg-primary/5 px-3 py-1.5 rounded-xl">
          <Filter size={14} className="text-primary/40" />
          <span className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Lọc dữ liệu:</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-primary/40 uppercase ml-1">Lớp</span>
            <select 
              className="bg-primary/5 border-none rounded-xl px-4 py-2 text-xs font-bold text-primary focus:ring-0 cursor-pointer"
              value={filter.class}
              onChange={(e) => setFilter({ ...filter, class: e.target.value })}
            >
              <option value="All">Tất cả các lớp</option>
              {classes.map(cls => (
                <option key={cls} value={cls}>Lớp {cls}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-primary/40 uppercase ml-1">Từ ngày</span>
            <input 
              type="date"
              className="bg-primary/5 border-none rounded-xl px-4 py-2 text-xs font-bold text-primary focus:ring-0 cursor-pointer"
              value={filter.startDate}
              onChange={(e) => setFilter({ ...filter, startDate: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold text-primary/40 uppercase ml-1">Đến ngày</span>
            <input 
              type="date"
              className="bg-primary/5 border-none rounded-xl px-4 py-2 text-xs font-bold text-primary focus:ring-0 cursor-pointer"
              value={filter.endDate}
              onChange={(e) => setFilter({ ...filter, endDate: e.target.value })}
            />
          </div>

          {(filter.class !== 'All' || filter.startDate || filter.endDate) && (
            <button 
              onClick={() => setFilter({ class: 'All', startDate: '', endDate: '' })}
              className="mt-5 px-4 py-2 bg-red-50 text-red-500 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 transition-colors flex items-center gap-2"
            >
              <X size={12} />
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 space-y-4">
          <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
            <TrendingUp size={16} className="text-accent" />
            Xu hướng điểm số
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                />
                <YAxis 
                  domain={[0, 10]} 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', fontSize: '12px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="score" 
                  stroke="#F27D26" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#F27D26', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-primary/5 space-y-4">
          <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" />
            So sánh giữa các lớp
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                />
                <YAxis 
                  domain={[0, 10]} 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }} 
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                  {classStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#141414' : '#F27D26'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-primary/5 overflow-hidden">
        <div className="p-6 border-b border-primary/5 flex items-center justify-between">
          <h3 className="text-xs font-bold text-primary uppercase tracking-widest flex items-center gap-2">
            <History size={16} className="text-primary/40" />
            Lịch sử ghi nhận
          </h3>
          <div className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">
            Hiển thị {filteredHistory.length} kết quả
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-primary/5">
                <th className="px-6 py-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest">Ngày</th>
                <th className="px-6 py-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest">Lớp</th>
                <th className="px-6 py-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest">Nề nếp (3)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest">Phòng (3)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest">Ăn trưa (2)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest">Vệ sinh (2)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest">Tổng (10)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest">Nhận xét</th>
                <th className="px-6 py-4 text-[10px] font-bold text-primary/40 uppercase tracking-widest text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5">
              {filteredHistory.map((item) => (
                <tr key={item.id} className="hover:bg-primary/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-primary">
                        {item.date}
                      </span>
                      <span className="text-[9px] text-primary/40 uppercase font-medium">
                        {format(new Date(item.date), 'yyyy')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-primary/5 rounded-lg text-[10px] font-bold text-primary uppercase">
                      {item.className}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-primary/60">
                    {item.scores?.classDiscipline?.toLocaleString('vi-VN', { minimumFractionDigits: 3 }) || '-'}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-primary/60">
                    {item.scores?.dorm?.toLocaleString('vi-VN', { minimumFractionDigits: 3 }) || '-'}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-primary/60">
                    {item.scores?.dining?.toLocaleString('vi-VN', { minimumFractionDigits: 3 }) || '-'}
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-primary/60">
                    {item.scores?.cleaning?.toLocaleString('vi-VN', { minimumFractionDigits: 3 }) || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        item.score >= 8 ? "bg-green-500" : 
                        item.score >= 5 ? "bg-accent" : "bg-red-500"
                      )} />
                      <span className="text-sm font-black text-primary">
                        {item.score.toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-primary/60 line-clamp-1 max-w-xs italic">
                      {item.details}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onDelete(item.id)}
                      className="p-2 text-primary/20 hover:text-red-500 hover:bg-red-50 transition-all rounded-xl opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredHistory.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-20">
                      <Search size={32} />
                      <p className="text-xs font-bold uppercase tracking-widest">Không tìm thấy dữ liệu</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ManualInput({ placeholder, value, onChange }: { placeholder: string, value: string, onChange: (val: string) => void }) {
  return (
    <input 
      type="text"
      className="w-full p-2.5 rounded-xl border border-primary/10 bg-white focus:border-accent/30 focus:ring-0 transition-all text-xs italic"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ScoreCard({ icon, label, score, max }: { icon: React.ReactNode, label: string, score: number, max: number }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-primary/5 flex flex-col items-center text-center gap-1">
      <div className="text-primary/40 mb-1">{icon}</div>
      <span className="text-[10px] font-bold text-primary/40 uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-0.5">
        <span className={cn(
          "text-2xl font-black",
          score === max ? "text-primary" : score > 0 ? "text-accent" : "text-red-500"
        )}>
          {score.toLocaleString('vi-VN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
        </span>
        <span className="text-[10px] text-primary/20 font-bold">/{max}</span>
      </div>
    </div>
  );
}
