export interface AnalysisResult {
  className?: string;
  scores: {
    classDiscipline: number; // Max 3
    dorm: number;           // Max 3
    dining: number;         // Max 2
    cleaning: number;       // Max 2
    disciplineTotal: number; // Max 10 (Điểm nề nếp)
  };
  deductions: {
    category: string;
    points: number;
    reason: string;
  }[];
  pedagogicalMessage: string;
  attendanceAlert?: string;
  specialSupportCase?: {
    isSpecial: boolean;
    reason: string;
    type: 'skill' | 'attitude' | 'psychology';
  };
  educationalSuggestions?: string[];
}

export interface AttendanceRecord {
  studentName: string;
  status: 'present' | 'absent';
  reason?: string;
}
