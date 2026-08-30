import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface AdminInfoTooltipProps {
  title?: string;
  description: string;
  whoItAffects?: string;
  impact?: string;
  dependencies?: string;
  warning?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const AdminInfoTooltip: React.FC<AdminInfoTooltipProps> = ({
  title,
  description,
  whoItAffects,
  impact,
  dependencies,
  warning,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placeBelow: boolean }>({
    top: 0,
    left: 0,
    placeBelow: false,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isOpen = isHovered || isPinned;

  // Calculate coordinates relative to viewport
  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = Math.min(320, window.innerWidth - 24);
    const estimatedHeight = 180;

    let placeBelow = false;
    let top = rect.top - estimatedHeight - 8;
    if (top < 10) {
      top = rect.bottom + 8;
      placeBelow = true;
    }

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    if (left < 12) left = 12;
    if (left + tooltipWidth > window.innerWidth - 12) {
      left = window.innerWidth - tooltipWidth - 12;
    }

    setCoords({ top, left, placeBelow });
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updateCoords();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => {
      updateCoords();
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  // Click outside handling
  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsPinned(false);
        setIsHovered(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPinned((prev) => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsPinned(false);
      setIsHovered(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      setIsPinned((prev) => !prev);
    }
  };

  const popoverContent = isOpen ? (
    <div
      ref={popoverRef}
      role="tooltip"
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 99999,
      }}
      className="w-72 sm:w-80 bg-slate-900 text-white rounded-2xl p-4 text-xs shadow-2xl border border-slate-700/90 animate-fade-in pointer-events-auto leading-relaxed"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {title && (
        <div className="font-black text-indigo-300 text-xs mb-1.5 flex items-center gap-1.5 border-b border-slate-800 pb-1.5">
          <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{title}</span>
        </div>
      )}

      <p className="text-slate-200 text-[11px] font-normal leading-relaxed">{description}</p>

      {whoItAffects && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/80">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 block mb-0.5">
            Who It Affects
          </span>
          <p className="text-slate-300 text-[11px] font-medium">{whoItAffects}</p>
        </div>
      )}

      {impact && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/80">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block mb-0.5">
            Business Impact
          </span>
          <p className="text-slate-300 text-[11px] font-medium">{impact}</p>
        </div>
      )}

      {dependencies && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/80">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400 block mb-0.5">
            Dependencies
          </span>
          <p className="text-slate-300 text-[11px] font-medium">{dependencies}</p>
        </div>
      )}

      {warning && (
        <div className="mt-2.5 p-2 bg-amber-950/80 border border-amber-700/80 text-amber-200 rounded-xl text-[10px] font-semibold flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <span>{warning}</span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <span className={`relative inline-flex items-center align-middle select-none ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onKeyDown={handleKeyDown}
        className={`p-0.5 rounded-md transition-colors inline-flex items-center justify-center align-middle cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          isOpen ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
        }`}
        aria-label={`Information about ${title || 'setting'}`}
        aria-expanded={isOpen}
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {popoverContent && createPortal(popoverContent, document.body)}
    </span>
  );
};
