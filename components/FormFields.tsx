import React, { useState } from 'react';

export const AiSuggestButtons = ({ onSuggest, onEnhance, hasAiUsed, suggesting, exhausted }: any) => (
  <div className="flex items-center gap-3">
    {hasAiUsed ? (
      <>
        <button onClick={onEnhance} disabled={suggesting} className={`text-[9px] font-black transition-all flex items-center gap-1 ${exhausted ? 'text-amber-500/60 hover:text-amber-500' : 'text-brand/60 hover:text-brand'}`}>
          {suggesting ? 'Processing...' : '✨ Enhance'}
        </button>
        <button onClick={onSuggest} disabled={suggesting} className={`text-[9px] font-black transition-all flex items-center gap-1 ${exhausted ? 'text-amber-500/60 hover:text-amber-500' : 'text-brand/60 hover:text-brand'}`}>
          {suggesting ? 'Processing...' : '🔄 New'}
        </button>
      </>
    ) : (
      <button onClick={onSuggest} disabled={suggesting} className={`text-[9px] font-black transition-all flex items-center gap-2 ${exhausted ? 'text-amber-500/60 hover:text-amber-500' : 'text-brand/40 hover:text-brand'}`}>
        {suggesting ? 'Processing...' : exhausted ? '📚 Neural Preset' : '✨ AI Suggest'}
      </button>
    )}
  </div>
);

export const Field = ({ label, value, onChange, onSuggest, onEnhance, hasAiUsed, suggesting, exhausted, isTextArea, placeholder }: any) => {
  const Component = isTextArea ? 'textarea' : 'input';
  return (
    <div className="space-y-4 group">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700 group-focus-within:text-brand transition-colors">{label}</label>
        <AiSuggestButtons onSuggest={onSuggest} onEnhance={onEnhance} hasAiUsed={hasAiUsed} suggesting={suggesting} exhausted={exhausted} />
      </div>
      <Component 
        value={value} 
        onChange={(e: any) => onChange(e.target.value)} 
        className={`w-full bg-surface border rounded-2xl px-6 py-5 text-sm font-medium text-white focus:outline-none focus:border-brand/50 transition-all placeholder-zinc-800 ${isTextArea ? 'min-h-[160px] resize-y' : ''} ${suggesting ? 'opacity-50 border-brand/30 animate-pulse' : 'border-white/5'}`}
        placeholder={placeholder}
        disabled={suggesting}
      />
    </div>
  );
};

export const MultiSelectWithCustom = ({ label, options, selected, onChange, onSuggest, onEnhance, hasAiUsed, suggesting, exhausted }: any) => {
  const [customValue, setCustomValue] = useState("");
  const [allOptions, setAllOptions] = useState<string[]>(options);

  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((x: string) => x !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const handleAddCustom = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && customValue.trim()) {
      e.preventDefault();
      const val = customValue.trim();
      if (!allOptions.includes(val)) {
        setAllOptions([...allOptions, val]);
      }
      if (!selected.includes(val)) {
        onChange([...selected, val]);
      }
      setCustomValue("");
    }
  };

  return (
    <div className="space-y-4 group">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700 group-focus-within:text-brand transition-colors">{label}</label>
        <AiSuggestButtons onSuggest={onSuggest} onEnhance={onEnhance} hasAiUsed={hasAiUsed} suggesting={suggesting} exhausted={exhausted} />
      </div>
      <div className={`flex flex-wrap gap-2 ${suggesting ? 'opacity-30' : ''}`}>
        {allOptions.map(opt => (
          <button key={opt} onClick={() => toggleOption(opt)} className={`px-4 py-2 md:px-5 md:py-3 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest border transition-all ${selected.includes(opt) ? 'bg-brand border-brand text-white' : 'border-white/5 text-zinc-700 hover:text-zinc-400'}`}>
            {opt}
          </button>
        ))}
        <input 
          type="text" 
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={handleAddCustom}
          placeholder="+ Add Custom (Press Enter)"
          className="px-4 py-2 md:px-5 md:py-3 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest border border-white/5 bg-transparent text-white focus:outline-none focus:border-brand/50 min-w-[150px]"
        />
      </div>
    </div>
  );
};

export const SelectWithCustom = ({ label, options, selected, onChange, onSuggest, onEnhance, hasAiUsed, suggesting, exhausted }: any) => {
  const [customValue, setCustomValue] = useState("");
  const [allOptions, setAllOptions] = useState<string[]>(options);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  const handleAddCustom = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && customValue.trim()) {
      e.preventDefault();
      const val = customValue.trim();
      if (!allOptions.includes(val)) {
        setAllOptions([...allOptions, val]);
      }
      onChange(val);
      setCustomValue("");
    }
  };

  return (
    <div className="space-y-4 group">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700 group-focus-within:text-brand transition-colors">{label}</label>
        <AiSuggestButtons onSuggest={onSuggest} onEnhance={onEnhance} hasAiUsed={hasAiUsed} suggesting={suggesting} exhausted={exhausted} />
      </div>
      <div className={`flex flex-col gap-2 ${suggesting ? 'opacity-30' : ''}`}>
        <select 
          value={selected} 
          onChange={handleSelect}
          className="w-full bg-surface border border-white/5 rounded-2xl px-6 py-5 text-sm font-medium text-white focus:outline-none focus:border-brand/50 transition-all appearance-none"
        >
          <option value="" disabled>Select an option</option>
          {allOptions.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <input 
          type="text" 
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={handleAddCustom}
          placeholder="Or type custom value and press Enter"
          className="w-full bg-transparent border border-white/5 rounded-2xl px-6 py-3 text-sm font-medium text-white focus:outline-none focus:border-brand/50 transition-all placeholder-zinc-800"
        />
      </div>
    </div>
  );
};

export const RangeSlider = ({ label, min, max, value, onChange, unit, onSuggest, onEnhance, hasAiUsed, suggesting, exhausted }: any) => (
  <div className="space-y-4 group">
    <div className="flex justify-between items-center px-1">
      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700 group-focus-within:text-brand transition-colors">{label}</label>
      <div className="flex items-center gap-4">
        <AiSuggestButtons onSuggest={onSuggest} onEnhance={onEnhance} hasAiUsed={hasAiUsed} suggesting={suggesting} exhausted={exhausted} />
        <span className="text-brand font-black text-xs">{value} {unit}</span>
      </div>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      value={value} 
      onChange={(e) => onChange(parseInt(e.target.value))} 
      className={`w-full h-1.5 bg-white/5 accent-brand rounded-full cursor-pointer appearance-none ${suggesting ? 'opacity-30 animate-pulse' : ''}`} 
    />
  </div>
);
