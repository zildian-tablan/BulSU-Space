import React, { createContext, useContext, useState, ReactNode } from 'react';

interface JobOpeningsContextType {
  showJobOpenings: boolean;
  setShowJobOpenings: (show: boolean) => void;
}

const JobOpeningsContext = createContext<JobOpeningsContextType | undefined>(undefined);

export const JobOpeningsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [showJobOpenings, setShowJobOpenings] = useState(false);

  return (
    <JobOpeningsContext.Provider value={{ showJobOpenings, setShowJobOpenings }}>
      {children}
    </JobOpeningsContext.Provider>
  );
};

export const useJobOpenings = (): JobOpeningsContextType => {
  const context = useContext(JobOpeningsContext);
  if (context === undefined) {
    throw new Error('useJobOpenings must be used within a JobOpeningsProvider');
  }
  return context;
};
