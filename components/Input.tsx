
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  isTextArea?: boolean;
  onSuggest?: () => void;
  isSuggesting?: boolean;
}

export const Input: React.FC<InputProps> = ({ 
  label, 
  helperText, 
  isTextArea, 
  onSuggest, 
  isSuggesting,
  className = '', 
  ...props 
}) => {
  const Component = isTextArea ? 'textarea' : 'input';
  
  return (
    <div className="w-full space-y-3 group">
      <div className="flex justify-between items-center px-1">
        {label && <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 group-focus-within:text-brand transition-all">{label}</label>}
        {onSuggest && (
          <button 
            type="button"
            onClick={onSuggest}
            disabled={isSuggesting}
            className="text-[9px] font-black text-brand/40 hover:text-brand transition-all uppercase tracking-widest flex items-center gap-2 disabled:opacity-20"
          >
            {isSuggesting ? (
              <span className="w-2 h-2 border-t border-brand rounded-full animate-spin"></span>
            ) : '✨ Neural Suggest'}
          </button>
        )}
      </div>
      
      <div className="relative">
        <Component
          className={`w-full bg-surface/40 border border-white/5 rounded-2xl px-5 py-4 text-zinc-200 text-sm placeholder-zinc-800 focus:outline-none focus:border-brand/50 focus:bg-brand/[0.02] transition-all ${isTextArea ? 'min-h-[120px] resize-none' : ''} ${className}`}
          {...props as any}
        />
      </div>
      
      {helperText && (
        <p className="text-[10px] text-zinc-500 leading-relaxed font-bold tracking-tight pl-2 border-l border-brand/20 ml-1">
          {helperText}
        </p>
      )}
    </div>
  );
};
