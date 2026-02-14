
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  fullWidth?: boolean;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = false, 
  loading = false,
  className = '',
  ...props 
}) => {
  const baseStyles = "px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] transition-all duration-500 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed active:scale-95";
  
  const variants = {
    primary: "muse-gradient text-white hover:shadow-[0_0_40px_rgba(255,77,0,0.3)] hover:brightness-110",
    secondary: "bg-white text-black hover:bg-zinc-200",
    outline: "border border-white/10 text-zinc-400 hover:border-brand hover:text-brand bg-white/[0.02] hover:bg-brand/[0.05]"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={loading}
      {...props}
    >
      {loading ? (
        <div className="flex items-center gap-3">
          <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="animate-pulse">Processing...</span>
        </div>
      ) : children}
    </button>
  );
};
