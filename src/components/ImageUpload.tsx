import React from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface ImageUploadProps {
  label: string;
  image: string | null;
  onImageChange: (base64: string | null) => void;
  className?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ label, image, onImageChange, className }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onImageChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium text-primary/80 uppercase tracking-wider">{label}</label>
      <div 
        className={cn(
          "relative aspect-video rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 flex flex-col items-center justify-center overflow-hidden transition-all hover:border-primary/40",
          image && "border-solid border-primary/40"
        )}
      >
        {image ? (
          <>
            <img src={image} alt={label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            <button 
              onClick={() => onImageChange(null)}
              className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <label className="cursor-pointer flex flex-col items-center gap-2 p-4 text-center">
            <Upload className="text-primary/40" size={32} />
            <span className="text-sm text-primary/60">Nhấn để tải ảnh hoặc kéo thả</span>
            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
          </label>
        )}
      </div>
    </div>
  );
};
