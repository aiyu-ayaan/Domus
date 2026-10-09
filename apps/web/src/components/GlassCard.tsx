import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  interactive = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl relative overflow-hidden backdrop-blur-glass transition-all duration-300 ${
        interactive ? 'glass-panel-interactive cursor-pointer active:scale-[0.99]' : 'glass-panel'
      } ${className}`}
    >
      {/* Specular glass reflection overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.07] pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  );
};
