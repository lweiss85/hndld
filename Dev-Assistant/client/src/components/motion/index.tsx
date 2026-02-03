import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { forwardRef, useState, useCallback } from "react";

export const PageTransition = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
);

export const StaggerContainer = ({ 
  children,
  delay = 0.05,
  className 
}: { 
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => (
  <motion.div
    className={className}
    initial="hidden"
    animate="visible"
    variants={{
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: delay, delayChildren: 0.1 }
      }
    }}
  >
    {children}
  </motion.div>
);

export const StaggerItem = ({ 
  children,
  className 
}: { 
  children: React.ReactNode;
  className?: string;
}) => (
  <motion.div
    className={className}
    variants={{
      hidden: { opacity: 0, y: 20 },
      visible: { 
        opacity: 1, 
        y: 0,
        transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
      }
    }}
  >
    {children}
  </motion.div>
);

interface HndldButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const HndldButton = forwardRef<HTMLButtonElement, HndldButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, onClick, ...props }, ref) => {
    const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
    
    const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();
      
      setRipples(prev => [...prev, { x, y, id }]);
      setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);
      
      if (navigator.vibrate) navigator.vibrate(10);
      
      onClick?.(e);
    }, [onClick]);
    
    const variants = {
      primary: "bg-[hsl(var(--hndld-ink-600))] text-white hover:bg-[hsl(var(--hndld-ink-700))]",
      secondary: "bg-[hsl(var(--hndld-ink-100))] text-[hsl(var(--hndld-ink-700))] hover:bg-[hsl(var(--hndld-ink-200))]",
      ghost: "bg-transparent hover:bg-[hsl(var(--hndld-ink-100))]",
    };
    
    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2.5 text-base",
      lg: "px-6 py-3 text-lg",
    };
    
    return (
      <motion.button
        ref={ref}
        className={cn(
          "relative overflow-hidden font-medium hndld-curve-sm",
          "transition-colors duration-200",
          variants[variant],
          sizes[size],
          className
        )}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleClick}
        {...props}
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
          whileHover={{ translateX: '200%' }}
          transition={{ duration: 0.6 }}
        />
        
        <AnimatePresence>
          {ripples.map(ripple => (
            <motion.span
              key={ripple.id}
              className="absolute rounded-full bg-white/30 pointer-events-none"
              style={{ left: ripple.x, top: ripple.y, width: 20, height: 20, marginLeft: -10, marginTop: -10 }}
              initial={{ scale: 0, opacity: 0.5 }}
              animate={{ scale: 10, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            />
          ))}
        </AnimatePresence>
        
        <span className="relative z-10">{children}</span>
      </motion.button>
    );
  }
);

HndldButton.displayName = 'HndldButton';

export const SuccessCelebration = ({ show }: { show: boolean }) => {
  if (!show) return null;
  
  return (
    <motion.div
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {Array.from({ length: 20 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-3 h-3 rounded-full"
          style={{
            background: i % 3 === 0 
              ? 'hsl(var(--hndld-ink-400))' 
              : i % 3 === 1 
                ? 'hsl(var(--hndld-gold-400))'
                : 'hsl(42 50% 55%)',
          }}
          initial={{
            x: 0,
            y: 0,
            scale: 0,
          }}
          animate={{
            x: (Math.random() - 0.5) * 300,
            y: (Math.random() - 0.5) * 300 - 100,
            scale: [0, 1, 0.5],
            opacity: [0, 1, 0],
            rotate: Math.random() * 360,
          }}
          transition={{
            duration: 1,
            ease: [0.22, 1, 0.36, 1],
            delay: Math.random() * 0.2,
          }}
        />
      ))}
      
      <motion.div
        className="w-20 h-20 rounded-full bg-[hsl(var(--hndld-ink-600))] flex items-center justify-center"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.2, 1] }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <motion.svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          className="text-white"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <motion.path
            d="M5 12l5 5L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </motion.div>
    </motion.div>
  );
};

export const FloatingIndicator = ({ 
  count, 
  color = 'ink' 
}: { 
  count: number;
  color?: 'ink' | 'gold' | 'warning';
}) => {
  if (count === 0) return null;
  
  const colors = {
    ink: 'bg-[hsl(var(--hndld-ink-600))]',
    gold: 'bg-[hsl(var(--hndld-gold-500))]',
    warning: 'bg-[hsl(42_50%_55%)]',
  };
  
  return (
    <motion.div
      className={cn(
        "absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center",
        colors[color]
      )}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
    >
      <motion.span
        key={count}
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        {count > 9 ? '9+' : count}
      </motion.span>
    </motion.div>
  );
};

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <motion.div
    className="flex flex-col items-center justify-center py-16 px-4 text-center"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <motion.div
      className="w-24 h-24 rounded-full bg-[hsl(var(--hndld-ink-100))] flex items-center justify-center mb-6 text-[hsl(var(--hndld-ink-600))]"
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      {icon}
    </motion.div>
    
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-muted-foreground max-w-xs mb-6">{description}</p>
    
    {action && (
      <HndldButton onClick={action.onClick}>
        {action.label}
      </HndldButton>
    )}
  </motion.div>
);

export const SmartGreeting = ({ name }: { name: string }) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good morning, ${name}`;
    if (hour < 17) return `Good afternoon, ${name}`;
    return `Good evening, ${name}`;
  };
  
  return (
    <motion.h1
      className="text-3xl font-bold"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {getGreeting()}
    </motion.h1>
  );
};

export const HndldCard = ({ 
  children, 
  className,
  onClick 
}: { 
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) => (
  <motion.div
    className={cn(
      "hndld-glass hndld-curve p-4",
      onClick && "cursor-pointer",
      className
    )}
    whileHover={onClick ? { scale: 1.01, y: -2 } : undefined}
    whileTap={onClick ? { scale: 0.99 } : undefined}
    onClick={onClick}
    transition={{ duration: 0.2 }}
  >
    {children}
  </motion.div>
);

export const ShimmerSkeleton = ({ 
  className 
}: { 
  className?: string;
}) => (
  <div className={cn("relative overflow-hidden bg-muted rounded-lg", className)}>
    <motion.div
      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
      animate={{ x: ['-100%', '100%'] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
    />
  </div>
);

export { motion, AnimatePresence };
