import React, { useRef, useEffect } from 'react';

interface LiveSignalFeedProps {
  dataPoints: number[]; 
  signalType: 'buy' | 'sell' | 'neutral';
}

export const LiveSignalFeed: React.FC<LiveSignalFeedProps> = ({ dataPoints, signalType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dataPoints.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas entirely to ensure a clean, uncluttered render
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dynamic colours for the signal trajectory
    const lineColor = signalType === 'buy' ? '#00ffaa' : signalType === 'sell' ? '#ff0055' : '#444444';
    
    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;

    const max = Math.max(...dataPoints);
    const min = Math.min(...dataPoints);
    const range = max - min || 1;

    dataPoints.forEach((point, index) => {
      const x = (index / (dataPoints.length - 1)) * canvas.width;
      const y = canvas.height - ((point - min) / range) * canvas.height;
      
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
    
    // Note: We intentionally avoid rendering any text, axes, or numeric 
    // overlays here to ensure the chart's visual logic remains entirely 
    // readable and strictly geometry-focused.
  }, [dataPoints, signalType]);

  return (
    <div className="w-full h-48 bg-black rounded-lg overflow-hidden border border-gray-800">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full" 
        width={800} 
        height={400} 
      />
    </div>
  );
};
