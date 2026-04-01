// Animation variants for sidebar
export const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.03 }
  }
};

export const itemVariants = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as const } }
};

export const bootVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { 
    opacity: 1, 
    scale: 1, 
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } 
  }
};
