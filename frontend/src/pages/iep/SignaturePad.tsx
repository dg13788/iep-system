import { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Trash2, Pen } from 'lucide-react';
import type { SignatureType } from '@/services/iep';

interface SignaturePadProps {
  onSave?: (dataUrl: string, signatureType: SignatureType) => void;
  savedSignature?: string | null;
  readOnly?: boolean;
  /**
   * 签名类型。必须与 backend/sql/init.sql 中
   * parent_signatures.signature_type ENUM('handwritten','digital','fingerprint') 一致，
   * 传 'parent' / 'electronic' / 'typed' 等其它值会导致插入失败。
   */
  signatureType?: SignatureType;
}

export default function SignaturePad({
  onSave,
  savedSignature,
  readOnly = false,
  signatureType = 'handwritten',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signature, setSignature] = useState<string | null>(savedSignature || null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (readOnly || signature) return;
    e.preventDefault();
    setIsDrawing(true);
    setHasDrawn(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [readOnly, signature, getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || readOnly || signature) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, readOnly, signature, getPos]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
    setSignature(null);
  }, []);

  const saveSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSignature(dataUrl);
    onSave?.(dataUrl, signatureType);
  }, [hasDrawn, onSave, signatureType]);

  if (signature) {
    return (
      <div className="flex flex-col items-center gap-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full border-2 border-[#10B981] rounded-lg overflow-hidden bg-[#ECFDF5]"
        >
          <img src={signature} alt="签名" className="w-full h-40 object-contain" />
        </motion.div>
        <div className="flex items-center gap-2 text-[#10B981]">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">签名已完成</span>
        </div>
        {!readOnly && (
          <button
            onClick={clearSignature}
            className="text-sm text-[#64748B] hover:text-[#1E293B] transition-colors cursor-pointer"
          >
            重新签名
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`
          relative w-full h-40 border-2 border-dashed rounded-lg overflow-hidden
          ${readOnly ? 'border-[#E2E8F0] bg-[#F7F6F4]' : 'border-[#CBD5E1] bg-[#F7F6F4] hover:border-[#977653]'}
          transition-colors duration-150
        `}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{ cursor: readOnly ? 'default' : 'crosshair' }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasDrawn && !readOnly && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-[#94A3B8]">
              <Pen className="w-6 h-6" />
              <span className="text-sm">请在此处手写签名</span>
            </div>
          </div>
        )}
        {readOnly && !signature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-[#94A3B8]">待家长签名</span>
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center justify-between">
          <button
            onClick={clearSignature}
            disabled={!hasDrawn}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer
              ${hasDrawn
                ? 'text-[#64748B] hover:bg-[#F7F6F4]'
                : 'text-[#94A3B8] cursor-not-allowed'
              }
            `}
          >
            <Trash2 className="w-4 h-4" />
            清除
          </button>
          <button
            onClick={saveSignature}
            disabled={!hasDrawn}
            className={`
              px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer
              ${hasDrawn
                ? 'bg-[#977653] text-white hover:bg-[#7A5F42]'
                : 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
              }
            `}
          >
            确认签名
          </button>
        </div>
      )}
    </div>
  );
}
