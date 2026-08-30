import React, { useState } from 'react';
import type { TemplateComponent } from '../../types/index.js';
import { Star } from 'lucide-react';

interface RatingInputControlProps {
  component: TemplateComponent;
  value: any;
  mode: 'edit' | 'readOnly';
  onChange?: (key: string, val: number) => void;
  disabled?: boolean;
}

export const RatingInputControl: React.FC<RatingInputControlProps> = ({
  component,
  value,
  mode,
  onChange,
  disabled,
}) => {
  const fieldKey = component.key || component.id;
  const ratingConfig = component.ratingConfig || {};
  const min = ratingConfig.min !== undefined ? ratingConfig.min : 1;
  const max = ratingConfig.max !== undefined ? ratingConfig.max : 5;
  const step = ratingConfig.step || 1;
  const displayStyle = ratingConfig.displayStyle || 'stars';
  const lowLabel = ratingConfig.lowLabel || '';
  const highLabel = ratingConfig.highLabel || '';
  const showValue = ratingConfig.showValue !== false;

  const currentNum = typeof value === 'number' ? value : parseFloat(value) || 0;
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  // Generate range items
  const items: number[] = [];
  for (let i = min; i <= max; i += step) {
    items.push(i);
  }

  const handleSelect = (val: number) => {
    if (disabled || mode === 'readOnly') return;
    if (onChange) {
      onChange(fieldKey, val);
    }
  };

  const activeValue = hoverValue !== null ? hoverValue : currentNum;

  if (mode === 'readOnly') {
    return (
      <div className="space-y-1.5 py-1">
        <div className="flex items-center gap-2">
          {displayStyle === 'stars' ? (
            <div className="flex items-center gap-1">
              {items.map((num) => (
                <Star
                  key={num}
                  className={`w-4 h-4 ${
                    num <= currentNum
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-slate-200 fill-slate-100'
                  }`}
                />
              ))}
            </div>
          ) : (
            <span className="font-mono font-extrabold text-indigo-900 text-sm bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-200">
              {currentNum > 0 ? `${currentNum} / ${max}` : 'Not rated'}
            </span>
          )}

          {showValue && currentNum > 0 && displayStyle === 'stars' && (
            <span className="text-xs font-bold font-mono text-slate-700">
              {currentNum} / {max}
            </span>
          )}
        </div>

        {(lowLabel || highLabel) && (
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold max-w-xs">
            <span>{lowLabel}</span>
            <span>{highLabel}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 py-1">
      {/* Interactive Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {displayStyle === 'stars' && (
          <div
            tabIndex={disabled ? -1 : 0}
            role="slider"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={currentNum}
            aria-label={component.label || 'Rating scale'}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                handleSelect(Math.min(max, (currentNum || min - 1) + 1));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                handleSelect(Math.max(min, (currentNum || min + 1) - 1));
              }
            }}
            className="flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 p-1 rounded-lg"
          >
            {items.map((num) => {
              const isFilled = num <= activeValue;
              return (
                <button
                  key={num}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(num)}
                  onMouseEnter={() => setHoverValue(num)}
                  onMouseLeave={() => setHoverValue(null)}
                  className="p-1 text-slate-300 hover:scale-115 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Star
                    className={`w-6 h-6 ${
                      isFilled
                        ? 'text-amber-400 fill-amber-400 drop-shadow-xs'
                        : 'text-slate-300 fill-slate-50'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}

        {displayStyle === 'numbers' && (
          <div className="flex items-center gap-1.5">
            {items.map((num) => {
              const isSelected = num === currentNum;
              return (
                <button
                  key={num}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(num)}
                  className={`w-9 h-9 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs scale-105'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        )}

        {displayStyle === 'buttons' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {items.map((num, idx) => {
              const isSelected = num === currentNum;
              const optionLabel =
                component.options && component.options[idx]
                  ? typeof component.options[idx] === 'string'
                    ? (component.options[idx] as string)
                    : (component.options[idx] as any).label
                  : `${num}`;

              return (
                <button
                  key={num}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(num)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {optionLabel}
                </button>
              );
            })}
          </div>
        )}

        {showValue && currentNum > 0 && (
          <span className="text-xs font-extrabold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-xl">
            {currentNum} / {max}
          </span>
        )}
      </div>

      {/* Low & High Labels */}
      {(lowLabel || highLabel) && (
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold max-w-xs px-1">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
};
