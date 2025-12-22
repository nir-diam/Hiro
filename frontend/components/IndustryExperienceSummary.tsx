
import React, { useMemo } from 'react';
import { ArrowLeftIcon } from './Icons';
import { experienceData } from './IndustryExperienceTable';

interface IndustryExperienceSummaryProps {
  onBack: () => void;
  onShowFullDetails: () => void;
}

interface SummaryData {
  totalYears: number;
  companies: string[];
}

const IndustryExperienceSummary: React.FC<IndustryExperienceSummaryProps> = ({ onBack, onShowFullDetails }) => {
  const industrySummary = useMemo<{ [key: string]: SummaryData }>(() => {
    const summary: { [key: string]: SummaryData } = {};
    
    experienceData.forEach(item => {
      if (!summary[item.industry]) {
        summary[item.industry] = { totalYears: 0, companies: [] };
      }
      summary[item.industry].totalYears += item.yearsOfExperience;
      summary[item.industry].companies.push(item.company);
    });

    const sortedEntries = Object.entries(summary).sort((
        [_keyA, a]: [string, SummaryData],
        [_keyB, b]: [string, SummaryData]
    ) => b.totalYears - a.totalYears);
    
    return Object.fromEntries(sortedEntries);
  }, []);

  const totalExperienceYears = useMemo(() => 
    Object.values(industrySummary).reduce((sum: number, item: SummaryData) => sum + item.totalYears, 0),
    [industrySummary]
  );
  
  const maxYears = useMemo(() =>
    Math.max(1, ...Object.values(industrySummary).map((item: SummaryData) => item.totalYears)),
    [industrySummary]
  );

  return (
    <div className="bg-bg-card h-full flex flex-col">
        <header className="flex items-center justify-between pb-4 border-b border-border-default bg-bg-card p-4 -m-4 mb-0">
            <h2 className="text-xl font-bold text-text-default">תקציר ניסיון בתעשיות</h2>
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-text-muted font-semibold py-2 px-3 rounded-lg hover:bg-bg-hover transition"
                aria-label="חזרה"
            >
                <ArrowLeftIcon className="w-5 h-5 transform rotate-180" />
                <span>חזרה לקורות חיים</span>
            </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="text-center">
            <h3 className="text-lg font-bold text-text-default">פילוח ניסיון לפי תעשייה</h3>
            <p className="text-sm text-text-muted">סה"כ <span className="font-bold text-primary-600">{totalExperienceYears}</span> שנות ניסיון במגוון תעשיות.</p>
          </div>
          
          <div className="space-y-4">
            {Object.entries(industrySummary).map(([industry, data]: [string, SummaryData]) => (
              <div key={industry} className="bg-bg-card p-4 rounded-xl border border-border-default shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="font-bold text-text-default text-base">{industry}</h5>
                  <span className="font-extrabold text-primary-600 text-lg">{data.totalYears} שנים</span>
                </div>
                 <div className="flex flex-wrap gap-2 mb-3">
                  {data.companies.map(company => (
                    <span key={company} className="text-xs bg-bg-subtle text-text-muted px-2 py-1 rounded-md font-medium">{company}</span>
                  ))}
                </div>
                <div className="relative w-full bg-primary-100 rounded-full h-3">
                  <div
                    className="bg-primary-500 h-3 rounded-full"
                    style={{ width: `${(data.totalYears / maxYears) * 100}%` }}
                    title={`${data.totalYears} שנים`}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          
          <div>
            <button 
                onClick={onShowFullDetails} 
                className="w-full flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm"
            >
                <span>הצג פירוט מלא</span>
                <ArrowLeftIcon className="w-5 h-5" />
            </button>
          </div>
        </main>
    </div>
  );
};

export default IndustryExperienceSummary;
