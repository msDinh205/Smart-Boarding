import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeDiscipline(
  className: string,
  selectedDate: string,
  dormImagesBase64?: string[],
  uniformImageBase64?: string,
  diningImageBase64?: string,
  cleaningImageBase64?: string,
  attendanceData?: string,
  manualNotes?: {
    classDiscipline: string;
    dorm: string;
    dining: string;
    cleaning: string;
  }
): Promise<AnalysisResult> {
  const model = "gemini-3-flash-preview";
  
  const dateObj = new Date(selectedDate);
  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6; // 0: Sunday, 6: Saturday
  const dayName = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][dateObj.getDay()];

  const systemInstruction = `Bạn là "Smart Boarding 4.0: Giải pháp Số hóa Nề nếp và Học tập".
Nhiệm vụ: Phân tích dữ liệu nề nếp cho lớp: ${className} vào ${dayName}, ngày: ${selectedDate}.

${isWeekend ? `
QUY TẮC ĐẶC BIỆT CHO THỨ 7 VÀ CHỦ NHẬT:
- Không chấm điểm theo tiêu chí 10đ của ngày thường.
- Chỉ theo dõi và xác định xem có bất kỳ lỗi vi phạm nề nếp nào không (dựa trên các hình ảnh và ghi chú).
- Nếu CÓ vi phạm: Đặt disciplineTotal = 0 (để đánh dấu có lỗi). Liệt kê chi tiết lỗi trong phần deductions.
- Nếu KHÔNG CÓ vi phạm: Đặt disciplineTotal = 10 (để đánh dấu sạch sẽ).
- Các điểm thành phần (classDiscipline, dorm, dining, cleaning) cũng đặt tương ứng 0 hoặc điểm tối đa.
` : `
BẢNG TIÊU CHÍ CHẤM ĐIỂM NỀ NẾP (Max 10đ/ngày):
1. Lớp học + TD + Tự học (15 phút đầu giờ, Trang phục, đồng phục + giày dép; tự học) (Tối đa 3 điểm):
   - Trừ 2đ: 1-3 hs vào muộn; Mất trật tự; đi lại ra ngoài lớp; vệ sinh không sạch sẽ; có giày dép trên lớp; giá sách, đồ đạc lộn xộn; Không đeo khăn quàng, không mặc đồng phục, trang phục.
   - Trừ 2đ: Giờ tự học không nghiêm túc, nói chuyện, làm việc riêng.
   - Trừ 2đ: 1-3 hs tập trung chưa đúng giờ, sĩ số không đảm bảo, tập chưa đều.

2. Phòng ở (Tối đa 3 điểm):
   - Nếu giáo viên đã nhập "Điểm trung bình X phòng" trong phần ghi chú thủ công, hãy sử dụng con số đó làm điểm cho mục này (Max 3).
   - Nếu không có điểm nhập sẵn: Mỗi lỗi trừ 2đ/phòng cho các lỗi: Phòng ở không sạch sẽ, nhiều rác, nặng mùi, đồ dùng bừa bãi; Giường chiếu, chăn màn, đồ dùng cá nhân không sạch sẽ, sắp xếp không gọn gàng; mang khay ăn về phòng; Mất trật tự giờ ngủ.
   - Trừ 5đ/lỗi/phòng: Có rác liên quan đến thuốc lá; Sử dụng điện thoại vào giờ ngủ; sử dụng đồ dùng điện đun nấu.

3. Bàn ăn (Tối đa 2 điểm):
   - Trừ 2đ: Không thu dọn khay bát, bàn ăn, chưa quét dọn sàn nhà, vệ sinh bàn sau khi ăn, xếp khay không gọn gàng, Số lượng khay ăn không đảm bảo, Ăn uống chưa lịch sự thiếu văn minh, không tiết kiệm.

4. Vệ sinh (Tối đa 2 điểm):
   - Trừ 2đ: Khu vực được giao vệ sinh không sạch sẽ.
   - Trừ 3đ: Không quét dọn.

LỖI ĐẶC BIỆT:
- Trừ 5đ/phòng (lớp): Các lỗi liên quan đến thuốc lá, sd điện thoại không đúng mục đích.
- Trừ 10đ/ngày: Các hình thức đánh bài; Gây gổ đánh nhau, mâu thuẫn.
`}

CÔNG THỨC TÍNH ĐIỂM:
- Điểm tổng cộng = Điểm nề nếp (Max 10).

QUY TRÌNH PHẢN HỒI:
- Bước 1: Phân tích lỗi nề nếp từ hình ảnh và ghi chú.
- Bước 2: Xác định Điểm nề nếp cho từng hạng mục.
- Bước 3: Tính Tổng điểm nề nếp.
- Bước 4: Viết lời nhắc nhở thân thiện, khích lệ.
- Bước 5: CHẾ ĐỘ HỖ TRỢ ĐẶC BIỆT (DÀNH CHO HỌC SINH HAY VI PHẠM):
  + Nhận diện xu hướng (AI Suggests): Nếu một học sinh/phòng vi phạm cùng một lỗi quá 03 lần/tuần (ví dụ: liên tục sử dụng điện thoại giờ ngủ hoặc không dọn khay bát), hãy đánh dấu đây là "Trường hợp cần hỗ trợ đặc biệt". Phân tích xem vi phạm là do thiếu kỹ năng (gấp chăn chưa thạo) hay do ý thức (đánh bài, thuốc lá) để gợi ý hướng xử lý khác nhau.
  + Gợi ý giải pháp giáo dục tích cực:
    * Thay vì chỉ trừ điểm: Gợi ý giáo viên tổ chức hình thức "Đôi bạn cùng tiến", giao cho học sinh làm tốt kèm cặp học sinh hay vi phạm.
    * Ghi nhận sự tiến bộ: Nếu học sinh hay vi phạm có sự cải thiện (dù nhỏ), hãy đưa ra lời khen ngợi đặc biệt: "Hôm nay em đã tiến bộ hơn hôm qua, hãy tiếp tục giữ vững nhé!".
    * Cảnh báo tâm lý: Nếu vi phạm đi kèm với việc nghỉ học/vắng mặt bất thường, hãy nhắc nhở giáo viên: "Học sinh có dấu hiệu bất ổn, Thầy/Cô nên dành thời gian tâm sự riêng để nắm bắt hoàn cảnh gia đình hoặc nỗi nhớ nhà".
- Bước 6: NGUYÊN TẮC SƯ PHẠM VÙNG CAO:
  + Tuyệt đối không dùng ngôn ngữ đe dọa. Sử dụng hình ảnh so sánh gần gũi (ví dụ: "Nề nếp tốt như hạt ngô chắc bắp, giúp em vững vàng hơn") để khuyên bảo học sinh dân tộc thiểu số.
  + Luôn ưu tiên hình thức "Hướng dẫn lại" trước khi áp dụng "Trừ điểm thi đua" đối với các lỗi về kỹ năng nội vụ.
- Bước 7: ĐẢM BẢO TẤT CẢ CÁC ĐIỂM SỐ đều được tính toán và trả về với độ chính xác 3 chữ số thập phân.
- Bước 8: Kết thúc bằng câu: "Mời Thầy/Cô kiểm tra lại hình ảnh để xác nhận lỗi trước khi phê duyệt kết quả cuối cùng."

Yêu cầu output JSON chính xác theo schema.`;

  const parts: any[] = [{ text: `Hãy phân tích dữ liệu cho lớp ${className}:` }];

  if (manualNotes) {
    parts.push({ text: `Lỗi nhập thủ công từ giáo viên:
- Lớp học/Tác phong: ${manualNotes.classDiscipline || "Không có"}
- Phòng ở: ${manualNotes.dorm || "Không có"}
- Bàn ăn: ${manualNotes.dining || "Không có"}
- Vệ sinh khu vực: ${manualNotes.cleaning || "Không có"}` });
  }

  if (dormImagesBase64 && dormImagesBase64.length > 0) {
    dormImagesBase64.forEach((img, idx) => {
      parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: img.split(",")[1] || img,
        },
      });
      parts.push({ text: `Đây là ảnh phòng ở thứ ${idx + 1}.` });
    });
  }

  if (uniformImageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: uniformImageBase64.split(",")[1] || uniformImageBase64,
      },
    });
    parts.push({ text: "Đây là ảnh lớp học/tác phong." });
  }

  if (diningImageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: diningImageBase64.split(",")[1] || diningImageBase64,
      },
    });
    parts.push({ text: "Đây là ảnh bàn ăn." });
  }

  if (cleaningImageBase64) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: cleaningImageBase64.split(",")[1] || cleaningImageBase64,
      },
    });
    parts.push({ text: "Đây là ảnh vệ sinh khu vực giao." });
  }

  if (attendanceData) {
    parts.push({ text: `Dữ liệu báo cáo/chuyên cần: ${attendanceData}` });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          className: { type: Type.STRING },
          scores: {
            type: Type.OBJECT,
            properties: {
              classDiscipline: { type: Type.NUMBER, description: "Max 3" },
              dorm: { type: Type.NUMBER, description: "Max 3" },
              dining: { type: Type.NUMBER, description: "Max 2" },
              cleaning: { type: Type.NUMBER, description: "Max 2" },
              disciplineTotal: { type: Type.NUMBER, description: "Tổng điểm nề nếp (Max 10)" },
            },
            required: ["classDiscipline", "dorm", "dining", "cleaning", "disciplineTotal"],
          },
          deductions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                points: { type: Type.NUMBER },
                reason: { type: Type.STRING },
              },
              required: ["category", "points", "reason"],
            },
          },
          pedagogicalMessage: { type: Type.STRING },
          attendanceAlert: { type: Type.STRING },
          specialSupportCase: {
            type: Type.OBJECT,
            properties: {
              isSpecial: { type: Type.BOOLEAN },
              reason: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['skill', 'attitude', 'psychology'] },
            },
            required: ["isSpecial", "reason", "type"],
          },
          educationalSuggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["scores", "deductions", "pedagogicalMessage"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as AnalysisResult;
}
