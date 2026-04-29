import React, { useRef, useState, useEffect } from 'react';
import { X, Check, RotateCcw, Undo2, Redo2, Eraser } from 'lucide-react';
import { motion } from 'motion/react';
import { TIMING } from '../constants';

interface MarkupEditorProps {
  imageData: string;
  onSave: (newImageData: string) => void;
  onCancel: () => void;
}

export const MarkupEditor: React.FC<MarkupEditorProps> = ({ imageData, onSave, onCancel }) => {
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ distance: number; lineWidth: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ef4444'); // Red default
  const [lineWidth, setLineWidth] = useState(4);
  const [tool, setTool] = useState<'pencil' | 'eraser'>('pencil');
  const [history, setHistory] = useState<string[]>([]);
  const [historyStep, setHistoryStep] = useState(-1);

  const saveToHistory = () => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL();
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(dataUrl);
    const trimmedHistory = newHistory.slice(-TIMING.MARKUP_HISTORY_LIMIT);
    setHistory(trimmedHistory);
    setHistoryStep(trimmedHistory.length - 1);
  };

  useEffect(() => {
    const imgCanvas = imageCanvasRef.current;
    const drawCanvas = drawingCanvasRef.current;
    const container = containerRef.current;
    if (!imgCanvas || !drawCanvas || !container) return;

    const imgCtx = imgCanvas.getContext('2d');
    const drawCtx = drawCanvas.getContext('2d');
    if (!imgCtx || !drawCtx) return;

    const img = new Image();
    img.src = imageData;
    img.onload = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const imgRatio = img.width / img.height;
      const containerRatio = containerWidth / containerHeight;

      let drawWidth, drawHeight;
      if (imgRatio > containerRatio) {
        drawWidth = containerWidth;
        drawHeight = containerWidth / imgRatio;
      } else {
        drawHeight = containerHeight;
        drawWidth = containerHeight * imgRatio;
      }

      imgCanvas.width = drawWidth;
      imgCanvas.height = drawHeight;
      drawCanvas.width = drawWidth;
      drawCanvas.height = drawHeight;
      
      imgCtx.drawImage(img, 0, 0, drawWidth, drawHeight);
      
      drawCtx.lineCap = 'round';
      drawCtx.lineJoin = 'round';
      drawCtx.strokeStyle = color;
      drawCtx.lineWidth = lineWidth;

      // Initial history state (empty drawing)
      const initialData = drawCanvas.toDataURL();
      setHistory([initialData]);
      setHistoryStep(0);
    };
  }, [imageData]);

  useEffect(() => {
    const ctx = drawingCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    }
  }, [color, lineWidth, tool]);

  const getTouchDistance = (touches: React.TouchList): number =>
    Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if ('touches' in e && e.touches.length === 2) {
      pinchRef.current = {
        distance: getTouchDistance(e.touches),
        lineWidth,
      };
      return;
    }

    setIsDrawing(true);

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handlePinchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;

    const newDistance = getTouchDistance(e.touches);
    const newLineWidth = Math.min(
      40,
      Math.max(2, pinchRef.current.lineWidth * (newDistance / pinchRef.current.distance))
    );
    setLineWidth(newLineWidth);
  };

  const stopDrawing = (e?: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in (e ?? {}) && e.touches.length < 2) {
      pinchRef.current = null;
    }

    if (isDrawing) {
      setIsDrawing(false);
      saveToHistory();
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length === 2) {
      handlePinchMove(e);
      return;
    }

    if (!isDrawing) return;
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleUndo = () => {
    if (historyStep <= 0) return;
    const prevStep = historyStep - 1;
    setHistoryStep(prevStep);
    loadFromHistory(history[prevStep]);
  };

  const handleRedo = () => {
    if (historyStep >= history.length - 1) return;
    const nextStep = historyStep + 1;
    setHistoryStep(nextStep);
    loadFromHistory(history[nextStep]);
  };

  const loadFromHistory = (dataUrl: string) => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Restore styles
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    };
  };

  const handleClear = () => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveToHistory();
  };

  const handleSave = () => {
    const imgCanvas = imageCanvasRef.current;
    const drawCanvas = drawingCanvasRef.current;
    if (!imgCanvas || !drawCanvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imgCanvas.width;
    tempCanvas.height = imgCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.drawImage(imgCanvas, 0, 0);
    tempCtx.drawImage(drawCanvas, 0, 0);
    onSave(tempCanvas.toDataURL('image/jpeg', 0.8));
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
    >
      <header className="p-4 pt-safe flex items-center justify-between bg-black/50 text-white">
        <button onClick={onCancel} className="p-2">
          <X size={24} />
        </button>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleUndo} 
            disabled={historyStep <= 0}
            className="p-2 disabled:opacity-30"
          >
            <Undo2 size={20} />
          </button>
          <button 
            onClick={handleRedo} 
            disabled={historyStep >= history.length - 1}
            className="p-2 disabled:opacity-30"
          >
            <Redo2 size={20} />
          </button>
        </div>
        <button onClick={handleSave} className="p-2 text-blue-400 font-bold">
          <Check size={24} />
        </button>
      </header>

      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden p-4 relative">
        {!isDrawing && (
          <div className="pointer-events-none absolute top-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/45 px-3 py-1 text-white backdrop-blur-md">
            <span
              className="rounded-full bg-white"
              style={{
                width: `${Math.min(24, Math.max(6, lineWidth))}px`,
                height: `${Math.min(24, Math.max(6, lineWidth))}px`,
              }}
            />
            <span className="text-sm font-medium">{Math.round(lineWidth)}px</span>
          </div>
        )}
        <canvas
          ref={imageCanvasRef}
          className="absolute bg-white shadow-2xl max-w-full max-h-full"
        />
        <canvas
          ref={drawingCanvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute touch-none max-w-full max-h-full z-10"
        />
      </div>

      <footer className="p-6 pb-safe-offset-4 bg-black/50 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar flex-1">
            {['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ffffff', '#000000'].map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); setTool('pencil'); }}
                className={`shrink-0 w-8 h-8 rounded-full border-2 ${color === c && tool === 'pencil' ? 'border-white scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <div className={`relative shrink-0 w-8 h-8 rounded-full border-2 overflow-hidden bg-gradient-to-tr from-red-500 via-green-500 to-blue-500 ${tool === 'pencil' && !['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ffffff', '#000000'].includes(color) ? 'border-white scale-110' : 'border-transparent'}`}>
              <input 
                type="color" 
                value={color}
                onChange={(e) => { setColor(e.target.value); setTool('pencil'); }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setTool(tool === 'eraser' ? 'pencil' : 'eraser')}
              className={`p-3 rounded-full transition-all ${tool === 'eraser' ? 'bg-blue-600 text-white scale-110 shadow-lg' : 'bg-white/10 text-white'}`}
            >
              <Eraser size={20} />
            </button>
            <button 
              onClick={handleClear}
              className="p-3 bg-white/10 rounded-full text-white active:scale-90 transition-transform"
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </div>
      </footer>
    </motion.div>
  );
};
